import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { buildEvidenceCatalog } from "@/lib/evidence";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";

function assistantRequest(body: unknown): Request {
  return new Request("http://localhost/api/assistant", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function baseline() {
  const loaded = await loadWorkbook();
  if (!loaded.ok) throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
  const plan = calculatePlan(loaded.value.snapshot);
  return { loaded: loaded.value, catalog: buildEvidenceCatalog(loaded.value, plan) };
}

async function withOpenRouterEnv<T>(
  values: { readonly key?: string; readonly model?: string },
  callback: () => Promise<T>,
): Promise<T> {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousModel = process.env.OPENROUTER_MODEL;
  if (values.key === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = values.key;
  if (values.model === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = values.model;
  try {
    return await callback();
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = previousModel;
  }
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/assistant", () => {
  it("returns a deterministic summary when no private key is configured", async () => {
    const { loaded } = await baseline();
    const fetchMock = vi.fn<typeof fetch>();

    const response = await withOpenRouterEnv(
      {},
      () => POST(assistantRequest({
        question: "Which clients are at risk and why?",
        inputVersion: loaded.snapshot.version,
      })),
    );
    const body = (await response.json()) as {
      answer?: { source?: string; sourceLabel?: string; factIds?: string[] };
      provider?: { status?: string; code?: string };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.answer).toMatchObject({
      source: "deterministic",
      sourceLabel: "Deterministic summary — no model used",
    });
    expect(body.answer?.factIds).toHaveLength(3);
    expect(body.provider).toMatchObject({ status: "unavailable", code: "MISSING_API_KEY" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recomputes the server plan and renders validated facts around a free model selection", async () => {
    const { loaded, catalog } = await baseline();
    const returnedModel = "qwen/qwen3-30b-a3b-instruct:free";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: returnedModel,
        choices: [{
          message: {
            content: JSON.stringify({
              intent: "risk",
              selectedFactIds: catalog.requiredFactIds.risk,
              // This extra prose field simulates an attempted model injection.
              paragraphs: ["EUR 999,999 is the answer."],
            }),
          },
        }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({
        question: "Which clients are at risk and why?",
        inputVersion: loaded.snapshot.version,
      })),
    );
    const body = (await response.json()) as {
      answer?: { source?: string; model?: string; paragraphs?: string[] };
      provider?: { status?: string; returnedModel?: string };
    };

    expect(response.status).toBe(200);
    expect(body.answer).toMatchObject({
      source: "deterministic",
      sourceLabel: "Deterministic summary — no model used",
    });
    expect(body.provider).toMatchObject({ status: "error", returnedModel });
    expect(JSON.stringify(body)).not.toContain("EUR 999,999");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a model-labelled answer while rendering only catalog text", async () => {
    const { loaded, catalog } = await baseline();
    const returnedModel = "qwen/qwen3-30b-a3b-instruct:free";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: returnedModel,
        choices: [{
          message: {
            content: JSON.stringify({ intent: "risk", selectedFactIds: catalog.requiredFactIds.risk }),
          },
        }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({
        question: "Which clients are at risk and why?",
        inputVersion: loaded.snapshot.version,
      })),
    );
    const body = (await response.json()) as {
      answer?: { source?: string; sourceLabel?: string; model?: string; paragraphs?: string[] };
      provider?: { status?: string; returnedModel?: string };
    };

    expect(body.answer).toMatchObject({
      source: "openrouter",
      sourceLabel: "OpenRouter free model — server-rendered evidence",
      model: returnedModel,
    });
    expect(body.provider).toMatchObject({ status: "success", returnedModel });
    expect(body.answer?.paragraphs?.join(" ")).toContain("C02");
    expect(body.answer?.paragraphs?.join(" ")).not.toContain("999,999");
  });

  it("does not call OpenRouter for unsupported questions", async () => {
    const { loaded } = await baseline();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({
        question: "Will weather cause a delivery delay tomorrow?",
        inputVersion: loaded.snapshot.version,
      })),
    );
    const body = (await response.json()) as {
      answer?: { intent?: string; sourceLabel?: string };
      provider?: { status?: string; code?: string };
    };

    expect(response.status).toBe(200);
    expect(body.answer).toMatchObject({ intent: "unsupported", sourceLabel: "Deterministic summary — no model used" });
    expect(body.provider).toMatchObject({ status: "not-requested", code: "UNSUPPORTED_QUESTION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a safe deterministic fallback for provider failure", async () => {
    const { loaded } = await baseline();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: 429, message: "private rate-limit details" } }, 429, { "Retry-After": "9" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({
        question: "Why is the residual going local?",
        inputVersion: loaded.snapshot.version,
      })),
    );
    const body = (await response.json()) as {
      answer?: { source?: string; sourceLabel?: string };
      provider?: { status?: string; code?: string; retryAfterSeconds?: number };
    };

    expect(body.answer).toMatchObject({ source: "deterministic", sourceLabel: "Deterministic summary — no model used" });
    expect(body.provider).toMatchObject({ status: "error", code: "RATE_LIMITED", retryAfterSeconds: 9 });
    expect(JSON.stringify(body)).not.toContain("private rate-limit details");
  });

  it("rejects paid configuration and stale or browser-supplied result data", async () => {
    const { loaded } = await baseline();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const paidResponse = await withOpenRouterEnv(
      { key: "test-key", model: "openai/gpt-4o" },
      () => POST(assistantRequest({ question: "Which clients are at risk?", inputVersion: loaded.snapshot.version })),
    );
    const paidBody = (await paidResponse.json()) as { provider?: { code?: string } };
    expect(paidResponse.status).toBe(200);
    expect(paidBody.provider?.code).toBe("PAID_MODEL_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();

    const staleResponse = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({ question: "Which clients are at risk?", inputVersion: { algorithm: "sha256", value: "b".repeat(64) } })),
    );
    const staleBody = (await staleResponse.json()) as { code?: string };
    expect(staleResponse.status).toBe(409);
    expect(staleBody.code).toBe("STALE_INPUT_VERSION");
    expect(fetchMock).not.toHaveBeenCalled();

    const browserResult = await POST(assistantRequest({
      question: "Which clients are at risk?",
      inputVersion: loaded.snapshot.version,
      kpis: { exportedTonnes: 0 },
    }));
    expect(browserResult.status).toBe(400);
  });
});
