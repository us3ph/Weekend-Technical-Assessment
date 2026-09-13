import Decimal from "decimal.js";
import { z } from "zod";
import {
  ACCEPTANCE_MODES,
  SEGMENTS,
  type ClientInput,
  type FarmInput,
  type RawInputSnapshot,
  type ReferencePriceInput,
  type Segment,
  type SegmentMap,
  type SourceRecordLocation,
  type StationInput,
  type ValidatedInputSnapshot,
  type ValidationIssue,
  type ValidationIssueCode,
  type ValidationResult,
} from "./types";

/**
 * Domain assumptions applied here: all source numeric values must be actual
 * finite numbers (numeric strings are not coerced), prices cannot be negative,
 * and the station's local-market ratio is a finite fraction in [0, 1].
 * Expected capacity may use one decimal place; actual receipts, demand, and
 * station capacity use the business unit of 5 tonnes. Invalid input is never
 * rounded, rescaled, defaulted, or otherwise repaired.
 */

const sourceRecordSchema = z.record(z.string(), z.unknown());
const sourceSnapshotSchema = z.object({
  farms: z.array(sourceRecordSchema),
  clients: z.array(sourceRecordSchema),
  stations: z.array(sourceRecordSchema),
  referencePrices: z.array(sourceRecordSchema),
});

const FARM_SHEET = "Farms";
const CLIENT_SHEET = "Clients";
const STATION_SHEET = "Station";

const FARM_FIELD_LABELS = {
  farmId: "farm_id",
  farmName: "farm_name",
  expectedDailyCapacityT: "expected_daily_capacity_t",
} as const;

const CLIENT_FIELD_LABELS = {
  clientId: "client_id",
  clientName: "client_name",
  acceptanceMode: "acceptance_mode",
  requestedSegment: "requested_segment",
  demandT: "demand_t",
  exportPricePerTonneEur: "export_price_per_t_eur",
} as const;

const STATION_FIELD_LABELS = {
  stationId: "station_id",
  exportConditioningCapacityT: "export_conditioning_capacity_t",
  localMarketRatio: "local_market_ratio",
} as const;

const REFERENCE_FIELD_LABELS = {
  segment: "segment",
  referenceExportPricePerTonneEur: "reference_export_price_per_t_eur",
} as const;

type RecordValue = Record<string, unknown>;
type IssueLocation = Pick<ValidationIssue, "sheet" | "row" | "cell">;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSegment(value: unknown): value is Segment {
  return typeof value === "string" && (SEGMENTS as readonly string[]).includes(value);
}

function fallbackSource(sheet: string, row: number): SourceRecordLocation {
  return { sheet, row, cells: {} };
}

function sourceLocation(
  record: RecordValue,
  fallbackSheet: string,
  fallbackRow: number,
  issues: ValidationIssue[],
): SourceRecordLocation {
  const rawSource = record.source;
  if (rawSource === undefined) {
    // Loader-produced records should always include metadata. The fallback
    // keeps small unit fixtures usable while still giving their errors a row.
    return fallbackSource(fallbackSheet, fallbackRow);
  }

  if (!isRecord(rawSource)) {
    addIssue(
      issues,
      "INVALID_SOURCE_LOCATION",
      { sheet: fallbackSheet, row: fallbackRow, cell: null },
      "source",
      "Source location metadata must be an object.",
      "Retain the source sheet, row, and cell addresses when creating this record.",
    );
    return fallbackSource(fallbackSheet, fallbackRow);
  }

  const sheet = rawSource.sheet;
  const row = rawSource.row;
  const cells = rawSource.cells;
  const validSheet = typeof sheet === "string" && sheet.trim().length > 0;
  const validRow = typeof row === "number" && Number.isInteger(row) && row > 0;

  if (!validSheet || !validRow) {
    addIssue(
      issues,
      "INVALID_SOURCE_LOCATION",
      { sheet: fallbackSheet, row: fallbackRow, cell: null },
      "source",
      "Source location metadata must contain a nonempty sheet and positive row.",
      "Provide the original workbook sheet name and 1-based row number.",
    );
  }

  const normalizedCells: Partial<Record<string, string>> = {};
  if (cells !== undefined) {
    if (!isRecord(cells)) {
      addIssue(
        issues,
        "INVALID_SOURCE_LOCATION",
        {
          sheet: validSheet ? sheet : fallbackSheet,
          row: validRow ? row : fallbackRow,
          cell: null,
        },
        "source.cells",
        "Source cell metadata must be an object of field names to cell addresses.",
        "Provide cell addresses such as A5 or H5 for source fields.",
      );
    } else {
      for (const [field, cell] of Object.entries(cells)) {
        if (typeof cell !== "string" || cell.trim().length === 0) {
          addIssue(
            issues,
            "INVALID_SOURCE_LOCATION",
            {
              sheet: validSheet ? sheet : fallbackSheet,
              row: validRow ? row : fallbackRow,
              cell: null,
            },
            `source.cells.${field}`,
            "Each source cell address must be a nonempty string.",
            "Retain the original Excel cell address for this field.",
          );
          continue;
        }
        normalizedCells[field] = cell;
      }
    }
  }

  return {
    sheet: validSheet ? sheet : fallbackSheet,
    row: validRow ? row : fallbackRow,
    cells: normalizedCells,
  };
}

function locationFor(
  source: SourceRecordLocation,
  fieldKeys: readonly string[],
): IssueLocation {
  for (const key of fieldKeys) {
    const cell = source.cells[key];
    if (cell !== undefined) {
      return { sheet: source.sheet, row: source.row, cell };
    }
  }
  return { sheet: source.sheet, row: source.row, cell: null };
}

function addIssue(
  issues: ValidationIssue[],
  code: ValidationIssueCode,
  location: IssueLocation,
  field: string,
  message: string,
  correctiveText: string,
  entityId?: string,
): void {
  issues.push({
    code,
    ...location,
    ...(entityId === undefined ? {} : { entityId }),
    field,
    message,
    correctiveText,
  });
}

function issueForField(
  issues: ValidationIssue[],
  code: ValidationIssueCode,
  source: SourceRecordLocation,
  field: string,
  fieldKeys: readonly string[],
  message: string,
  correctiveText: string,
  entityId?: string,
): void {
  addIssue(
    issues,
    code,
    locationFor(source, fieldKeys),
    field,
    message,
    correctiveText,
    entityId,
  );
}

function readRequiredText(
  record: RecordValue,
  key: string,
  field: string,
  source: SourceRecordLocation,
  issues: ValidationIssue[],
  entityId?: string,
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    issueForField(
      issues,
      "MISSING_VALUE",
      source,
      field,
      [key, field],
      `${field} is missing.`,
      `Enter a nonempty ${field} value in the source row.`,
      entityId,
    );
    return undefined;
  }
  if (typeof value !== "string") {
    issueForField(
      issues,
      "INVALID_TYPE",
      source,
      field,
      [key, field],
      `${field} must be text.`,
      `Enter a nonempty ${field} text value; values are not coerced.`,
      entityId,
    );
    return undefined;
  }
  if (value.trim().length === 0) {
    issueForField(
      issues,
      "MISSING_VALUE",
      source,
      field,
      [key, field],
      `${field} cannot be blank.`,
      `Enter a nonempty ${field} value in the source row.`,
      entityId,
    );
    return undefined;
  }
  return value;
}

function readRequiredNumber(
  record: RecordValue,
  key: string,
  field: string,
  source: SourceRecordLocation,
  issues: ValidationIssue[],
  entityId?: string,
  fieldKeys: readonly string[] = [key, field],
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    issueForField(
      issues,
      "MISSING_VALUE",
      source,
      field,
      fieldKeys,
      `${field} is missing.`,
      `Enter a finite numeric ${field} value; do not use a blank or implicit zero.`,
      entityId,
    );
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issueForField(
      issues,
      "INVALID_TYPE",
      source,
      field,
      fieldKeys,
      `${field} must be a finite number.`,
      `Enter a finite numeric ${field} value; numeric strings, NaN, and Infinity are invalid.`,
      entityId,
    );
    return undefined;
  }
  return value;
}

function readEnum<T extends string>(
  record: RecordValue,
  key: string,
  field: string,
  allowed: readonly T[],
  source: SourceRecordLocation,
  issues: ValidationIssue[],
  invalidCode: "INVALID_MODE" | "INVALID_SEGMENT",
  entityId?: string,
): T | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    issueForField(
      issues,
      "MISSING_VALUE",
      source,
      field,
      [key, field],
      `${field} is missing.`,
      `Enter one of: ${allowed.join(", ")}.`,
      entityId,
    );
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issueForField(
      issues,
      invalidCode,
      source,
      field,
      [key, field],
      `${field} must be one of: ${allowed.join(", ")}.`,
      `Use exactly one of: ${allowed.join(", ")}; do not normalize other values silently.`,
      entityId,
    );
    return undefined;
  }
  return value as T;
}

function validateNonnegative(
  value: number | undefined,
  source: SourceRecordLocation,
  field: string,
  fieldKeys: readonly string[],
  issues: ValidationIssue[],
  entityId?: string,
): void {
  if (value !== undefined && value < 0) {
    issueForField(
      issues,
      "INVALID_VALUE",
      source,
      field,
      fieldKeys,
      `${field} cannot be negative.`,
      `Enter a nonnegative ${field} value; invalid negatives are not repaired.`,
      entityId,
    );
  }
}

function validateFraction(
  value: number | undefined,
  source: SourceRecordLocation,
  field: string,
  fieldKeys: readonly string[],
  issues: ValidationIssue[],
  entityId?: string,
): void {
  if (value !== undefined && (value < 0 || value > 1)) {
    issueForField(
      issues,
      "INVALID_VALUE",
      source,
      field,
      fieldKeys,
      `${field} must be between 0 and 1.`,
      `Enter a fraction in the inclusive range [0, 1]; do not enter a percentage or rescale it silently.`,
      entityId,
    );
  }
}

function validateMultipleOfFive(
  value: number | undefined,
  source: SourceRecordLocation,
  field: string,
  fieldKeys: readonly string[],
  issues: ValidationIssue[],
  entityId?: string,
): void {
  if (value !== undefined && value >= 0 && !new Decimal(value).mod(5).isZero()) {
    issueForField(
      issues,
      "INVALID_VALUE",
      source,
      field,
      fieldKeys,
      `${field} must be a nonnegative multiple of 5 tonnes.`,
      `Enter a value such as 0, 5, 10, or 15 tonnes; invalid quantities are not rounded.`,
      entityId,
    );
  }
}

function validateAtMostOneDecimal(
  value: number | undefined,
  source: SourceRecordLocation,
  field: string,
  fieldKeys: readonly string[],
  issues: ValidationIssue[],
  entityId?: string,
): void {
  if (value !== undefined && value >= 0 && new Decimal(value).decimalPlaces() > 1) {
    issueForField(
      issues,
      "INVALID_VALUE",
      source,
      field,
      fieldKeys,
      `${field} can have at most one decimal place.`,
      `Enter a nonnegative capacity with no more than one decimal place, such as 125.5.`,
      entityId,
    );
  }
}

function segmentField(
  mapKey: "expectedMix" | "actualTonnes",
  segment: Segment,
): { readonly label: string; readonly key: string; readonly sourceKeys: readonly string[] } {
  if (mapKey === "expectedMix") {
    const label = `expected_${segment}_pct`;
    return {
      label,
      key: `expectedMix.${segment}`,
      sourceKeys: [`expectedMix.${segment}`, label, `expectedMix_${segment}`],
    };
  }
  const label = `actual_${segment}_t`;
  return {
    label,
    key: `actualTonnes.${segment}`,
    sourceKeys: [`actualTonnes.${segment}`, label, `actualTonnes_${segment}`],
  };
}

function readSegmentMap(
  record: RecordValue,
  mapKey: "expectedMix" | "actualTonnes",
  source: SourceRecordLocation,
  issues: ValidationIssue[],
  entityId?: string,
): SegmentMap<number> | undefined {
  const rawMap = record[mapKey];
  if (rawMap === undefined || rawMap === null) {
    for (const segment of SEGMENTS) {
      const field = segmentField(mapKey, segment);
      issueForField(
        issues,
        "MISSING_VALUE",
        source,
        field.label,
        field.sourceKeys,
        `${field.label} is missing.`,
        `Provide a numeric ${field.label} value in the source row.`,
        entityId,
      );
    }
    return undefined;
  }
  if (!isRecord(rawMap)) {
    issueForField(
      issues,
      "INVALID_TYPE",
      source,
      mapKey,
      [mapKey],
      `${mapKey} must be an object containing A, B, C, and D values.`,
      `Provide one numeric value for each of A, B, C, and D.`,
      entityId,
    );
    return undefined;
  }

  for (const key of Object.keys(rawMap)) {
    if (!isSegment(key)) {
      issueForField(
        issues,
        "INVALID_SEGMENT",
        source,
        `${mapKey}.${key}`,
        [`${mapKey}.${key}`, mapKey],
        `${mapKey} contains unsupported segment ${key}.`,
        "Use only the four declared segments: A, B, C, and D.",
        entityId,
      );
    }
  }

  const result: Partial<SegmentMap<number>> = {};
  for (const segment of SEGMENTS) {
    const field = segmentField(mapKey, segment);
    const value = readRequiredNumber(
      rawMap,
      segment,
      field.label,
      source,
      issues,
      entityId,
      field.sourceKeys,
    );
    if (value !== undefined) {
      result[segment] = value;
      if (mapKey === "expectedMix") {
        validateFraction(value, source, field.label, field.sourceKeys, issues, entityId);
      } else {
        validateNonnegative(value, source, field.label, field.sourceKeys, issues, entityId);
        validateMultipleOfFive(value, source, field.label, field.sourceKeys, issues, entityId);
      }
    }
  }

  if (SEGMENTS.every((segment) => result[segment] !== undefined)) {
    return result as SegmentMap<number>;
  }
  return undefined;
}

function validateMixTotal(
  mix: SegmentMap<number> | undefined,
  source: SourceRecordLocation,
  entityId: string | undefined,
  issues: ValidationIssue[],
): void {
  if (mix === undefined) {
    return;
  }
  const total = SEGMENTS.reduce(
    (sum, segment) => sum.plus(mix[segment]),
    new Decimal(0),
  );
  if (!total.eq(1)) {
    issueForField(
      issues,
      "INVALID_VALUE",
      source,
      "expected_mix_total",
      SEGMENTS.flatMap((segment) => segmentField("expectedMix", segment).sourceKeys),
      `Expected mix fractions must total exactly 1; received ${total.toString()}.`,
      "Adjust the A/B/C/D fractions so their exact decimal sum is 1.",
      entityId,
    );
  }
}

function duplicateIds(
  rows: readonly { readonly id: string | undefined; readonly source: SourceRecordLocation }[],
  field: string,
  issues: ValidationIssue[],
): void {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.id !== undefined) {
      counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
    }
  }
  for (const row of rows) {
    if (row.id !== undefined && (counts.get(row.id) ?? 0) > 1) {
      issueForField(
        issues,
        "DUPLICATE_ID",
        row.source,
        field,
        [field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), field],
        `${field} ${row.id} is duplicated.`,
        `Give every ${field.replace(/_id$/, "")} a unique nonempty ID.`,
        row.id,
      );
    }
  }
}

function structuralIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    code: "INVALID_STRUCTURE",
    sheet: "InputSnapshot",
    row: null,
    cell: null,
    field: issue.path.length > 0 ? issue.path.join(".") : "snapshot",
    message: "The source snapshot has an invalid structure.",
    correctiveText:
      "Provide farms, clients, stations, and referencePrices as arrays of source records.",
  }));
}

/**
 * Validate the normalized source snapshot once for all server entry points.
 * A successful result contains only typed source inputs; no calculated values
 * are fabricated or attached here.
 */
export function validateInputSnapshot(input: unknown): ValidationResult<ValidatedInputSnapshot> {
  const parsed = sourceSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: structuralIssues(parsed.error) };
  }

  const issues: ValidationIssue[] = [];
  const farms: FarmInput[] = [];
  const farmIds: Array<{ readonly id: string | undefined; readonly source: SourceRecordLocation }> = [];

  parsed.data.farms.forEach((record, index) => {
    const source = sourceLocation(record, FARM_SHEET, index + 5, issues);
    const farmId = readRequiredText(
      record,
      "farmId",
      FARM_FIELD_LABELS.farmId,
      source,
      issues,
    );
    farmIds.push({ id: farmId, source });
    const farmName = readRequiredText(
      record,
      "farmName",
      FARM_FIELD_LABELS.farmName,
      source,
      issues,
      farmId,
    );
    const expectedDailyCapacityT = readRequiredNumber(
      record,
      "expectedDailyCapacityT",
      FARM_FIELD_LABELS.expectedDailyCapacityT,
      source,
      issues,
      farmId,
    );
    validateNonnegative(
      expectedDailyCapacityT,
      source,
      FARM_FIELD_LABELS.expectedDailyCapacityT,
      ["expectedDailyCapacityT", FARM_FIELD_LABELS.expectedDailyCapacityT],
      issues,
      farmId,
    );
    validateAtMostOneDecimal(
      expectedDailyCapacityT,
      source,
      FARM_FIELD_LABELS.expectedDailyCapacityT,
      ["expectedDailyCapacityT", FARM_FIELD_LABELS.expectedDailyCapacityT],
      issues,
      farmId,
    );
    const expectedMix = readSegmentMap(record, "expectedMix", source, issues, farmId);
    validateMixTotal(expectedMix, source, farmId, issues);
    const actualTonnes = readSegmentMap(record, "actualTonnes", source, issues, farmId);

    if (
      farmId !== undefined &&
      farmName !== undefined &&
      expectedDailyCapacityT !== undefined &&
      expectedMix !== undefined &&
      actualTonnes !== undefined
    ) {
      farms.push({
        farmId,
        farmName,
        expectedDailyCapacityT,
        expectedMix,
        actualTonnes,
        source,
      });
    }
  });
  duplicateIds(farmIds, FARM_FIELD_LABELS.farmId, issues);

  const clients: ClientInput[] = [];
  const clientIds: Array<{ readonly id: string | undefined; readonly source: SourceRecordLocation }> = [];
  parsed.data.clients.forEach((record, index) => {
    const source = sourceLocation(record, CLIENT_SHEET, index + 5, issues);
    const clientId = readRequiredText(
      record,
      "clientId",
      CLIENT_FIELD_LABELS.clientId,
      source,
      issues,
    );
    clientIds.push({ id: clientId, source });
    const clientName = readRequiredText(
      record,
      "clientName",
      CLIENT_FIELD_LABELS.clientName,
      source,
      issues,
      clientId,
    );
    const acceptanceMode = readEnum(
      record,
      "acceptanceMode",
      CLIENT_FIELD_LABELS.acceptanceMode,
      ACCEPTANCE_MODES,
      source,
      issues,
      "INVALID_MODE",
      clientId,
    );
    const requestedSegment = readEnum(
      record,
      "requestedSegment",
      CLIENT_FIELD_LABELS.requestedSegment,
      SEGMENTS,
      source,
      issues,
      "INVALID_SEGMENT",
      clientId,
    );
    const demandT = readRequiredNumber(
      record,
      "demandT",
      CLIENT_FIELD_LABELS.demandT,
      source,
      issues,
      clientId,
    );
    validateNonnegative(demandT, source, CLIENT_FIELD_LABELS.demandT, ["demandT", CLIENT_FIELD_LABELS.demandT], issues, clientId);
    validateMultipleOfFive(demandT, source, CLIENT_FIELD_LABELS.demandT, ["demandT", CLIENT_FIELD_LABELS.demandT], issues, clientId);
    const exportPricePerTonneEur = readRequiredNumber(
      record,
      "exportPricePerTonneEur",
      CLIENT_FIELD_LABELS.exportPricePerTonneEur,
      source,
      issues,
      clientId,
    );
    validateNonnegative(
      exportPricePerTonneEur,
      source,
      CLIENT_FIELD_LABELS.exportPricePerTonneEur,
      ["exportPricePerTonneEur", CLIENT_FIELD_LABELS.exportPricePerTonneEur],
      issues,
      clientId,
    );

    if (
      clientId !== undefined &&
      clientName !== undefined &&
      acceptanceMode !== undefined &&
      requestedSegment !== undefined &&
      demandT !== undefined &&
      exportPricePerTonneEur !== undefined
    ) {
      clients.push({
        clientId,
        clientName,
        acceptanceMode,
        requestedSegment,
        demandT,
        exportPricePerTonneEur,
        source,
      });
    }
  });
  duplicateIds(clientIds, CLIENT_FIELD_LABELS.clientId, issues);

  let station: StationInput | undefined;
  const rawStations = parsed.data.stations;
  if (rawStations.length !== 1) {
    addIssue(
      issues,
      "INVALID_STATION_COUNT",
      {
        sheet: STATION_SHEET,
        row: rawStations.length === 0 ? null : 5,
        cell: null,
      },
      "station",
      `Expected exactly one station record; received ${rawStations.length}.`,
      "Provide one valid station parameter record and remove any duplicate station records.",
    );
  }
  rawStations.forEach((record, index) => {
    const source = sourceLocation(record, STATION_SHEET, index + 5, issues);
    const stationId = readRequiredText(
      record,
      "stationId",
      STATION_FIELD_LABELS.stationId,
      source,
      issues,
    );
    const exportConditioningCapacityT = readRequiredNumber(
      record,
      "exportConditioningCapacityT",
      STATION_FIELD_LABELS.exportConditioningCapacityT,
      source,
      issues,
      stationId,
    );
    validateNonnegative(
      exportConditioningCapacityT,
      source,
      STATION_FIELD_LABELS.exportConditioningCapacityT,
      ["exportConditioningCapacityT", STATION_FIELD_LABELS.exportConditioningCapacityT],
      issues,
      stationId,
    );
    validateMultipleOfFive(
      exportConditioningCapacityT,
      source,
      STATION_FIELD_LABELS.exportConditioningCapacityT,
      ["exportConditioningCapacityT", STATION_FIELD_LABELS.exportConditioningCapacityT],
      issues,
      stationId,
    );
    const localMarketRatio = readRequiredNumber(
      record,
      "localMarketRatio",
      STATION_FIELD_LABELS.localMarketRatio,
      source,
      issues,
      stationId,
    );
    validateFraction(
      localMarketRatio,
      source,
      STATION_FIELD_LABELS.localMarketRatio,
      ["localMarketRatio", STATION_FIELD_LABELS.localMarketRatio],
      issues,
      stationId,
    );

    if (
      rawStations.length === 1 &&
      stationId !== undefined &&
      exportConditioningCapacityT !== undefined &&
      localMarketRatio !== undefined
    ) {
      station = {
        stationId,
        exportConditioningCapacityT,
        localMarketRatio,
        source,
      };
    }
  });

  const referencePrices: Partial<SegmentMap<ReferencePriceInput>> = {};
  const referenceRowsBySegment = new Map<Segment, SourceRecordLocation[]>();
  parsed.data.referencePrices.forEach((record, index) => {
    const source = sourceLocation(record, STATION_SHEET, index + 16, issues);
    const segment = readEnum(
      record,
      "segment",
      REFERENCE_FIELD_LABELS.segment,
      SEGMENTS,
      source,
      issues,
      "INVALID_SEGMENT",
    );
    const referenceExportPricePerTonneEur = readRequiredNumber(
      record,
      "referenceExportPricePerTonneEur",
      REFERENCE_FIELD_LABELS.referenceExportPricePerTonneEur,
      source,
      issues,
    );
    validateNonnegative(
      referenceExportPricePerTonneEur,
      source,
      REFERENCE_FIELD_LABELS.referenceExportPricePerTonneEur,
      [
        "referenceExportPricePerTonneEur",
        REFERENCE_FIELD_LABELS.referenceExportPricePerTonneEur,
      ],
      issues,
    );

    if (segment !== undefined) {
      const rows = referenceRowsBySegment.get(segment) ?? [];
      rows.push(source);
      referenceRowsBySegment.set(segment, rows);
      if (rows.length > 1) {
        issueForField(
          issues,
          "DUPLICATE_REFERENCE",
          source,
          `reference_price.${segment}`,
          ["segment", REFERENCE_FIELD_LABELS.segment],
          `Reference price for segment ${segment} is duplicated.`,
          `Keep exactly one reference export price row for segment ${segment}.`,
        );
      }
    }

    if (
      segment !== undefined &&
      referenceExportPricePerTonneEur !== undefined &&
      (referenceRowsBySegment.get(segment)?.length ?? 0) === 1
    ) {
      referencePrices[segment] = {
        segment,
        referenceExportPricePerTonneEur,
        source,
      };
    }
  });

  for (const segment of SEGMENTS) {
    if ((referenceRowsBySegment.get(segment)?.length ?? 0) === 0) {
      addIssue(
        issues,
        "MISSING_REFERENCE",
        { sheet: STATION_SHEET, row: null, cell: null },
        `reference_price.${segment}`,
        `Reference price for segment ${segment} is missing.`,
        `Provide exactly one finite nonnegative reference export price for segment ${segment}.`,
      );
    }
  }

  if (issues.length > 0 || station === undefined) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      farms,
      clients,
      station,
      referencePrices: referencePrices as SegmentMap<ReferencePriceInput>,
    },
    issues: [],
  };
}

/** Alias used by server loaders when naming the input as source data. */
export const validateSourceSnapshot = validateInputSnapshot;

// Keep the raw contract visible to consumers that want to type a loader result
// without making this module depend on a workbook reader.
export type { RawInputSnapshot };
