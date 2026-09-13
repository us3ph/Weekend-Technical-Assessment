"use client";

import { useRef, useReducer, useState } from "react";
import CommercialView from "@/components/CommercialView";
import DecisionOverview from "@/components/DecisionOverview";
import ProductionView from "@/components/ProductionView";
import TraceView from "@/components/TraceView";
import {
  initialWorkspaceState,
  workspaceReducer,
  type WorkspaceFailure,
  type WorkspaceSelection,
  type WorkspaceState,
} from "@/lib/workspace";
import type { InputVersion, ValidationIssue, WorkbookData } from "@/lib/types";
import styles from "./PlanningWorkspace.module.css";

const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInputVersion(value: unknown): value is InputVersion {
  return (
    isRecord(value) &&
    value.algorithm === "sha256" &&
    typeof value.value === "string" &&
    /^[a-f0-9]{64}$/.test(value.value)
  );
}

function isWorkbookData(value: unknown): value is WorkbookData {
  return (
    isRecord(value) &&
    isRecord(value.snapshot) &&
    isInputVersion(value.snapshot.version) &&
    isRecord(value.production) &&
    isRecord(value.health)
  );
}

function isPlanData(value: unknown): value is NonNullable<
  Extract<WorkspaceState, { status: "planned" }>['plan']
> {
  return (
    isRecord(value) &&
    isInputVersion(value.inputVersion) &&
    isRecord(value.production) &&
    Array.isArray(value.allocations) &&
    Array.isArray(value.balances) &&
    Array.isArray(value.localResiduals) &&
    Array.isArray(value.clientOutcomes) &&
    isRecord(value.kpis)
  );
}

function errorText(value: unknown, fallback: string): string {
  if (isRecord(value) && typeof value.error === "string" && value.error.trim().length > 0) {
    return value.error;
  }
  return fallback;
}

function validationIssues(value: unknown): readonly ValidationIssue[] {
  if (!isRecord(value) || !Array.isArray(value.issues)) return [];
  return value.issues as readonly ValidationIssue[];
}

function failureFromResponse(
  response: Response,
  body: unknown,
  operation: "load" | "plan",
  requestedVersion?: InputVersion,
): WorkspaceFailure {
  if (response.status === 422) {
    return {
      kind: "invalid-data",
      message: errorText(body, "The workbook data is invalid."),
      issues: validationIssues(body),
    };
  }

  if (response.status === 409 && operation === "plan" && isRecord(body)) {
    const currentVersion = isInputVersion(body.currentInputVersion)
      ? body.currentInputVersion
      : requestedVersion;
    return {
      kind: "stale-result",
      message: errorText(body, "The workbook changed. Reload before generating a plan."),
      currentVersion,
    };
  }

  return {
    kind: "server-error",
    message: errorText(
      body,
      operation === "load"
        ? "Unable to load the configured workbook. Try again."
        : "Unable to generate the plan. Try again.",
    ),
  };
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

function workbookFromState(state: WorkspaceState): WorkbookData | undefined {
  switch (state.status) {
    case "loaded":
    case "planning":
    case "planned":
    case "stale-result":
      return state.workbook;
    case "server-error":
      return state.workbook;
    default:
      return undefined;
  }
}

function statusLabel(state: WorkspaceState): string {
  switch (state.status) {
    case "unloaded":
      return "Waiting for the authoritative workbook";
    case "loading":
      return "Loading and validating the workbook…";
    case "loaded":
      return "Workbook loaded — ready to compare and plan";
    case "planning":
      return "Generating the server-side recommendation…";
    case "planned":
      return "Plan prepared — ready for committee review";
    case "invalid-data":
      return "The source data needs attention";
    case "server-error":
      return "The server could not complete that request";
    case "stale-result":
      return "The workbook version is no longer current";
  }
}

function issueLocation(issue: ValidationIssue): string {
  const row = issue.row === null ? "" : ` row ${issue.row}`;
  const cell = issue.cell === null ? "" : `, ${issue.cell}`;
  return `${issue.sheet}${row}${cell}`;
}

function FailurePanel({
  state,
  onRetry,
  onReload,
}: {
  readonly state: WorkspaceState;
  readonly onRetry: () => void;
  readonly onReload: () => void;
}) {
  if (state.status === "invalid-data") {
    return (
      <section className={`${styles.messagePanel} ${styles.invalidPanel}`} role="alert">
        <p className={styles.messageKicker}>Invalid source data</p>
        <h3>{state.message}</h3>
        <p>Planning stays disabled until the configured source is corrected and reloaded.</p>
        {state.issues.length > 0 ? (
          <ol className={styles.issueList}>
            {state.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.field}-${index}`}>
                <strong>{issueLocation(issue)}:</strong> {issue.message} {issue.correctiveText}
              </li>
            ))}
          </ol>
        ) : null}
        <button className={styles.secondaryButton} type="button" onClick={onReload}>
          Reload workbook
        </button>
      </section>
    );
  }

  if (state.status === "server-error") {
    return (
      <section className={`${styles.messagePanel} ${styles.errorPanel}`} role="alert">
        <p className={styles.messageKicker}>Request failed</p>
        <h3>{state.message}</h3>
        <p>No server-calculated result was accepted into this workspace.</p>
        <button className={styles.secondaryButton} type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }

  if (state.status === "stale-result") {
    return (
      <section className={`${styles.messagePanel} ${styles.warningPanel}`} role="alert">
        <p className={styles.messageKicker}>Reload required</p>
        <h3>{state.message}</h3>
        <p>
          The visible comparison and the requested plan no longer refer to the same source
          snapshot. Reload to start a new coherent workspace.
        </p>
        <button className={styles.secondaryButton} type="button" onClick={onReload}>
          Reload workbook
        </button>
      </section>
    );
  }

  return null;
}

function DataHealthPanel({ workbook }: { readonly workbook: WorkbookData }) {
  return (
    <section className={styles.healthPanel} aria-labelledby="data-health-title">
      <div>
        <p className={styles.sectionKicker}>Source status</p>
        <h3 id="data-health-title">Data health: valid</h3>
        <p className={styles.mutedText}>
          {workbook.health.sourceFileName} · version {workbook.snapshot.version.value.slice(0, 12)}…
        </p>
      </div>
      <dl className={styles.healthList}>
        <div>
          <dt>Farms</dt>
          <dd>{workbook.health.farmCount}</dd>
        </div>
        <div>
          <dt>Clients</dt>
          <dd>{workbook.health.clientCount}</dd>
        </div>
        <div>
          <dt>Station capacity</dt>
          <dd>{formatTonnes(workbook.snapshot.station.exportConditioningCapacityT)}</dd>
        </div>
      </dl>
    </section>
  );
}

export default function PlanningWorkspace() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<number | null>(null);

  function nextRequestId(): number {
    requestSequence.current += 1;
    return requestSequence.current;
  }

  function startLoad(): void {
    if (activeRequest.current !== null) return;
    setSelection(null);
    const requestId = nextRequestId();
    activeRequest.current = requestId;
    dispatch({ type: "LOAD_STARTED", requestId });

    void (async () => {
      try {
        const response = await fetch("/api/workbook", { cache: "no-store" });
        const body = await responseBody(response);
        if (!response.ok) {
          dispatch({
            type: "LOAD_FAILED",
            requestId,
            failure: failureFromResponse(response, body, "load"),
          });
        } else if (!isWorkbookData(body)) {
          dispatch({
            type: "LOAD_FAILED",
            requestId,
            failure: {
              kind: "server-error",
              message: "The server returned an incomplete workbook response. Try again.",
            },
          });
        } else {
          dispatch({ type: "LOAD_SUCCEEDED", requestId, workbook: body });
        }
      } catch {
        dispatch({
          type: "LOAD_FAILED",
          requestId,
          failure: {
            kind: "server-error",
            message: "The workbook request could not reach the server. Try again.",
          },
        });
      } finally {
        if (activeRequest.current === requestId) activeRequest.current = null;
      }
    })();
  }

  function startPlan(): void {
    if (activeRequest.current !== null) return;
    const workbook = workbookFromState(state);
    const canRetryPlan =
      state.status === "loaded" ||
      state.status === "planned" ||
      (state.status === "server-error" && state.operation === "plan" && state.workbook !== undefined);
    if (workbook === undefined || !canRetryPlan) return;

    setSelection(null);
    const requestId = nextRequestId();
    activeRequest.current = requestId;
    dispatch({ type: "PLAN_STARTED", requestId });

    void (async () => {
      try {
        const response = await fetch("/api/plan", {
          body: JSON.stringify({ inputVersion: workbook.snapshot.version }),
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = await responseBody(response);
        if (!response.ok) {
          dispatch({
            type: "PLAN_FAILED",
            requestId,
            failure: failureFromResponse(response, body, "plan", workbook.snapshot.version),
          });
        } else if (!isPlanData(body)) {
          dispatch({
            type: "PLAN_FAILED",
            requestId,
            failure: {
              kind: "server-error",
              message: "The server returned an incomplete plan response. Try again.",
            },
          });
        } else {
          dispatch({ type: "PLAN_SUCCEEDED", requestId, plan: body });
        }
      } catch {
        dispatch({
          type: "PLAN_FAILED",
          requestId,
          failure: {
            kind: "server-error",
            message: "The planning request could not reach the server. Try again.",
          },
        });
      } finally {
        if (activeRequest.current === requestId) activeRequest.current = null;
      }
    })();
  }

  function resetWorkspace(): void {
    activeRequest.current = null;
    setSelection(null);
    dispatch({ type: "RESET" });
  }

  const workbook = workbookFromState(state);
  const pending = state.status === "loading" || state.status === "planning";
  const canPlan = state.status === "loaded" || state.status === "planned";
  const loadLabel = state.status === "unloaded" ? "Load workbook" : "Reload workbook";

  return (
    <section className={styles.workspace} aria-labelledby="workspace-title" aria-busy={pending}>
      <div className={styles.workspaceHeader}>
        <div>
          <p className={styles.sectionKicker}>Workspace</p>
          <h2 id="workspace-title">Load, compare, and prepare</h2>
          <p className={styles.statusText} aria-live="polite">{statusLabel(state)}</p>
        </div>
        <div className={styles.actionRow}>
          <button className={styles.primaryButton} type="button" onClick={startLoad} disabled={pending}>
            {loadLabel}
          </button>
          <button className={styles.primaryButton} type="button" onClick={startPlan} disabled={!canPlan || pending}>
            {state.status === "planned" ? "Regenerate plan" : "Generate plan"}
          </button>
          <button
            className={styles.tertiaryButton}
            type="button"
            onClick={resetWorkspace}
            disabled={state.status === "unloaded"}
          >
            Reset
          </button>
        </div>
      </div>

      {state.status === "unloaded" ? (
        <section className={styles.emptyState} aria-labelledby="empty-workspace-title">
          <span className={styles.badge}>Not loaded</span>
          <h3 id="empty-workspace-title">Start with the supplied workbook</h3>
          <p>
            Load the authoritative source to see its health and production comparison. No allocations or financial results are shown before the server generates a plan.
          </p>
        </section>
      ) : null}

      {state.status === "loading" ? (
        <section className={styles.loadingState} aria-live="polite">
          <span className={styles.loadingDot} aria-hidden="true" />
          <div>
            <h3>Loading workbook</h3>
            <p>Reading, validating, and versioning the server-side source…</p>
          </div>
        </section>
      ) : null}

      {state.status === "invalid-data" || state.status === "server-error" || state.status === "stale-result" ? (
        <FailurePanel state={state} onRetry={state.status === "server-error" && state.workbook ? startPlan : startLoad} onReload={startLoad} />
      ) : null}

      {workbook ? (
        <div className={styles.contentStack}>
          <DataHealthPanel workbook={workbook} />
          <DecisionOverview
            workbook={workbook}
            plan={state.status === "planned" ? state.plan : undefined}
            selection={selection}
            onSelect={setSelection}
            onClearSelection={() => setSelection(null)}
          />
          <ProductionView
            workbook={workbook}
            plan={state.status === "planned" ? state.plan : undefined}
            selection={selection}
            onSelect={setSelection}
            onClearSelection={() => setSelection(null)}
          />
          <CommercialView
            workbook={workbook}
            plan={state.status === "planned" ? state.plan : undefined}
            selection={selection}
            onSelect={setSelection}
            onClearSelection={() => setSelection(null)}
          />
          <TraceView
            workbook={workbook}
            plan={state.status === "planned" ? state.plan : undefined}
            selection={selection}
            onSelect={setSelection}
            onClearSelection={() => setSelection(null)}
          />
        </div>
      ) : null}
    </section>
  );
}
