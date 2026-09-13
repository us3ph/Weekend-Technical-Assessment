"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import {
  deriveCommercialClientFacts,
  explainClientOutcome,
  isCommercialFocus,
  shortageReasonLabel,
  statusLabel,
  type CommercialClientFacts,
} from "@/lib/commercial";
import type { Allocation, ClientOutcome, PlanningResult, WorkbookData } from "@/lib/types";
import type { WorkspaceSelection } from "@/lib/workspace";
import styles from "./CommercialView.module.css";

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

function formatValue(value: number | null): string {
  return value === null ? "Not calculated yet" : formatTonnes(value);
}

function acceptanceLabel(mode: CommercialClientFacts["client"]["acceptanceMode"]): string {
  return mode === "EXACT" ? "Exact segment only" : "Requested segment or better";
}

function statusClassName(status: ClientOutcome["status"] | null): string {
  if (status === "COMPLETE") return styles.completeStatus ?? "";
  if (status === "PARTIAL") return styles.partialStatus ?? "";
  if (status === "UNSERVED") return styles.unservedStatus ?? "";
  return styles.pendingStatus ?? "";
}

function farmName(workbook: WorkbookData, farmId: string): string {
  return workbook.snapshot.farms.find((farm) => farm.farmId === farmId)?.farmName ?? farmId;
}

function clientFocusLabel(
  facts: readonly CommercialClientFacts[],
  selection: WorkspaceSelection | null,
  workbook: WorkbookData,
): string {
  if (selection === null) return "All clients are visible";
  if (selection.kind === "client") {
    const client = workbook.snapshot.clients.find((candidate) => candidate.clientId === selection.clientId);
    return `${selection.clientId} selected${client === undefined ? "" : ` · ${client.clientName}`}`;
  }
  if (selection.kind === "allocation") {
    const allocation = facts
      .flatMap((clientFacts) => clientFacts.allocations)
      .find((candidate) => candidate.allocationId === selection.allocationId);
    return allocation === undefined
      ? `${selection.allocationId} allocation selected`
      : `${selection.allocationId} · ${allocation.clientId} allocation selected`;
  }
  if (selection.kind === "segment") {
    const count = facts.filter((clientFacts) => isCommercialFocus(clientFacts, selection)).length;
    return `Segment ${selection.segment} compatible demand focus · ${count} clients in view`;
  }
  return "Local residual focus · all client demand remains visible";
}

function FocusBar({
  facts,
  selection,
  workbook,
  onClearSelection,
}: {
  readonly facts: readonly CommercialClientFacts[];
  readonly selection: WorkspaceSelection | null;
  readonly workbook: WorkbookData;
  readonly onClearSelection: () => void;
}) {
  return (
    <div className={styles.focusBar} role="status" aria-live="polite" aria-atomic="true">
      <div>
        <span className={styles.focusKicker}>Active focus</span>
        <strong>{clientFocusLabel(facts, selection, workbook)}</strong>
        <p>
          {selection === null
            ? "Select a client to connect its demand to supplying farms in Production."
            : selection.kind === "client"
              ? "The selected client stays open below; its supplying farms are highlighted in Production."
              : selection.kind === "allocation"
                ? "The selected allocation is highlighted in this client and the connected farm and trace views."
              : "All clients remain listed; compatible demand is highlighted for the selected segment."}
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
  onSelect,
}: {
  readonly allocations: readonly Allocation[];
  readonly workbook: WorkbookData;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  if (allocations.length === 0) {
    return (
      <p className={styles.detailEmpty}>
        No farm-segment allocation was made to this client in the current plan.
      </p>
    );
  }

  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="Supplying farm-segment allocations table"
      tabIndex={0}
    >
      <table className={styles.allocationTable}>
        <caption className={styles.visuallyHidden}>Supplying farm-segment allocations</caption>
        <thead>
          <tr>
            <th scope="col">Farm</th>
            <th scope="col">Received</th>
            <th scope="col">Requested</th>
            <th scope="col">Tonnes</th>
            <th scope="col">Quality fit</th>
            <th scope="col">Client price</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => (
            <tr key={allocation.allocationId}>
              <th scope="row">
                <button
                  className={styles.farmLink}
                  type="button"
                  onClick={() => onSelect({ kind: "allocation", allocationId: allocation.allocationId })}
                >
                  <span>{allocation.farmId}</span>
                  <small>{farmName(workbook, allocation.farmId)}</small>
                </button>
              </th>
              <td>{allocation.segment}</td>
              <td>{allocation.requestedSegment}</td>
              <td>{formatTonnes(allocation.tonnes)}</td>
              <td>
                {allocation.qualityUpgrade.levels === 0
                  ? "Exact fit"
                  : `${allocation.qualityUpgrade.fromSegment} → ${allocation.qualityUpgrade.toSegment} upgrade`}
              </td>
              <td>{formatCurrency(allocation.exportPricePerTonneEur)}</td>
              <td>{formatCurrency(allocation.exportRevenueEur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Evidence({
  facts,
  clientNames,
  onSelect,
}: {
  readonly facts: CommercialClientFacts;
  readonly clientNames: ReadonlyMap<string, string>;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  if (facts.evidence === null || facts.outcome === null) {
    return (
      <div className={styles.notReadyDetail}>
        Generate a plan to calculate actual compatible supply, processing-point capacity, and allocation evidence.
      </div>
    );
  }

  const { evidence, outcome } = facts;
  const higherPriorityText = evidence.higherPriorityAllocatedTonnes > 0
    ? `${formatTonnes(evidence.higherPriorityAllocatedTonnes)} of compatible supply was already allocated to higher-priced client(s): ${evidence.higherPriorityClientIds.map((id) => `${id} · ${clientNames.get(id) ?? id}`).join(", ")}.`
    : "No higher-priced allocation used compatible supply before this client.";

  return (
    <div className={styles.evidenceBlock}>
      <div className={styles.evidenceGrid} aria-label="Calculated processing evidence">
        <div>
          <span>Actual compatible supply</span>
          <strong>{formatTonnes(evidence.actualCompatibleTonnes)}</strong>
          <small>{evidence.compatibleSegments.join("/")} receipts across all farms</small>
        </div>
        <div>
          <span>Available at processing</span>
          <strong>{formatTonnes(evidence.compatibleAvailableAtProcessingTonnes)}</strong>
          <small>After higher-priced compatible allocations</small>
        </div>
        <div>
          <span>Station room at processing</span>
          <strong>{formatTonnes(evidence.stationCapacityAvailableAtProcessingTonnes)}</strong>
          <small>
            {formatTonnes(evidence.stationUsedBeforeTonnes)} used before · {formatTonnes(evidence.stationUsedAfterTonnes)} after
          </small>
        </div>
      </div>
      <p className={styles.evidenceText}>{higherPriorityText}</p>
      <p className={styles.reasonText}>
        <strong>{shortageReasonLabel(outcome.shortageReason)}:</strong>{" "}
        {explainClientOutcome(facts, clientNames)}
      </p>
      <button
        className={styles.productionLink}
        type="button"
        onClick={() => onSelect({ kind: "segment", segment: facts.client.requestedSegment })}
      >
        Review {facts.client.requestedSegment} production comparison
      </button>
    </div>
  );
}

function ClientCard({
  facts,
  workbook,
  selection,
  clientNames,
  onSelect,
}: {
  readonly facts: CommercialClientFacts;
  readonly workbook: WorkbookData;
  readonly selection: WorkspaceSelection | null;
  readonly clientNames: ReadonlyMap<string, string>;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  const selected =
    (selection?.kind === "client" && selection.clientId === facts.client.clientId) ||
    (selection?.kind === "allocation" && facts.allocations.some((allocation) => allocation.allocationId === selection.allocationId));
  const focused = isCommercialFocus(facts, selection);
  const [expanded, setExpanded] = useState(selected);
  const summaryRef = useRef<HTMLElement | null>(null);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>): void {
    setExpanded(event.currentTarget.open);
    if (!event.currentTarget.open) summaryRef.current?.focus();
  }

  const outcome = facts.outcome;
  const risk = outcome !== null && outcome.status !== "COMPLETE";
  const summaryClass = `${styles.clientCard} ${risk ? styles.riskCard : ""} ${focused ? styles.focusedCard : ""}`;

  return (
    <article id={`client-${facts.client.clientId}`} className={summaryClass}>
      {focused ? <span className={styles.focusBadge}>Focus</span> : null}
      <details className={styles.clientDetails} open={expanded || selected} onToggle={handleToggle}>
        <summary ref={summaryRef} className={styles.clientSummary}>
          <div className={styles.clientIdentity}>
            <span className={styles.clientId}>{facts.client.clientId}</span>
            <h4>{facts.client.clientName}</h4>
          </div>
          <div className={styles.summaryField}>
            <span>Acceptance rule</span>
            <strong>{facts.client.acceptanceMode}</strong>
            <small>{acceptanceLabel(facts.client.acceptanceMode)}</small>
          </div>
          <div className={styles.summaryField}>
            <span>Requested</span>
            <strong>Segment {facts.client.requestedSegment}</strong>
          </div>
          <div className={styles.summaryField}>
            <span>Demand</span>
            <strong>{formatTonnes(facts.client.demandT)}</strong>
          </div>
          <div className={styles.summaryField}>
            <span>Allocated</span>
            <strong>{formatValue(outcome?.allocatedTonnes ?? null)}</strong>
          </div>
          <div className={styles.summaryField}>
            <span>Remaining</span>
            <strong>{formatValue(outcome?.remainingTonnes ?? null)}</strong>
          </div>
          <div className={styles.summaryField}>
            <span>Export revenue</span>
            <strong>{outcome === null ? "Not calculated yet" : formatCurrency(outcome.exportRevenueEur)}</strong>
          </div>
          <div className={`${styles.statusField} ${statusClassName(outcome?.status ?? null)}`}>
            <span>Status</span>
            <strong>{statusLabel(outcome?.status ?? null)}</strong>
          </div>
          <span className={styles.summaryChevron} aria-hidden="true">+</span>
          <div className={`${styles.reasonSummary} ${risk ? styles.riskReason : ""}`}>
            <span>Shortage reason</span>
            <strong>{shortageReasonLabel(outcome?.shortageReason ?? null)}</strong>
          </div>
        </summary>

        <div className={styles.detailBody}>
          <div className={styles.detailHeading}>
            <div>
              <p className={styles.detailKicker}>Allocation drill-down</p>
              <h5>Farm-segment supply serving {facts.client.clientId}</h5>
              <p className={styles.detailLead}>
                Export revenue below uses this client&apos;s price, including any higher-quality upgrades.
              </p>
            </div>
            <button
              className={styles.focusClientButton}
              type="button"
              onClick={() => onSelect({ kind: "client", clientId: facts.client.clientId })}
            >
              Focus client
            </button>
          </div>

          <AllocationTable allocations={facts.allocations} workbook={workbook} onSelect={onSelect} />
          <Evidence facts={facts} clientNames={clientNames} onSelect={onSelect} />
        </div>
      </details>
    </article>
  );
}

function ClientGroup({
  title,
  note,
  facts,
  workbook,
  selection,
  clientNames,
  onSelect,
}: {
  readonly title: string;
  readonly note: string;
  readonly facts: readonly CommercialClientFacts[];
  readonly workbook: WorkbookData;
  readonly selection: WorkspaceSelection | null;
  readonly clientNames: ReadonlyMap<string, string>;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  if (facts.length === 0) return null;

  return (
    <section className={styles.clientGroup} aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>
      <div className={styles.groupHeading}>
        <div>
          <p className={styles.sectionKicker}>Inspect clients</p>
          <h4 id={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>{title}</h4>
        </div>
        <p>{note}</p>
      </div>
      <div className={styles.clientGrid}>
        {facts.map((clientFacts) => (
          <ClientCard
            key={clientFacts.client.clientId}
            facts={clientFacts}
            workbook={workbook}
            selection={selection}
            clientNames={clientNames}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

export default function CommercialView({
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
  const facts = deriveCommercialClientFacts(workbook, plan);
  const clientNames = useMemo(
    () => new Map(workbook.snapshot.clients.map((client) => [client.clientId, client.clientName])),
    [workbook.snapshot.clients],
  );
  const atRisk = facts.filter((clientFacts) => clientFacts.outcome?.status !== "COMPLETE");
  const complete = facts.filter((clientFacts) => clientFacts.outcome?.status === "COMPLETE");
  const planReady = plan !== undefined;

  useEffect(() => {
    if (selection?.kind !== "client") return;
    const view = document.getElementById("commercial-view");
    if (!(view instanceof HTMLElement)) return;
    view.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    view.focus({ preventScroll: true });
  }, [selection]);

  return (
    <section
      id="commercial-view"
      className={styles.commercialView}
      aria-labelledby="commercial-view-title"
      tabIndex={-1}
    >
      <div className={styles.viewHeader}>
        <div>
          <p className={styles.sectionKicker}>Inspect · Commercial</p>
          <h3 id="commercial-view-title">Client demand and allocation risk</h3>
          <p className={styles.viewLead}>
            Review every order against its acceptance rule, then open a client to see the actual farm-segment supply and the reason any demand remains unmet.
          </p>
        </div>
        <span className={planReady ? styles.successBadge : styles.badge}>
          {planReady ? "Plan-linked view" : "Comparison only"}
        </span>
      </div>

      <FocusBar
        facts={facts}
        selection={selection}
        workbook={workbook}
        onClearSelection={onClearSelection}
      />

      <div className={styles.commercialSummary} role="group" aria-label="Commercial view totals">
        <div>
          <span>Clients in source</span>
          <strong>{facts.length}</strong>
        </div>
        <div>
          <span>At risk</span>
          <strong>{planReady ? atRisk.length : "Not calculated yet"}</strong>
        </div>
        <div>
          <span>Complete</span>
          <strong>{planReady ? complete.length : "Not calculated yet"}</strong>
        </div>
        <div>
          <span>Export revenue</span>
          <strong>{planReady ? formatCurrency(plan.kpis.exportRevenueEur) : "Not calculated yet"}</strong>
        </div>
      </div>

      <ClientGroup
        title={planReady ? "At-risk clients" : "Client requests"}
        note={planReady ? `${atRisk.length} partial or unserved order${atRisk.length === 1 ? "" : "s"} need review.` : "Allocation and risk fields remain pending until the server generates a plan."}
        facts={planReady ? atRisk : facts}
        workbook={workbook}
        selection={selection}
        clientNames={clientNames}
        onSelect={onSelect}
      />
      {planReady ? (
        <ClientGroup
          title="Complete clients"
          note={`${complete.length} order${complete.length === 1 ? "" : "s"} fully covered; expand any row to inspect its supply trace.`}
          facts={complete}
          workbook={workbook}
          selection={selection}
          clientNames={clientNames}
          onSelect={onSelect}
        />
      ) : null}

      <p className={styles.viewNote}>
        Status and shortage reason are fixed by the server at each client&apos;s processing point. Shared segment supply is evidence of constraint, not proof of a farm-to-client obligation.
      </p>
    </section>
  );
}
