import { describe, expect, it } from "vitest";
import { loadWorkbook, parseWorkbookRows, type WorkbookRows } from "@/lib/workbook";
import { calculatePlan } from "@/lib/planner";
import {
  SEGMENTS,
  type InputSnapshot,
  type RawClientInput,
  type RawFarmInput,
  type RawInputSnapshot,
  type RawReferencePriceInput,
  type RawStationInput,
  type Segment,
  type SegmentMap,
  type ValidationIssue,
} from "@/lib/types";
import { validateInputSnapshot } from "@/lib/validation";

interface MutableRawInputSnapshot {
  farms: RawFarmInput[];
  clients: RawClientInput[];
  stations: RawStationInput[];
  referencePrices: RawReferencePriceInput[];
}

function source(sheet: string, row: number) {
  return {
    sheet,
    row,
    cells: {
      farmId: `A${row}`,
      farmName: `B${row}`,
      expectedDailyCapacityT: `C${row}`,
      "expectedMix.A": `D${row}`,
      "expectedMix.B": `E${row}`,
      "expectedMix.C": `F${row}`,
      "expectedMix.D": `G${row}`,
      "actualTonnes.A": `H${row}`,
      "actualTonnes.B": `I${row}`,
      "actualTonnes.C": `J${row}`,
      "actualTonnes.D": `K${row}`,
      clientId: `A${row}`,
      clientName: `B${row}`,
      acceptanceMode: `C${row}`,
      requestedSegment: `D${row}`,
      demandT: `E${row}`,
      exportPricePerTonneEur: `F${row}`,
      stationId: `A${row}`,
      exportConditioningCapacityT: `B${row}`,
      localMarketRatio: `C${row}`,
      segment: `A${row}`,
      referenceExportPricePerTonneEur: `B${row}`,
    },
  };
}

function segmentMap<T>(value: T): SegmentMap<T> {
  return { A: value, B: value, C: value, D: value };
}

function farm(
  farmId: string,
  actualTonnes: Partial<SegmentMap<number>>,
  options: {
    expectedDailyCapacityT?: number;
    expectedMix?: SegmentMap<number>;
    row?: number;
  } = {},
): RawFarmInput {
  return {
    farmId,
    farmName: `${farmId} Farm`,
    expectedDailyCapacityT: options.expectedDailyCapacityT ?? 100,
    expectedMix: options.expectedMix ?? segmentMap(0.25),
    actualTonnes: { ...segmentMap(0), ...actualTonnes },
    source: source("Farms", options.row ?? 5),
  };
}

function client(
  clientId: string,
  acceptanceMode: "EXACT" | "MINIMUM",
  requestedSegment: Segment,
  demandT: number,
  exportPricePerTonneEur: number,
  row = 5,
): RawClientInput {
  return {
    clientId,
    clientName: `${clientId} Client`,
    acceptanceMode,
    requestedSegment,
    demandT,
    exportPricePerTonneEur,
    source: source("Clients", row),
  };
}

function testSnapshot(
  farms: RawFarmInput[],
  clients: RawClientInput[],
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

function planWith(
  farms: RawFarmInput[],
  clients: RawClientInput[],
  station: { capacityT?: number; localMarketRatio?: number } = {},
  referencePriceOverrides: Partial<SegmentMap<number>> = {},
): ReturnType<typeof calculatePlan> {
  return calculatePlan(testSnapshot(farms, clients, station, referencePriceOverrides));
}

function rawValidationSnapshot(): MutableRawInputSnapshot {
  return {
    farms: [farm("F01", { A: 10 }, { row: 5 })],
    clients: [client("C01", "MINIMUM", "A", 5, 1_000, 5)],
    stations: [
      {
        stationId: "STATION-01",
        exportConditioningCapacityT: 50,
        localMarketRatio: 0.1,
        source: source("Station", 5),
      },
    ],
    referencePrices: SEGMENTS.map((segment, index) => ({
      segment,
      referenceExportPricePerTonneEur: 1_200 - index * 100,
      source: source("Station", 17 + index),
    })),
  };
}

function issueList(input: unknown): readonly ValidationIssue[] {
  const result = validateInputSnapshot(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected validation to fail");
  return result.issues;
}

function issueForField(input: unknown, field: string): ValidationIssue {
  const issue = issueList(input).find((candidate) => candidate.field === field);
  expect(issue).toBeDefined();
  if (issue === undefined) throw new Error(`Expected an issue for ${field}`);
  return issue;
}

describe("T1 — workbook baseline", () => {
  it("reproduces the public baseline, every client outcome, residual composition, and trace conservation", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    expect(plan.kpis).toEqual({
      expectedTotalTonnes: 600,
      actualTotalTonnes: 560,
      stationCapacityT: 500,
      exportedTonnes: 500,
      stationUtilization: 1,
      exportRate: 500 / 560,
      localTonnes: 60,
      exportRevenueEur: 549_500,
      localValueEur: 4_500,
      totalValueEur: 554_000,
      atRiskCount: 3,
    });
    expect(plan.production.segments).toEqual([
      { segment: "A", expectedTonnes: 101.7, actualTonnes: 90, varianceTonnes: -11.7 },
      { segment: "B", expectedTonnes: 168.3, actualTonnes: 160, varianceTonnes: -8.3 },
      { segment: "C", expectedTonnes: 207.9, actualTonnes: 180, varianceTonnes: -27.9 },
      { segment: "D", expectedTonnes: 122.1, actualTonnes: 130, varianceTonnes: 7.9 },
    ]);

    const outcomes = new Map(plan.clientOutcomes.map((outcome) => [outcome.clientId, outcome]));
    expect(Object.fromEntries(
      [...outcomes.values()].map((outcome) => [outcome.clientId, {
        allocatedTonnes: outcome.allocatedTonnes,
        remainingTonnes: outcome.remainingTonnes,
        exportRevenueEur: outcome.exportRevenueEur,
        status: outcome.status,
        shortageReason: outcome.shortageReason,
      }]),
    )).toEqual({
      C01: { allocatedTonnes: 50, remainingTonnes: 0, exportRevenueEur: 75_000, status: "COMPLETE", shortageReason: null },
      C02: { allocatedTonnes: 40, remainingTonnes: 10, exportRevenueEur: 58_000, status: "PARTIAL", shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT" },
      C03: { allocatedTonnes: 60, remainingTonnes: 0, exportRevenueEur: 75_000, status: "COMPLETE", shortageReason: null },
      C04: { allocatedTonnes: 70, remainingTonnes: 0, exportRevenueEur: 84_000, status: "COMPLETE", shortageReason: null },
      C05: { allocatedTonnes: 60, remainingTonnes: 0, exportRevenueEur: 60_000, status: "COMPLETE", shortageReason: null },
      C06: { allocatedTonnes: 70, remainingTonnes: 0, exportRevenueEur: 66_500, status: "COMPLETE", shortageReason: null },
      C07: { allocatedTonnes: 50, remainingTonnes: 0, exportRevenueEur: 37_500, status: "COMPLETE", shortageReason: null },
      C08: { allocatedTonnes: 20, remainingTonnes: 30, exportRevenueEur: 14_000, status: "PARTIAL", shortageReason: "STATION_CAPACITY_REACHED" },
      C09: { allocatedTonnes: 30, remainingTonnes: 20, exportRevenueEur: 34_500, status: "PARTIAL", shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT" },
      C10: { allocatedTonnes: 50, remainingTonnes: 0, exportRevenueEur: 45_000, status: "COMPLETE", shortageReason: null },
    });

    const localByFarm = new Map(
      plan.localResiduals.map((residual) => [residual.farmId, residual]),
    );
    expect([...localByFarm.entries()].map(([farmId, residual]) => [farmId, residual.segment, residual.tonnes])).toEqual([
      ["F15", "D", 5],
      ["F16", "D", 20],
      ["F19", "D", 5],
      ["F20", "D", 30],
    ]);
    expect(plan.localResiduals.reduce((sum, residual) => sum + residual.localValueEur, 0)).toBe(4_500);

    const actualByFarmSegment = new Map<string, number>(
      loaded.value.snapshot.farms.flatMap((farmInput) =>
        SEGMENTS.map((segment) => [`${farmInput.farmId}/${segment}`, farmInput.actualTonnes[segment]] as const),
      ),
    );
    const exportedByFarmSegment = new Map<string, number>();
    for (const allocation of plan.allocations) {
      expect(allocation.tonnes % 5).toBe(0);
      expect(loaded.value.snapshot.clients.some((clientInput) => clientInput.clientId === allocation.clientId)).toBe(true);
      const key = `${allocation.farmId}/${allocation.segment}`;
      exportedByFarmSegment.set(key, (exportedByFarmSegment.get(key) ?? 0) + allocation.tonnes);
    }
    for (const balance of plan.balances) {
      const key = `${balance.farmId}/${balance.segment}`;
      expect(balance.exportedTonnes + balance.localTonnes).toBe(balance.actualTonnes);
      expect(balance.actualTonnes).toBe(actualByFarmSegment.get(key));
      expect(balance.exportedTonnes).toBe(exportedByFarmSegment.get(key) ?? 0);
    }
    expect(plan.allocations.reduce((sum, allocation) => sum + allocation.tonnes, 0)).toBe(500);
    expect(plan.balances.reduce((sum, balance) => sum + balance.actualTonnes, 0)).toBe(560);
    expect(plan.balances.reduce((sum, balance) => sum + balance.localTonnes, 0)).toBe(60);
  });
});

describe("T2 — ordering and determinism", () => {
  it("applies price, client ID, quality-fit, and farm ID ordering without mutation", () => {
    const pricePlan = planWith(
      [farm("F01", { B: 5 }), farm("F02", { B: 5 })],
      [
        client("C-LOW", "EXACT", "B", 5, 100),
        client("C-HIGH", "EXACT", "B", 5, 200),
      ],
      { capacityT: 10 },
    );
    expect(pricePlan.allocations.map((allocation) => allocation.clientId)).toEqual(["C-HIGH", "C-LOW"]);

    const clientTiePlan = planWith(
      [farm("F01", { B: 5 }), farm("F02", { B: 5 })],
      [
        client("C02", "EXACT", "B", 5, 100),
        client("C01", "EXACT", "B", 5, 100),
      ],
      { capacityT: 10 },
    );
    expect(clientTiePlan.allocations.map((allocation) => [allocation.clientId, allocation.farmId])).toEqual([
      ["C01", "F01"],
      ["C02", "F02"],
    ]);

    const qualityPlan = planWith(
      [farm("F00", { A: 5 }), farm("F01", { B: 5 }), farm("F99", { C: 5 })],
      [client("C01", "MINIMUM", "C", 15, 100)],
      { capacityT: 15 },
    );
    expect(qualityPlan.allocations.map((allocation) => [allocation.segment, allocation.farmId])).toEqual([
      ["C", "F99"],
      ["B", "F01"],
      ["A", "F00"],
    ]);

    const farmTiePlan = planWith(
      [farm("F02", { B: 5 }), farm("F01", { B: 5 })],
      [client("C01", "EXACT", "B", 10, 100)],
      { capacityT: 10 },
    );
    expect(farmTiePlan.allocations.map((allocation) => allocation.farmId)).toEqual(["F01", "F02"]);
  });

  it("does not mutate inputs and returns identical business results on repeat and shuffled calls", () => {
    const snapshot = testSnapshot(
      [farm("F02", { C: 5, B: 5 }), farm("F01", { C: 5, B: 5 })],
      [
        client("C02", "MINIMUM", "C", 5, 100),
        client("C01", "EXACT", "B", 5, 100),
      ],
      { capacityT: 10 },
    );
    const before = structuredClone(snapshot);
    const first = calculatePlan(snapshot);
    const second = calculatePlan(snapshot);
    const shuffled = calculatePlan({
      ...snapshot,
      farms: [...snapshot.farms].reverse(),
      clients: [...snapshot.clients].reverse(),
    });

    expect(snapshot).toEqual(before);
    expect(second).toEqual(first);
    expect(shuffled).toEqual(first);
  });
});

describe("T3 — compatibility", () => {
  it("keeps EXACT allocations on the requested segment and rejects other fruit", () => {
    const plan = planWith(
      [farm("F01", { A: 5, B: 5 })],
      [client("C-EXACT", "EXACT", "B", 10, 1_000)],
      { capacityT: 10 },
    );

    expect(plan.allocations.map((allocation) => allocation.segment)).toEqual(["B"]);
    expect(plan.clientOutcomes[0]).toMatchObject({
      allocatedTonnes: 5,
      remainingTonnes: 5,
      status: "PARTIAL",
      shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT",
    });
    expect(plan.balances.find((balance) => balance.farmId === "F01" && balance.segment === "A")).toMatchObject({
      exportedTonnes: 0,
      localTonnes: 5,
    });
  });

  it("lets MINIMUM clients use requested quality first, then only better upgrades", () => {
    const plan = planWith(
      [farm("F00", { A: 5 }), farm("F01", { B: 5 }), farm("F02", { C: 5 }), farm("F03", { D: 5 })],
      [client("C-MIN", "MINIMUM", "C", 20, 800)],
      { capacityT: 20 },
    );

    expect(plan.allocations.map((allocation) => allocation.segment)).toEqual(["C", "B", "A"]);
    expect(plan.allocations.map((allocation) => allocation.qualityUpgrade.levels)).toEqual([0, 1, 2]);
    expect(plan.allocations.some((allocation) => allocation.segment === "D")).toBe(false);
    expect(plan.allocations.every((allocation) => allocation.exportPricePerTonneEur === 800)).toBe(true);
    expect(plan.kpis.exportRevenueEur).toBe(12_000);
    expect(plan.allocations.find((allocation) => allocation.segment === "A")).toMatchObject({
      tonnes: 5,
      exportRevenueEur: 4_000,
    });
  });
});

describe("T4 — hard limits and shortage reasons", () => {
  it("holds demand, station, supply, 5-tonne, and conservation limits with processing-time reasons", () => {
    const plan = planWith(
      [farm("F01", { A: 5 }), farm("F02", { B: 5 })],
      [
        client("C01", "EXACT", "C", 5, 300),
        client("C02", "EXACT", "A", 10, 200),
        client("C03", "EXACT", "B", 5, 100),
      ],
      { capacityT: 5 },
    );
    const clientsById = new Map([
      ["C01", 5],
      ["C02", 10],
      ["C03", 5],
    ]);

    expect(plan.clientOutcomes).toMatchObject([
      { clientId: "C01", allocatedTonnes: 0, status: "UNSERVED", shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT" },
      { clientId: "C02", allocatedTonnes: 5, remainingTonnes: 5, status: "PARTIAL", shortageReason: "STATION_CAPACITY_REACHED" },
      { clientId: "C03", allocatedTonnes: 0, status: "UNSERVED", shortageReason: "STATION_CAPACITY_REACHED" },
    ]);
    expect(plan.kpis.exportedTonnes).toBe(5);
    expect(plan.kpis.localTonnes).toBe(5);
    expect(plan.kpis.stationUtilization).toBe(1);

    for (const outcome of plan.clientOutcomes) {
      const demand = clientsById.get(outcome.clientId);
      expect(demand).toBeDefined();
      expect(outcome.allocatedTonnes).toBeLessThanOrEqual(demand ?? 0);
      expect(outcome.allocatedTonnes % 5).toBe(0);
    }
    for (const balance of plan.balances) {
      expect(balance.exportedTonnes).toBeLessThanOrEqual(balance.actualTonnes);
      expect(balance.exportedTonnes + balance.localTonnes).toBe(balance.actualTonnes);
      expect(balance.exportedTonnes % 5).toBe(0);
      expect(balance.localTonnes % 5).toBe(0);
    }
  });

  it("represents zero supply, zero demand, zero capacity, and zero-denominator ratios honestly", () => {
    const plan = planWith(
      [farm("F01", {})],
      [
        client("C-ZERO", "MINIMUM", "A", 0, 200),
        client("C-UNSERVED", "MINIMUM", "A", 5, 100),
      ],
      { capacityT: 0 },
    );

    expect(plan.kpis).toMatchObject({
      actualTotalTonnes: 0,
      exportedTonnes: 0,
      localTonnes: 0,
      stationUtilization: null,
      exportRate: null,
    });
    expect(plan.clientOutcomes).toMatchObject([
      { clientId: "C-ZERO", status: "COMPLETE", remainingTonnes: 0, shortageReason: null },
      { clientId: "C-UNSERVED", status: "UNSERVED", shortageReason: "STATION_CAPACITY_REACHED" },
    ]);
  });
});

describe("T5 — local value and changed inputs", () => {
  it("traces every residual and changes local value when its reference price changes", () => {
    const snapshot = testSnapshot(
      [farm("F01", { A: 10, D: 5 })],
      [client("C01", "EXACT", "A", 5, 1_000)],
      { capacityT: 5, localMarketRatio: 0.1 },
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

    expect(plan.localResiduals).toEqual([
      expect.objectContaining({
        farmId: "F01",
        segment: "A",
        tonnes: 5,
        localPricePerTonneEur: 100,
        localValueEur: 500,
      }),
      expect.objectContaining({
        farmId: "F01",
        segment: "D",
        tonnes: 5,
        localPricePerTonneEur: 70,
        localValueEur: 350,
      }),
    ]);
    expect(changedPlan.allocations).toEqual(plan.allocations);
    expect(changedPlan.clientOutcomes).toEqual(plan.clientOutcomes);
    expect(changedPlan.kpis.exportRevenueEur).toBe(plan.kpis.exportRevenueEur);
    expect(plan.kpis.localValueEur).toBe(850);
    expect(changedPlan.kpis.localValueEur).toBe(950);
    expect(changedPlan.localResiduals.find((residual) => residual.segment === "D")).toMatchObject({
      localPricePerTonneEur: 90,
      localValueEur: 450,
    });
  });

  it("changes production comparisons without treating expected mix as actual supply", () => {
    const snapshot = testSnapshot(
      [farm("F01", { A: 10, D: 5 })],
      [client("C01", "EXACT", "A", 5, 1_000)],
      { capacityT: 5 },
    );
    const changedSnapshot: InputSnapshot = {
      ...snapshot,
      farms: [
        {
          ...snapshot.farms[0]!,
          expectedMix: { A: 0.5, B: 0.2, C: 0.2, D: 0.1 },
        },
      ],
    };
    const plan = calculatePlan(snapshot);
    const changedPlan = calculatePlan(changedSnapshot);

    expect(changedPlan.production.segments).not.toEqual(plan.production.segments);
    expect(changedPlan.production.segments[0]).toEqual({
      segment: "A",
      expectedTonnes: 50,
      actualTonnes: 10,
      varianceTonnes: -40,
    });
    expect(changedPlan.allocations).toEqual(plan.allocations);
    expect(changedPlan.balances).toEqual(plan.balances);
    expect(changedPlan.kpis.exportRevenueEur).toBe(plan.kpis.exportRevenueEur);
  });

  it.each([
    ["supply", (snapshot: InputSnapshot): InputSnapshot => ({
      ...snapshot,
      farms: [{ ...snapshot.farms[0]!, actualTonnes: { A: 5, B: 0, C: 0, D: 0 } }],
    }), 5, 0, 5, { C01: "COMPLETE", C02: "UNSERVED" }],
    ["demand", (snapshot: InputSnapshot): InputSnapshot => ({
      ...snapshot,
      clients: snapshot.clients.map((clientInput) =>
        clientInput.clientId === "C02" ? { ...clientInput, demandT: 10 } : clientInput,
      ),
    }), 10, 0, 10, { C01: "COMPLETE", C02: "PARTIAL" }],
    ["capacity", (snapshot: InputSnapshot): InputSnapshot => ({
      ...snapshot,
      station: { ...snapshot.station, exportConditioningCapacityT: 5 },
    }), 5, 5, 10, { C01: "COMPLETE", C02: "UNSERVED" }],
  ])("recomputes the affected result when %s changes", (_name, change, expectedExport, expectedLocal, expectedActual, expectedStatuses) => {
    const snapshot = testSnapshot(
      [farm("F01", { A: 10 })],
      [
        client("C01", "EXACT", "A", 5, 200),
        client("C02", "EXACT", "A", 5, 100),
      ],
      { capacityT: 10 },
    );
    const changed = change(snapshot);
    const plan = calculatePlan(changed);

    expect(plan.kpis.exportedTonnes).toBe(expectedExport);
    expect(plan.kpis.localTonnes).toBe(expectedLocal);
    expect(plan.kpis.exportedTonnes + plan.kpis.localTonnes).toBe(expectedActual);
    expect(Object.fromEntries(plan.clientOutcomes.map((outcome) => [outcome.clientId, outcome.status]))).toEqual(expectedStatuses);
  });

  it("reorders the allocation when the price priority changes", () => {
    const snapshot = testSnapshot(
      [farm("F01", { A: 5 }), farm("F02", { A: 5 })],
      [
        client("C01", "EXACT", "A", 5, 200),
        client("C02", "EXACT", "A", 5, 100),
      ],
      { capacityT: 10 },
    );
    const changed: InputSnapshot = {
      ...snapshot,
      clients: snapshot.clients.map((clientInput) =>
        clientInput.clientId === "C01"
          ? { ...clientInput, exportPricePerTonneEur: 50 }
          : { ...clientInput, exportPricePerTonneEur: 300 },
      ),
    };

    expect(calculatePlan(snapshot).allocations.map((allocation) => allocation.clientId)).toEqual(["C01", "C02"]);
    expect(calculatePlan(changed).allocations.map((allocation) => allocation.clientId)).toEqual(["C02", "C01"]);
  });
});

describe("T6 — source validation", () => {
  it.each([
    ["missing farm ID", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms[0] = { ...snapshot.farms[0], farmId: undefined };
    }, "farm_id", "MISSING_VALUE", "Farms", 5, "A5"],
    ["blank client ID", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients[0] = { ...snapshot.clients[0], clientId: "" };
    }, "client_id", "MISSING_VALUE", "Clients", 5, "A5"],
    ["duplicate farm ID", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms = [...snapshot.farms, { ...snapshot.farms[0], source: source("Farms", 6) }];
    }, "farm_id", "DUPLICATE_ID", "Farms", 5, "A5"],
    ["duplicate client ID", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients = [...snapshot.clients, { ...snapshot.clients[0], source: source("Clients", 6) }];
    }, "client_id", "DUPLICATE_ID", "Clients", 5, "A5"],
    ["invalid mode", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients[0] = { ...snapshot.clients[0], acceptanceMode: "OPTIONAL" };
    }, "acceptance_mode", "INVALID_MODE", "Clients", 5, "C5"],
    ["invalid requested segment", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients[0] = { ...snapshot.clients[0], requestedSegment: "E" };
    }, "requested_segment", "INVALID_SEGMENT", "Clients", 5, "D5"],
    ["invalid reference segment", (snapshot: MutableRawInputSnapshot) => {
      snapshot.referencePrices = [{ ...snapshot.referencePrices[0], segment: "E" }, ...snapshot.referencePrices.slice(1)];
    }, "segment", "INVALID_SEGMENT", "Station", 17, "A17"],
    ["missing reference", (snapshot: MutableRawInputSnapshot) => {
      snapshot.referencePrices = snapshot.referencePrices.filter((reference) => reference.segment !== "D");
    }, "reference_price.D", "MISSING_REFERENCE", "Station", null, null],
    ["duplicate reference", (snapshot: MutableRawInputSnapshot) => {
      snapshot.referencePrices = [...snapshot.referencePrices, { ...snapshot.referencePrices[0], source: source("Station", 21) }];
    }, "reference_price.A", "DUPLICATE_REFERENCE", "Station", 21, "A21"],
    ["mix fraction outside range", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms[0] = { ...snapshot.farms[0], expectedMix: { A: 1.1, B: 0, C: 0, D: 0 } };
    }, "expected_A_pct", "INVALID_VALUE", "Farms", 5, "D5"],
    ["mix total is not exact", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms[0] = { ...snapshot.farms[0], expectedMix: { A: 0.2, B: 0.2, C: 0.2, D: 0.2 } };
    }, "expected_mix_total", "INVALID_VALUE", "Farms", 5, "D5"],
    ["missing actual value", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms[0] = { ...snapshot.farms[0], actualTonnes: { A: 10, B: 0, C: 0 } };
    }, "actual_D_t", "MISSING_VALUE", "Farms", 5, "K5"],
    ["numeric string", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients[0] = { ...snapshot.clients[0], demandT: "5" };
    }, "demand_t", "INVALID_TYPE", "Clients", 5, "E5"],
    ["non-finite number", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients[0] = { ...snapshot.clients[0], exportPricePerTonneEur: Number.NaN };
    }, "export_price_per_t_eur", "INVALID_TYPE", "Clients", 5, "F5"],
    ["negative actual", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms[0] = { ...snapshot.farms[0], actualTonnes: { A: -5, B: 0, C: 0, D: 0 } };
    }, "actual_A_t", "INVALID_VALUE", "Farms", 5, "H5"],
    ["negative price", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients[0] = { ...snapshot.clients[0], exportPricePerTonneEur: -1 };
    }, "export_price_per_t_eur", "INVALID_VALUE", "Clients", 5, "F5"],
    ["non-5 tonne demand", (snapshot: MutableRawInputSnapshot) => {
      snapshot.clients[0] = { ...snapshot.clients[0], demandT: 7 };
    }, "demand_t", "INVALID_VALUE", "Clients", 5, "E5"],
    ["non-5 tonne actual", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms[0] = { ...snapshot.farms[0], actualTonnes: { A: 7, B: 0, C: 0, D: 0 } };
    }, "actual_A_t", "INVALID_VALUE", "Farms", 5, "H5"],
    ["expected capacity precision", (snapshot: MutableRawInputSnapshot) => {
      snapshot.farms[0] = { ...snapshot.farms[0], expectedDailyCapacityT: 100.55 };
    }, "expected_daily_capacity_t", "INVALID_VALUE", "Farms", 5, "C5"],
    ["non-5 station capacity", (snapshot: MutableRawInputSnapshot) => {
      snapshot.stations[0] = { ...snapshot.stations[0], exportConditioningCapacityT: 7 };
    }, "export_conditioning_capacity_t", "INVALID_VALUE", "Station", 5, "B5"],
    ["invalid local ratio", (snapshot: MutableRawInputSnapshot) => {
      snapshot.stations[0] = { ...snapshot.stations[0], localMarketRatio: 1.1 };
    }, "local_market_ratio", "INVALID_VALUE", "Station", 5, "C5"],
  ])("rejects %s with an actionable source issue", (_name, mutate, field, code, sheet, row, cell) => {
    const snapshot = rawValidationSnapshot();
    mutate(snapshot);
    const issue = issueForField(snapshot, field);

    expect(issue.code).toBe(code);
    expect(issue.sheet).toBe(sheet);
    expect(issue.row).toBe(row);
    expect(issue.cell).toBe(cell);
    expect(issue.message.length).toBeGreaterThan(0);
    expect(issue.correctiveText.length).toBeGreaterThan(0);
  });

  it("rejects invalid station cardinality and preserves row-specific duplicate diagnostics", () => {
    const noStation = rawValidationSnapshot();
    noStation.stations = [];
    expect(issueForField(noStation, "station")).toMatchObject({
      code: "INVALID_STATION_COUNT",
      sheet: "Station",
      row: null,
      cell: null,
    });

    const duplicateStation = rawValidationSnapshot();
    duplicateStation.stations = [
      ...duplicateStation.stations,
      { ...duplicateStation.stations[0], source: source("Station", 6) },
    ];
    expect(issueForField(duplicateStation, "station")).toMatchObject({
      code: "INVALID_STATION_COUNT",
      row: 5,
    });
  });

  it.each([
    ["not an object", null, "snapshot"],
    ["missing clients array", { farms: [], stations: [], referencePrices: [] }, "clients"],
    ["clients is not an array", { farms: [], clients: {}, stations: [], referencePrices: [] }, "clients"],
  ])("rejects %s as invalid structure", (_name, input, field) => {
    const issue = issueForField(input, field);
    expect(issue).toMatchObject({ code: "INVALID_STRUCTURE", sheet: "InputSnapshot", row: null, cell: null });
    expect(issue.correctiveText).toContain("arrays");
  });

  it("reports missing workbook headers as structure errors before validation", () => {
    const emptyRows = Array.from({ length: 20 }, () => []) as WorkbookRows["farms"];
    const parsed = parseWorkbookRows({ farms: emptyRows, clients: emptyRows, station: emptyRows });

    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_STRUCTURE",
          sheet: "Farms",
          row: 4,
          field: "farm_id",
        }),
        expect.objectContaining({
          code: "INVALID_STRUCTURE",
          sheet: "Station",
          row: 16,
          field: "segment",
        }),
      ]),
    );
  });
});
