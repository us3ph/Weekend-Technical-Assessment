import { z } from "zod";
import {
  EVIDENCE_INTENTS,
  evidenceContextForIntent,
  factById,
  type EvidenceCatalog,
  type EvidenceFact,
  type EvidenceIntent,
  type EvidenceReference,
} from "./evidence";
import type { InputVersion } from "./types";

/** The model-facing contract contains only an intent and server fact IDs. */
export const evidenceSelectionSchema = z
  .object({
    intent: z.enum(EVIDENCE_INTENTS),
    selectedFactIds: z.array(z.string().min(1)).min(1).max(100),
  })
  .strict();

export type EvidenceSelectionCandidate = z.input<typeof evidenceSelectionSchema>;

export interface ValidatedEvidenceSelection {
  readonly intent: EvidenceIntent;
  readonly selectedFactIds: readonly string[];
  readonly inputVersion: InputVersion;
}

export type EvidenceSelectionErrorCode =
  | "INVALID_SCHEMA"
  | "DUPLICATE_FACT"
  | "UNKNOWN_FACT"
  | "MISMATCHED_INTENT"
  | "MISMATCHED_VERSION"
  | "INCOMPLETE_COVERAGE";

export interface EvidenceSelectionError {
  readonly code: EvidenceSelectionErrorCode;
  readonly message: string;
  readonly factIds?: readonly string[];
}

export type EvidenceSelectionValidation =
  | { readonly ok: true; readonly value: ValidatedEvidenceSelection }
  | { readonly ok: false; readonly error: EvidenceSelectionError };

export const SUPPORTED_QUESTION_INTENTS = EVIDENCE_INTENTS;

export type QuestionClassification =
  | { readonly intent: EvidenceIntent }
  | { readonly intent: "unsupported"; readonly reason: "unsupported-topic" | "unrecognized" };

export interface GroundedAnswer {
  readonly source: "deterministic";
  readonly sourceLabel: "Deterministic summary — no model used";
  readonly inputVersion: InputVersion;
  readonly intent: EvidenceIntent | "unsupported";
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly factIds: readonly string[];
  readonly citations: readonly EvidenceReference[];
}

function versionMatches(left: InputVersion, right: InputVersion): boolean {
  return left.algorithm === right.algorithm && left.value === right.value;
}

function referenceKey(reference: EvidenceReference): string {
  return `${reference.kind}:${reference.id}`;
}

function titleForIntent(intent: EvidenceIntent): string {
  switch (intent) {
    case "risk":
      return "Client risk summary";
    case "production-gap":
      return "Production-gap summary";
    case "local-residual":
      return "Local residual summary";
  }
}

/**
 * Classify only the three supported planning topics. The question is never
 * used as factual content and cannot alter the planning policy.
 */
export function classifyQuestion(question: string): QuestionClassification {
  const normalized = question.trim().toLocaleLowerCase("en-GB");
  if (normalized.length === 0) return { intent: "unsupported", reason: "unrecognized" };

  const outsideSnapshot = /\b(weather|forecast|future|tomorrow|next week|logistics|delivery|deliver|approve|approval|execute|send|contact|external|transport)\b/u;
  if (outsideSnapshot.test(normalized)) {
    return { intent: "unsupported", reason: "unsupported-topic" };
  }

  if (/\b(local|residual|going local|local value|left over)\b/u.test(normalized)) {
    return { intent: "local-residual" };
  }
  if (/\b(risk|at risk|unserved|shortage|client risk|which clients)\b/u.test(normalized)) {
    return { intent: "risk" };
  }
  if (/\b(gap|gaps|production|farm|segment|deficit|variance)\b/u.test(normalized)) {
    return { intent: "production-gap" };
  }
  return { intent: "unsupported", reason: "unrecognized" };
}

/** Validate schema, catalog membership, intent, version, and required coverage. */
export function validateEvidenceSelection(
  catalog: EvidenceCatalog,
  candidate: unknown,
): EvidenceSelectionValidation {
  const parsed = evidenceSelectionSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_SCHEMA",
        message: "The evidence selection does not match the strict intent/fact-ID schema.",
      },
    };
  }

  const selectedFactIds = parsed.data.selectedFactIds;
  const duplicates = selectedFactIds.filter((id, index) => selectedFactIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: {
        code: "DUPLICATE_FACT",
        message: "Evidence fact IDs must be unique and ordered once.",
        factIds: [...new Set(duplicates)],
      },
    };
  }

  const unknownFactIds = selectedFactIds.filter((factId) => factById(catalog, factId) === undefined);
  if (unknownFactIds.length > 0) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_FACT",
        message: "The response selected an evidence fact that is not in this snapshot catalog.",
        factIds: unknownFactIds,
      },
    };
  }

  const selectedFacts = selectedFactIds.map((factId) => factById(catalog, factId));
  const mismatchedIntentIds = selectedFacts
    .filter((fact): fact is EvidenceFact => fact !== undefined && fact.intent !== parsed.data.intent)
    .map((fact) => fact.id);
  if (mismatchedIntentIds.length > 0) {
    return {
      ok: false,
      error: {
        code: "MISMATCHED_INTENT",
        message: "Every selected evidence fact must belong to the requested intent.",
        factIds: mismatchedIntentIds,
      },
    };
  }

  const mismatchedVersionIds = selectedFacts
    .filter((fact): fact is EvidenceFact => fact !== undefined && !versionMatches(fact.inputVersion, catalog.inputVersion))
    .map((fact) => fact.id);
  if (mismatchedVersionIds.length > 0) {
    return {
      ok: false,
      error: {
        code: "MISMATCHED_VERSION",
        message: "Every selected evidence fact must belong to the visible input version.",
        factIds: mismatchedVersionIds,
      },
    };
  }

  const selectedSet = new Set(selectedFactIds);
  const missingFactIds = catalog.requiredFactIds[parsed.data.intent].filter((factId) => !selectedSet.has(factId));
  if (missingFactIds.length > 0) {
    return {
      ok: false,
      error: {
        code: "INCOMPLETE_COVERAGE",
        message: "The response omitted required evidence for this intent.",
        factIds: missingFactIds,
      },
    };
  }

  return {
    ok: true,
    value: {
      intent: parsed.data.intent,
      selectedFactIds,
      inputVersion: catalog.inputVersion,
    },
  };
}

/** Render only catalog text and references after selection validation. */
export function renderGroundedSelection(
  catalog: EvidenceCatalog,
  selection: ValidatedEvidenceSelection,
): GroundedAnswer {
  if (!versionMatches(selection.inputVersion, catalog.inputVersion)) {
    throw new Error("Cannot render evidence from a different input version.");
  }
  const facts = selection.selectedFactIds.map((factId) => {
    const fact = factById(catalog, factId);
    if (fact === undefined || fact.intent !== selection.intent) {
      throw new Error(`Cannot render unvalidated evidence fact ${factId}.`);
    }
    return fact;
  });
  const citations: EvidenceReference[] = [];
  const seenCitations = new Set<string>();
  for (const fact of facts) {
    for (const reference of fact.references) {
      const key = referenceKey(reference);
      if (seenCitations.has(key)) continue;
      seenCitations.add(key);
      citations.push(reference);
    }
  }
  return {
    source: "deterministic",
    sourceLabel: "Deterministic summary — no model used",
    inputVersion: catalog.inputVersion,
    intent: selection.intent,
    title: titleForIntent(selection.intent),
    paragraphs: facts.map((fact) => fact.allowedText),
    factIds: selection.selectedFactIds,
    citations,
  };
}

/** Produce a complete, no-key answer from all required server facts. */
export function createDeterministicSummary(
  catalog: EvidenceCatalog,
  intent: EvidenceIntent,
): GroundedAnswer {
  const validation = validateEvidenceSelection(catalog, {
    intent,
    selectedFactIds: catalog.requiredFactIds[intent],
  });
  if (!validation.ok) {
    throw new Error(validation.error.message);
  }
  return renderGroundedSelection(catalog, validation.value);
}

/** Classify a free-text question and return only supported grounded facts. */
export function createDeterministicResponse(
  catalog: EvidenceCatalog,
  question: string,
): GroundedAnswer {
  const classification = classifyQuestion(question);
  if (classification.intent === "unsupported") {
    return {
      source: "deterministic",
      sourceLabel: "Deterministic summary — no model used",
      inputVersion: catalog.inputVersion,
      intent: "unsupported",
      title: "Question not supported by this snapshot",
      paragraphs: ["This workspace can explain client risk, production gaps, and local residual/value only. Weather, future forecasts, logistics, approvals, and external actions are unavailable in the supplied snapshot."],
      factIds: [],
      citations: [],
    };
  }
  return createDeterministicSummary(catalog, classification.intent);
}

/** Return a provider-ready context without workbook binaries or unrelated facts. */
export function assistantContextForIntent(
  catalog: EvidenceCatalog,
  intent: EvidenceIntent,
) {
  return evidenceContextForIntent(catalog, intent);
}
