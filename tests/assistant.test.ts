import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { buildEvidenceCatalog, factById, type EvidenceIntent } from "@/lib/evidence";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";

function assistantRequest(body: unknown): Request {
  return new Request("http://localhost/api/assistant", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function baseline() {
  const loaded = await loadWorkbook();
  if (!loaded.ok) throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
  const plan = calculatePlan(loaded.value.snapshot);
  return { loaded: loaded.value, plan, catalog: buildEvidenceCatalog(loaded.value, plan) };
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

const supportedQuestions: readonly { readonly intent: EvidenceIntent; readonly question: string }[] = [
  { intent: "risk", question: "Which clients are at risk and why?" },
  { intent: "production-gap", question: "Which farm/segment gaps matter most today?" },
  { intent: "local-residual", question: "Why are 60 t going local, and what is its estimated value?" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("T7 — Grounded assistant answers", () => {
  it.each(supportedQuestions)("renders server facts and resolvable citations for $intent", async ({ intent, question }) => {
    const { loaded, plan, catalog } = await baseline();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: "qwen/qwen3-30b-a3b-instruct:free",
        choices: [{
          message: {
            content: JSON.stringify({ intent, selectedFactIds: catalog.requiredFactIds[intent] }),
          },
        }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({ question, inputVersion: loaded.snapshot.version })),
    );
    const body = (await response.json()) as {
      answer?: {
        source?: string;
        sourceLabel?: string;
        paragraphs?: string[];
        factIds?: string[];
        citations?: readonly { readonly kind: string; readonly id: string }[];
      };
      provider?: { status?: string };
    };

    const expectedFacts = catalog.requiredFactIds[intent].map((factId) => factById(catalog, factId));
    const expectedParagraphs = expectedFacts.map((fact) => fact?.allowedText);
    const expectedCitationKeys = new Set(
      expectedFacts.flatMap((fact) => fact?.references.map((reference) => `${reference.kind}:${reference.id}`) ?? []),
    );
    const actualCitationKeys = new Set(
      body.answer?.citations?.map((reference) => `${reference.kind}:${reference.id}`) ?? [],
    );

    expect(response.status).toBe(200);
    expect(body.answer).toMatchObject({
      source: "openrouter",
      sourceLabel: "OpenRouter free model — server-rendered evidence",
      factIds: catalog.requiredFactIds[intent],
      paragraphs: expectedParagraphs,
    });
    expect(body.provider).toMatchObject({ status: "success" });
    expect(actualCitationKeys).toEqual(expectedCitationKeys);
    expect(body.answer?.paragraphs?.join(" ")).not.toContain("999,999");
    expect(body.answer?.paragraphs?.join(" ")).toContain(intent === "local-residual" ? "60 t" : intent === "risk" ? "C02" : "F01");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (const referenceKey of actualCitationKeys) {
      const [kind, id] = referenceKey.split(":");
      if (kind === "farm") expect(plan.balances.some((balance) => balance.farmId === id)).toBe(true);
      if (kind === "client") expect(plan.clientOutcomes.some((outcome) => outcome.clientId === id)).toBe(true);
      if (kind === "allocation") expect(plan.allocations.some((allocation) => allocation.allocationId === id)).toBe(true);
      if (kind === "residual") expect(plan.localResiduals.some((residual) => residual.residualId === id)).toBe(true);
    }
  });
});

describe("T8 — Assistant failure and safety boundaries", () => {
  it("keeps unsupported, missing-key, paid-model, rate-limit, and invalid-selection states honest", async () => {
    const { loaded, plan } = await baseline();
    const before = JSON.stringify(plan);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const unsupported = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({
        question: "Will weather cause a delivery delay tomorrow?",
        inputVersion: loaded.snapshot.version,
      })),
    );
    const unsupportedBody = (await unsupported.json()) as { answer?: { intent?: string }; provider?: { code?: string } };
    expect(unsupportedBody).toMatchObject({ answer: { intent: "unsupported" }, provider: { code: "UNSUPPORTED_QUESTION" } });
    expect(fetchMock).not.toHaveBeenCalled();

    const missingKey = await withOpenRouterEnv(
      {},
      () => POST(assistantRequest({ question: "Which clients are at risk?", inputVersion: loaded.snapshot.version })),
    );
    const missingKeyBody = (await missingKey.json()) as { answer?: { sourceLabel?: string }; provider?: { code?: string } };
    expect(missingKeyBody).toMatchObject({ answer: { sourceLabel: "Deterministic summary — no model used" }, provider: { code: "MISSING_API_KEY" } });

    const paidModel = await withOpenRouterEnv(
      { key: "test-key", model: "openai/gpt-4o" },
      () => POST(assistantRequest({ question: "Which clients are at risk?", inputVersion: loaded.snapshot.version })),
    );
    const paidModelBody = (await paidModel.json()) as { provider?: { code?: string } };
    expect(paidModelBody.provider?.code).toBe("PAID_MODEL_CONFIGURED");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 429 } }, 429, { "Retry-After": "7" }));
    const rateLimited = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({ question: "Why is the residual going local?", inputVersion: loaded.snapshot.version })),
    );
    const rateLimitedBody = (await rateLimited.json()) as { answer?: { sourceLabel?: string }; provider?: { code?: string; retryAfterSeconds?: number } };
    expect(rateLimitedBody).toMatchObject({ answer: { sourceLabel: "Deterministic summary — no model used" }, provider: { code: "RATE_LIMITED", retryAfterSeconds: 7 } });

    fetchMock.mockResolvedValueOnce(jsonResponse({
      model: "qwen/qwen3-30b-a3b-instruct:free",
      choices: [{ message: { content: JSON.stringify({ intent: "risk", selectedFactIds: ["unknown:fact"] }) } }],
    }));
    const invalidSelection = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({ question: "Which clients are at risk?", inputVersion: loaded.snapshot.version })),
    );
    const invalidSelectionBody = (await invalidSelection.json()) as { answer?: { sourceLabel?: string }; provider?: { code?: string } };
    expect(invalidSelectionBody).toMatchObject({ answer: { sourceLabel: "Deterministic summary — no model used" }, provider: { code: "INVALID_SELECTION" } });
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("rejects stale versions and browser-supplied result data before inference", async () => {
    const { loaded, plan } = await baseline();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const stale = await withOpenRouterEnv(
      { key: "test-key" },
      () => POST(assistantRequest({
        question: "Which clients are at risk?",
        inputVersion: { algorithm: "sha256", value: "b".repeat(64) },
      })),
    );
    const staleBody = (await stale.json()) as { code?: string };
    expect(stale.status).toBe(409);
    expect(staleBody.code).toBe("STALE_INPUT_VERSION");

    const tampered = await POST(assistantRequest({
      question: "Which clients are at risk?",
      inputVersion: loaded.snapshot.version,
      allocations: [{ clientId: "C01", tonnes: 0 }],
      kpis: { exportedTonnes: 0 },
    }));
    expect(tampered.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(calculatePlan(loaded.snapshot))).toBe(JSON.stringify(plan));
  });
});
