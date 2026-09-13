import type {
  PlanningKpis,
  PlanningResult,
  ProductionComparison,
  WorkbookData,
} from "./types";

export interface DecisionOverviewFacts {
  readonly production: ProductionComparison;
  readonly stationCapacityT: number;
  readonly kpis: PlanningKpis | null;
}

/**
 * Keep the overview as a projection of the current server response. Before a
 * plan exists, only workbook-backed comparison facts are available; all
 * allocation-dependent values remain explicitly absent.
 */
export function deriveDecisionOverviewFacts(
  workbook: WorkbookData,
  plan?: PlanningResult,
): DecisionOverviewFacts {
  return {
    production: plan?.production ?? workbook.production,
    stationCapacityT: workbook.snapshot.station.exportConditioningCapacityT,
    kpis: plan?.kpis ?? null,
  };
}
