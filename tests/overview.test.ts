import { describe, expect, it } from "vitest";
import { deriveDecisionOverviewFacts } from "@/lib/overview";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";

describe("decision overview facts", () => {
  it("keeps plan-dependent metrics absent before generation", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const facts = deriveDecisionOverviewFacts(loaded.value);

    expect(facts.production.expectedTotalTonnes).toBe(600);
    expect(facts.production.actualTotalTonnes).toBe(560);
    expect(facts.production.varianceTonnes).toBe(-40);
    expect(facts.stationCapacityT).toBe(500);
    expect(facts.kpis).toBeNull();
  });

  it("projects the current server plan without embedding baseline figures", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const facts = deriveDecisionOverviewFacts(loaded.value, plan);

    expect(facts.kpis).toEqual(plan.kpis);
    expect(facts.production).toEqual(plan.production);
    expect(facts.kpis).toMatchObject({
      exportedTonnes: 500,
      localTonnes: 60,
      exportRevenueEur: 549_500,
      localValueEur: 4_500,
      totalValueEur: 554_000,
      atRiskCount: 3,
    });
  });
});
