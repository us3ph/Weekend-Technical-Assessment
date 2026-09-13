"use client";

import { useEffect, useRef, type SyntheticEvent } from "react";
import {
  deriveAllocationLocalFacts,
  deriveTraceExplanations,
  isAllocationFocus,
  isBalanceFocus,
  isLocalFocus,
} from "@/lib/trace";
import type { Allocation, FarmSegmentBalance, LocalResidual, PlanningResult, WorkbookData } from "@/lib/types";
import type { WorkspaceSelection } from "@/lib/workspace";
import styles from "./TraceView.module.css";

const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const euroFormatter = new Intl.NumberFormat("en-GB", {
  currency: "EUR",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
  style: "currency",
});

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

function formatCurrency(value: number): string {
  return euroFormatter.format(value);
}

function farmName(workbook: WorkbookData, farmId: string): string {
  return workbook.snapshot.farms.find((farm) => farm.farmId === farmId)?.farmName ?? farmId;
}

function clientName(workbook: WorkbookData, clientId: string): string {
  return workbook.snapshot.clients.find((client) => client.clientId === clientId)?.clientName ?? clientId;
}

function selectionLabel(
  workbook: WorkbookData,
  selection: WorkspaceSelection | null,
): string {
  if (selection === null) return "All trace rows are visible";
  if (selection.kind === "allocation") return `${selection.allocationId} · allocation trace`;
  if (selection.kind === "client") return `${selection.clientId} · client allocation trace`;
  if (selection.kind === "segment") return `Segment ${selection.segment} · allocation and residual trace`;
  if (selection.residualId !== undefined) {
    return `${selection.residualId} · ${selection.farmId ?? "farm"}/${selection.segment ?? "all segments"}`;
  }
  if (selection.farmId !== undefined) return `${selection.farmId} · local residual trace`;
  return selection.segment === null
    ? "All local residuals"
    : `Local residual · segment ${selection.segment}`;
}

function TraceFocusBar({
  workbook,
  selection,
  onClearSelection,
}: {
  readonly workbook: WorkbookData;
  readonly selection: WorkspaceSelection | null;
  readonly onClearSelection: () => void;
}) {
  return (
    <div className={styles.focusBar} role="status" aria-live="polite" aria-atomic="true">
      <div>
        <span className={styles.focusKicker}>Active trace focus</span>
        <strong>{selectionLabel(workbook, selection)}</strong>
        <p>
          {selection === null
            ? "Every exported and local tonne is listed; choose a row to carry the same focus to Production and Commercial."
            : "The selected row remains highlighted across the connected views; no farm-client obligation is inferred."}
        </p>
      </div>
      {selection !== null ? (
        <button className={styles.clearFocusButton} type="button" onClick={onClearSelection}>
          Clear focus
        </button>
      ) : null}
    </div>
  );
}

function AllocationTable({
  allocations,
  workbook,
  selection,
  onSelect,
}: {
  readonly allocations: readonly Allocation[];
  readonly workbook: WorkbookData;
  readonly selection: WorkspaceSelection | null;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="Export allocation trace table"
      tabIndex={0}
    >
      <table className={styles.traceTable}>
        <caption className={styles.visuallyHidden}>Export allocation trace</caption>
        <thead>
          <tr>
            <th scope="col">Trace</th>
            <th scope="col">Farm</th>
            <th scope="col">Supply segment</th>
            <th scope="col">Client</th>
            <th scope="col">Requested</th>
            <th scope="col">Tonnes</th>
            <th scope="col">Quality upgrade</th>
            <th scope="col">Export revenue</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => {
            const focused = isAllocationFocus(allocation, selection);
            return (
              <tr key={allocation.allocationId} className={focused ? styles.focusedRow : undefined}>
                <th scope="row">
                  <button
                    className={styles.traceButton}
                    type="button"
                    aria-pressed={selection?.kind === "allocation" && selection.allocationId === allocation.allocationId}
                    onClick={() => onSelect({ kind: "allocation", allocationId: allocation.allocationId })}
                  >
                    {allocation.allocationId}
                  </button>
                </th>
                <td>
                  <button
                    className={styles.entityButton}
                    type="button"
                    onClick={() => onSelect({ kind: "allocation", allocationId: allocation.allocationId })}
                  >
                    <span>{allocation.farmId}</span>
                    <small>{farmName(workbook, allocation.farmId)}</small>
                  </button>
                </td>
                <td>
                  <button
                    className={styles.segmentButton}
                    type="button"
                    onClick={() => onSelect({ kind: "segment", segment: allocation.segment })}
                  >
                    {allocation.segment}
                  </button>
                </td>
                <td>
                  <button
                    className={styles.entityButton}
                    type="button"
                    onClick={() => onSelect({ kind: "allocation", allocationId: allocation.allocationId })}
                  >
                    <span>{allocation.clientId}</span>
                    <small>{clientName(workbook, allocation.clientId)}</small>
                  </button>
                </td>
                <td>{allocation.requestedSegment}</td>
                <td>{formatTonnes(allocation.tonnes)}</td>
                <td>
                  {allocation.qualityUpgrade.levels === 0
                    ? "Exact fit"
                    : `${allocation.qualityUpgrade.fromSegment} → ${allocation.qualityUpgrade.toSegment} (${allocation.qualityUpgrade.levels})`}
                </td>
                <td>{formatCurrency(allocation.exportRevenueEur)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LocalResidualTable({
  residuals,
  selection,
  onSelect,
}: {
  readonly residuals: readonly LocalResidual[];
  readonly selection: WorkspaceSelection | null;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="Local residual trace table"
      tabIndex={0}
    >
      <table className={styles.traceTable}>
        <caption className={styles.visuallyHidden}>Local residual trace</caption>
        <thead>
          <tr>
            <th scope="col">Trace</th>
            <th scope="col">Farm</th>
            <th scope="col">Segment</th>
            <th scope="col">Residual tonnes</th>
            <th scope="col">Local unit price</th>
            <th scope="col">Local value</th>
          </tr>
        </thead>
        <tbody>
          {residuals.map((residual) => {
            const focused = isLocalFocus(residual, selection);
            return (
              <tr key={residual.residualId} className={focused ? styles.focusedRow : undefined}>
                <th scope="row">
                  <button
                    className={styles.traceButton}
                    type="button"
                    aria-pressed={selection?.kind === "local" && selection.residualId === residual.residualId}
                    onClick={() => onSelect({
                      kind: "local",
                      farmId: residual.farmId,
                      residualId: residual.residualId,
                      segment: residual.segment,
                    })}
                  >
                    {residual.residualId}
                  </button>
                </th>
                <td>
                  <button
                    className={styles.entityButton}
                    type="button"
                    onClick={() => onSelect({
                      kind: "local",
                      farmId: residual.farmId,
                      residualId: residual.residualId,
                      segment: residual.segment,
                    })}
                  >
                    <span>{residual.farmId}</span>
                  </button>
                </td>
                <td>
                  <button
                    className={styles.segmentButton}
                    type="button"
                    onClick={() => onSelect({ kind: "local", segment: residual.segment })}
                  >
                    {residual.segment}
                  </button>
                </td>
                <td>{formatTonnes(residual.tonnes)}</td>
                <td>{formatCurrency(residual.localPricePerTonneEur)}</td>
                <td>{formatCurrency(residual.localValueEur)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConservationTable({
  balances,
  selection,
}: {
  readonly balances: readonly FarmSegmentBalance[];
  readonly selection: WorkspaceSelection | null;
}) {
  const summaryRef = useRef<HTMLElement | null>(null);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>): void {
    if (!event.currentTarget.open) summaryRef.current?.focus();
  }

  return (
    <details className={styles.conservationDetails} onToggle={handleToggle}>
      <summary ref={summaryRef}>Show per farm / segment conservation ({balances.length} rows)</summary>
      <div
        className={styles.tableWrap}
        role="region"
        aria-label="Farm and segment conservation table"
        tabIndex={0}
      >
        <table className={styles.conservationTable}>
          <caption className={styles.visuallyHidden}>Farm and segment export/local conservation</caption>
          <thead>
            <tr>
              <th scope="col">Farm</th>
              <th scope="col">Segment</th>
              <th scope="col">Actual receipts</th>
              <th scope="col">Exported</th>
              <th scope="col">Local</th>
              <th scope="col">Check</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => {
              const focused = isBalanceFocus(balance, selection);
              return (
                <tr key={`${balance.farmId}-${balance.segment}`} className={focused ? styles.focusedRow : undefined}>
                  <th scope="row">{balance.farmId}</th>
                  <td>{balance.segment}</td>
                  <td>{formatTonnes(balance.actualTonnes)}</td>
                  <td>{formatTonnes(balance.exportedTonnes)}</td>
                  <td>{formatTonnes(balance.localTonnes)}</td>
                  <td className={styles.checkCell}>
                    {balance.exportedTonnes + balance.localTonnes === balance.actualTonnes ? "OK" : "Review"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function TraceView({
  workbook,
  plan,
  selection,
  onSelect,
  onClearSelection,
}: {
  readonly workbook: WorkbookData;
  readonly plan?: PlanningResult;
  readonly selection: WorkspaceSelection | null;
  readonly onSelect: (selection: WorkspaceSelection) => void;
  readonly onClearSelection: () => void;
}) {
  const facts = deriveAllocationLocalFacts(plan);
  const explanations = deriveTraceExplanations(workbook, plan);

  useEffect(() => {
    if (selection?.kind !== "allocation" && selection?.kind !== "local") return;
    const view = document.getElementById("allocation-local-view");
    if (!(view instanceof HTMLElement)) return;
    view.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    view.focus({ preventScroll: true });
  }, [selection]);

  return (
    <section
      id="allocation-local-view"
      className={styles.traceView}
      aria-labelledby="allocation-local-title"
      tabIndex={-1}
    >
      <div className={styles.viewHeader}>
        <div>
          <p className={styles.sectionKicker}>Trace · Allocation &amp; Local</p>
          <h3 id="allocation-local-title">Every tonne has a visible destination</h3>
          <p className={styles.viewLead}>
            Export rows connect actual farm-segment receipts to clients. Local rows show the remaining actual receipts with the source reference price and ratio applied.
          </p>
        </div>
        <span className={plan === undefined ? styles.badge : styles.successBadge}>
          {plan === undefined ? "Plan required" : "Plan-linked trace"}
        </span>
      </div>

      <TraceFocusBar workbook={workbook} selection={selection} onClearSelection={onClearSelection} />

      {facts === null ? (
        <div className={styles.notReady}>
          Generate a plan to reveal export destinations, local residuals, and conservation checks. No trace row is shown as zero before the server calculates it.
        </div>
      ) : (
        <>
          <div className={styles.traceSummary} role="group" aria-label="Allocation and local totals">
            <div>
              <span>Export trace rows</span>
              <strong>{facts.allocations.length}</strong>
            </div>
            <div>
              <span>Exported</span>
              <strong>{formatTonnes(facts.exportedTonnes)}</strong>
            </div>
            <div>
              <span>Local residual</span>
              <strong>{formatTonnes(facts.localTonnes)}</strong>
            </div>
            <div>
              <span>Local value</span>
              <strong>{formatCurrency(facts.localValueEur)}</strong>
            </div>
          </div>

          <div className={styles.traceGrid}>
            <section className={styles.traceCard} aria-labelledby="allocation-trace-title">
              <div className={styles.cardHeading}>
                <div>
                  <p className={styles.sectionKicker}>Export destination</p>
                  <h4 id="allocation-trace-title">Allocation trace</h4>
                </div>
                <span>{formatTonnes(facts.exportedTonnes)} total</span>
              </div>
              <AllocationTable
                allocations={facts.allocations}
                workbook={workbook}
                selection={selection}
                onSelect={onSelect}
              />
            </section>

            <section className={styles.traceCard} aria-labelledby="local-trace-title">
              <div className={styles.cardHeading}>
                <div>
                  <p className={styles.sectionKicker}>Local destination</p>
                  <h4 id="local-trace-title">Residual trace</h4>
                </div>
                <span>{formatTonnes(facts.localTonnes)} total</span>
              </div>
              <LocalResidualTable residuals={facts.localResiduals} selection={selection} onSelect={onSelect} />
              <p className={styles.tableNote}>
                Local unit price = source reference export price × station local-market ratio. This is a calculated local value, not guaranteed lost profit or achievable additional sales.
              </p>
            </section>
          </div>

          <ConservationTable balances={facts.balances} selection={selection} />

          {explanations.length > 0 ? (
            <section className={styles.explanationSection} aria-labelledby="trace-explanation-title">
              <div className={styles.cardHeading}>
                <div>
                  <p className={styles.sectionKicker}>Shared evidence</p>
                  <h4 id="trace-explanation-title">Read the remaining constraints</h4>
                </div>
                <span>Server-calculated</span>
              </div>
              <div className={styles.explanationGrid}>
                {explanations.map((explanation) => (
                  <p key={explanation.kind} className={styles.explanationItem}>{explanation.text}</p>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
