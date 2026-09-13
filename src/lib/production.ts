import type {
  Allocation,
  FarmComparison,
  FarmInput,
  FarmSegmentBalance,
  PlanningResult,
  Segment,
  SegmentMap,
  WorkbookData,
} from "./types";

export interface ProductionFarmFacts {
  readonly farm: FarmInput;
  readonly comparison: FarmComparison;
  readonly balances: SegmentMap<FarmSegmentBalance> | null;
  readonly allocations: readonly Allocation[];
  readonly localTonnes: number | null;
  readonly localValueEur: number | null;
}

function emptySegmentMap<T>(): SegmentMap<T> {
  return {} as SegmentMap<T>;
}

function balancesByFarm(plan: PlanningResult): Map<string, SegmentMap<FarmSegmentBalance>> {
  const result = new Map<string, SegmentMap<FarmSegmentBalance>>();
  for (const balance of plan.balances) {
    const farmBalances = result.get(balance.farmId) ?? emptySegmentMap<FarmSegmentBalance>();
    farmBalances[balance.segment] = balance;
    result.set(balance.farmId, farmBalances);
  }
  return result;
}

/**
 * Join source farm records with the server comparison and, when available, the
 * matching plan trace. The UI consumes this projection and never fetches or
 * recalculates a second result.
 */
export function deriveProductionFarmFacts(
  workbook: WorkbookData,
  plan?: PlanningResult,
): readonly ProductionFarmFacts[] {
  const comparisons = new Map(workbook.production.farms.map((comparison) => [comparison.farmId, comparison]));
  const planBalances = plan === undefined ? undefined : balancesByFarm(plan);
  const allocationsByFarm = new Map<string, Allocation[]>();
  const localTonnesByFarm = new Map<string, number>();
  const localValueByFarm = new Map<string, number>();

  for (const allocation of plan?.allocations ?? []) {
    const farmAllocations = allocationsByFarm.get(allocation.farmId) ?? [];
    farmAllocations.push(allocation);
    allocationsByFarm.set(allocation.farmId, farmAllocations);
  }

  for (const residual of plan?.localResiduals ?? []) {
    localTonnesByFarm.set(residual.farmId, (localTonnesByFarm.get(residual.farmId) ?? 0) + residual.tonnes);
    localValueByFarm.set(residual.farmId, (localValueByFarm.get(residual.farmId) ?? 0) + residual.localValueEur);
  }

  return workbook.snapshot.farms.map((farm) => {
    const comparison = comparisons.get(farm.farmId);
    if (comparison === undefined) {
      throw new Error(`Production comparison is missing farm ${farm.farmId}.`);
    }

    return {
      farm,
      comparison,
      balances: planBalances?.get(farm.farmId) ?? null,
      allocations: allocationsByFarm.get(farm.farmId) ?? [],
      localTonnes: plan === undefined ? null : localTonnesByFarm.get(farm.farmId) ?? 0,
      localValueEur: plan === undefined ? null : localValueByFarm.get(farm.farmId) ?? 0,
    };
  });
}

export function segmentBalance(
  facts: ProductionFarmFacts,
  segment: Segment,
): FarmSegmentBalance | undefined {
  return facts.balances?.[segment];
}
