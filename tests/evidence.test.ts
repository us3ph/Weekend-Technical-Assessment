import { describe, expect, it } from "vitest";
import {
  assistantContextForIntent,
  classifyQuestion,
  createDeterministicResponse,
  createDeterministicSummary,
  validateEvidenceSelection,
} from "@/lib/assistant";
import {
  buildEvidenceCatalog,
  type EvidenceCatalog,
  type ProductionGapFact,
  type RiskFact,
} from "@/lib/evidence";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";
import type { PlanningResult } from "@/lib/types";

async function baselineEvidence(): Promise<{
  readonly catalog: EvidenceCatalog;
  readonly plan: PlanningResult;
}> {
  const loaded = await loadWorkbook();
  if (!loaded.ok) throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
  const plan = calculatePlan(loaded.value.snapshot);
  return { catalog: buildEvidenceCatalog(loaded.value, plan), plan };
}

describe("grounded evidence catalog", () => {
  it("covers every at-risk client with ordered, exact server facts", async () => {
    const { catalog } = await baselineEvidence();
    const riskFacts = catalog.facts.filter(
      (fact): fact is RiskFact => fact.intent === "risk" && fact.kind === "client-risk",
    );

    expect(riskFacts).toHaveLength(3);
    expect(new Set(riskFacts.map((fact) => fact.values.clientId))).toEqual(new Set(["C02", "C08", "C09"]));
    expect(riskFacts.map((fact) => fact.values.rank)).toEqual([1, 2, 3]);
    expect(riskFacts.find((fact) => fact.values.clientId === "C02")?.values).toMatchObject({
      allocatedTonnes: 40,
      remainingTonnes: 10,
      shortageReason: "INSUFFICIENT_COMPATIBLE_SEGMENT",
    });
    expect(riskFacts.find((fact) => fact.values.clientId === "C08")?.values).toMatchObject({
      allocatedTonnes: 20,
      remainingTonnes: 30,
      shortageReason: "STATION_CAPACITY_REACHED",
    });

    const summary = createDeterministicSummary(catalog, "risk");
    expect(summary.sourceLabel).toBe("Deterministic summary — no model used");
    expect(summary.factIds).toEqual(catalog.requiredFactIds.risk);
    expect(summary.paragraphs.join(" ")).toContain("C02");
    expect(summary.paragraphs.join(" ")).toContain("C08");
    expect(summary.paragraphs.join(" ")).toContain("C09");
    expect(summary.paragraphs.join(" ")).toContain("10 t unmet");
    expect(summary.paragraphs.join(" ")).toContain("station capacity reached");
  });

  it("includes local quantity, composition, constraint, value, and trace references", async () => {
    const { catalog } = await baselineEvidence();
    const localSummary = catalog.facts.find(
      (fact) => fact.intent === "local-residual" && fact.kind === "local-summary",
    );
    expect(localSummary).toBeDefined();
    if (localSummary === undefined || localSummary.kind !== "local-summary") return;

    expect(localSummary.values).toMatchObject({
      totalTonnes: 60,
      composition: { A: 0, B: 0, C: 0, D: 60 },
      localValueEur: 4_500,
      stationUsedTonnes: 500,
      stationCapacityT: 500,
      stationCapacityReached: true,
      qualityLimitedSegments: ["D"],
      qualityLimitedClientIds: ["C09", "C02"],
      capacityLimitedClientIds: ["C08"],
    });
    expect(localSummary.values.constraints.map((constraint) => constraint.kind)).toEqual([
      "STATION_CAPACITY_REACHED",
      "QUALITY_COMPATIBILITY",
    ]);
    expect(localSummary.allowedText).toContain("60 t local");
    expect(localSummary.allowedText).toContain("60 t D");
    expect(localSummary.allowedText).toContain("station was full");
    expect(localSummary.allowedText).toContain("EUR 4,500");
    expect(localSummary.allowedText).toContain("not guaranteed lost profit");

    const summary = createDeterministicSummary(catalog, "local-residual");
    expect(summary.paragraphs).toHaveLength(1);
    expect(summary.citations).toEqual(expect.arrayContaining([
      { kind: "farm", id: "F20" },
      { kind: "segment", id: "D" },
      { kind: "residual", id: "residual-0004" },
      { kind: "client", id: "C02" },
      { kind: "client", id: "C08" },
    ]));
  });

  it("ranks actual farm/segment gaps and relates them to compatible unmet demand", async () => {
    const { catalog } = await baselineEvidence();
    const gapFacts = catalog.facts.filter(
      (fact): fact is ProductionGapFact => fact.intent === "production-gap" && fact.kind !== "no-negative-production-gaps",
    );
    expect(gapFacts.length).toBeGreaterThan(0);
    expect(gapFacts.map((fact) => fact.values.rank)).toEqual(
      gapFacts.map((_fact, index) => index + 1),
    );
    expect(gapFacts.find((fact) => fact.values.farmId === "F01" && fact.values.segment === "A")?.values.varianceTonnes).toBe(-6.5);
    expect(gapFacts.find((fact) => fact.values.farmId === "F04" && fact.values.segment === "A")?.values.varianceTonnes).toBe(-6);
    expect(gapFacts.find((fact) => fact.values.farmId === "F20" && fact.values.segment === "C")?.values.varianceTonnes).toBe(-18.9);

    const summary = createDeterministicSummary(catalog, "production-gap");
    const text = summary.paragraphs.join(" ");
    expect(text).toContain("F01 A");
    expect(text).toContain("F04 A");
    expect(text).toContain("F20 C");
    expect(text).toContain("shared compatibility evidence");
    expect(text).toContain("actual against");
  });

  it("keeps each provider context to one intent and the same input version", async () => {
    const { catalog } = await baselineEvidence();
    for (const intent of ["risk", "production-gap", "local-residual"] as const) {
      const context = assistantContextForIntent(catalog, intent);
      expect(context.intent).toBe(intent);
      expect(context.inputVersion).toEqual(catalog.inputVersion);
      expect(context.facts.every((fact) => fact.intent === intent)).toBe(true);
      expect(context.facts.some((fact) => fact.intent !== intent)).toBe(false);
      expect(context.requiredFactIds).toEqual(catalog.requiredFactIds[intent]);
    }
  });
});

describe("strict grounded selection and deterministic boundaries", () => {
  it("rejects unknown, mismatched, duplicate, incomplete, and extra-field selections", async () => {
    const { catalog } = await baselineEvidence();
    const riskIds = catalog.requiredFactIds.risk;
    const gapId = catalog.requiredFactIds["production-gap"][0];
    expect(gapId).toBeDefined();

    expect(validateEvidenceSelection(catalog, {
      intent: "risk",
      selectedFactIds: [...riskIds, "risk:client:UNKNOWN"],
    })).toMatchObject({ ok: false, error: { code: "UNKNOWN_FACT" } });

    expect(validateEvidenceSelection(catalog, {
      intent: "risk",
      selectedFactIds: [gapId, ...riskIds],
    })).toMatchObject({ ok: false, error: { code: "MISMATCHED_INTENT" } });

    expect(validateEvidenceSelection(catalog, {
      intent: "risk",
      selectedFactIds: [riskIds[0]],
    })).toMatchObject({ ok: false, error: { code: "INCOMPLETE_COVERAGE" } });

    expect(validateEvidenceSelection(catalog, {
      intent: "risk",
      selectedFactIds: [...riskIds, riskIds[0]],
    })).toMatchObject({ ok: false, error: { code: "DUPLICATE_FACT" } });

    expect(validateEvidenceSelection(catalog, {
      intent: "risk",
      selectedFactIds: riskIds,
      inventedText: "EUR 999,999",
    })).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
  });

  it("classifies only the supported planning topics and never answers outside-snapshot questions", async () => {
    const { catalog } = await baselineEvidence();
    expect(classifyQuestion("Which clients are at risk and why?")).toEqual({ intent: "risk" });
    expect(classifyQuestion("Which farm/segment gaps matter most today?")).toEqual({ intent: "production-gap" });
    expect(classifyQuestion("Why are 60 t going local?")).toEqual({ intent: "local-residual" });
    expect(classifyQuestion("Will weather cause a delivery delay tomorrow?")).toEqual({
      intent: "unsupported",
      reason: "unsupported-topic",
    });

    const response = createDeterministicResponse(catalog, "Will weather cause a delivery delay tomorrow?");
    expect(response.intent).toBe("unsupported");
    expect(response.factIds).toEqual([]);
    expect(response.sourceLabel).toBe("Deterministic summary — no model used");
    expect(response.paragraphs[0]).toContain("unavailable in the supplied snapshot");
  });

  it("does not build facts for a plan from a different snapshot version", async () => {
    const { catalog, plan } = await baselineEvidence();
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const changedPlan: PlanningResult = {
      ...plan,
      inputVersion: { algorithm: "sha256", value: "b".repeat(64) },
    };
    expect(() => buildEvidenceCatalog(loaded.value, changedPlan)).toThrow("different input version");
    expect(catalog.inputVersion.value).not.toBe(changedPlan.inputVersion.value);
  });
});
