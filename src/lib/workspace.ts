import type {
  InputVersion,
  PlanningResult,
  ValidationIssue,
  WorkbookData,
  Segment,
} from "./types";

/** One shared inspection target carried across overview and detail views. */
export type WorkspaceSelection =
  | { readonly kind: "segment"; readonly segment: Segment }
  | { readonly kind: "client"; readonly clientId: string }
  | {
      readonly kind: "allocation";
      readonly allocationId: string;
    }
  | {
      readonly kind: "local";
      readonly segment: Segment | null;
      readonly farmId?: string;
      readonly residualId?: string;
    };

export type WorkspaceState =
  | { readonly status: "unloaded" }
  | { readonly status: "loading"; readonly requestId: number }
  | { readonly status: "loaded"; readonly workbook: WorkbookData }
  | {
      readonly status: "planning";
      readonly requestId: number;
      readonly workbook: WorkbookData;
    }
  | {
      readonly status: "planned";
      readonly workbook: WorkbookData;
      readonly plan: PlanningResult;
    }
  | {
      readonly status: "invalid-data";
      readonly operation: "load" | "plan";
      readonly message: string;
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly status: "server-error";
      readonly operation: "load" | "plan";
      readonly message: string;
      readonly workbook?: WorkbookData;
    }
  | {
      readonly status: "stale-result";
      readonly workbook: WorkbookData;
      readonly message: string;
      readonly requestedVersion: InputVersion;
      readonly currentVersion: InputVersion;
    };

export interface WorkspaceFailure {
  readonly kind: "invalid-data" | "server-error" | "stale-result";
  readonly message: string;
  readonly issues?: readonly ValidationIssue[];
  readonly currentVersion?: InputVersion;
}

export type WorkspaceAction =
  | { readonly type: "LOAD_STARTED"; readonly requestId: number }
  | {
      readonly type: "LOAD_SUCCEEDED";
      readonly requestId: number;
      readonly workbook: WorkbookData;
    }
  | {
      readonly type: "LOAD_FAILED";
      readonly requestId: number;
      readonly failure: WorkspaceFailure;
    }
  | { readonly type: "PLAN_STARTED"; readonly requestId: number }
  | {
      readonly type: "PLAN_SUCCEEDED";
      readonly requestId: number;
      readonly plan: PlanningResult;
    }
  | {
      readonly type: "PLAN_FAILED";
      readonly requestId: number;
      readonly failure: WorkspaceFailure;
    }
  | { readonly type: "RESET" };

export const initialWorkspaceState: WorkspaceState = { status: "unloaded" };

function activeLoadRequest(
  state: WorkspaceState,
  requestId: number,
): state is Extract<WorkspaceState, { status: "loading" }> {
  return state.status === "loading" && state.requestId === requestId;
}

function activePlanRequest(
  state: WorkspaceState,
  requestId: number,
): state is Extract<WorkspaceState, { status: "planning" }> {
  return state.status === "planning" && state.requestId === requestId;
}

function errorState(
  operation: "load" | "plan",
  failure: WorkspaceFailure,
  workbook?: WorkbookData,
): WorkspaceState {
  if (failure.kind === "invalid-data") {
    return {
      status: "invalid-data",
      operation,
      message: failure.message,
      issues: failure.issues ?? [],
    };
  }

  if (failure.kind === "stale-result") {
    if (workbook === undefined) {
      return {
        status: "server-error",
        operation,
        message: failure.message,
      };
    }
    return {
      status: "stale-result",
      workbook,
      message: failure.message,
      requestedVersion: workbook.snapshot.version,
      currentVersion: failure.currentVersion ?? workbook.snapshot.version,
    };
  }

  return {
    status: "server-error",
    operation,
    message: failure.message,
    ...(workbook === undefined ? {} : { workbook }),
  };
}

/**
 * State transitions for the Load → Compare → Plan workspace.
 *
 * Request IDs make completion order explicit: a response can only change the
 * state that started its request. A plan is also checked against the loaded
 * content version before it is allowed into the workspace.
 */
export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "LOAD_STARTED":
      return { status: "loading", requestId: action.requestId };

    case "LOAD_SUCCEEDED":
      return activeLoadRequest(state, action.requestId)
        ? { status: "loaded", workbook: action.workbook }
        : state;

    case "LOAD_FAILED":
      return activeLoadRequest(state, action.requestId)
        ? errorState("load", action.failure)
        : state;

    case "PLAN_STARTED":
      if (
        state.status !== "loaded" &&
        state.status !== "planned" &&
        !(state.status === "server-error" && state.operation === "plan" && state.workbook !== undefined)
      ) {
        return state;
      }
      if (state.status === "server-error") {
        if (state.workbook === undefined) return state;
        return {
          status: "planning",
          requestId: action.requestId,
          workbook: state.workbook,
        };
      }
      return {
        status: "planning",
        requestId: action.requestId,
        workbook: state.workbook,
      };

    case "PLAN_SUCCEEDED":
      if (!activePlanRequest(state, action.requestId)) return state;
      if (action.plan.inputVersion.value !== state.workbook.snapshot.version.value) {
        return {
          status: "stale-result",
          workbook: state.workbook,
          message: "The plan belongs to a different workbook version. Reload before continuing.",
          requestedVersion: state.workbook.snapshot.version,
          currentVersion: action.plan.inputVersion,
        };
      }
      return { status: "planned", workbook: state.workbook, plan: action.plan };

    case "PLAN_FAILED":
      return activePlanRequest(state, action.requestId)
        ? errorState("plan", action.failure, state.workbook)
        : state;

    case "RESET":
      return initialWorkspaceState;
  }
}
