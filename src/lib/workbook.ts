/**
 * Server-only workbook loading. This module deliberately imports the Node
 * reader and filesystem APIs; browser code should consume its returned data
 * through the /api/workbook route instead.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readSheet,
  SheetNotFoundError,
  type Row,
  type SheetData,
} from "read-excel-file/node";
import { calculateProductionComparison } from "./calculations";
import {
  SEGMENTS,
  type DataHealth,
  type InputSnapshot,
  type RawClientInput,
  type RawFarmInput,
  type RawInputSnapshot,
  type RawReferencePriceInput,
  type RawStationInput,
  type SourceRecordLocation,
  type ValidationIssue,
  type WorkbookData,
} from "./types";
import { validateInputSnapshot } from "./validation";

const FARM_SHEET = "Farms" as const;
const CLIENT_SHEET = "Clients" as const;
const STATION_SHEET = "Station" as const;
const FARM_HEADER_ROW = 4;
const CLIENT_HEADER_ROW = 4;
const STATION_HEADER_ROW = 4;
const REFERENCE_HEADER_ROW = 16;
const DEFAULT_WORKBOOK_NAME = "Atlas_Fresh_Production_Commercial_Data.xlsx";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultWorkbookPath = resolve(repoRoot, DEFAULT_WORKBOOK_NAME);

interface ColumnSpec {
  readonly key: string;
  readonly header: string;
}

const FARM_COLUMNS: readonly ColumnSpec[] = [
  { key: "farmId", header: "farm_id" },
  { key: "farmName", header: "farm_name" },
  { key: "expectedDailyCapacityT", header: "expected_daily_capacity_t" },
  ...SEGMENTS.map((segment) => ({
    key: `expectedMix.${segment}`,
    header: `expected_${segment}_pct`,
  })),
  ...SEGMENTS.map((segment) => ({
    key: `actualTonnes.${segment}`,
    header: `actual_${segment}_t`,
  })),
];

const CLIENT_COLUMNS: readonly ColumnSpec[] = [
  { key: "clientId", header: "client_id" },
  { key: "clientName", header: "client_name" },
  { key: "acceptanceMode", header: "acceptance_mode" },
  { key: "requestedSegment", header: "requested_segment" },
  { key: "demandT", header: "demand_t" },
  { key: "exportPricePerTonneEur", header: "export_price_per_t_eur" },
];

const STATION_COLUMNS: readonly ColumnSpec[] = [
  { key: "stationId", header: "station_id" },
  { key: "exportConditioningCapacityT", header: "export_conditioning_capacity_t" },
  { key: "localMarketRatio", header: "local_market_ratio" },
];

const REFERENCE_COLUMNS: readonly ColumnSpec[] = [
  { key: "segment", header: "segment" },
  { key: "referenceExportPricePerTonneEur", header: "reference_export_price_per_t_eur" },
];

export interface WorkbookRows {
  readonly farms: SheetData;
  readonly clients: SheetData;
  readonly station: SheetData;
}

export type WorkbookLoadResult =
  | { readonly ok: true; readonly value: WorkbookData }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function cellAddress(columnIndex: number, rowNumber: number): string {
  let value = columnIndex + 1;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return `${letters}${rowNumber}`;
}

function issue(
  code: ValidationIssue["code"],
  sheet: string,
  row: number | null,
  cell: string | null,
  field: string,
  message: string,
  correctiveText: string,
): ValidationIssue {
  return { code, sheet, row, cell, field, message, correctiveText };
}

function isBlankCell(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function isMeaningfulRow(row: Row | undefined): boolean {
  return row?.some((value) => !isBlankCell(value)) ?? false;
}

function lastMeaningfulRow(rows: SheetData, startIndex: number): number | null {
  for (let index = rows.length - 1; index >= startIndex; index -= 1) {
    if (isMeaningfulRow(rows[index])) {
      return index;
    }
  }
  return null;
}

function literalCell(
  row: Row | undefined,
  columnIndex: number | undefined,
  sheet: string,
  rowNumber: number,
  field: string,
  issues: ValidationIssue[],
): unknown {
  const value = columnIndex === undefined ? undefined : row?.[columnIndex];
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }

  const cell = columnIndex === undefined ? null : cellAddress(columnIndex, rowNumber);
  issues.push(
    issue(
      "INVALID_TYPE",
      sheet,
      rowNumber,
      cell,
      field,
      `${field} contains an unsupported workbook cell type.`,
      "Use a literal text or numeric cell value in the declared table; formulas and objects are not supported.",
    ),
  );
  return value;
}

function sourceLocation(
  sheet: string,
  rowNumber: number,
  columns: ReadonlyMap<string, number>,
): SourceRecordLocation {
  const cells: Record<string, string> = {};
  for (const [key, columnIndex] of columns) {
    cells[key] = cellAddress(columnIndex, rowNumber);
  }
  return { sheet, row: rowNumber, cells };
}

function headerColumns(
  sheet: string,
  rows: SheetData | undefined,
  headerRowNumber: number,
  requiredColumns: readonly ColumnSpec[],
  issues: ValidationIssue[],
): Map<string, number> | undefined {
  const header = rows?.[headerRowNumber - 1];
  if (header === undefined) {
    issues.push(
      issue(
        "INVALID_STRUCTURE",
        sheet,
        headerRowNumber,
        null,
        "header",
        `${sheet} is missing its required header row ${headerRowNumber}.`,
        `Restore the declared ${sheet} headers on row ${headerRowNumber}.`,
      ),
    );
    return undefined;
  }

  const found = new Map<string, number>();
  for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
    const value = header[columnIndex];
    if (isBlankCell(value)) {
      continue;
    }
    if (typeof value !== "string") {
      issues.push(
        issue(
          "INVALID_STRUCTURE",
          sheet,
          headerRowNumber,
          cellAddress(columnIndex, headerRowNumber),
          "header",
          `${sheet} header cells must be literal text.`,
          "Use the exact declared text headers and remove unsupported header cell values.",
        ),
      );
      continue;
    }
    if (found.has(value)) {
      issues.push(
        issue(
          "INVALID_STRUCTURE",
          sheet,
          headerRowNumber,
          cellAddress(columnIndex, headerRowNumber),
          "header",
          `${sheet} contains the duplicate header ${value}.`,
          `Keep exactly one ${value} column in the ${sheet} table.`,
        ),
      );
      continue;
    }
    found.set(value, columnIndex);
  }

  const columns = new Map<string, number>();
  for (const required of requiredColumns) {
    const columnIndex = found.get(required.header);
    if (columnIndex === undefined) {
      issues.push(
        issue(
          "INVALID_STRUCTURE",
          sheet,
          headerRowNumber,
          null,
          required.header,
          `${sheet} is missing required header ${required.header}.`,
          `Restore the exact ${required.header} header on row ${headerRowNumber}.`,
        ),
      );
      continue;
    }
    columns.set(required.key, columnIndex);
  }
  return columns;
}

function cell(
  row: Row | undefined,
  columns: ReadonlyMap<string, number>,
  key: string,
  sheet: string,
  rowNumber: number,
  issues: ValidationIssue[],
): unknown {
  return literalCell(row, columns.get(key), sheet, rowNumber, key, issues);
}

function farmRows(
  rows: SheetData | undefined,
  columns: ReadonlyMap<string, number> | undefined,
  issues: ValidationIssue[],
): RawFarmInput[] {
  if (rows === undefined || columns === undefined) {
    return [];
  }
  const startIndex = FARM_HEADER_ROW;
  const lastIndex = lastMeaningfulRow(rows, startIndex);
  if (lastIndex === null) {
    issues.push(
      issue(
        "INVALID_STRUCTURE",
        FARM_SHEET,
        FARM_HEADER_ROW + 1,
        null,
        "rows",
        "Farms has no data rows after its header.",
        "Provide at least one farm record beginning on row 5.",
      ),
    );
    return [];
  }

  const result: RawFarmInput[] = [];
  for (let rowIndex = startIndex; rowIndex <= lastIndex; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const row = rows[rowIndex];
    const source = sourceLocation(FARM_SHEET, rowNumber, columns);
    const expectedMix: Record<string, unknown> = {};
    const actualTonnes: Record<string, unknown> = {};
    for (const segment of SEGMENTS) {
      expectedMix[segment] = cell(row, columns, `expectedMix.${segment}`, FARM_SHEET, rowNumber, issues);
      actualTonnes[segment] = cell(row, columns, `actualTonnes.${segment}`, FARM_SHEET, rowNumber, issues);
    }
    result.push({
      farmId: cell(row, columns, "farmId", FARM_SHEET, rowNumber, issues),
      farmName: cell(row, columns, "farmName", FARM_SHEET, rowNumber, issues),
      expectedDailyCapacityT: cell(row, columns, "expectedDailyCapacityT", FARM_SHEET, rowNumber, issues),
      expectedMix,
      actualTonnes,
      source,
    });
  }
  return result;
}

function clientRows(
  rows: SheetData | undefined,
  columns: ReadonlyMap<string, number> | undefined,
  issues: ValidationIssue[],
): RawClientInput[] {
  if (rows === undefined || columns === undefined) {
    return [];
  }
  const startIndex = CLIENT_HEADER_ROW;
  const lastIndex = lastMeaningfulRow(rows, startIndex);
  if (lastIndex === null) {
    issues.push(
      issue(
        "INVALID_STRUCTURE",
        CLIENT_SHEET,
        CLIENT_HEADER_ROW + 1,
        null,
        "rows",
        "Clients has no data rows after its header.",
        "Provide at least one client record beginning on row 5.",
      ),
    );
    return [];
  }

  const result: RawClientInput[] = [];
  for (let rowIndex = startIndex; rowIndex <= lastIndex; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const row = rows[rowIndex];
    const source = sourceLocation(CLIENT_SHEET, rowNumber, columns);
    result.push({
      clientId: cell(row, columns, "clientId", CLIENT_SHEET, rowNumber, issues),
      clientName: cell(row, columns, "clientName", CLIENT_SHEET, rowNumber, issues),
      acceptanceMode: cell(row, columns, "acceptanceMode", CLIENT_SHEET, rowNumber, issues),
      requestedSegment: cell(row, columns, "requestedSegment", CLIENT_SHEET, rowNumber, issues),
      demandT: cell(row, columns, "demandT", CLIENT_SHEET, rowNumber, issues),
      exportPricePerTonneEur: cell(row, columns, "exportPricePerTonneEur", CLIENT_SHEET, rowNumber, issues),
      source,
    });
  }
  return result;
}

function stationRows(
  rows: SheetData | undefined,
  columns: ReadonlyMap<string, number> | undefined,
  issues: ValidationIssue[],
): RawStationInput[] {
  if (rows === undefined || columns === undefined) {
    return [];
  }
  const rowIndex = STATION_HEADER_ROW;
  const rowNumber = rowIndex + 1;
  const row = rows[rowIndex];
  const hasData = Array.from(columns.values()).some((columnIndex) => !isBlankCell(row?.[columnIndex]));
  if (!hasData) {
    return [];
  }
  const source = sourceLocation(STATION_SHEET, rowNumber, columns);
  return [
    {
      stationId: cell(row, columns, "stationId", STATION_SHEET, rowNumber, issues),
      exportConditioningCapacityT: cell(
        row,
        columns,
        "exportConditioningCapacityT",
        STATION_SHEET,
        rowNumber,
        issues,
      ),
      localMarketRatio: cell(row, columns, "localMarketRatio", STATION_SHEET, rowNumber, issues),
      source,
    },
  ];
}

function referenceRows(
  rows: SheetData | undefined,
  columns: ReadonlyMap<string, number> | undefined,
  issues: ValidationIssue[],
): RawReferencePriceInput[] {
  if (rows === undefined || columns === undefined) {
    return [];
  }
  const startIndex = REFERENCE_HEADER_ROW;
  const lastIndex = lastMeaningfulRow(rows, startIndex);
  if (lastIndex === null) {
    return [];
  }

  const result: RawReferencePriceInput[] = [];
  for (let rowIndex = startIndex; rowIndex <= lastIndex; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const row = rows[rowIndex];
    const source = sourceLocation(STATION_SHEET, rowNumber, columns);
    result.push({
      segment: cell(row, columns, "segment", STATION_SHEET, rowNumber, issues),
      referenceExportPricePerTonneEur: cell(
        row,
        columns,
        "referenceExportPricePerTonneEur",
        STATION_SHEET,
        rowNumber,
        issues,
      ),
      source,
    });
  }
  return result;
}

/** Parse already-read sheets. Exported to make workbook structure checks independently testable. */
export function parseWorkbookRows(rows: WorkbookRows): {
  readonly snapshot: RawInputSnapshot;
  readonly issues: readonly ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const farmColumns = headerColumns(FARM_SHEET, rows.farms, FARM_HEADER_ROW, FARM_COLUMNS, issues);
  const clientColumns = headerColumns(CLIENT_SHEET, rows.clients, CLIENT_HEADER_ROW, CLIENT_COLUMNS, issues);
  const stationColumns = headerColumns(STATION_SHEET, rows.station, STATION_HEADER_ROW, STATION_COLUMNS, issues);
  const referenceColumns = headerColumns(
    STATION_SHEET,
    rows.station,
    REFERENCE_HEADER_ROW,
    REFERENCE_COLUMNS,
    issues,
  );

  return {
    snapshot: {
      farms: farmRows(rows.farms, farmColumns, issues),
      clients: clientRows(rows.clients, clientColumns, issues),
      stations: stationRows(rows.station, stationColumns, issues),
      referencePrices: referenceRows(rows.station, referenceColumns, issues),
    },
    issues,
  };
}

function isMissingSheetError(error: unknown): boolean {
  return error instanceof SheetNotFoundError || (error as { constructor?: { name?: string } })?.constructor?.name === "SheetNotFoundError";
}

async function readRequiredSheet(
  workbook: Buffer,
  sheet: string,
  issues: ValidationIssue[],
): Promise<SheetData | undefined> {
  try {
    return await readSheet(workbook, sheet, { trim: false });
  } catch (error) {
    if (!isMissingSheetError(error)) {
      throw error;
    }
    issues.push(
      issue(
        "INVALID_STRUCTURE",
        sheet,
        null,
        null,
        "sheet",
        `Required workbook sheet ${sheet} is missing.`,
        `Add a sheet named exactly ${sheet} with its declared table structure.`,
      ),
    );
    return undefined;
  }
}

async function readWorkbookRows(workbook: Buffer): Promise<{
  readonly rows: WorkbookRows;
  readonly issues: readonly ValidationIssue[];
}> {
  const issues: ValidationIssue[] = [];
  const [farms, clients, station] = await Promise.all([
    readRequiredSheet(workbook, FARM_SHEET, issues),
    readRequiredSheet(workbook, CLIENT_SHEET, issues),
    readRequiredSheet(workbook, STATION_SHEET, issues),
  ]);
  return {
    rows: {
      farms: farms ?? [],
      clients: clients ?? [],
      station: station ?? [],
    },
    issues,
  };
}

function workbookPath(): string {
  const configuredPath = process.env.WORKBOOK_PATH?.trim();
  return configuredPath === undefined || configuredPath.length === 0
    ? defaultWorkbookPath
    : resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

function contentVersion(workbook: Buffer): InputSnapshot["version"] {
  return {
    algorithm: "sha256",
    value: createHash("sha256").update(workbook).digest("hex"),
  };
}

function dataHealth(sourceFileName: string, snapshot: InputSnapshot): DataHealth {
  return {
    status: "VALID",
    sourceFileName,
    farmCount: snapshot.farms.length,
    clientCount: snapshot.clients.length,
    stationCount: 1,
    referencePriceCount: SEGMENTS.length,
  };
}

/** Read, validate, version, and compare the configured workbook. */
export async function loadWorkbook(): Promise<WorkbookLoadResult> {
  const path = workbookPath();
  const workbook = await readFile(path);
  const version = contentVersion(workbook);
  const loaded = await readWorkbookRows(workbook);

  if (loaded.issues.length > 0) {
    return { ok: false, issues: loaded.issues };
  }

  const parsed = parseWorkbookRows(loaded.rows);
  if (parsed.issues.length > 0) {
    return { ok: false, issues: parsed.issues };
  }

  const validated = validateInputSnapshot(parsed.snapshot);
  if (!validated.ok) {
    return validated;
  }

  const snapshot: InputSnapshot = { ...validated.value, version };
  return {
    ok: true,
    value: {
      snapshot,
      production: calculateProductionComparison(snapshot),
      health: dataHealth(basename(path), snapshot),
    },
  };
}

export { DEFAULT_WORKBOOK_NAME };
