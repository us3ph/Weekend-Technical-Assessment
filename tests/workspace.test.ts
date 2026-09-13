import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/planner";
import { initialWorkspaceState, workspaceReducer } from "@/lib/workspace";
import { loadWorkbook } from "@/lib/workbook";

describe("workspace state", () => {
  it("ignores an older load response after a newer load begins", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const firstLoading = workspaceReducer(initialWorkspaceState, {
      type: "LOAD_STARTED",
      requestId: 1,
    });
    const secondLoading = workspaceReducer(firstLoading, {
      type: "LOAD_STARTED",
      requestId: 2,
    });
    const ignored = workspaceReducer(secondLoading, {
      type: "LOAD_SUCCEEDED",
      requestId: 1,
      workbook: loaded.value,
    });

    expect(ignored).toEqual(secondLoading);
    expect(
      workspaceReducer(secondLoading, {
        type: "LOAD_SUCCEEDED",
        requestId: 2,
        workbook: loaded.value,
      }),
    ).toEqual({ status: "loaded", workbook: loaded.value });
  });

  it("only accepts a plan matching the loaded input version", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = calculatePlan(loaded.value.snapshot);
    const planning = workspaceReducer(
      { status: "loaded", workbook: loaded.value },
      { type: "PLAN_STARTED", requestId: 3 },
    );
    expect(planning.status).toBe("planning");

    const planned = workspaceReducer(planning, {
      type: "PLAN_SUCCEEDED",
      requestId: 3,
      plan,
    });
    expect(planned.status).toBe("planned");

    const stale = workspaceReducer(planning, {
      type: "PLAN_SUCCEEDED",
      requestId: 3,
      plan: { ...plan, inputVersion: { algorithm: "sha256", value: "c".repeat(64) } },
    });
    expect(stale.status).toBe("stale-result");
    if (stale.status === "stale-result") {
      expect(stale.requestedVersion).toEqual(loaded.value.snapshot.version);
      expect(stale.currentVersion.value).toBe("c".repeat(64));
    }
  });

  it("clears dependent results on reset and preserves the workbook for plan retries", async () => {
    const loaded = await loadWorkbook();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const planning = workspaceReducer(
      { status: "loaded", workbook: loaded.value },
      { type: "PLAN_STARTED", requestId: 4 },
    );
    const failed = workspaceReducer(planning, {
      type: "PLAN_FAILED",
      requestId: 4,
      failure: { kind: "server-error", message: "Try again." },
    });
    expect(failed).toEqual({
      status: "server-error",
      operation: "plan",
      message: "Try again.",
      workbook: loaded.value,
    });
    expect(
      workspaceReducer(failed, { type: "PLAN_STARTED", requestId: 5 }),
    ).toEqual({ status: "planning", requestId: 5, workbook: loaded.value });

    expect(workspaceReducer(failed, { type: "RESET" })).toEqual(initialWorkspaceState);
    expect(
      workspaceReducer(planning, {
        type: "PLAN_SUCCEEDED",
        requestId: 4,
        plan: calculatePlan(loaded.value.snapshot),
      }),
    ).toMatchObject({ status: "planned" });
  });
});
