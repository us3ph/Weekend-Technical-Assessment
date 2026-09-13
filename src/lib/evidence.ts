import Decimal from "decimal.js";
import { deriveCommercialClientFacts, type CommercialClientFacts } from "./commercial";
import { SEGMENTS, type InputVersion, type PlanningResult, type Segment, type SegmentMap, type WorkbookData } from "./types";

/** The only planning topics that can be grounded by this snapshot. */
export const EVIDENCE_INTENTS = ["risk", "production-gap", "local-residual"] as const;
export type EvidenceIntent = (typeof EVIDENCE_INTENTS)[number];

export type EvidenceReference =
  | { readonly kind: "farm"; readonly id: string }
  | { readonly kind: "client"; readonly id: string }
  | { readonly kind: "segment"; readonly id: Segment }
  | { readonly kind: "allocation"; readonly id: string }
  | { readonly kind: "residual"; readonly id: string };

interface EvidenceFactBase {
  readonly id: string;
  readonly intent: EvidenceIntent;
  readonly inputVersion: InputVersion;
  /** Server-owned factual copy. Model output is never rendered as this text. */
  readonly allowedText: string;
  readonly references: readonly EvidenceReference[];
}

export interface RiskFactValues {
  readonly rank: number;
  readonly clientId: string;
  readonly clientName: string;
  readonly acceptanceMode: "EXACT" | "MINIMUM";
  readonly requestedSegment: Segment;
  readonly demandT: number;
  readonly allocatedTonnes: number;
  readonly remainingTonnes: number;
  readonly status: "PARTIAL" | "UNSERVED";
  readonly shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT" | "STATION_CAPACITY_REACHED";
  readonly compatibleSegments: readonly Segment[];
  readonly compatibleAvailableAtProcessingTonnes: number;
  readonly higherPriorityAllocatedTonnes: number;
  readonly higherPriorityClientIds: readonly string[];
  readonly stationCapacityAvailableAtProcessingTonnes: number;
  readonly stationCapacityT: number;
}

export interface RiskFact extends EvidenceFactBase {
  readonly intent: "risk";
  readonly kind: "client-risk";
  readonly values: RiskFactValues;
}

export interface RiskClearFact extends EvidenceFactBase {
  readonly intent: "risk";
  readonly kind: "no-at-risk-clients";
  readonly values: {
    readonly atRiskCount: 0;
  };
}

export interface ProductionGapValues {
  readonly rank: number;
  readonly scope: "farm-segment" | "segment";
  readonly farmId?: string;
  readonly segment: Segment;
  readonly expectedTonnes: number;
  readonly actualTonnes: number;
  readonly varianceTonnes: number;
  readonly segmentExpectedTonnes: number;
  readonly segmentActualTonnes: number;
  readonly segmentVarianceTonnes: number;
  readonly compatibleAtRiskClientIds: readonly string[];
  readonly compatibleAtRiskUnmetDemandT: number;
}

export interface ProductionGapFact extends EvidenceFactBase {
  readonly intent: "production-gap";
  readonly kind: "farm-segment-gap" | "segment-gap";
  readonly values: ProductionGapValues;
}

export interface ProductionGapClearFact extends EvidenceFactBase {
  readonly intent: "production-gap";
  readonly kind: "no-negative-production-gaps";
  readonly values: {
    readonly negativeGapCount: 0;
  };
}

export type LocalConstraintKind =
  | "STATION_CAPACITY_REACHED"
  | "QUALITY_COMPATIBILITY"
  | "NO_COMPATIBLE_UNMET_DEMAND"
  | "NONE";

export interface LocalConstraint {
  readonly kind: LocalConstraintKind;
  readonly segment?: Segment;
  readonly clientIds: readonly string[];
}

export interface LocalSummaryValues {
  readonly totalTonnes: number;
  readonly composition: SegmentMap<number>;
  readonly localValueEur: number;
  readonly stationUsedTonnes: number;
  readonly stationCapacityT: number;
  readonly stationCapacityReached: boolean;
  readonly residualSegments: readonly Segment[];
  readonly qualityLimitedSegments: readonly Segment[];
  readonly qualityLimitedClientIds: readonly string[];
  readonly capacityLimitedClientIds: readonly string[];
  readonly constraints: readonly LocalConstraint[];
}

export interface LocalSummaryFact extends EvidenceFactBase {
  readonly intent: "local-residual";
  readonly kind: "local-summary";
  readonly values: LocalSummaryValues;
}

export interface LocalResidualFact extends EvidenceFactBase {
  readonly intent: "local-residual";
  readonly kind: "local-residual";
  readonly values: {
    readonly residualId: string;
    readonly farmId: string;
    readonly segment: Segment;
    readonly tonnes: number;
    readonly localPricePerTonneEur: number;
    readonly localValueEur: number;
  };
}

export type EvidenceFact =
  | RiskFact
  | RiskClearFact
  | ProductionGapFact
  | ProductionGapClearFact
  | LocalSummaryFact
  | LocalResidualFact;

export interface EvidenceFactIds {
  readonly risk: readonly string[];
  readonly "production-gap": readonly string[];
  readonly "local-residual": readonly string[];
}

export interface EvidenceCatalog {
  readonly inputVersion: InputVersion;
  readonly facts: readonly EvidenceFact[];
  /** Every required fact must be selected before an answer is renderable. */
  readonly requiredFactIds: EvidenceFactIds;
}

export interface EvidenceContext {
  readonly inputVersion: InputVersion;
  readonly intent: EvidenceIntent;
  readonly facts: readonly EvidenceFact[];
  readonly requiredFactIds: readonly string[];
}

const QUALITY_RANK: Record<Segment, number> = { A: 0, B: 1, C: 2, D: 3 };
const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const moneyFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

function formatSignedTonnes(value: number): string {
  if (value > 0) return `+${formatTonnes(value)}`;
  return formatTonnes(value);
}

function formatMoney(value: number): string {
  return `EUR ${moneyFormatter.format(value)}`;
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareNumbersDescending(left: number, right: number): number {
  if (left > right) return -1;
  if (left < right) return 1;
  return 0;
}

function joinLabels(values: readonly string[], emptyLabel: string): string {
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return values[0] ?? emptyLabel;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function versionMatches(left: InputVersion, right: InputVersion): boolean {
  return left.algorithm === right.algorithm && left.value === right.value;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total.plus(value), new Decimal(0)).toNumber();
}

function riskOrder(left: CommercialClientFacts, right: CommercialClientFacts): number {
  const leftRemaining = left.outcome?.remainingTonnes ?? 0;
  const rightRemaining = right.outcome?.remainingTonnes ?? 0;
  const remainingOrder = compareNumbersDescending(leftRemaining, rightRemaining);
  if (remainingOrder !== 0) return remainingOrder;
  const leftPrice = left.client.exportPricePerTonneEur;
  const rightPrice = right.client.exportPricePerTonneEur;
  const priceOrder = compareNumbersDescending(leftPrice, rightPrice);
  return priceOrder === 0 ? compareIds(left.client.clientId, right.client.clientId) : priceOrder;
}

function assertFactReferences(
  workbook: WorkbookData,
  plan: PlanningResult,
  facts: readonly EvidenceFact[],
): void {
  const farmIds = new Set(workbook.snapshot.farms.map((farm) => farm.farmId));
  const clientIds = new Set(workbook.snapshot.clients.map((client) => client.clientId));
  const allocationIds = new Set(plan.allocations.map((allocation) => allocation.allocationId));
  const residualIds = new Set(plan.localResiduals.map((residual) => residual.residualId));
  const factIds = new Set<string>();

  for (const fact of facts) {
    if (factIds.has(fact.id)) {
      throw new Error(`Evidence fact ID ${fact.id} is not unique.`);
    }
    factIds.add(fact.id);
    if (!versionMatches(fact.inputVersion, workbook.snapshot.version)) {
      throw new Error(`Evidence fact ${fact.id} belongs to a different input version.`);
    }
    for (const reference of fact.references) {
      const known = reference.kind === "farm"
        ? farmIds.has(reference.id)
        : reference.kind === "client"
          ? clientIds.has(reference.id)
          : reference.kind === "allocation"
            ? allocationIds.has(reference.id)
            : reference.kind === "residual"
              ? residualIds.has(reference.id)
              : SEGMENTS.includes(reference.id);
      if (!known) {
        throw new Error(`Evidence fact ${fact.id} references unknown ${reference.kind} ${reference.id}.`);
      }
    }
  }
}

function clientsForRisk(
  facts: readonly CommercialClientFacts[],
): readonly CommercialClientFacts[] {
  return facts
    .filter((factsForClient) => factsForClient.outcome?.status !== "COMPLETE")
    .sort(riskOrder);
}

function createRiskFacts(
  workbook: WorkbookData,
  commercialFacts: readonly CommercialClientFacts[],
): readonly (RiskFact | RiskClearFact)[] {
  const atRisk = clientsForRisk(commercialFacts);
  if (atRisk.length === 0) {
    return [{
      id: "risk:none",
      intent: "risk",
      kind: "no-at-risk-clients",
      inputVersion: workbook.snapshot.version,
      allowedText: "No client is at risk in the current server-calculated plan; every positive-demand order is complete.",
      references: [],
      values: { atRiskCount: 0 },
    }];
  }

  return atRisk.map((factsForClient, index) => {
    const outcome = factsForClient.outcome;
    const evidence = factsForClient.evidence;
    if (outcome === null || evidence === null || outcome.status === "COMPLETE") {
      throw new Error(`Risk evidence is incomplete for ${factsForClient.client.clientId}.`);
    }

    if (outcome.shortageReason === null) {
      throw new Error(`Risk evidence has no shortage reason for ${factsForClient.client.clientId}.`);
    }

    const values: RiskFactValues = {
      rank: index + 1,
      clientId: factsForClient.client.clientId,
      clientName: factsForClient.client.clientName,
      acceptanceMode: factsForClient.client.acceptanceMode,
      requestedSegment: factsForClient.client.requestedSegment,
      demandT: outcome.demandT,
      allocatedTonnes: outcome.allocatedTonnes,
      remainingTonnes: outcome.remainingTonnes,
      status: outcome.status,
      shortageReason: outcome.shortageReason,
      compatibleSegments: evidence.compatibleSegments,
      compatibleAvailableAtProcessingTonnes: evidence.compatibleAvailableAtProcessingTonnes,
      higherPriorityAllocatedTonnes: evidence.higherPriorityAllocatedTonnes,
      higherPriorityClientIds: evidence.higherPriorityClientIds,
      stationCapacityAvailableAtProcessingTonnes: evidence.stationCapacityAvailableAtProcessingTonnes,
      stationCapacityT: evidence.stationCapacityT,
    };

    const references: EvidenceReference[] = [
      { kind: "client", id: values.clientId },
      { kind: "segment", id: values.requestedSegment },
      ...values.compatibleSegments.map((segment): EvidenceReference => ({ kind: "segment", id: segment })),
      ...values.higherPriorityClientIds.map((clientId): EvidenceReference => ({ kind: "client", id: clientId })),
    ];
    const compatible = values.compatibleSegments.join("/");
    const priorityText = values.higherPriorityAllocatedTonnes > 0
      ? ` Higher-priced orders had already used ${formatTonnes(values.higherPriorityAllocatedTonnes)} of compatible supply (${joinLabels(values.higherPriorityClientIds, "known higher-priced orders")}).`
      : " No higher-priced order had used compatible supply before this client.";
    const constraintText = values.shortageReason === "STATION_CAPACITY_REACHED"
      ? `At its processing point, ${formatTonnes(values.stationCapacityAvailableAtProcessingTonnes)} of the ${formatTonnes(values.stationCapacityT)} station capacity was available; the plan allocated ${formatTonnes(values.allocatedTonnes)} before capacity was reached.`
      : `At its processing point, ${formatTonnes(values.compatibleAvailableAtProcessingTonnes)} of compatible ${compatible} supply was available.`;

    return {
      id: stableId("risk:client", values.clientId),
      intent: "risk",
      kind: "client-risk",
      inputVersion: workbook.snapshot.version,
      allowedText: `${values.rank}. ${values.clientId} · ${values.clientName} is ${values.status.toLowerCase()}: ${formatTonnes(values.allocatedTonnes)} allocated of ${formatTonnes(values.demandT)} demand, leaving ${formatTonnes(values.remainingTonnes)} unmet. ${constraintText}${values.shortageReason === "INSUFFICIENT_COMPATIBLE_SEGMENT" ? priorityText : ""} The recorded shortage reason is ${values.shortageReason === "STATION_CAPACITY_REACHED" ? "station capacity reached" : "insufficient compatible segment"}.`,
      references,
      values,
    } satisfies RiskFact;
  });
}

interface GapCandidate {
  readonly scope: "farm-segment" | "segment";
  readonly farmId?: string;
  readonly segment: Segment;
  readonly expectedTonnes: number;
  readonly actualTonnes: number;
  readonly varianceTonnes: number;
  readonly segmentExpectedTonnes: number;
  readonly segmentActualTonnes: number;
  readonly segmentVarianceTonnes: number;
  readonly compatibleAtRiskClientIds: readonly string[];
  readonly compatibleAtRiskUnmetDemandT: number;
}

function compatibleAtRiskForSegment(
  segment: Segment,
  commercialFacts: readonly CommercialClientFacts[],
): { readonly clientIds: readonly string[]; readonly unmetDemandT: number } {
  const compatible = commercialFacts
    .filter((factsForClient) => {
      const outcome = factsForClient.outcome;
      const evidence = factsForClient.evidence;
      return outcome !== null && outcome.status !== "COMPLETE" && evidence?.compatibleSegments.includes(segment);
    })
    .sort(riskOrder);
  return {
    clientIds: compatible.map((factsForClient) => factsForClient.client.clientId),
    unmetDemandT: new Decimal(sum(compatible.map((factsForClient) => factsForClient.outcome?.remainingTonnes ?? 0))).toNumber(),
  };
}

function gapOrder(left: GapCandidate, right: GapCandidate): number {
  const varianceOrder = compareNumbersDescending(Math.abs(left.varianceTonnes), Math.abs(right.varianceTonnes));
  if (varianceOrder !== 0) return varianceOrder;
  const segmentOrder = QUALITY_RANK[left.segment] - QUALITY_RANK[right.segment];
  if (segmentOrder !== 0) return segmentOrder;
  if (left.scope !== right.scope) return left.scope === "segment" ? -1 : 1;
  return compareIds(left.farmId ?? "", right.farmId ?? "");
}

function createGapFact(
  workbook: WorkbookData,
  candidate: GapCandidate,
  rank: number,
): ProductionGapFact {
  const scopeLabel = candidate.scope === "farm-segment"
    ? `${candidate.farmId} ${candidate.segment}`
    : `segment ${candidate.segment}`;
  const clientText = candidate.compatibleAtRiskClientIds.length > 0
    ? ` At-risk clients ${joinLabels(candidate.compatibleAtRiskClientIds, "") } can accept this segment under their recorded acceptance rules, with ${formatTonnes(candidate.compatibleAtRiskUnmetDemandT)} combined unmet demand; this shared compatibility evidence does not assign the farm to a client or prove causation.`
    : " No currently at-risk client in this snapshot is compatible with this segment.";
  const references: EvidenceReference[] = [
    ...(candidate.farmId === undefined ? [] : [{ kind: "farm", id: candidate.farmId } satisfies EvidenceReference]),
    { kind: "segment", id: candidate.segment },
    ...candidate.compatibleAtRiskClientIds.map((clientId): EvidenceReference => ({ kind: "client", id: clientId })),
  ];
  const values: ProductionGapValues = {
    rank,
    scope: candidate.scope,
    ...(candidate.farmId === undefined ? {} : { farmId: candidate.farmId }),
    segment: candidate.segment,
    expectedTonnes: candidate.expectedTonnes,
    actualTonnes: candidate.actualTonnes,
    varianceTonnes: candidate.varianceTonnes,
    segmentExpectedTonnes: candidate.segmentExpectedTonnes,
    segmentActualTonnes: candidate.segmentActualTonnes,
    segmentVarianceTonnes: candidate.segmentVarianceTonnes,
    compatibleAtRiskClientIds: candidate.compatibleAtRiskClientIds,
    compatibleAtRiskUnmetDemandT: candidate.compatibleAtRiskUnmetDemandT,
  };
  return {
    id: candidate.scope === "farm-segment"
      ? stableId("gap:farm", `${candidate.farmId}:${candidate.segment}`)
      : stableId("gap:segment", candidate.segment),
    intent: "production-gap",
    kind: candidate.scope === "farm-segment" ? "farm-segment-gap" : "segment-gap",
    inputVersion: workbook.snapshot.version,
    allowedText: `${rank}. ${scopeLabel} is ${formatSignedTonnes(candidate.varianceTonnes)} versus expected production: ${formatTonnes(candidate.actualTonnes)} actual against ${formatTonnes(candidate.expectedTonnes)} expected. The aggregate ${candidate.segment} comparison is ${formatSignedTonnes(candidate.segmentVarianceTonnes)} (${formatTonnes(candidate.segmentActualTonnes)} actual versus ${formatTonnes(candidate.segmentExpectedTonnes)} expected).${clientText}`,
    references,
    values,
  };
}

function createGapFacts(
  workbook: WorkbookData,
  commercialFacts: readonly CommercialClientFacts[],
): readonly (ProductionGapFact | ProductionGapClearFact)[] {
  const segmentComparisons = new Map(workbook.production.segments.map((comparison) => [comparison.segment, comparison]));
  const candidates: GapCandidate[] = [];

  for (const farm of workbook.production.farms) {
    for (const segment of SEGMENTS) {
      const comparison = farm.segments[segment];
      if (comparison.varianceTonnes >= 0) continue;
      const segmentComparison = segmentComparisons.get(segment);
      if (segmentComparison === undefined) throw new Error(`Production comparison is missing segment ${segment}.`);
      const compatible = compatibleAtRiskForSegment(segment, commercialFacts);
      candidates.push({
        scope: "farm-segment",
        farmId: farm.farmId,
        segment,
        expectedTonnes: comparison.expectedTonnes,
        actualTonnes: comparison.actualTonnes,
        varianceTonnes: comparison.varianceTonnes,
        segmentExpectedTonnes: segmentComparison.expectedTonnes,
        segmentActualTonnes: segmentComparison.actualTonnes,
        segmentVarianceTonnes: segmentComparison.varianceTonnes,
        compatibleAtRiskClientIds: compatible.clientIds,
        compatibleAtRiskUnmetDemandT: compatible.unmetDemandT,
      });
    }
  }

  for (const comparison of workbook.production.segments) {
    if (comparison.varianceTonnes >= 0) continue;
    const compatible = compatibleAtRiskForSegment(comparison.segment, commercialFacts);
    candidates.push({
      scope: "segment",
      segment: comparison.segment,
      expectedTonnes: comparison.expectedTonnes,
      actualTonnes: comparison.actualTonnes,
      varianceTonnes: comparison.varianceTonnes,
      segmentExpectedTonnes: comparison.expectedTonnes,
      segmentActualTonnes: comparison.actualTonnes,
      segmentVarianceTonnes: comparison.varianceTonnes,
      compatibleAtRiskClientIds: compatible.clientIds,
      compatibleAtRiskUnmetDemandT: compatible.unmetDemandT,
    });
  }

  const ordered = candidates.sort(gapOrder);
  if (ordered.length === 0) {
    return [{
      id: "gap:none",
      intent: "production-gap",
      kind: "no-negative-production-gaps",
      inputVersion: workbook.snapshot.version,
      allowedText: "No farm-segment or aggregate segment production gap is negative in the current server-calculated comparison.",
      references: [],
      values: { negativeGapCount: 0 },
    }];
  }
  return ordered.map((candidate, index) => createGapFact(workbook, candidate, index + 1));
}

function emptyComposition(): SegmentMap<number> {
  return { A: 0, B: 0, C: 0, D: 0 };
}

function compositionText(composition: SegmentMap<number>, segments: readonly Segment[]): string {
  if (segments.length === 0) return "none";
  return segments.map((segment) => `${formatTonnes(composition[segment])} ${segment}`).join(", ");
}

function constraintsForLocal(
  workbook: WorkbookData,
  plan: PlanningResult,
  riskFacts: readonly (RiskFact | RiskClearFact)[],
  residualSegments: readonly Segment[],
): {
  readonly constraints: readonly LocalConstraint[];
  readonly qualityLimitedSegments: readonly Segment[];
  readonly qualityLimitedClientIds: readonly string[];
  readonly capacityLimitedClientIds: readonly string[];
} {
  const clientRiskFacts = riskFacts.filter((fact): fact is RiskFact => fact.kind === "client-risk");
  const qualityLimitedSegments = residualSegments.filter((segment) =>
    clientRiskFacts.some((fact) => fact.values.remainingTonnes > 0 && !fact.values.compatibleSegments.includes(segment)),
  );
  const qualityLimitedClientIds = [...new Set(qualityLimitedSegments.flatMap((segment) =>
    clientRiskFacts
      .filter((fact) => fact.values.remainingTonnes > 0 && !fact.values.compatibleSegments.includes(segment))
      .map((fact) => fact.values.clientId),
  ))];
  const capacityLimitedClientIds = clientRiskFacts
    .filter((fact) => fact.values.shortageReason === "STATION_CAPACITY_REACHED")
    .map((fact) => fact.values.clientId);
  const constraints: LocalConstraint[] = [];

  if (
    plan.kpis.localTonnes > 0 &&
    plan.kpis.exportedTonnes >= workbook.snapshot.station.exportConditioningCapacityT
  ) {
    constraints.push({
      kind: "STATION_CAPACITY_REACHED",
      clientIds: capacityLimitedClientIds,
    });
  }
  for (const segment of qualityLimitedSegments) {
    constraints.push({
      kind: "QUALITY_COMPATIBILITY",
      segment,
      clientIds: clientRiskFacts
        .filter((fact) => fact.values.remainingTonnes > 0 && !fact.values.compatibleSegments.includes(segment))
        .map((fact) => fact.values.clientId),
    });
  }
  if (plan.kpis.localTonnes > 0 && constraints.length === 0) {
    constraints.push({ kind: "NO_COMPATIBLE_UNMET_DEMAND", clientIds: [] });
  }
  if (plan.kpis.localTonnes === 0) {
    constraints.push({ kind: "NONE", clientIds: [] });
  }

  return { constraints, qualityLimitedSegments, qualityLimitedClientIds, capacityLimitedClientIds };
}

function localConstraintText(
  values: LocalSummaryValues,
): string {
  return values.constraints.map((constraint) => {
    switch (constraint.kind) {
      case "STATION_CAPACITY_REACHED":
        return `Station constraint: ${formatTonnes(values.stationUsedTonnes)} was processed against ${formatTonnes(values.stationCapacityT)} capacity, so the station was full at the relevant processing point${constraint.clientIds.length > 0 ? ` for ${joinLabels(constraint.clientIds, "the affected order")}` : ""}.`;
      case "QUALITY_COMPATIBILITY":
        return `Quality constraint: residual ${constraint.segment ?? "fruit"} cannot satisfy the higher-quality requests from ${joinLabels(constraint.clientIds, "the affected clients")} under their recorded acceptance rules. This is shared compatibility evidence, not a farm-to-client cause.`;
      case "NO_COMPATIBLE_UNMET_DEMAND":
        return "Demand constraint: no compatible unmet demand remained for the residual segments at their processing points.";
      case "NONE":
        return "Constraint: no local residual remains in this plan.";
    }
  }).join(" ");
}

function createLocalFacts(
  workbook: WorkbookData,
  plan: PlanningResult,
  riskFacts: readonly (RiskFact | RiskClearFact)[],
): readonly [LocalSummaryFact, ...LocalResidualFact[]] {
  const composition = emptyComposition();
  const residualSegments = SEGMENTS.filter((segment) => plan.localResiduals.some((residual) => residual.segment === segment));
  for (const residual of plan.localResiduals) {
    composition[residual.segment] += residual.tonnes;
  }
  const constraints = constraintsForLocal(workbook, plan, riskFacts, residualSegments);
  const values: LocalSummaryValues = {
    totalTonnes: plan.kpis.localTonnes,
    composition,
    localValueEur: plan.kpis.localValueEur,
    stationUsedTonnes: plan.kpis.exportedTonnes,
    stationCapacityT: workbook.snapshot.station.exportConditioningCapacityT,
    stationCapacityReached: plan.kpis.exportedTonnes >= workbook.snapshot.station.exportConditioningCapacityT,
    residualSegments,
    qualityLimitedSegments: constraints.qualityLimitedSegments,
    qualityLimitedClientIds: constraints.qualityLimitedClientIds,
    capacityLimitedClientIds: constraints.capacityLimitedClientIds,
    constraints: constraints.constraints,
  };
  const residualText = compositionText(values.composition, values.residualSegments);
  const summaryText = values.totalTonnes > 0
    ? `The current plan leaves ${formatTonnes(values.totalTonnes)} local. Composition: ${residualText}. ${localConstraintText(values)} Calculated local reference value: ${formatMoney(values.localValueEur)}. This is a reference comparison from the station ratio and segment prices, not guaranteed lost profit or achievable additional sales.`
    : `The current plan leaves no local residual. Composition: none. ${localConstraintText(values)} Calculated local reference value: ${formatMoney(values.localValueEur)}.`;
  const summaryReferences: EvidenceReference[] = [
    ...plan.localResiduals.flatMap((residual): EvidenceReference[] => [
      { kind: "farm", id: residual.farmId },
      { kind: "segment", id: residual.segment },
      { kind: "residual", id: residual.residualId },
    ]),
    ...values.qualityLimitedClientIds.map((clientId): EvidenceReference => ({ kind: "client", id: clientId })),
    ...values.capacityLimitedClientIds.map((clientId): EvidenceReference => ({ kind: "client", id: clientId })),
  ];
  const summary: LocalSummaryFact = {
    id: "local:summary",
    intent: "local-residual",
    kind: "local-summary",
    inputVersion: workbook.snapshot.version,
    allowedText: summaryText,
    references: summaryReferences,
    values,
  };
  const details = plan.localResiduals.map((residual): LocalResidualFact => ({
    id: stableId("local:residual", residual.residualId),
    intent: "local-residual",
    kind: "local-residual",
    inputVersion: workbook.snapshot.version,
    allowedText: `${residual.farmId} leaves ${formatTonnes(residual.tonnes)} of segment ${residual.segment} local at ${formatMoney(residual.localPricePerTonneEur)} per tonne, for a calculated reference value of ${formatMoney(residual.localValueEur)}.`,
    references: [
      { kind: "farm", id: residual.farmId },
      { kind: "segment", id: residual.segment },
      { kind: "residual", id: residual.residualId },
    ],
    values: {
      residualId: residual.residualId,
      farmId: residual.farmId,
      segment: residual.segment,
      tonnes: residual.tonnes,
      localPricePerTonneEur: residual.localPricePerTonneEur,
      localValueEur: residual.localValueEur,
    },
  }));
  return [summary, ...details];
}

/**
 * Build the complete server-owned evidence catalog for one immutable plan.
 * The plan and workbook must refer to the same content-derived version.
 */
export function buildEvidenceCatalog(
  workbook: WorkbookData,
  plan: PlanningResult,
): EvidenceCatalog {
  if (!versionMatches(workbook.snapshot.version, plan.inputVersion)) {
    throw new Error("Cannot build evidence for a plan from a different input version.");
  }

  const commercialFacts = deriveCommercialClientFacts(workbook, plan);
  const riskFacts = createRiskFacts(workbook, commercialFacts);
  const gapFacts = createGapFacts(workbook, commercialFacts);
  const localFacts = createLocalFacts(workbook, plan, riskFacts);
  const facts: readonly EvidenceFact[] = [...riskFacts, ...gapFacts, ...localFacts];
  assertFactReferences(workbook, plan, facts);

  return {
    inputVersion: workbook.snapshot.version,
    facts,
    requiredFactIds: {
      risk: riskFacts.map((fact) => fact.id),
      "production-gap": gapFacts.map((fact) => fact.id),
      "local-residual": [localFacts[0].id],
    },
  };
}

/** Return the smallest server-owned context for one supported intent. */
export function evidenceContextForIntent(
  catalog: EvidenceCatalog,
  intent: EvidenceIntent,
): EvidenceContext {
  return {
    inputVersion: catalog.inputVersion,
    intent,
    facts: catalog.facts.filter((fact) => fact.intent === intent),
    requiredFactIds: catalog.requiredFactIds[intent],
  };
}

export function factById(
  catalog: EvidenceCatalog,
  factId: string,
): EvidenceFact | undefined {
  return catalog.facts.find((fact) => fact.id === factId);
}
