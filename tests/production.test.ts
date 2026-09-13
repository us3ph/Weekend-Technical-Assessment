import { describe, expect, it } from "vitest";
import { deriveProductionFarmFacts } from "@/lib/production";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";

describe("production view facts", () => {
  it("joins every farm to its expected/actual comparison and the matching plan trace", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const facts = deriveProductionFarmFacts(loaded.value, plan);
    const byId = new Map(facts.map((farm) => [farm.farm.farmId, farm]));

    expect(facts).toHaveLength(loaded.value.snapshot.farms.length);
    expect(facts.map((farm) => farm.farm.farmId)).toEqual(
      loaded.value.snapshot.farms.map((farm) => farm.farmId),
    );
    expect(byId.get("F01")).toMatchObject({
      comparison: {
        expectedCapacityT: 35,
        actualTotalTonnes: 30,
        varianceTonnes: -5,
        segments: {
          A: { expectedTonnes: 31.5, actualTonnes: 25, varianceTonnes: -6.5 },
        },
      },
    });
    expect(byId.get("F04")).toMatchObject({
      comparison: {
        segments: {
          A: { expectedTonnes: 21, actualTonnes: 15, varianceTonnes: -6 },
        },
      },
    });
    expect(byId.get("F20")).toMatchObject({
      comparison: {
        segments: {
          C: { expectedTonnes: 18.9, actualTonnes: 0, varianceTonnes: -18.9 },
          D: { expectedTonnes: 8.1, actualTonnes: 30, varianceTonnes: 21.9 },
        },
      },
    });

    const localTonnes = facts.reduce((sum, farm) => sum + (farm.localTonnes ?? 0), 0);
    const localValue = facts.reduce((sum, farm) => sum + (farm.localValueEur ?? 0), 0);
    expect(localTonnes).toBe(plan.kpis.localTonnes);
    expect(localValue).toBe(plan.kpis.localValueEur);
    expect(facts.flatMap((farm) => farm.allocations).reduce((sum, allocation) => sum + allocation.tonnes, 0)).toBe(
      plan.kpis.exportedTonnes,
    );
    expect(byId.get("F20")?.localTonnes).toBe(30);
  });

  it("keeps plan-dependent farm facts absent before a plan is generated", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const facts = deriveProductionFarmFacts(loaded.value);

    expect(facts).toHaveLength(20);
    expect(facts.every((farm) => farm.balances === null && farm.localTonnes === null && farm.allocations.length === 0)).toBe(true);
    expect(facts.find((farm) => farm.farm.farmId === "F01")?.comparison.segments.A.actualTonnes).toBe(25);
  });
});
