import { describe, expect, it } from "vitest";
import { validateInputSnapshot } from "@/lib/validation";
import type {
  RawClientInput,
  RawFarmInput,
  RawInputSnapshot,
  RawReferencePriceInput,
  RawStationInput,
  Segment,
} from "@/lib/types";

interface MutableSnapshot {
  farms: RawFarmInput[];
  clients: RawClientInput[];
  stations: RawStationInput[];
  referencePrices: RawReferencePriceInput[];
}

function source(sheet: string, row: number): {
  sheet: string;
  row: number;
  cells: Record<string, string>;
} {
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

function segmentMap<T>(value: T): Record<Segment, T> {
  return { A: value, B: value, C: value, D: value };
}

function validSnapshot(): RawInputSnapshot {
  return {
    farms: [
      {
        farmId: "F01",
        farmName: "North Farm",
        expectedDailyCapacityT: 100.5,
        expectedMix: { A: 0.2, B: 0.3, C: 0.4, D: 0.1 },
        actualTonnes: { A: 20, B: 30, C: 40, D: 10 },
        source: source("Farms", 5),
      },
    ],
    clients: [
      {
        clientId: "C01",
        clientName: "Example Client",
        acceptanceMode: "MINIMUM",
        requestedSegment: "C",
        demandT: 25,
        exportPricePerTonneEur: 1_000,
        source: source("Clients", 5),
      },
    ],
    stations: [
      {
        stationId: "STATION-01",
        exportConditioningCapacityT: 50,
        localMarketRatio: 0.1,
        source: source("Station", 5),
      },
    ],
    referencePrices: [
      { segment: "A", referenceExportPricePerTonneEur: 1_200, source: source("Station", 16) },
      { segment: "B", referenceExportPricePerTonneEur: 1_050, source: source("Station", 17) },
      { segment: "C", referenceExportPricePerTonneEur: 900, source: source("Station", 18) },
      { segment: "D", referenceExportPricePerTonneEur: 750, source: source("Station", 19) },
    ],
  };
}

function mutableSnapshot(): MutableSnapshot {
  const snapshot = validSnapshot();
  return {
    farms: [...snapshot.farms],
    clients: [...snapshot.clients],
    stations: [...snapshot.stations],
    referencePrices: [...snapshot.referencePrices],
  };
}

function issueFields(snapshot: RawInputSnapshot): string[] {
  const result = validateInputSnapshot(snapshot);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((issue) => issue.field);
}

describe("validateInputSnapshot", () => {
  it("accepts a representative source snapshot and preserves source metadata", () => {
    const result = validateInputSnapshot(validSnapshot());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.farms[0]?.source).toMatchObject({ sheet: "Farms", row: 5 });
    expect(result.value.farms[0]?.expectedMix).toEqual({
      A: 0.2,
      B: 0.3,
      C: 0.4,
      D: 0.1,
    });
    expect(result.value.station.exportConditioningCapacityT).toBe(50);
    expect(result.value.referencePrices.C.referenceExportPricePerTonneEur).toBe(900);
  });

  it.each([
    ["missing farm ID", (snapshot: MutableSnapshot) => { snapshot.farms[0] = { ...snapshot.farms[0], farmId: undefined }; }, "farm_id"],
    ["duplicate farm ID", (snapshot: MutableSnapshot) => { snapshot.farms = [...snapshot.farms, { ...snapshot.farms[0] }]; }, "farm_id"],
    ["invalid acceptance mode", (snapshot: MutableSnapshot) => { snapshot.clients[0] = { ...snapshot.clients[0], acceptanceMode: "OPTIONAL" }; }, "acceptance_mode"],
    ["invalid requested segment", (snapshot: MutableSnapshot) => { snapshot.clients[0] = { ...snapshot.clients[0], requestedSegment: "E" }; }, "requested_segment"],
    ["incomplete reference prices", (snapshot: MutableSnapshot) => { snapshot.referencePrices = snapshot.referencePrices.filter((reference) => reference.segment !== "D"); }, "reference_price.D"],
    ["negative actual tonnes", (snapshot: MutableSnapshot) => { snapshot.farms[0] = { ...snapshot.farms[0], actualTonnes: { ...snapshot.farms[0]?.actualTonnes, A: -5 } }; }, "actual_A_t"],
    ["non-finite price", (snapshot: MutableSnapshot) => { snapshot.clients[0] = { ...snapshot.clients[0], exportPricePerTonneEur: Number.NaN }; }, "export_price_per_t_eur"],
    ["invalid expected capacity precision", (snapshot: MutableSnapshot) => { snapshot.farms[0] = { ...snapshot.farms[0], expectedDailyCapacityT: 100.55 }; }, "expected_daily_capacity_t"],
    ["non-5 tonne demand", (snapshot: MutableSnapshot) => { snapshot.clients[0] = { ...snapshot.clients[0], demandT: 23 }; }, "demand_t"],
    ["invalid local ratio", (snapshot: MutableSnapshot) => { snapshot.stations[0] = { ...snapshot.stations[0], localMarketRatio: 1.1 }; }, "local_market_ratio"],
  ])("rejects %s with the relevant field", (_name, mutate, expectedField) => {
    const snapshot = mutableSnapshot();
    mutate(snapshot);
    expect(issueFields(snapshot)).toContain(expectedField);
  });

  it("reports duplicate client IDs and their source rows", () => {
    const snapshot = mutableSnapshot();
    snapshot.clients = [
      ...snapshot.clients,
      { ...snapshot.clients[0], source: source("Clients", 6) },
    ];

    const result = validateInputSnapshot(snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const duplicates = result.issues.filter((issue) => issue.code === "DUPLICATE_ID");
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map((issue) => issue.row)).toEqual([5, 6]);
    expect(duplicates.every((issue) => issue.cell === "A5" || issue.cell === "A6")).toBe(true);
  });

  it("uses Decimal arithmetic for an exact mix total", () => {
    const snapshot = mutableSnapshot();
    snapshot.farms[0] = {
      ...snapshot.farms[0],
      expectedMix: segmentMap(0.25),
    };
    expect(validateInputSnapshot(snapshot).ok).toBe(true);

    snapshot.farms[0] = {
      ...snapshot.farms[0],
      expectedMix: { A: 0.1, B: 0.2, C: 0.3, D: 0.39 },
    };
    expect(issueFields(snapshot)).toContain("expected_mix_total");
  });

  it("requires exactly one station and all four unique references", () => {
    const snapshot = mutableSnapshot();
    snapshot.stations = [];
    snapshot.referencePrices = [
      ...snapshot.referencePrices,
      { ...snapshot.referencePrices[0], source: source("Station", 20) },
    ];

    const result = validateInputSnapshot(snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.code === "INVALID_STATION_COUNT")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_REFERENCE")).toBe(true);
  });

  it("does not mutate source objects while validating", () => {
    const snapshot = validSnapshot();
    const original = structuredClone(snapshot);

    validateInputSnapshot(snapshot);

    expect(snapshot).toEqual(original);
  });
});
