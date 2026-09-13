import { SEGMENTS } from "./types";
import type {
  Allocation,
  FarmSegmentBalance,
  InputSnapshot,
  LocalResidual,
  PlanningResult,
  Segment,
  WorkbookData,
} from "./types";
import type { WorkspaceSelection } from "./workspace";

const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export interface AllocationLocalFacts {
  readonly allocations: readonly Allocation[];
  readonly localResiduals: readonly LocalResidual[];
  readonly balances: readonly FarmSegmentBalance[];
  readonly exportedTonnes: number;
  readonly localTonnes: number;
  readonly localValueEur: number;
}

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

function processingOrder(snapshot: InputSnapshot) {
  return [...snapshot.clients].sort((left, right) => {
    if (left.exportPricePerTonneEur !== right.exportPricePerTonneEur) {
      return right.exportPricePerTonneEur - left.exportPricePerTonneEur;
    }
    return left.clientId < right.clientId ? -1 : left.clientId > right.clientId ? 1 : 0;
  });
}

/** A single projection keeps trace tables faithful to the server plan. */
export function deriveAllocationLocalFacts(plan?: PlanningResult): AllocationLocalFacts | null {
  if (plan === undefined) return null;

  return {
    allocations: plan.allocations,
    localResiduals: plan.localResiduals,
    balances: plan.balances,
    exportedTonnes: plan.kpis.exportedTonnes,
    localTonnes: plan.kpis.localTonnes,
    localValueEur: plan.kpis.localValueEur,
  };
}

export function isAllocationFocus(
  allocation: Allocation,
  selection: WorkspaceSelection | null,
): boolean {
  if (selection === null) return false;
  if (selection.kind === "allocation") return allocation.allocationId === selection.allocationId;
  if (selection.kind === "client") return allocation.clientId === selection.clientId;
  if (selection.kind === "segment") {
    return allocation.segment === selection.segment || allocation.requestedSegment === selection.segment;
  }
  return false;
}

export function isLocalFocus(
  residual: LocalResidual,
  selection: WorkspaceSelection | null,
): boolean {
  if (selection === null) return false;
  if (selection.kind === "local") {
    return (
      (selection.residualId === undefined || residual.residualId === selection.residualId) &&
      (selection.farmId === undefined || residual.farmId === selection.farmId) &&
      (selection.segment === null || residual.segment === selection.segment)
    );
  }
  if (selection.kind === "segment") return residual.segment === selection.segment;
  return false;
}

export function isBalanceFocus(
  balance: FarmSegmentBalance,
  selection: WorkspaceSelection | null,
): boolean {
  if (selection === null) return false;
  if (selection.kind === "segment") return balance.segment === selection.segment;
  if (selection.kind === "allocation") return false;
  if (selection.kind === "local") {
    return (
      (selection.farmId === undefined || balance.farmId === selection.farmId) &&
      (selection.segment === null || balance.segment === selection.segment)
    );
  }
  return false;
}

export interface TraceExplanation {
  readonly kind: "quality" | "capacity" | "comparison";
  readonly text: string;
}

/**
 * Narrative helpers use only server-calculated plan facts. They deliberately
 * describe shared segment evidence instead of assigning a farm to a client.
 */
export function deriveTraceExplanations(
  workbook: WorkbookData,
  plan?: PlanningResult,
): readonly TraceExplanation[] {
  if (plan === undefined) return [];

  const residualD = plan.localResiduals
    .filter((residual) => residual.segment === "D")
    .reduce((sum, residual) => sum + residual.tonnes, 0);
  const explanations: TraceExplanation[] = [];
  if (residualD > 0) {
    explanations.push({
      kind: "quality",
      text: `${formatTonnes(residualD)} of the current residual is segment D. D is below A and B in the quality order, so an A/B request cannot accept it: EXACT accepts only the requested segment and MINIMUM accepts the requested segment or better. This is shared compatibility evidence, not a farm-to-client obligation.`,
    });
  }

  const dEligibleClients = processingOrder(workbook.snapshot).filter(
    (client) => client.requestedSegment === "D",
  );
  const finalDEligibleClient = dEligibleClients.at(-1);
  const finalDOutcome = finalDEligibleClient === undefined
    ? undefined
    : plan.clientOutcomes.find((outcome) => outcome.clientId === finalDEligibleClient.clientId);
  if (
    finalDEligibleClient !== undefined &&
    finalDOutcome?.shortageReason === "STATION_CAPACITY_REACHED"
  ) {
    const usedBefore = workbook.snapshot.station.exportConditioningCapacityT - finalDOutcome.allocatedTonnes;
    explanations.push({
      kind: "capacity",
      text: `${finalDEligibleClient.clientId} is the final D-eligible order in the deterministic price/ID sequence. Only ${formatTonnes(finalDOutcome.allocatedTonnes)} of station room remained at that processing point; the station then reached its ${formatTonnes(workbook.snapshot.station.exportConditioningCapacityT)} capacity, leaving ${formatTonnes(finalDOutcome.remainingTonnes)} unmet. The ${formatTonnes(usedBefore)} already used is processing-order evidence, not a farm assignment.`,
    });
  }

  const cComparison = workbook.production.segments.find((comparison) => comparison.segment === "C");
  const cClients = workbook.snapshot.clients.filter((client) => client.requestedSegment === "C");
  const cOutcomes = cClients.map((client) => plan.clientOutcomes.find((outcome) => outcome.clientId === client.clientId));
  if (cComparison !== undefined && cClients.length > 0 && cOutcomes.every((outcome) => outcome?.status === "COMPLETE")) {
    explanations.push({
      kind: "comparison",
      text: `Segment C receipts are ${formatTonnes(cComparison.varianceTonnes)} versus the expected production plan, while all ${cClients.length} baseline C order${cClients.length === 1 ? " is" : "s are"} complete. The production-plan gap is therefore a comparison signal, not a current C demand shortage.`,
    });
  }

  return explanations;
}

export function segmentsWithLocalResiduals(plan: PlanningResult): readonly Segment[] {
  return SEGMENTS.filter((segment) => plan.localResiduals.some((residual) => residual.segment === segment));
}
