import { describe, expect, it, vi } from "vitest";
import { buildEvidenceCatalog } from "@/lib/evidence";
import {
  OPENROUTER_DEFAULT_MODEL,
  OPENROUTER_ENDPOINT,
  selectEvidenceWithOpenRouter,
} from "@/lib/openrouter";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";
import type { EvidenceCatalog } from "@/lib/evidence";

async function baselineCatalog(): Promise<EvidenceCatalog> {
  const loaded = await loadWorkbook();
  if (!loaded.ok) throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
  return buildEvidenceCatalog(loaded.value, calculatePlan(loaded.value.snapshot));
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
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

describe("OpenRouter free evidence adapter", () => {
  it("sends the supported question and minimum context with strict non-streaming JSON output", async () => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: "qwen/qwen3-30b-a3b-instruct:free",
        choices: [{
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              intent: "risk",
              selectedFactIds: catalog.requiredFactIds.risk,
            }),
          },
        }],
      }),
    );

    const result = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        {
          question: "Which clients are at risk and why?",
          catalog,
          intent: "risk",
        },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.selectedFactIds).toEqual(catalog.requiredFactIds.risk);
    expect(result.diagnostic).toMatchObject({
      provider: "openrouter",
      status: "success",
      requestedModel: OPENROUTER_DEFAULT_MODEL,
      returnedModel: "qwen/qwen3-30b-a3b-instruct:free",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(OPENROUTER_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    const requestBody = JSON.parse(String(init?.body)) as {
      model?: string;
      stream?: boolean;
      max_tokens?: number;
      provider?: { require_parameters?: boolean };
      response_format?: {
        type?: string;
        json_schema?: { strict?: boolean; schema?: { additionalProperties?: boolean } };
      };
      messages?: Array<{ content?: string }>;
    };
    expect(requestBody.model).toBe(OPENROUTER_DEFAULT_MODEL);
    expect(requestBody.stream).toBe(false);
    expect(requestBody.max_tokens).toBe(256);
    expect(requestBody.provider?.require_parameters).toBe(true);
    expect(requestBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true, schema: { additionalProperties: false } },
    });
    expect(requestBody.messages?.[1]?.content).toContain("Which clients are at risk and why?");
    expect(requestBody.messages?.[1]?.content).toContain(catalog.requiredFactIds.risk[0]);
  });

  it("returns a no-key diagnostic without making a request", async () => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>();

    const result = await withOpenRouterEnv(
      {},
      () => selectEvidenceWithOpenRouter(
        { question: "Which clients are at risk?", catalog, intent: "risk" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostic: {
        status: "unavailable",
        code: "MISSING_API_KEY",
        message: "AI unavailable — OpenRouter API key not configured.",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects paid model configuration before inference", async () => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>();

    const result = await withOpenRouterEnv(
      { key: "test-key", model: "openai/gpt-4o" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which clients are at risk?", catalog, intent: "risk" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({ ok: false, diagnostic: { code: "PAID_MODEL_CONFIGURED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an explicitly free model variant and retains returned model metadata", async () => {
    const catalog = await baselineCatalog();
    const freeModel = "meta-llama/llama-3.2-3b-instruct:free";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: freeModel,
        choices: [{ message: { content: JSON.stringify({ intent: "local-residual", selectedFactIds: catalog.requiredFactIds["local-residual"] }) } }],
      }),
    );

    const result = await withOpenRouterEnv(
      { key: "test-key", model: freeModel },
      () => selectEvidenceWithOpenRouter(
        { question: "Why is the residual going local?", catalog, intent: "local-residual" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({ ok: true, diagnostic: { requestedModel: freeModel, returnedModel: freeModel } });
  });

  it("discards a response identified as a paid model", async () => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: "openai/gpt-4o",
        choices: [{ message: { content: JSON.stringify({ intent: "risk", selectedFactIds: catalog.requiredFactIds.risk }) } }],
      }),
    );

    const result = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which clients are at risk?", catalog, intent: "risk" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({ ok: false, diagnostic: { code: "NON_FREE_MODEL_RETURNED" } });
  });

  it.each([
    [401, "INVALID_API_KEY"],
    [402, "ACCOUNT_CREDIT_REQUIRED"],
    [403, "PROVIDER_REFUSED"],
    [404, "MODEL_UNAVAILABLE"],
    [500, "PROVIDER_ERROR"],
  ] as const)("maps HTTP %s to a sanitized failure without exposing provider text", async (status, code) => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: status, message: "private provider diagnostic" } }, status, status === 500 ? undefined : { "Retry-After": "12" }),
    );

    const result = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which farm gaps matter?", catalog, intent: "production-gap" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({ ok: false, diagnostic: { code, httpStatus: status } });
    expect(JSON.stringify(result)).not.toContain("private provider diagnostic");
  });

  it("preserves Retry-After for a rate limit and does not retry automatically", async () => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: 429, message: "rate limited" } }, 429, { "Retry-After": "7" }),
    );

    const result = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which farm gaps matter?", catalog, intent: "production-gap" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({ ok: false, diagnostic: { code: "RATE_LIMITED", retryAfterSeconds: 7 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid JSON", { model: "x/y:free", choices: [{ message: { content: "not-json" } }] }, "INVALID_JSON"],
    ["unknown fact", { model: "x/y:free", choices: [{ message: { content: JSON.stringify({ intent: "risk", selectedFactIds: ["risk:client:UNKNOWN"] }) } }] }, "INVALID_SELECTION"],
    ["truncated", { model: "x/y:free", choices: [{ finish_reason: "length", message: { content: "{}" } }] }, "TRUNCATED_OUTPUT"],
    ["refusal", { model: "x/y:free", choices: [{ message: { refusal: "I cannot select facts." } }] }, "REFUSED_OUTPUT"],
    ["empty", { model: "x/y:free", choices: [{ message: { content: "" } }] }, "EMPTY_OUTPUT"],
  ] as const)("falls back safely for %s model output", async (_name, responseBody, code) => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(responseBody));

    const result = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which clients are at risk?", catalog, intent: "risk" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({ ok: false, diagnostic: { code } });
  });

  it("rejects a response body above the bounded size", async () => {
    const catalog = await baselineCatalog();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: "x/y:free",
        choices: [{ message: { content: "x".repeat(70_000) } }],
      }),
    );

    const result = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which clients are at risk?", catalog, intent: "risk" },
        { fetchImpl: fetchMock },
      ),
    );

    expect(result).toMatchObject({ ok: false, diagnostic: { code: "RESPONSE_TOO_LARGE" } });
  });

  it("handles network failures and bounded aborts without raw errors", async () => {
    const catalog = await baselineCatalog();
    const networkFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("socket secret"));
    const networkResult = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which clients are at risk?", catalog, intent: "risk" },
        { fetchImpl: networkFetch },
      ),
    );
    expect(networkResult).toMatchObject({ ok: false, diagnostic: { code: "NETWORK_ERROR" } });
    expect(JSON.stringify(networkResult)).not.toContain("socket secret");

    const timeoutFetch = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    );
    const timeoutResult = await withOpenRouterEnv(
      { key: "test-key" },
      () => selectEvidenceWithOpenRouter(
        { question: "Which clients are at risk?", catalog, intent: "risk" },
        { fetchImpl: timeoutFetch, timeoutMs: 1 },
      ),
    );
    expect(timeoutResult).toMatchObject({ ok: false, diagnostic: { code: "TIMEOUT" } });
  });
});
