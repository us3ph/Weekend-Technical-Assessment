import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/plan/route";
import { loadWorkbook } from "@/lib/workbook";

async function withWorkbookPath<T>(path: string | undefined, callback: () => Promise<T>): Promise<T> {
  const previous = process.env.WORKBOOK_PATH;
  if (path === undefined) {
    delete process.env.WORKBOOK_PATH;
  } else {
    process.env.WORKBOOK_PATH = path;
  }

  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.WORKBOOK_PATH;
    } else {
      process.env.WORKBOOK_PATH = previous;
    }
  }
}

function planRequest(body: unknown): Request {
  return new Request("http://localhost/api/plan", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/plan", () => {
  it("recomputes and returns the complete plan for the requested source version", async () => {
    const loaded = await withWorkbookPath(undefined, loadWorkbook);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const response = await withWorkbookPath(
      undefined,
      () => POST(planRequest({ inputVersion: loaded.value.snapshot.version })),
    );
    const body = (await response.json()) as {
      inputVersion?: { value?: string };
      allocations?: unknown[];
      balances?: unknown[];
      localResiduals?: unknown[];
      clientOutcomes?: unknown[];
      kpis?: { exportedTonnes?: number };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.inputVersion?.value).toBe(loaded.value.snapshot.version.value);
    expect(body.allocations?.length).toBeGreaterThan(0);
    expect(body.balances).toHaveLength(80);
    expect(body.localResiduals).toHaveLength(4);
    expect(body.clientOutcomes).toHaveLength(10);
    expect(body.kpis?.exportedTonnes).toBe(500);
  });

  it("rejects malformed JSON and browser-supplied result data", async () => {
    const malformed = await POST(
      new Request("http://localhost/api/plan", {
        body: "not-json",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    expect(malformed.status).toBe(400);

    const browserResult = await POST(
      planRequest({
        allocations: [],
        inputVersion: { algorithm: "sha256", value: "a".repeat(64) },
      }),
    );
    const body = (await browserResult.json()) as { code?: string };
    expect(browserResult.status).toBe(400);
    expect(body.code).toBe("MALFORMED_REQUEST");
  });

  it("returns a reloadable conflict when the source version changed", async () => {
    const loaded = await withWorkbookPath(undefined, loadWorkbook);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const response = await POST(
      planRequest({ inputVersion: { algorithm: "sha256", value: "b".repeat(64) } }),
    );
    const body = (await response.json()) as {
      code?: string;
      currentInputVersion?: { value?: string };
      requestedInputVersion?: { value?: string };
    };

    expect(response.status).toBe(409);
    expect(body.code).toBe("STALE_INPUT_VERSION");
    expect(body.requestedInputVersion?.value).toBe("b".repeat(64));
    expect(body.currentInputVersion?.value).toBe(loaded.value.snapshot.version.value);
  });

  it("does not expose configured filesystem errors", async () => {
    const missingPath = "plan-source-does-not-exist.xlsx";
    const response = await withWorkbookPath(missingPath, () =>
      POST(planRequest({ inputVersion: { algorithm: "sha256", value: "a".repeat(64) } })),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("Unable to generate the plan from the configured workbook. Try again.");
    expect(JSON.stringify(body)).not.toContain(missingPath);
    expect(JSON.stringify(body)).not.toContain("ENOENT");
  });
});
