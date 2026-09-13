import { describe, expect, it } from "vitest";
import { loadWorkbook } from "@/lib/workbook";
import { calculatePlan } from "@/lib/planner";
import { SEGMENTS, type InputSnapshot, type RawInputSnapshot, type Segment, type SegmentMap } from "@/lib/types";
import { validateInputSnapshot } from "@/lib/validation";

function source(sheet: string, row: number) {
  return { sheet, row, cells: {} };
}

function segmentMap(value: number): SegmentMap<number> {
  return { A: value, B: value, C: value, D: value };
}

function farm(
  farmId: string,
  actualTonnes: Partial<SegmentMap<number>>,
): RawInputSnapshot["farms"][number] {
  return {
    farmId,
    farmName: `${farmId} Farm`,
    expectedDailyCapacityT: 100,
    expectedMix: segmentMap(0.25),
    actualTonnes: { ...segmentMap(0), ...actualTonnes },
    source: source("Farms", 5),
  };
}

function client(
  clientId: string,
  acceptanceMode: "EXACT" | "MINIMUM",
  requestedSegment: Segment,
  demandT: number,
  exportPricePerTonneEur: number,
): RawInputSnapshot["clients"][number] {
  return {
    clientId,
    clientName: `${clientId} Client`,
    acceptanceMode,
    requestedSegment,
    demandT,
    exportPricePerTonneEur,
    source: source("Clients", 5),
  };
}

function testSnapshot(
  farms: RawInputSnapshot["farms"],
  clients: RawInputSnapshot["clients"],
  station: { capacityT?: number; localMarketRatio?: number } = {},
  referencePriceOverrides: Partial<SegmentMap<number>> = {},
): InputSnapshot {
  const raw: RawInputSnapshot = {
    farms,
    clients,
    stations: [
      {
        stationId: "STATION-TEST",
        exportConditioningCapacityT: station.capacityT ?? 500,
        localMarketRatio: station.localMarketRatio ?? 0.1,
        source: source("Station", 5),
      },
    ],
    referencePrices: SEGMENTS.map((segment, index) => ({
      segment,
      referenceExportPricePerTonneEur: referencePriceOverrides[segment] ?? 1_000 - index * 100,
      source: source("Station", 16 + index),
    })),
  };
  const validated = validateInputSnapshot(raw);
  if (!validated.ok) {
    throw new Error(validated.issues.map((issue) => issue.message).join("; "));
  }
  return {
    ...validated.value,
    version: { algorithm: "sha256", value: "a".repeat(64) },
  };
}

describe("calculatePlan", () => {
  it("reproduces the workbook baseline metrics, outcomes, and residual composition", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const outcomes = new Map(plan.clientOutcomes.map((outcome) => [outcome.clientId, outcome]));
    const localBySegment = new Map<Segment, number>();
    for (const residual of plan.localResiduals) {
      localBySegment.set(residual.segment, (localBySegment.get(residual.segment) ?? 0) + residual.tonnes);
    }

    expect(plan.kpis).toMatchObject({
      expectedTotalTonnes: 600,
      actualTotalTonnes: 560,
      stationCapacityT: 500,
      exportedTonnes: 500,
      exportRate: 500 / 560,
      stationUtilization: 1,
      localTonnes: 60,
      exportRevenueEur: 549_500,
      localValueEur: 4_500,
      totalValueEur: 554_000,
      atRiskCount: 3,
    });
    expect(outcomes.get("C02")).toMatchObject({
      allocatedTonnes: 40,
      remainingTonnes: 10,
      status: "PARTIAL",
      shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT",
    });
    expect(outcomes.get("C09")).toMatchObject({
      allocatedTonnes: 30,
      remainingTonnes: 20,
      status: "PARTIAL",
      shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT",
    });
    expect(outcomes.get("C08")).toMatchObject({
      allocatedTonnes: 20,
      remainingTonnes: 30,
      status: "PARTIAL",
      shortageReason: "STATION_CAPACITY_REACHED",
    });
    expect([...outcomes.values()].filter((outcome) => outcome.status === "COMPLETE")).toHaveLength(7);
    expect(Object.fromEntries(SEGMENTS.map((segment) => [segment, localBySegment.get(segment) ?? 0]))).toEqual({
      A: 0,
      B: 0,
      C: 0,
      D: 60,
    });
    expect(plan.localResiduals.every((residual) => residual.segment === "D")).toBe(true);
  });

  it("uses price and ID ordering, quality-fit ordering, and stable shuffled results", () => {
    const snapshot = testSnapshot(
      [farm("F02", { B: 5 }), farm("F01", { B: 5 })],
      [
        client("C02", "EXACT", "B", 5, 1_000),
        client("C01", "EXACT", "B", 5, 1_000),
      ],
      { capacityT: 10 },
    );
    const before = structuredClone(snapshot);
    const plan = calculatePlan(snapshot);
    const shuffled = calculatePlan({
      ...snapshot,
      farms: [...snapshot.farms].reverse(),
      clients: [...snapshot.clients].reverse(),
    });

    expect(plan.allocations.map((allocation) => [allocation.clientId, allocation.farmId])).toEqual([
      ["C01", "F01"],
      ["C02", "F02"],
    ]);
    expect(plan.allocations.map((allocation) => allocation.allocationId)).toEqual([
      "allocation-0001",
      "allocation-0002",
    ]);
    expect(shuffled).toEqual(plan);
    expect(snapshot).toEqual(before);

    const qualityPlan = calculatePlan(
      testSnapshot(
        [farm("F09", { C: 5 }), farm("F01", { B: 5 }), farm("F00", { A: 5 })],
        [client("C03", "MINIMUM", "C", 15, 1_000)],
        { capacityT: 15 },
      ),
    );
    expect(qualityPlan.allocations.map((allocation) => allocation.segment)).toEqual(["C", "B", "A"]);
  });

  it("enforces EXACT/MINIMUM compatibility and prices upgrades at the client price", () => {
    const exactPlan = calculatePlan(
      testSnapshot(
        [farm("F01", { A: 5, B: 5, C: 5 })],
        [client("C-EXACT", "EXACT", "B", 10, 1_000)],
        { capacityT: 10 },
      ),
    );
    expect(exactPlan.allocations.map((allocation) => allocation.segment)).toEqual(["B"]);
    expect(exactPlan.clientOutcomes[0]).toMatchObject({
      allocatedTonnes: 5,
      status: "PARTIAL",
      shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT",
    });

    const minimumPlan = calculatePlan(
      testSnapshot(
        [farm("F01", { A: 5, B: 5, C: 5 })],
        [client("C-MIN", "MINIMUM", "B", 10, 800)],
        { capacityT: 10 },
      ),
    );
    expect(minimumPlan.allocations.map((allocation) => allocation.segment)).toEqual(["B", "A"]);
    expect(minimumPlan.allocations.map((allocation) => allocation.qualityUpgrade.levels)).toEqual([0, 1]);
    expect(minimumPlan.kpis.exportRevenueEur).toBe(8_000);
    expect(minimumPlan.allocations[1]?.exportRevenueEur).toBe(4_000);
  });

  it("records shortage reasons at processing time and handles zero denominators", () => {
    const constrainedPlan = calculatePlan(
      testSnapshot(
        [farm("F01", { B: 5 })],
        [
          client("C01", "EXACT", "A", 5, 200),
          client("C02", "EXACT", "B", 10, 100),
        ],
        { capacityT: 5 },
      ),
    );
    expect(constrainedPlan.clientOutcomes).toMatchObject([
      { clientId: "C01", status: "UNSERVED", shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT" },
      { clientId: "C02", status: "PARTIAL", shortageReason: "STATION_CAPACITY_REACHED" },
    ]);

    const zeroPlan = calculatePlan(
      testSnapshot(
        [farm("F01", {})],
        [client("C01", "MINIMUM", "A", 5, 200), client("C02", "MINIMUM", "A", 0, 100)],
        { capacityT: 0 },
      ),
    );
    expect(zeroPlan.kpis).toMatchObject({
      actualTotalTonnes: 0,
      exportedTonnes: 0,
      localTonnes: 0,
      stationUtilization: null,
      exportRate: null,
    });
    expect(zeroPlan.clientOutcomes).toMatchObject([
      { clientId: "C01", status: "UNSERVED", shortageReason: "STATION_CAPACITY_REACHED" },
      { clientId: "C02", status: "COMPLETE", shortageReason: null },
    ]);
  });

  it("values residuals with their segment reference price without changing export order", () => {
    const snapshot = testSnapshot(
      [farm("F01", { A: 10, D: 5 })],
      [client("C01", "EXACT", "A", 5, 1_000)],
      { capacityT: 5 },
      { A: 1_000, D: 700 },
    );
    const changedSnapshot: InputSnapshot = {
      ...snapshot,
      referencePrices: {
        ...snapshot.referencePrices,
        D: {
          ...snapshot.referencePrices.D,
          referenceExportPricePerTonneEur: 900,
        },
      },
    };
    const plan = calculatePlan(snapshot);
    const changedPlan = calculatePlan(changedSnapshot);

    expect(changedPlan.allocations).toEqual(plan.allocations);
    expect(changedPlan.clientOutcomes).toEqual(plan.clientOutcomes);
    expect(plan.kpis).toMatchObject({ exportRevenueEur: 5_000, localValueEur: 850 });
    expect(changedPlan.kpis).toMatchObject({ exportRevenueEur: 5_000, localValueEur: 950 });
    expect(changedPlan.localResiduals.find((residual) => residual.segment === "D")).toMatchObject({
      tonnes: 5,
      localPricePerTonneEur: 90,
      localValueEur: 450,
    });
  });
});

