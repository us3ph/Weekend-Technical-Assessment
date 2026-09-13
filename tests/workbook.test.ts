import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/workbook/route";
import { loadWorkbook, parseWorkbookRows, type WorkbookRows } from "@/lib/workbook";

async function withWorkbookPath<T>(path: string | undefined, callback: () => Promise<T>): Promise<T> {
  const previous = process.env.WORKBOOK_PATH;
  if (path === undefined) {
    delete process.env.WORKBOOK_PATH;
  } else {
    process.env.WORKBOOK_PATH = path;
  }

  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.WORKBOOK_PATH;
    } else {
      process.env.WORKBOOK_PATH = previous;
    }
  }
}

describe("real workbook loading and production comparisons", () => {
  it("loads the supplied workbook with exact source locations and baseline totals", async () => {
    const result = await withWorkbookPath(undefined, loadWorkbook);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.snapshot.farms).toHaveLength(20);
    expect(result.value.snapshot.clients).toHaveLength(10);
    expect(result.value.snapshot.station).toMatchObject({
      stationId: "STATION-01",
      exportConditioningCapacityT: 500,
      localMarketRatio: 0.1,
    });
    expect(result.value.snapshot.referencePrices).toMatchObject({
      A: { referenceExportPricePerTonneEur: 1500 },
      B: { referenceExportPricePerTonneEur: 1250 },
      C: { referenceExportPricePerTonneEur: 1000 },
      D: { referenceExportPricePerTonneEur: 750 },
    });
    expect(result.value.snapshot.farms[0]?.source).toMatchObject({
      sheet: "Farms",
      row: 5,
      cells: {
        farmId: "A5",
        "expectedMix.A": "D5",
        "actualTonnes.D": "K5",
      },
    });
    expect(result.value.snapshot.clients[0]?.source).toMatchObject({
      sheet: "Clients",
      row: 5,
      cells: { clientId: "A5", exportPricePerTonneEur: "F5" },
    });
    expect(result.value.snapshot.referencePrices.D?.source).toMatchObject({
      sheet: "Station",
      row: 20,
      cells: { segment: "A20", referenceExportPricePerTonneEur: "B20" },
    });
    expect(result.value.health).toEqual({
      status: "VALID",
      sourceFileName: "Atlas_Fresh_Production_Commercial_Data.xlsx",
      farmCount: 20,
      clientCount: 10,
      stationCount: 1,
      referencePriceCount: 4,
    });

    expect(result.value.production.expectedTotalTonnes).toBe(600);
    expect(result.value.production.actualTotalTonnes).toBe(560);
    expect(result.value.production.varianceTonnes).toBe(-40);
    expect(result.value.production.segments).toEqual([
      { segment: "A", expectedTonnes: 101.7, actualTonnes: 90, varianceTonnes: -11.7 },
      { segment: "B", expectedTonnes: 168.3, actualTonnes: 160, varianceTonnes: -8.3 },
      { segment: "C", expectedTonnes: 207.9, actualTonnes: 180, varianceTonnes: -27.9 },
      { segment: "D", expectedTonnes: 122.1, actualTonnes: 130, varianceTonnes: 7.9 },
    ]);
    expect(result.value.production.farms[0]?.segments.A).toEqual({
      segment: "A",
      expectedTonnes: 31.5,
      actualTonnes: 25,
      varianceTonnes: -6.5,
    });
    expect(result.value.production.farms[0]).toMatchObject({
      farmId: "F01",
      expectedCapacityT: 35,
      actualTotalTonnes: 30,
      varianceTonnes: -5,
    });
  });

  it("derives the same content version on repeated reads", async () => {
    const first = await withWorkbookPath(undefined, loadWorkbook);
    const second = await withWorkbookPath(undefined, loadWorkbook);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.snapshot.version).toEqual(second.value.snapshot.version);
    expect(first.value.snapshot.version.value).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects missing required table headers explicitly", () => {
    const emptyRows = Array.from({ length: 20 }, () => []) as WorkbookRows["farms"];
    const result = parseWorkbookRows({
      farms: emptyRows,
      clients: emptyRows,
      station: emptyRows,
    });

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues).toEqual(
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

describe("GET /api/workbook", () => {
  it("returns the validated workbook and disables caching", async () => {
    const response = await withWorkbookPath(undefined, GET);
    const body = (await response.json()) as { snapshot?: { farms?: unknown[] }; production?: { actualTotalTonnes?: number } };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.snapshot?.farms).toHaveLength(20);
    expect(body.production?.actualTotalTonnes).toBe(560);
  });

  it("returns a safe server error for an unreadable configured workbook", async () => {
    const missingPath = "this-workbook-does-not-exist.xlsx";
    const response = await withWorkbookPath(missingPath, GET);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe(
      "Unable to read the configured workbook. Check the server workbook path and try again.",
    );
    expect(JSON.stringify(body)).not.toContain(missingPath);
    expect(JSON.stringify(body)).not.toContain("ENOENT");
  });
});
