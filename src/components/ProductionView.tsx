import { useEffect, useRef, type SyntheticEvent } from "react";
import { deriveProductionFarmFacts, segmentBalance, type ProductionFarmFacts } from "@/lib/production";
import { SEGMENTS, type PlanningResult, type Segment, type WorkbookData } from "@/lib/types";
import type { WorkspaceSelection } from "@/lib/workspace";
import styles from "./ProductionView.module.css";

const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0, style: "percent" });

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

function formatPercent(value: number): string {
  return percentFormatter.format(value);
}

function formatVariance(value: number): string {
  return `${value > 0 ? "+" : ""}${tonnesFormatter.format(value)} t`;
}

function varianceClass(value: number): string {
  if (value < 0) return styles.negativeVariance ?? "";
  if (value > 0) return styles.positiveVariance ?? "";
  return styles.neutralVariance ?? "";
}

function farmAnchor(farmId: string): string {
  return `farm-${farmId}`;
}

function segmentAnchor(farmId: string, segment: Segment): string {
  return `${farmAnchor(farmId)}-${segment}`;
}

function selectedSegment(
  facts: readonly ProductionFarmFacts[],
  selection: WorkspaceSelection | null,
): Segment | undefined {
  if (selection?.kind === "segment") return selection.segment;
  if (selection?.kind === "local") return selection.segment ?? undefined;
  if (selection?.kind === "allocation") {
    return facts
      .flatMap((farmFacts) => farmFacts.allocations)
      .find((allocation) => allocation.allocationId === selection.allocationId)?.segment;
  }
  return undefined;
}

function clientName(workbook: WorkbookData, clientId: string): string {
  return workbook.snapshot.clients.find((client) => client.clientId === clientId)?.clientName ?? clientId;
}

function isFocusedFarm(
  facts: ProductionFarmFacts,
  selection: WorkspaceSelection | null,
): boolean {
  if (selection === null) return false;

  if (selection.kind === "client") {
    return facts.allocations.some((allocation) => allocation.clientId === selection.clientId);
  }

  if (selection.kind === "allocation") {
    return facts.allocations.some((allocation) => allocation.allocationId === selection.allocationId);
  }

  if (selection.kind === "local") {
    return facts.localTonnes !== null && SEGMENTS.some((segment) =>
      (selection.segment === null || segment === selection.segment) &&
      (segmentBalance(facts, segment)?.localTonnes ?? 0) > 0,
      );
  }

  return SEGMENTS.some((segment) => {
    const comparison = facts.comparison.segments[segment];
    if (comparison.segment !== selection.segment) return false;
    return comparison.expectedTonnes > 0 || comparison.actualTonnes > 0;
  });
}

function focusCount(
  facts: readonly ProductionFarmFacts[],
  selection: WorkspaceSelection | null,
): number {
  return facts.filter((farmFacts) => isFocusedFarm(farmFacts, selection)).length;
}

function focusLabel(
  facts: readonly ProductionFarmFacts[],
  selection: WorkspaceSelection | null,
): string {
  if (selection === null) return "All farms are visible";
  const count = focusCount(facts, selection);
  if (selection.kind === "segment") return `Segment ${selection.segment} focus · ${count} farms in view`;
  if (selection.kind === "local") {
    return selection.segment === null
      ? `Local residual focus · ${count} farms in view`
      : `Local residual ${selection.segment} focus · ${count} farms in view`;
  }
  if (selection.kind === "allocation") {
    return `${selection.allocationId} allocation focus · ${count} farms in view`;
  }
  return `${selection.clientId} supply focus · ${count} supplying farms in view`;
}

function ActualReceipts({ facts }: { readonly facts: ProductionFarmFacts }) {
  return (
    <ul className={styles.receiptStrip} aria-label={`Actual receipts for ${facts.farm.farmId}`}>
      {SEGMENTS.map((segment) => (
        <li key={segment} className={styles.receiptSegment}>
          <span>{segment}</span>
          <strong>{formatTonnes(facts.comparison.segments[segment].actualTonnes)}</strong>
        </li>
      ))}
    </ul>
  );
}

function ExpectedMix({ facts }: { readonly facts: ProductionFarmFacts }) {
  return (
    <ul className={styles.mixStrip} aria-label={`Expected production mix for ${facts.farm.farmId}`}>
      {SEGMENTS.map((segment) => (
        <li key={segment}>
          <span>{segment}</span>
          <strong>{formatPercent(facts.farm.expectedMix[segment])}</strong>
        </li>
      ))}
    </ul>
  );
}

function ClientAllocations({
  workbook,
  facts,
  onSelect,
}: {
  readonly workbook: WorkbookData;
  readonly facts: ProductionFarmFacts;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  if (facts.allocations.length === 0) {
    return (
      <p className={styles.detailEmpty}>
        {facts.balances === null
          ? "Generate a plan to see the clients served by this farm."
          : "No export allocation from this farm in the current plan."}
      </p>
    );
  }

  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label={`Clients served by ${facts.farm.farmId} table`}
      tabIndex={0}
    >
      <table className={styles.clientTable}>
        <caption className={styles.visuallyHidden}>{`Clients served by ${facts.farm.farmId}`}</caption>
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col">Requested</th>
            <th scope="col">Supply</th>
            <th scope="col">Tonnes</th>
            <th scope="col">Fit</th>
          </tr>
        </thead>
        <tbody>
          {facts.allocations.map((allocation) => (
            <tr key={allocation.allocationId}>
              <th scope="row">
                <button
                  className={styles.clientButton}
                  type="button"
                  onClick={() => onSelect({ kind: "client", clientId: allocation.clientId })}
                >
                  <span>{allocation.clientId}</span>
                  <small>{clientName(workbook, allocation.clientId)}</small>
                </button>
              </th>
              <td>{allocation.requestedSegment}</td>
              <td>{allocation.segment}</td>
              <td>{formatTonnes(allocation.tonnes)}</td>
              <td>
                {allocation.qualityUpgrade.levels === 0
                  ? "Exact"
                  : `${allocation.segment} → ${allocation.requestedSegment}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FarmDetail({
  workbook,
  facts,
  selectedSegmentValue,
  onSelect,
}: {
  readonly workbook: WorkbookData;
  readonly facts: ProductionFarmFacts;
  readonly selectedSegmentValue?: Segment;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  const summaryRef = useRef<HTMLElement | null>(null);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>): void {
    if (!event.currentTarget.open) summaryRef.current?.focus();
  }

  return (
    <details className={styles.farmDetails} onToggle={handleToggle}>
      <summary ref={summaryRef} className={styles.farmSummary}>
        <div className={styles.farmHeading}>
          <span className={styles.farmId}>{facts.farm.farmId}</span>
          <h4>{facts.farm.farmName}</h4>
          <p>
            Planned capacity <strong>{formatTonnes(facts.comparison.expectedCapacityT)}</strong>
            <span aria-hidden="true"> · </span>
            Actual supply <strong>{formatTonnes(facts.comparison.actualTotalTonnes)}</strong>
          </p>
        </div>
        <div className={styles.farmSummaryMetrics}>
          <span className={styles.summaryMetricLabel}>Total variance</span>
          <strong className={varianceClass(facts.comparison.varianceTonnes)}>
            {formatVariance(facts.comparison.varianceTonnes)}
          </strong>
          <span className={styles.summaryMetricLabel}>Local residual</span>
          <strong>
            {facts.localTonnes === null ? "Not calculated yet" : formatTonnes(facts.localTonnes)}
          </strong>
        </div>
        <ActualReceipts facts={facts} />
        <span className={styles.summaryChevron} aria-hidden="true">+</span>
      </summary>

      <div className={styles.detailBody}>
        <div className={styles.planBlock}>
          <div className={styles.detailHeading}>
            <div>
              <p className={styles.detailKicker}>Planned production</p>
              <h5>Expected capacity and quality mix</h5>
            </div>
            <strong>{formatTonnes(facts.comparison.expectedCapacityT)}</strong>
          </div>
          <ExpectedMix facts={facts} />
        </div>

        <div
          className={styles.tableWrap}
          role="region"
          aria-label={`Expected and actual production for ${facts.farm.farmId} table`}
          tabIndex={0}
        >
          <table className={styles.segmentTable}>
            <caption className={styles.visuallyHidden}>{`Expected and actual production for ${facts.farm.farmId}`}</caption>
            <thead>
              <tr>
                <th scope="col">Segment</th>
                <th scope="col">Mix</th>
                <th scope="col" className={styles.plannedHeader}>Expected plan</th>
                <th scope="col" className={styles.actualHeader}>Actual receipts</th>
                <th scope="col">Variance</th>
                <th scope="col">Exported</th>
                <th scope="col">Local</th>
              </tr>
            </thead>
            <tbody>
              {SEGMENTS.map((segment) => {
                const comparison = facts.comparison.segments[segment];
                const balance = segmentBalance(facts, segment);
                const focused = selectedSegmentValue === segment;
                return (
                  <tr
                    id={segmentAnchor(facts.farm.farmId, segment)}
                    key={segment}
                    className={focused ? styles.selectedSegmentRow : undefined}
                  >
                    <th scope="row">
                      <button
                        className={styles.segmentAnchor}
                        type="button"
                        aria-pressed={focused}
                        onClick={() => onSelect({ kind: "segment", segment })}
                      >
                        {segment}
                      </button>
                    </th>
                    <td>{formatPercent(facts.farm.expectedMix[segment])}</td>
                    <td className={styles.plannedCell}>{formatTonnes(comparison.expectedTonnes)}</td>
                    <td className={styles.actualCell}>{formatTonnes(comparison.actualTonnes)}</td>
                    <td className={varianceClass(comparison.varianceTonnes)}>
                      {formatVariance(comparison.varianceTonnes)}
                    </td>
                    <td>{balance === undefined ? "Not calculated yet" : formatTonnes(balance.exportedTonnes)}</td>
                    <td>
                      {balance === undefined ? (
                        "Not calculated yet"
                      ) : balance.localTonnes > 0 ? (
                        <button
                          className={styles.localButton}
                          type="button"
                          onClick={() => onSelect({ kind: "local", farmId: facts.farm.farmId, segment })}
                        >
                          {formatTonnes(balance.localTonnes)}
                        </button>
                      ) : (
                        formatTonnes(balance.localTonnes)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.allocationBlock}>
          <div className={styles.detailHeading}>
            <div>
              <p className={styles.detailKicker}>Downstream allocation</p>
              <h5>Clients served by this farm</h5>
            </div>
            <span className={styles.traceNote}>Actual supply only</span>
          </div>
          <ClientAllocations workbook={workbook} facts={facts} onSelect={onSelect} />
        </div>
      </div>
    </details>
  );
}

function FarmCard({
  workbook,
  facts,
  selection,
  selectedSegmentValue,
  onSelect,
}: {
  readonly workbook: WorkbookData;
  readonly facts: ProductionFarmFacts;
  readonly selection: WorkspaceSelection | null;
  readonly selectedSegmentValue?: Segment;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  const focused = isFocusedFarm(facts, selection);
  return (
    <article
      id={farmAnchor(facts.farm.farmId)}
      className={`${styles.farmCard} ${focused ? styles.focusedFarm : ""}`}
      tabIndex={-1}
    >
      {focused ? <span className={styles.focusBadge}>Focus</span> : null}
      <FarmDetail
        workbook={workbook}
        facts={facts}
        selectedSegmentValue={selectedSegmentValue}
        onSelect={onSelect}
      />
    </article>
  );
}

export default function ProductionView({
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
  const facts = deriveProductionFarmFacts(workbook, plan);
  const selectedSegmentValue = selectedSegment(facts, selection);
  const focusedCount = focusCount(facts, selection);
  const planReady = plan !== undefined;

  useEffect(() => {
    if (selection === null) return;
    const view = document.getElementById("production-view");
    if (!(view instanceof HTMLElement)) return;
    view.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    view.focus({ preventScroll: true });
  }, [selection]);

  return (
    <section
      id="production-view"
      className={styles.productionView}
      aria-labelledby="production-view-title"
      tabIndex={-1}
    >
      <div className={styles.viewHeader}>
        <div>
          <p className={styles.sectionKicker}>Inspect · Production</p>
          <h3 id="production-view-title">Farm production and supply trace</h3>
          <p className={styles.viewLead}>
            Planned production is the expected capacity and mix. Actual receipts are the only supply used by the current export plan.
          </p>
        </div>
        <span className={planReady ? styles.successBadge : styles.badge}>
          {planReady ? "Plan-linked view" : "Comparison only"}
        </span>
      </div>

      <div className={styles.focusBar} role="status" aria-live="polite" aria-atomic="true">
        <div>
          <span className={styles.focusKicker}>Active focus</span>
          <strong>{focusLabel(facts, selection)}</strong>
          <p>
            {selection === null
              ? "Select a segment or exception above to bring the relevant farm evidence forward."
              : "All farms remain listed; focused farms and segment rows are highlighted for inspection."}
          </p>
        </div>
        {selection !== null ? (
          <button className={styles.clearFocusButton} type="button" onClick={onClearSelection}>
            Clear focus
          </button>
        ) : null}
      </div>

      <div className={styles.productionSummary} role="group" aria-label="Production view totals">
        <div>
          <span>Farms in source</span>
          <strong>{facts.length}</strong>
        </div>
        <div>
          <span>Expected plan</span>
          <strong>{formatTonnes(workbook.production.expectedTotalTonnes)}</strong>
        </div>
        <div>
          <span>Actual supply</span>
          <strong>{formatTonnes(workbook.production.actualTotalTonnes)}</strong>
        </div>
        <div>
          <span>Local residual</span>
          <strong>{planReady ? formatTonnes(plan.kpis.localTonnes) : "Not calculated yet"}</strong>
        </div>
      </div>

      {selection !== null && focusedCount === 0 ? (
        <p className={styles.noFocusNote}>
          No farm in this snapshot matches the selected focus. The complete farm list remains available below.
        </p>
      ) : null}

      <div className={styles.farmGrid}>
        {facts.map((farmFacts) => (
          <FarmCard
            key={farmFacts.farm.farmId}
            workbook={workbook}
            facts={farmFacts}
            selection={selection}
            selectedSegmentValue={selectedSegmentValue}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
