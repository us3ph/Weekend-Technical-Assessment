/**
 * Shared business vocabulary. These types are deliberately independent of
 * React, Next.js, workbook readers, and HTTP so the server can reuse them at
 * every entry point.
 */

export const SEGMENTS = ["A", "B", "C", "D"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const ACCEPTANCE_MODES = ["EXACT", "MINIMUM"] as const;
export type AcceptanceMode = (typeof ACCEPTANCE_MODES)[number];

export const CLIENT_STATUSES = ["COMPLETE", "PARTIAL", "UNSERVED"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const SHORTAGE_REASONS = [
  "INSUFFICIENT_COMPATIBLE_SEGMENT",
  "STATION_CAPACITY_REACHED",
] as const;
export type ShortageReason = (typeof SHORTAGE_REASONS)[number];

export type SegmentMap<T> = { [segment in Segment]: T };

/** A single source cell retained for actionable validation and evidence. */
export interface SourceLocation {
  readonly sheet: string;
  readonly row: number;
  readonly cell: string;
}

/**
 * Row-level source metadata. `cells` maps normalized domain field names (and,
 * where useful, nested names such as `expectedMix.A`) to Excel addresses.
 */
export interface SourceRecordLocation {
  readonly sheet: string;
  readonly row: number;
  readonly cells: Readonly<Partial<Record<string, string>>>;
}

/**
 * Raw, source-backed records. Values remain unknown until validation succeeds;
 * missing fields therefore cannot be mistaken for zeroes.
 *
 * The workbook loader in Step 03 will normalize workbook headers into these
 * camel-case keys while retaining the original source locations.
 */
export interface RawFarmInput {
  readonly farmId?: unknown;
  readonly farmName?: unknown;
  readonly expectedDailyCapacityT?: unknown;
  readonly expectedMix?: Partial<Record<Segment, unknown>>;
  readonly actualTonnes?: Partial<Record<Segment, unknown>>;
  readonly source?: SourceRecordLocation;
}

export interface RawClientInput {
  readonly clientId?: unknown;
  readonly clientName?: unknown;
  readonly acceptanceMode?: unknown;
  readonly requestedSegment?: unknown;
  readonly demandT?: unknown;
  readonly exportPricePerTonneEur?: unknown;
  readonly source?: SourceRecordLocation;
}

export interface RawStationInput {
  readonly stationId?: unknown;
  readonly exportConditioningCapacityT?: unknown;
  readonly localMarketRatio?: unknown;
  readonly source?: SourceRecordLocation;
}

export interface RawReferencePriceInput {
  readonly segment?: unknown;
  readonly referenceExportPricePerTonneEur?: unknown;
  readonly source?: SourceRecordLocation;
}

/** The normalized but not-yet-validated source snapshot supplied by a loader. */
export interface RawInputSnapshot {
  readonly farms: readonly RawFarmInput[];
  readonly clients: readonly RawClientInput[];
  readonly stations: readonly RawStationInput[];
  readonly referencePrices: readonly RawReferencePriceInput[];
}

/** Validated source inputs. No calculated result is stored on these records. */
export interface FarmInput {
  readonly farmId: string;
  readonly farmName: string;
  readonly expectedDailyCapacityT: number;
  readonly expectedMix: SegmentMap<number>;
  readonly actualTonnes: SegmentMap<number>;
  readonly source: SourceRecordLocation;
}

export interface ClientInput {
  readonly clientId: string;
  readonly clientName: string;
  readonly acceptanceMode: AcceptanceMode;
  readonly requestedSegment: Segment;
  readonly demandT: number;
  readonly exportPricePerTonneEur: number;
  readonly source: SourceRecordLocation;
}

export interface StationInput {
  readonly stationId: string;
  readonly exportConditioningCapacityT: number;
  readonly localMarketRatio: number;
  readonly source: SourceRecordLocation;
}

export interface ReferencePriceInput {
  readonly segment: Segment;
  readonly referenceExportPricePerTonneEur: number;
  readonly source: SourceRecordLocation;
}

/** A content-derived version is added by the workbook loader after validation. */
export interface InputVersion {
  readonly algorithm: "sha256";
  readonly value: string;
}

/** Validated inputs before a content-derived version has been attached. */
export interface ValidatedInputSnapshot {
  readonly farms: readonly FarmInput[];
  readonly clients: readonly ClientInput[];
  readonly station: StationInput;
  readonly referencePrices: SegmentMap<ReferencePriceInput>;
}

/** The immutable input snapshot used by planning and every later server route. */
export interface InputSnapshot extends ValidatedInputSnapshot {
  readonly version: InputVersion;
}

/** A server-calculated comparison; it is not a source record. */
export interface SegmentComparison {
  readonly segment: Segment;
  readonly expectedTonnes: number;
  readonly actualTonnes: number;
  readonly varianceTonnes: number;
}

export interface FarmComparison {
  readonly farmId: string;
  readonly expectedCapacityT: number;
  readonly actualTotalTonnes: number;
  readonly varianceTonnes: number;
  readonly segments: SegmentMap<SegmentComparison>;
}

export interface ProductionComparison {
  readonly expectedTotalTonnes: number;
  readonly actualTotalTonnes: number;
  readonly varianceTonnes: number;
  readonly segments: readonly SegmentComparison[];
  readonly farms: readonly FarmComparison[];
}

export interface QualityUpgrade {
  /** The actual received segment used to serve the client. */
  readonly fromSegment: Segment;
  /** The client's requested segment. */
  readonly toSegment: Segment;
  /** Zero for an exact fit; larger values indicate higher-quality fruit used. */
  readonly levels: number;
}

/** A server-calculated export trace row. */
export interface Allocation {
  readonly farmId: string;
  readonly segment: Segment;
  readonly clientId: string;
  readonly requestedSegment: Segment;
  readonly tonnes: number;
  readonly qualityUpgrade: QualityUpgrade;
  readonly exportPricePerTonneEur: number;
  readonly exportRevenueEur: number;
}

/** Server-calculated conservation balance for one farm and actual segment. */
export interface FarmSegmentBalance {
  readonly farmId: string;
  readonly segment: Segment;
  readonly actualTonnes: number;
  readonly exportedTonnes: number;
  readonly localTonnes: number;
}

export interface LocalResidual {
  readonly farmId: string;
  readonly segment: Segment;
  readonly tonnes: number;
  readonly localPricePerTonneEur: number;
  readonly localValueEur: number;
}

/**
 * Zero-demand clients are COMPLETE because their demand is satisfied. A null
 * shortage reason is used for complete outcomes.
 */
export interface ClientOutcome {
  readonly clientId: string;
  readonly acceptanceMode: AcceptanceMode;
  readonly requestedSegment: Segment;
  readonly demandT: number;
  readonly allocatedTonnes: number;
  readonly remainingTonnes: number;
  readonly exportRevenueEur: number;
  readonly status: ClientStatus;
  readonly shortageReason: ShortageReason | null;
}

/** Ratios are null when their denominator is zero and should be displayed as N/A. */
export interface PlanningKpis {
  readonly expectedTotalTonnes: number;
  readonly actualTotalTonnes: number;
  readonly stationCapacityT: number;
  readonly exportedTonnes: number;
  readonly stationUtilization: number | null;
  readonly exportRate: number | null;
  readonly localTonnes: number;
  readonly exportRevenueEur: number;
  readonly localValueEur: number;
  readonly totalValueEur: number;
  readonly atRiskCount: number;
}

/** Complete calculated output shape reserved for the planning step. */
export interface PlanningResult {
  readonly inputVersion: InputVersion;
  readonly production: ProductionComparison;
  readonly allocations: readonly Allocation[];
  readonly balances: readonly FarmSegmentBalance[];
  readonly localResiduals: readonly LocalResidual[];
  readonly clientOutcomes: readonly ClientOutcome[];
  readonly kpis: PlanningKpis;
}

export type ValidationIssueCode =
  | "INVALID_STRUCTURE"
  | "INVALID_SOURCE_LOCATION"
  | "MISSING_VALUE"
  | "INVALID_TYPE"
  | "INVALID_VALUE"
  | "DUPLICATE_ID"
  | "INVALID_MODE"
  | "INVALID_SEGMENT"
  | "DUPLICATE_REFERENCE"
  | "MISSING_REFERENCE"
  | "INVALID_STATION_COUNT";

/** A source-aware, corrective validation diagnostic returned by the server. */
export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly sheet: string;
  readonly row: number | null;
  readonly cell: string | null;
  readonly entityId?: string;
  readonly field: string;
  readonly message: string;
  readonly correctiveText: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
