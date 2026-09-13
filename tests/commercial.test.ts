import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CommercialView from "@/components/CommercialView";
import {
  deriveCommercialClientFacts,
  explainClientOutcome,
  shortageReasonLabel,
} from "@/lib/commercial";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";

describe("commercial view facts", () => {
  it("retains every client and exposes the baseline risk quantities and reasons", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const facts = deriveCommercialClientFacts(loaded.value, plan);
    const byId = new Map(facts.map((clientFacts) => [clientFacts.client.clientId, clientFacts]));

    expect(facts.map((clientFacts) => clientFacts.client.clientId)).toEqual(
      loaded.value.snapshot.clients.map((client) => client.clientId),
    );
    expect(facts.every((clientFacts) => clientFacts.outcome !== null && clientFacts.evidence !== null)).toBe(true);
    expect(facts.filter((clientFacts) => clientFacts.outcome?.status === "COMPLETE")).toHaveLength(7);
    expect(byId.get("C02")).toMatchObject({
      outcome: {
        allocatedTonnes: 40,
        remainingTonnes: 10,
        status: "PARTIAL",
        shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT",
      },
      evidence: {
        compatibleSegments: ["A"],
      },
    });
    expect(byId.get("C09")).toMatchObject({
      outcome: {
        allocatedTonnes: 30,
        remainingTonnes: 20,
        status: "PARTIAL",
        shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT",
      },
    });
    expect(byId.get("C08")).toMatchObject({
      outcome: {
        allocatedTonnes: 20,
        remainingTonnes: 30,
        status: "PARTIAL",
        shortageReason: "STATION_CAPACITY_REACHED",
      },
    });

    const c02 = byId.get("C02");
    const c08 = byId.get("C08");
    expect(c02).toBeDefined();
    expect(c08).toBeDefined();
    if (c02 === undefined || c08 === undefined) return;
    expect(shortageReasonLabel(c02.outcome?.shortageReason ?? null)).toBe("Insufficient compatible segment");
    expect(explainClientOutcome(c02)).toContain("processing point");
    expect(explainClientOutcome(c08)).toContain("station capacity");
    expect(c02.allocations.every((allocation) => allocation.exportPricePerTonneEur === c02.client.exportPricePerTonneEur)).toBe(true);
  });

  it("keeps result fields pending before a plan and renders an unserved capacity case as a distinct reason", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const pendingFacts = deriveCommercialClientFacts(loaded.value);
    expect(pendingFacts).toHaveLength(10);
    expect(pendingFacts.every((clientFacts) => clientFacts.outcome === null && clientFacts.evidence === null)).toBe(true);

    const zeroCapacitySnapshot = {
      ...loaded.value.snapshot,
      station: {
        ...loaded.value.snapshot.station,
        exportConditioningCapacityT: 0,
      },
    };
    const unservedPlan = calculatePlan(zeroCapacitySnapshot);
    const unservedWorkbook = {
      ...loaded.value,
      production: unservedPlan.production,
      snapshot: zeroCapacitySnapshot,
    };
    const unservedFacts = deriveCommercialClientFacts(unservedWorkbook, unservedPlan);
    const c02 = unservedFacts.find((clientFacts) => clientFacts.client.clientId === "C02");

    expect(c02).toMatchObject({
      outcome: {
        allocatedTonnes: 0,
        status: "UNSERVED",
        shortageReason: "STATION_CAPACITY_REACHED",
      },
    });
    expect(c02).toBeDefined();
    if (c02 === undefined) return;
    expect(explainClientOutcome(c02)).toContain("0 t of the 0 t station capacity remained");

    const markup = renderToStaticMarkup(createElement(CommercialView, {
      workbook: unservedWorkbook,
      plan: unservedPlan,
      selection: null,
      onSelect: () => undefined,
      onClearSelection: () => undefined,
    }));
    expect(markup).toContain("C02");
    expect(markup).toContain("Unserved");
    expect(markup).toContain("Station capacity reached at this client");
    expect(markup).toContain("No farm-segment allocation was made to this client in the current plan.");
  });
});
