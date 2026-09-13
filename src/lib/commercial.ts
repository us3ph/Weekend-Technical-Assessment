import { SEGMENTS } from "./types";
import type {
  Allocation,
  ClientInput,
  ClientOutcome,
  FarmSegmentBalance,
  PlanningResult,
  Segment,
  WorkbookData,
} from "./types";

const QUALITY_RANK: Record<Segment, number> = { A: 0, B: 1, C: 2, D: 3 };
const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export interface CommercialSupplyEvidence {
  /** Segments that satisfy this client's EXACT/MINIMUM rule. */
  readonly compatibleSegments: readonly Segment[];
  /** Actual receipts in those segments across all farms. */
  readonly actualCompatibleTonnes: number;
  /** Compatible tonnes allocated to clients processed before this client. */
  readonly higherPriorityAllocatedTonnes: number;
  readonly higherPriorityClientIds: readonly string[];
  /** Compatible actual receipts still available when this client was processed. */
  readonly compatibleAvailableAtProcessingTonnes: number;
  /** Station capacity remaining before and after this client was processed. */
  readonly stationUsedBeforeTonnes: number;
  readonly stationCapacityT: number;
  readonly stationCapacityAvailableAtProcessingTonnes: number;
  readonly stationUsedAfterTonnes: number;
}

export interface CommercialClientFacts {
  readonly client: ClientInput;
  /** Null before the server has generated a matching plan. */
  readonly outcome: ClientOutcome | null;
  readonly allocations: readonly Allocation[];
  readonly evidence: CommercialSupplyEvidence | null;
}

function compatibleSegments(client: ClientInput): Segment[] {
  return SEGMENTS.filter((segment) =>
    client.acceptanceMode === "EXACT"
      ? segment === client.requestedSegment
      : QUALITY_RANK[segment as Segment] <= QUALITY_RANK[client.requestedSegment],
  );
}

function allocationsByClient(plan: PlanningResult): Map<string, readonly Allocation[]> {
  const result = new Map<string, Allocation[]>();
  for (const allocation of plan.allocations) {
    const clientAllocations = result.get(allocation.clientId) ?? [];
    clientAllocations.push(allocation);
    result.set(allocation.clientId, clientAllocations);
  }
  return result;
}

function balancesBySegment(plan: PlanningResult): Map<Segment, FarmSegmentBalance[]> {
  const result = new Map<Segment, FarmSegmentBalance[]>();
  for (const balance of plan.balances) {
    const segmentBalances = result.get(balance.segment) ?? [];
    segmentBalances.push(balance);
    result.set(balance.segment, segmentBalances);
  }
  return result;
}

function processingOrder(clients: readonly ClientInput[]): readonly ClientInput[] {
  return [...clients].sort((left, right) => {
    if (left.exportPricePerTonneEur !== right.exportPricePerTonneEur) {
      return right.exportPricePerTonneEur - left.exportPricePerTonneEur;
    }
    return left.clientId < right.clientId ? -1 : left.clientId > right.clientId ? 1 : 0;
  });
}

function sumTonnes(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

export function statusLabel(status: ClientOutcome["status"] | null): string {
  if (status === null) return "Pending plan";
  if (status === "COMPLETE") return "Complete";
  if (status === "PARTIAL") return "Partial";
  return "Unserved";
}

export function shortageReasonLabel(
  reason: ClientOutcome["shortageReason"],
): string {
  if (reason === null) return "No shortage — demand fully covered";
  if (reason === "INSUFFICIENT_COMPATIBLE_SEGMENT") return "Insufficient compatible segment";
  return "Station capacity reached at this client";
}

function clientName(clientNames: ReadonlyMap<string, string>, clientId: string): string {
  return clientNames.get(clientId) ?? clientId;
}

/**
 * Explain the reason fixed by the planning engine at this client's processing
 * point. The wording uses only plan-derived quantities and never infers a
 * farm-to-client obligation from shared supply.
 */
export function explainClientOutcome(
  facts: CommercialClientFacts,
  clientNames: ReadonlyMap<string, string> = new Map(),
): string {
  if (facts.outcome === null || facts.evidence === null) {
    return "Generate a plan to calculate allocation, remaining demand, and shortage evidence.";
  }

  const { outcome, evidence } = facts;
  if (outcome.status === "COMPLETE") {
    return `Demand is fully covered: ${formatTonnes(outcome.allocatedTonnes)} allocated of ${formatTonnes(outcome.demandT)}.`;
  }

  const segments = evidence.compatibleSegments.join("/");
  if (outcome.shortageReason === "INSUFFICIENT_COMPATIBLE_SEGMENT") {
    const higherPriorityNote = evidence.higherPriorityAllocatedTonnes > 0
      ? ` Higher-priced client allocations had already used ${formatTonnes(evidence.higherPriorityAllocatedTonnes)} of that compatible supply (${evidence.higherPriorityClientIds.map((id) => `${id} · ${clientName(clientNames, id)}`).join(", ")}).`
      : " No higher-priced client allocation used compatible supply before this client.";
    return `At this client's processing point, ${formatTonnes(evidence.compatibleAvailableAtProcessingTonnes)} of compatible ${segments} supply was available; ${formatTonnes(outcome.allocatedTonnes)} was allocated and ${formatTonnes(outcome.remainingTonnes)} remained unmet.${higherPriorityNote}`;
  }

  return `At this client's processing point, ${formatTonnes(evidence.stationCapacityAvailableAtProcessingTonnes)} of the ${formatTonnes(evidence.stationCapacityT)} station capacity remained; ${formatTonnes(outcome.allocatedTonnes)} was processed before the station reached capacity. ${formatTonnes(outcome.remainingTonnes)} of demand remained unmet.`;
}

/**
 * Join source client requests to the matching server outcome, allocations,
 * and processing-time evidence. Before a plan exists, result fields remain
 * null rather than being represented as zeroes.
 */
export function deriveCommercialClientFacts(
  workbook: WorkbookData,
  plan?: PlanningResult,
): readonly CommercialClientFacts[] {
  if (plan === undefined) {
    return workbook.snapshot.clients.map((client) => ({
      client,
      outcome: null,
      allocations: [],
      evidence: null,
    }));
  }

  const outcomesByClient = new Map(plan.clientOutcomes.map((outcome) => [outcome.clientId, outcome]));
  const allocationsForClient = allocationsByClient(plan);
  const balancesForSegment = balancesBySegment(plan);
  const orderedClients = processingOrder(workbook.snapshot.clients);
  const orderIndex = new Map(orderedClients.map((client, index) => [client.clientId, index]));
  return workbook.snapshot.clients.map((client) => {
    const outcome = outcomesByClient.get(client.clientId);
    if (outcome === undefined) {
      throw new Error(`Commercial outcome is missing client ${client.clientId}.`);
    }

    const acceptedSegments = compatibleSegments(client);
    const actualCompatibleTonnes = sumTonnes(
      acceptedSegments.flatMap((segment) =>
        (balancesForSegment.get(segment) ?? []).map((balance) => balance.actualTonnes),
      ),
    );
    const currentOrderIndex = orderIndex.get(client.clientId);
    if (currentOrderIndex === undefined) {
      throw new Error(`Commercial processing order is missing client ${client.clientId}.`);
    }

    const higherPriorityClients = orderedClients.slice(0, currentOrderIndex);
    const higherPriorityClientIds: string[] = [];
    const higherPriorityAllocatedTonnes = sumTonnes(
      higherPriorityClients.flatMap((higherClient) =>
        (allocationsForClient.get(higherClient.clientId) ?? [])
          .filter((allocation) => acceptedSegments.includes(allocation.segment))
          .map((allocation) => {
            if (!higherPriorityClientIds.includes(higherClient.clientId)) {
              higherPriorityClientIds.push(higherClient.clientId);
            }
            return allocation.tonnes;
          }),
      ),
    );
    const stationUsedBeforeTonnes = sumTonnes(
      higherPriorityClients.flatMap((higherClient) =>
        (allocationsForClient.get(higherClient.clientId) ?? []).map((allocation) => allocation.tonnes),
      ),
    );
    const stationCapacityAvailableAtProcessingTonnes = Math.max(
      0,
      workbook.snapshot.station.exportConditioningCapacityT - stationUsedBeforeTonnes,
    );

    return {
      client,
      outcome,
      allocations: allocationsForClient.get(client.clientId) ?? [],
      evidence: {
        compatibleSegments: acceptedSegments,
        actualCompatibleTonnes,
        higherPriorityAllocatedTonnes,
        higherPriorityClientIds,
        compatibleAvailableAtProcessingTonnes: Math.max(
          0,
          actualCompatibleTonnes - higherPriorityAllocatedTonnes,
        ),
        stationUsedBeforeTonnes,
        stationCapacityT: workbook.snapshot.station.exportConditioningCapacityT,
        stationCapacityAvailableAtProcessingTonnes,
        stationUsedAfterTonnes: stationUsedBeforeTonnes + outcome.allocatedTonnes,
      },
    };
  });
}

export function isCommercialFocus(
  facts: CommercialClientFacts,
  selection: { readonly kind: "segment"; readonly segment: Segment } | { readonly kind: "client"; readonly clientId: string } | { readonly kind: "local"; readonly segment: Segment | null } | null,
): boolean {
  if (selection === null || facts.outcome === null) return false;
  if (selection.kind === "client") return facts.client.clientId === selection.clientId;
  if (selection.kind === "segment") {
    return facts.evidence?.compatibleSegments.includes(selection.segment) ?? false;
  }
  return false;
}
