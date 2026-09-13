import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TraceView from "@/components/TraceView";
import { calculatePlan } from "@/lib/planner";
import {
  deriveAllocationLocalFacts,
  deriveTraceExplanations,
  isAllocationFocus,
  isLocalFocus,
} from "@/lib/trace";
import { loadWorkbook } from "@/lib/workbook";

describe("allocation and local trace", () => {
  it("retains every allocation and residual with reconciled baseline totals", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const facts = deriveAllocationLocalFacts(plan);
    expect(facts).not.toBeNull();
    if (facts === null) return;

    expect(facts.exportedTonnes + facts.localTonnes).toBe(loaded.value.production.actualTotalTonnes);
    expect(facts.exportedTonnes).toBe(500);
    expect(facts.localTonnes).toBe(60);
    expect(facts.localValueEur).toBe(4_500);
    expect(facts.allocations.every((allocation) => allocation.tonnes % 5 === 0)).toBe(true);
    expect(facts.localResiduals).toMatchObject([
      { farmId: "F15", segment: "D", tonnes: 5, localPricePerTonneEur: 75 },
      { farmId: "F16", segment: "D", tonnes: 20, localPricePerTonneEur: 75 },
      { farmId: "F19", segment: "D", tonnes: 5, localPricePerTonneEur: 75 },
      { farmId: "F20", segment: "D", tonnes: 30, localPricePerTonneEur: 75 },
    ]);

    for (const balance of facts.balances) {
      expect(balance.exportedTonnes + balance.localTonnes).toBe(balance.actualTonnes);
    }
  });

  it("connects allocation and farm-local selections to exact trace rows", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const allocation = plan.allocations[0];
    const residual = plan.localResiduals[0];
    expect(allocation).toBeDefined();
    expect(residual).toBeDefined();
    if (allocation === undefined || residual === undefined) return;

    expect(isAllocationFocus(allocation, { kind: "allocation", allocationId: allocation.allocationId })).toBe(true);
    expect(isAllocationFocus(allocation, { kind: "client", clientId: allocation.clientId })).toBe(true);
    expect(isLocalFocus(residual, {
      kind: "local",
      farmId: residual.farmId,
      residualId: residual.residualId,
      segment: residual.segment,
    })).toBe(true);
    expect(isLocalFocus(residual, { kind: "local", farmId: "not-this-farm", segment: residual.segment })).toBe(false);
  });

  it("renders the connected trace and the baseline constraint explanations", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const explanations = deriveTraceExplanations(loaded.value, plan);
    expect(explanations.map((explanation) => explanation.kind)).toEqual(["quality", "capacity", "comparison"]);
    expect(explanations[0]?.text).toContain("D is below A and B");
    expect(explanations[1]?.text).toContain("C08");
    expect(explanations[1]?.text).toContain("station");
    expect(explanations[2]?.text).toContain("all 3 baseline C orders are complete");

    const markup = renderToStaticMarkup(createElement(TraceView, {
      workbook: loaded.value,
      plan,
      selection: null,
      onSelect: () => undefined,
      onClearSelection: () => undefined,
    }));
    expect(markup).toContain("Allocation trace");
    expect(markup).toContain("Residual trace");
    expect(markup).toContain("F20");
    expect(markup).toContain("C08");
    expect(markup).toContain("4,500");
    expect(markup).toContain("Every tonne has a visible destination");
  });

  it("keeps trace-dependent rows honest before plan generation", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const markup = renderToStaticMarkup(createElement(TraceView, {
      workbook: loaded.value,
      selection: null,
      onSelect: () => undefined,
      onClearSelection: () => undefined,
    }));
    expect(markup).toContain("Generate a plan to reveal export destinations");
    expect(markup).not.toContain("Allocation trace");
  });
});
