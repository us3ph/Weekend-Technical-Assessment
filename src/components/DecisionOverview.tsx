import type { ReactNode } from "react";
import { deriveDecisionOverviewFacts } from "@/lib/overview";
import type {
  ClientOutcome,
  PlanningResult,
  ProductionComparison,
  Segment,
  SegmentComparison,
  WorkbookData,
} from "@/lib/types";
import type { WorkspaceSelection } from "@/lib/workspace";
import styles from "./PlanningWorkspace.module.css";

const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const euroFormatter = new Intl.NumberFormat("en-GB", {
  currency: "EUR",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
  style: "currency",
});
const percentFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
  style: "percent",
});

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

function formatCurrency(value: number): string {
  return euroFormatter.format(value);
}

function formatPercent(value: number | null): string {
  return value === null ? "N/A" : percentFormatter.format(value);
}

function formatVariance(value: number): string {
  return `${value > 0 ? "+" : ""}${tonnesFormatter.format(value)} t`;
}

function varianceClass(value: number): string {
  if (value < 0) return styles.negativeVariance ?? "";
  if (value > 0) return styles.positiveVariance ?? "";
  return styles.neutralVariance ?? "";
}

function clientName(workbook: WorkbookData, clientId: string): string {
  return workbook.snapshot.clients.find((client) => client.clientId === clientId)?.clientName ?? clientId;
}

function selectionLabel(workbook: WorkbookData, selection: WorkspaceSelection): string {
  switch (selection.kind) {
    case "segment":
      return `Segment ${selection.segment}`;
    case "client":
      return `${selection.clientId} · ${clientName(workbook, selection.clientId)}`;
    case "local":
      return selection.segment === null
        ? "Local residuals"
        : `Local residual · segment ${selection.segment}`;
  }
}

function MetricCard({
  label,
  value,
  detail,
  valueClassName,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail: ReactNode;
  readonly valueClassName?: string;
}) {
  return (
    <article className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={`${styles.metricValue} ${valueClassName ?? ""}`}>{value}</p>
      <p className={styles.metricDetail}>{detail}</p>
    </article>
  );
}

function SelectionBanner({
  workbook,
  selection,
  onClear,
}: {
  readonly workbook: WorkbookData;
  readonly selection: WorkspaceSelection;
  readonly onClear: () => void;
}) {
  return (
    <div className={styles.selectionBanner} role="status">
      <p>
        <span className={styles.selectionKicker}>Next inspection</span>
        <strong>{selectionLabel(workbook, selection)}</strong>
      </p>
      <button className={styles.inlineButton} type="button" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}

function ComparisonTable({
  production,
  selectedSegment,
  onSelectSegment,
}: {
  readonly production: ProductionComparison;
  readonly selectedSegment?: Segment;
  readonly onSelectSegment: (segment: Segment) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.comparisonTable}>
        <caption className={styles.visuallyHidden}>Expected and actual tonnes by segment</caption>
        <thead>
          <tr>
            <th scope="col">Segment</th>
            <th scope="col">Expected</th>
            <th scope="col">Actual receipts</th>
            <th scope="col">Variance</th>
          </tr>
        </thead>
        <tbody>
          {production.segments.map((comparison) => {
            const selected = selectedSegment === comparison.segment;
            return (
              <tr key={comparison.segment} className={selected ? styles.selectedRow : undefined}>
                <th scope="row">
                  <button
                    className={styles.segmentButton}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectSegment(comparison.segment)}
                  >
                    {comparison.segment}
                  </button>
                </th>
                <td>{formatTonnes(comparison.expectedTonnes)}</td>
                <td>{formatTonnes(comparison.actualTonnes)}</td>
                <td className={varianceClass(comparison.varianceTonnes)}>
                  {formatVariance(comparison.varianceTonnes)}
                </td>
              </tr>
            );
          })}
            <tr className={styles.totalRow}>
              <th scope="row">Total</th>
            <td>{formatTonnes(production.expectedTotalTonnes)}</td>
            <td>{formatTonnes(production.actualTotalTonnes)}</td>
            <td className={varianceClass(production.varianceTonnes)}>
              {formatVariance(production.varianceTonnes)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SegmentExceptions({
  comparisons,
  onSelect,
}: {
  readonly comparisons: readonly SegmentComparison[];
  readonly onSelect: (segment: Segment) => void;
}) {
  const gaps = [...comparisons]
    .filter((comparison) => comparison.varianceTonnes < 0)
    .sort((left, right) => left.varianceTonnes - right.varianceTonnes);

  return (
    <article className={styles.exceptionCard}>
      <p className={styles.exceptionLabel}>Production gaps</p>
      <h4>{gaps.length === 0 ? "No segment below expected" : `${gaps.length} segment gaps`}</h4>
      {gaps.length === 0 ? (
        <p className={styles.exceptionText}>Expected and actual receipts are aligned across segments.</p>
      ) : (
        <ul className={styles.exceptionList}>
          {gaps.map((comparison) => (
            <li key={comparison.segment}>
              <button className={styles.exceptionButton} type="button" onClick={() => onSelect(comparison.segment)}>
                <span>Segment {comparison.segment}</span>
                <strong>{formatVariance(comparison.varianceTonnes)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.exceptionFootnote}>Select a gap to carry it into the next detail view.</p>
    </article>
  );
}

function RiskExceptions({
  workbook,
  outcomes,
  onSelect,
}: {
  readonly workbook: WorkbookData;
  readonly outcomes: readonly ClientOutcome[] | null;
  readonly onSelect: (clientId: string) => void;
}) {
  if (outcomes === null) {
    return (
      <article className={styles.exceptionCard}>
        <p className={styles.exceptionLabel}>Client risk</p>
        <h4>Not calculated yet</h4>
        <p className={styles.exceptionText}>Generate a plan to calculate remaining demand and shortage reasons.</p>
      </article>
    );
  }

  const atRisk = outcomes.filter((outcome) => outcome.status !== "COMPLETE");
  return (
    <article className={styles.exceptionCard}>
      <p className={styles.exceptionLabel}>Client risk</p>
      <h4>{atRisk.length === 0 ? "No client risk" : `${atRisk.length} clients at risk`}</h4>
      {atRisk.length === 0 ? (
        <p className={styles.exceptionText}>Every client&apos;s demand is covered by the prepared plan.</p>
      ) : (
        <ul className={styles.exceptionList}>
          {atRisk.map((outcome) => (
            <li key={outcome.clientId}>
              <button className={styles.exceptionButton} type="button" onClick={() => onSelect(outcome.clientId)}>
                <span>
                  {outcome.clientId} · {clientName(workbook, outcome.clientId)}
                </span>
                <strong>{formatTonnes(outcome.remainingTonnes)} remaining</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.exceptionFootnote}>Selection will open the commercial inspection point next.</p>
    </article>
  );
}

function LocalExceptions({
  plan,
  onSelect,
}: {
  readonly plan?: PlanningResult;
  readonly onSelect: () => void;
}) {
  if (plan === undefined) {
    return (
      <article className={styles.exceptionCard}>
        <p className={styles.exceptionLabel}>Local impact</p>
        <h4>Not calculated yet</h4>
        <p className={styles.exceptionText}>Generate a plan to value tonnes that remain after export allocation.</p>
      </article>
    );
  }

  const { localTonnes, localValueEur } = plan.kpis;
  return (
    <article className={styles.exceptionCard}>
      <p className={styles.exceptionLabel}>Local impact</p>
      <h4>{formatTonnes(localTonnes)} remaining local</h4>
      <p className={styles.exceptionText}>
        Estimated local value: <strong>{formatCurrency(localValueEur)}</strong>.
      </p>
      {localTonnes > 0 ? (
        <button className={styles.exceptionButton} type="button" onClick={onSelect}>
          <span>Inspect residual composition</span>
          <strong>{formatCurrency(localValueEur)}</strong>
        </button>
      ) : (
        <p className={styles.zeroState}>Zero tonnes remain for the local market in this plan.</p>
      )}
      <p className={styles.exceptionFootnote}>Value uses each residual segment&apos;s source reference price and local ratio.</p>
    </article>
  );
}

export default function DecisionOverview({
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
  const facts = deriveDecisionOverviewFacts(workbook, plan);
  const { kpis } = facts;
  const hasPlan = kpis !== null;
  const selectedSegment = selection?.kind === "segment" ? selection.segment : undefined;
  const localSegments = plan === undefined
    ? []
    : [...new Set(plan.localResiduals.map((residual) => residual.segment))];

  return (
    <div className={styles.decisionStack}>
      <section className={`${styles.card} ${styles.overviewCard}`} aria-labelledby="decision-overview-title">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.sectionKicker}>Decide</p>
            <h3 id="decision-overview-title">Decision overview</h3>
            <p className={styles.overviewLead}>
              {hasPlan
                ? "The current server-calculated plan is ready for Production and Commercial review."
                : "Start with the production situation; allocation, risk, and value appear after plan generation."}
            </p>
          </div>
          <span className={hasPlan ? styles.successBadge : styles.badge}>
            {hasPlan ? "Plan calculated" : "Comparison only"}
          </span>
        </div>

        <div className={styles.metricGrid}>
          <article className={`${styles.metricCard} ${styles.productionMetric}`}>
            <p className={styles.metricLabel}>Production tonnes</p>
            <div className={styles.metricPair}>
              <div>
                <span>Expected</span>
                <strong>{formatTonnes(facts.production.expectedTotalTonnes)}</strong>
              </div>
              <div>
                <span>Actual receipts</span>
                <strong>{formatTonnes(facts.production.actualTotalTonnes)}</strong>
              </div>
            </div>
            <p className={`${styles.metricDetail} ${varianceClass(facts.production.varianceTonnes)}`}>
              {formatVariance(facts.production.varianceTonnes)} versus expected
            </p>
          </article>

          <MetricCard
            label="Export station"
            value={hasPlan ? `${formatTonnes(kpis.exportedTonnes)} / ${formatTonnes(kpis.stationCapacityT)}` : "Not calculated yet"}
            valueClassName={hasPlan ? undefined : styles.notCalculated}
            detail={hasPlan
              ? kpis.stationUtilization === null
                ? "N/A — station capacity is zero"
                : `${formatPercent(kpis.stationUtilization)} utilized · usage / capacity`
              : `Usage / ${formatTonnes(facts.stationCapacityT)} capacity`}
          />
          <MetricCard
            label="Export rate"
            value={hasPlan ? formatPercent(kpis.exportRate) : "Not calculated yet"}
            valueClassName={hasPlan && kpis.exportRate === null ? styles.naValue : hasPlan ? undefined : styles.notCalculated}
            detail={hasPlan && kpis.exportRate === null ? "No actual receipts denominator" : "Exported tonnes / actual receipts"}
          />
          <MetricCard
            label="Local tonnes / value"
            value={hasPlan ? `${formatTonnes(kpis.localTonnes)} · ${formatCurrency(kpis.localValueEur)}` : "Not calculated yet"}
            valueClassName={hasPlan ? undefined : styles.notCalculated}
            detail={hasPlan ? "Residual after export allocation" : "Requires a generated plan"}
          />
          <MetricCard
            label="Export revenue"
            value={hasPlan ? formatCurrency(kpis.exportRevenueEur) : "Not calculated yet"}
            valueClassName={hasPlan ? undefined : styles.notCalculated}
            detail={hasPlan ? "Served-client prices" : "Requires a generated plan"}
          />
          <MetricCard
            label="Total value"
            value={hasPlan ? formatCurrency(kpis.totalValueEur) : "Not calculated yet"}
            valueClassName={hasPlan ? undefined : styles.notCalculated}
            detail={hasPlan ? "Export revenue + local value" : "Requires a generated plan"}
          />
          <MetricCard
            label="At-risk clients"
            value={hasPlan ? String(kpis.atRiskCount) : "Not calculated yet"}
            valueClassName={hasPlan ? undefined : styles.notCalculated}
            detail={hasPlan ? "Partial or unserved demand" : "Requires a generated plan"}
          />
        </div>

        {selection ? (
          <SelectionBanner workbook={workbook} selection={selection} onClear={onClearSelection} />
        ) : null}
      </section>

      <section className={styles.card} aria-labelledby="segment-comparison-title">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.sectionKicker}>Production signal</p>
            <h3 id="segment-comparison-title">Expected versus actual by segment</h3>
          </div>
          <p className={styles.comparisonNote}>Actual receipts are the planning supply.</p>
        </div>
        <ComparisonTable
          production={facts.production}
          selectedSegment={selectedSegment}
          onSelectSegment={(segment) => onSelect({ kind: "segment", segment })}
        />
      </section>

      <section className={styles.exceptionSection} aria-labelledby="exception-summary-title">
        <div className={styles.exceptionHeading}>
          <div>
            <p className={styles.sectionKicker}>Inspect next</p>
            <h3 id="exception-summary-title">Exceptions and business impact</h3>
          </div>
          <p className={styles.comparisonNote}>
            {hasPlan ? "Selections are ready for the detail views." : "Plan-dependent exceptions remain pending."}
          </p>
        </div>
        <div className={styles.exceptionGrid}>
          <SegmentExceptions
            comparisons={facts.production.segments}
            onSelect={(segment) => onSelect({ kind: "segment", segment })}
          />
          <RiskExceptions
            workbook={workbook}
            outcomes={plan?.clientOutcomes ?? null}
            onSelect={(clientId) => onSelect({ kind: "client", clientId })}
          />
          <LocalExceptions
            plan={plan}
            onSelect={() => onSelect({ kind: "local", segment: localSegments.length === 1 ? localSegments[0] ?? null : null })}
          />
        </div>
      </section>

      <p className={styles.recommendationNote}>
        {hasPlan
          ? "This is a recommendation for Production and Commercial review. The workspace does not approve or execute it."
          : "No financial or allocation result is shown as zero before the server calculates a plan."}
      </p>
    </div>
  );
}
