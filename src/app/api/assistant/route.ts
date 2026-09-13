import { z } from "zod";
import {
  classifyQuestion,
  createDeterministicResponse,
  createDeterministicSummary,
  renderModelSelection,
} from "@/lib/assistant";
import { buildEvidenceCatalog } from "@/lib/evidence";
import {
  OPENROUTER_DEFAULT_MODEL,
  requestedOpenRouterModel,
  selectEvidenceWithOpenRouter,
} from "@/lib/openrouter";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

const assistantRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    inputVersion: z
      .object({
        algorithm: z.literal("sha256"),
        value: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();

function malformedRequest(): Response {
  return Response.json(
    {
      code: "MALFORMED_REQUEST",
      error: "A question and valid inputVersion are required.",
    },
    { status: 400, headers: noStoreHeaders },
  );
}

function unsupportedDiagnostic() {
  return {
    provider: "openrouter" as const,
    status: "not-requested" as const,
    requestedModel: requestedOpenRouterModel(),
    code: "UNSUPPORTED_QUESTION" as const,
    message: "This question is outside the three supported planning topics; no model request was made.",
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return malformedRequest();
  }

  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) return malformedRequest();

  try {
    const loaded = await loadWorkbook();
    if (!loaded.ok) {
      return Response.json(
        {
          code: "INVALID_DATA",
          error: "Workbook validation failed. Reload after correcting the source data.",
          issues: loaded.issues,
        },
        { status: 422, headers: noStoreHeaders },
      );
    }

    const plan = calculatePlan(loaded.value.snapshot);
    if (loaded.value.snapshot.version.value !== parsed.data.inputVersion.value) {
      return Response.json(
        {
          code: "STALE_INPUT_VERSION",
          error: "The workbook changed since it was loaded. Reload it before asking for an explanation.",
          requestedInputVersion: parsed.data.inputVersion,
          currentInputVersion: loaded.value.snapshot.version,
        },
        { status: 409, headers: noStoreHeaders },
      );
    }

    const catalog = buildEvidenceCatalog(loaded.value, plan);
    const classification = classifyQuestion(parsed.data.question);
    if (classification.intent === "unsupported") {
      return Response.json(
        {
          answer: createDeterministicResponse(catalog, parsed.data.question),
          provider: unsupportedDiagnostic(),
        },
        { headers: noStoreHeaders },
      );
    }

    const providerResult = await selectEvidenceWithOpenRouter({
      question: parsed.data.question,
      catalog,
      intent: classification.intent,
    });
    if (!providerResult.ok) {
      return Response.json(
        {
          answer: createDeterministicSummary(catalog, classification.intent),
          provider: providerResult.diagnostic,
        },
        { headers: noStoreHeaders },
      );
    }

    return Response.json(
      {
        answer: renderModelSelection(catalog, providerResult.selection, providerResult.diagnostic.returnedModel),
        provider: providerResult.diagnostic,
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return Response.json(
      {
        code: "SERVER_ERROR",
        error: "Unable to prepare the grounded assistant response. Try again.",
        provider: {
          provider: "openrouter",
          status: "error",
          requestedModel: OPENROUTER_DEFAULT_MODEL,
          code: "PROVIDER_ERROR",
          message: "The server could not prepare this assistant request. No model answer was used.",
        },
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
