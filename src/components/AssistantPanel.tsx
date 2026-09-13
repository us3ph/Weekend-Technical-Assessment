"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { GroundedAnswer } from "@/lib/assistant";
import { SEGMENTS, type InputVersion, type PlanningResult, type Segment, type WorkbookData } from "@/lib/types";
import type { EvidenceReference } from "@/lib/evidence";
import type { WorkspaceSelection } from "@/lib/workspace";
import styles from "./AssistantPanel.module.css";

const tonnesFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const allowedAnswerLabels = new Set([
  "Deterministic summary — no model used",
  "OpenRouter free model — server-rendered evidence",
]);
const supportedIntents = new Set(["risk", "production-gap", "local-residual"]);
const providerStatuses = new Set(["success", "unavailable", "error", "not-requested"]);
const invalidOutputCodes = new Set([
  "EMPTY_OUTPUT",
  "INVALID_JSON",
  "INVALID_PROVIDER_RESPONSE",
  "INVALID_SELECTION",
  "NON_FREE_MODEL_RETURNED",
  "REFUSED_OUTPUT",
  "RESPONSE_TOO_LARGE",
  "TRUNCATED_OUTPUT",
]);

type JsonRecord = Record<string, unknown>;

interface ProviderDiagnostic {
  readonly provider: "openrouter";
  readonly status: "success" | "unavailable" | "error" | "not-requested";
  readonly requestedModel: string;
  readonly returnedModel?: string;
  readonly code?: string;
  readonly message?: string;
  readonly retryAfterSeconds?: number;
}

interface AssistantResponse {
  readonly answer: GroundedAnswer;
  readonly provider: ProviderDiagnostic;
}

type PanelStatus = "idle" | "loading" | "result" | "error";

interface PanelError {
  readonly kind: "stale" | "request" | "invalid-output";
  readonly title: string;
  readonly message: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInputVersion(value: unknown): value is InputVersion {
  return (
    isRecord(value) &&
    value.algorithm === "sha256" &&
    typeof value.value === "string" &&
    /^[a-f0-9]{64}$/u.test(value.value)
  );
}

function isReference(value: unknown): value is EvidenceReference {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    ["farm", "client", "segment", "allocation", "residual"].includes(value.kind) &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function isKnownReference(
  reference: EvidenceReference,
  workbook: WorkbookData,
  plan: PlanningResult,
): boolean {
  switch (reference.kind) {
    case "farm":
      return workbook.snapshot.farms.some((farm) => farm.farmId === reference.id);
    case "client":
      return workbook.snapshot.clients.some((client) => client.clientId === reference.id);
    case "segment":
      return SEGMENTS.some((segment) => segment === reference.id);
    case "allocation":
      return plan.allocations.some((allocation) => allocation.allocationId === reference.id);
    case "residual":
      return plan.localResiduals.some((residual) => residual.residualId === reference.id);
  }
}

function isGroundedAnswer(
  value: unknown,
  inputVersion: InputVersion,
  workbook: WorkbookData,
  plan: PlanningResult,
): value is GroundedAnswer {
  if (!isRecord(value) || !isInputVersion(value.inputVersion)) return false;
  if (value.inputVersion.value !== inputVersion.value) return false;
  if (value.source !== "deterministic" && value.source !== "openrouter") return false;
  if (typeof value.sourceLabel !== "string" || !allowedAnswerLabels.has(value.sourceLabel)) return false;
  if (typeof value.title !== "string" || value.title.trim().length === 0) return false;
  if (!Array.isArray(value.paragraphs) || !value.paragraphs.every((paragraph) => typeof paragraph === "string")) {
    return false;
  }
  if (!Array.isArray(value.factIds) || !value.factIds.every((factId) => typeof factId === "string" && factId.length > 0)) {
    return false;
  }
  if (!Array.isArray(value.citations) || !value.citations.every(isReference)) return false;
  if (!value.citations.every((reference) => isKnownReference(reference, workbook, plan))) return false;
  if (value.intent !== "unsupported" && (typeof value.intent !== "string" || !supportedIntents.has(value.intent))) return false;
  if (value.source === "deterministic" && value.sourceLabel !== "Deterministic summary — no model used") return false;
  if (value.source === "openrouter" && value.sourceLabel !== "OpenRouter free model — server-rendered evidence") return false;
  return value.model === undefined || typeof value.model === "string";
}

function isProviderDiagnostic(value: unknown): value is ProviderDiagnostic {
  return (
    isRecord(value) &&
    value.provider === "openrouter" &&
    typeof value.status === "string" &&
    providerStatuses.has(value.status) &&
    typeof value.requestedModel === "string" &&
    (value.returnedModel === undefined || typeof value.returnedModel === "string") &&
    (value.code === undefined || typeof value.code === "string") &&
    (value.message === undefined || typeof value.message === "string") &&
    (value.retryAfterSeconds === undefined || (typeof value.retryAfterSeconds === "number" && value.retryAfterSeconds > 0))
  );
}

function isAssistantResponse(
  value: unknown,
  inputVersion: InputVersion,
  workbook: WorkbookData,
  plan: PlanningResult,
): value is AssistantResponse {
  return (
    isRecord(value) &&
    isGroundedAnswer(value.answer, inputVersion, workbook, plan) &&
    isProviderDiagnostic(value.provider)
  );
}

function formatTonnes(value: number): string {
  return `${tonnesFormatter.format(value)} t`;
}

function formatCooldown(seconds: number): string {
  return `${seconds}s`;
}

function deadlineAfter(seconds: number): number {
  return Date.now() + seconds * 1000;
}

function clientName(workbook: WorkbookData, clientId: string): string {
  return workbook.snapshot.clients.find((client) => client.clientId === clientId)?.clientName ?? clientId;
}

function farmName(workbook: WorkbookData, farmId: string): string {
  return workbook.snapshot.farms.find((farm) => farm.farmId === farmId)?.farmName ?? farmId;
}

function citationLabel(workbook: WorkbookData, plan: PlanningResult, reference: EvidenceReference): string {
  switch (reference.kind) {
    case "farm":
      return `${reference.id} · ${farmName(workbook, reference.id)}`;
    case "client":
      return `${reference.id} · ${clientName(workbook, reference.id)}`;
    case "segment":
      return `Segment ${reference.id}`;
    case "allocation": {
      const allocation = plan.allocations.find((candidate) => candidate.allocationId === reference.id);
      return allocation === undefined
        ? `${reference.id} · allocation trace`
        : `${reference.id} · ${allocation.farmId} → ${allocation.clientId}`;
    }
    case "residual": {
      const residual = plan.localResiduals.find((candidate) => candidate.residualId === reference.id);
      return residual === undefined
        ? `${reference.id} · local residual`
        : `${reference.id} · ${residual.farmId} / ${residual.segment}`;
    }
  }
}

function inputVersionMatches(left: InputVersion, right: InputVersion): boolean {
  return left.algorithm === right.algorithm && left.value === right.value;
}

function responseErrorText(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" && value.error.trim().length > 0
    ? value.error
    : fallback;
}

function honestRequestFailure(value: unknown, fallback: string): string {
  const message = responseErrorText(value, fallback);
  return message.includes("No model answer was used")
    ? message
    : `${message} No model answer was used.`;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function diagnosticNotice(
  answer: GroundedAnswer,
  provider: ProviderDiagnostic,
): { readonly title: string; readonly message: string; readonly tone: "info" | "warning" } | null {
  if (provider.code === "UNSUPPORTED_QUESTION" || answer.intent === "unsupported") {
    return {
      title: "Question outside this snapshot",
      message: provider.message ?? "Ask about client risk, production gaps, or local residual/value.",
      tone: "warning",
    };
  }
  if (answer.source === "openrouter" && provider.status === "success") return null;
  return {
    title: provider.status === "unavailable"
      ? "AI unavailable"
      : invalidOutputCodes.has(provider.code ?? "")
        ? "Invalid model output"
        : "Model answer not used",
    message: provider.message ?? "The model answer was not used. The deterministic summary below is server-rendered.",
    tone: "info",
  };
}

function providerRetrySeconds(provider: ProviderDiagnostic): number {
  return provider.code === "RATE_LIMITED" && provider.retryAfterSeconds !== undefined
    ? Math.ceil(provider.retryAfterSeconds)
    : 0;
}

function citationTarget(
  reference: EvidenceReference,
  onSelect: (selection: WorkspaceSelection) => void,
  plan: PlanningResult,
): ReactNode {
  const label = reference.kind === "segment" ? `Open ${labelForSegment(reference.id)}` : reference.id;
  if (reference.kind === "farm") {
    return <a href={`#farm-${reference.id}`}>{label}</a>;
  }
  if (reference.kind === "client") {
    return (
      <button type="button" onClick={() => onSelect({ kind: "client", clientId: reference.id })}>
        {label}
      </button>
    );
  }
  if (reference.kind === "segment") {
    return (
      <button type="button" onClick={() => onSelect({ kind: "segment", segment: reference.id as Segment })}>
        {label}
      </button>
    );
  }
  if (reference.kind === "allocation") {
    return (
      <button type="button" onClick={() => onSelect({ kind: "allocation", allocationId: reference.id })}>
        {label}
      </button>
    );
  }
  const residual = plan.localResiduals.find((candidate) => candidate.residualId === reference.id);
  return residual === undefined ? (
    <span>{label}</span>
  ) : (
    <button
      type="button"
      onClick={() => onSelect({
        kind: "local",
        farmId: residual.farmId,
        residualId: residual.residualId,
        segment: residual.segment,
      })}
    >
      {label}
    </button>
  );
}

function labelForSegment(value: string): string {
  return `Segment ${value}`;
}

function AnswerCitations({
  answer,
  workbook,
  plan,
  onSelect,
}: {
  readonly answer: GroundedAnswer;
  readonly workbook: WorkbookData;
  readonly plan: PlanningResult;
  readonly onSelect: (selection: WorkspaceSelection) => void;
}) {
  if (answer.citations.length === 0) return null;
  return (
    <div className={styles.citations}>
      <p className={styles.subheading}>Evidence links</p>
      <ul>
        {answer.citations.map((reference) => (
          <li key={`${reference.kind}:${reference.id}`}>
            {citationTarget(reference, onSelect, plan)}
            <span className={styles.citationDescription}>
              {citationLabel(workbook, plan, reference)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AssistantPanel({
  workbook,
  plan,
  onSelect,
  onReload,
}: {
  readonly workbook: WorkbookData;
  readonly plan?: PlanningResult;
  readonly onSelect: (selection: WorkspaceSelection) => void;
  readonly onReload: () => void;
}) {
  const planReady = plan !== undefined && inputVersionMatches(plan.inputVersion, workbook.snapshot.version);
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [provider, setProvider] = useState<ProviderDiagnostic | null>(null);
  const [panelError, setPanelError] = useState<PanelError | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const requestSequence = useRef(0);
  const inFlight = useRef(false);
  const activeController = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => activeController.current?.abort();
  }, []);

  useEffect(() => {
    if (cooldownUntil === 0) return;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining === 0) setCooldownUntil(0);
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  const suggestions = [
    "Which clients are at risk and why?",
    "Which farm/segment gaps matter most today?",
    planReady && plan !== undefined
      ? `Why are ${formatTonnes(plan.kpis.localTonnes)} going local, and what is its estimated value?`
      : "Why is the current residual going local, and what is its estimated value?",
  ];
  const isLoading = status === "loading";
  const canAsk = planReady && !isLoading && cooldownRemaining === 0 && question.trim().length > 0;

  async function ask(rawQuestion: string): Promise<void> {
    const normalizedQuestion = rawQuestion.trim();
    if (!planReady || plan === undefined || normalizedQuestion.length === 0 || inFlight.current || cooldownRemaining > 0) return;
    const requestVersion = plan.inputVersion;
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    inFlight.current = true;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setQuestion(normalizedQuestion);
    setLastQuestion(normalizedQuestion);
    setStatus("loading");
    setAnswer(null);
    setProvider(null);
    setPanelError(null);

    try {
      const response = await fetch("/api/assistant", {
        body: JSON.stringify({ question: normalizedQuestion, inputVersion: requestVersion }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const body = await responseBody(response);
      if (requestSequence.current !== requestId) return;
      if (response.status === 409) {
        setStatus("error");
        setPanelError({
          kind: "stale",
          title: "Reload required",
          message: responseErrorText(body, "The workbook changed since this plan was prepared."),
        });
        return;
      }
      if (!response.ok) {
        setStatus("error");
        setPanelError({
          kind: "request",
          title: response.status === 422 ? "Source data needs attention" : "Assistant request failed",
          message: honestRequestFailure(body, "The assistant could not prepare a grounded response. Try again."),
        });
        return;
      }
      if (!isAssistantResponse(body, requestVersion, workbook, plan)) {
        setStatus("error");
        setPanelError({
          kind: "invalid-output",
          title: "Assistant response not accepted",
          message: "The response did not match the visible snapshot and strict evidence contract. No answer was used.",
        });
        return;
      }
      const retrySeconds = providerRetrySeconds(body.provider);
      if (retrySeconds > 0) {
        setCooldownRemaining(retrySeconds);
        setCooldownUntil(deadlineAfter(retrySeconds));
      }
      setAnswer(body.answer);
      setProvider(body.provider);
      setStatus("result");
    } catch (error) {
      if (requestSequence.current !== requestId || (error instanceof DOMException && error.name === "AbortError")) return;
      setStatus("error");
      setPanelError({
        kind: "request",
        title: "Assistant request failed",
        message: "The assistant request could not reach the server. No model answer was used.",
      });
    } finally {
      if (requestSequence.current === requestId) {
        inFlight.current = false;
        activeController.current = null;
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canAsk) return;
    void ask(question);
  }

  function askSuggestion(suggestion: string): void {
    if (!planReady || cooldownRemaining > 0 || inFlight.current) return;
    setQuestion(suggestion);
    void ask(suggestion);
  }

  const notice = answer !== null && provider !== null ? diagnosticNotice(answer, provider) : null;
  const showRetry = lastQuestion.length > 0 && status !== "loading";

  return (
    <section id="assistant-panel" className={styles.panel} aria-labelledby="assistant-panel-title">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Explain · Assistant</p>
          <h3 id="assistant-panel-title">Ask about this plan</h3>
          <p className={styles.lead}>
            Ask only about the current server-calculated plan: client risk, production gaps, or local residual/value. The assistant is read-only and cannot change allocations or approve execution.
          </p>
        </div>
        <span className={planReady ? styles.successBadge : styles.badge}>
          {planReady ? "Plan-linked evidence" : "Plan required"}
        </span>
      </div>

      <div className={styles.suggestionGrid} role="group" aria-label="Suggested assistant questions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className={styles.suggestionButton}
            type="button"
            onClick={() => askSuggestion(suggestion)}
            disabled={!planReady || isLoading || cooldownRemaining > 0}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {!planReady ? (
        <p className={styles.disabledNote}>Generate a plan to enable grounded questions and current residual quantities.</p>
      ) : null}

      <form className={styles.questionForm} onSubmit={submit}>
        <label htmlFor="assistant-question">Or ask a supported question</label>
        <div className={styles.inputRow}>
          <input
            id="assistant-question"
            name="question"
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            placeholder="Which clients are at risk and why?"
            disabled={!planReady || isLoading || cooldownRemaining > 0}
            aria-describedby="assistant-question-help"
          />
          <button className={styles.askButton} type="submit" disabled={!canAsk}>
            {status === "loading" ? "Thinking…" : "Ask"}
          </button>
        </div>
        <p id="assistant-question-help" className={styles.helpText}>
          Questions are limited to the supplied snapshot; unsupported topics receive an explicit boundary response.
        </p>
      </form>

      {cooldownRemaining > 0 ? (
        <p className={styles.cooldown} role="status" aria-atomic="true">
          OpenRouter rate limit received. Retry is available in {formatCooldown(cooldownRemaining)}; no automatic retry will run.
        </p>
      ) : null}

      {status === "loading" ? (
        <div className={styles.loading} role="status" aria-live="polite" aria-atomic="true">
          <span className={styles.loadingDot} aria-hidden="true" />
          <div>
            <strong>Thinking</strong>
            <p>Checking the current server-owned evidence and preparing a grounded response…</p>
          </div>
        </div>
      ) : null}

      {panelError ? (
        <div
          className={`${styles.panelMessage} ${panelError.kind === "stale" ? styles.warning : styles.error}`}
          role="alert"
          aria-atomic="true"
        >
          <p className={styles.messageKicker}>{panelError.kind === "invalid-output" ? "Invalid output" : panelError.kind === "stale" ? "Stale snapshot" : "Request failed"}</p>
          <h4>{panelError.title}</h4>
          <p>{panelError.message}</p>
          <div className={styles.messageActions}>
            {showRetry ? (
              <button className={styles.secondaryButton} type="button" onClick={() => void ask(lastQuestion)} disabled={cooldownRemaining > 0}>
                Try again
              </button>
            ) : null}
            {panelError.kind === "stale" ? (
              <button className={styles.secondaryButton} type="button" onClick={onReload}>
                Reload workbook
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          className={`${styles.panelMessage} ${notice.tone === "warning" ? styles.warning : styles.info}`}
          role="status"
          aria-atomic="true"
        >
          <p className={styles.messageKicker}>{notice.title}</p>
          <p>{notice.message}</p>
        </div>
      ) : null}

      {answer !== null && planReady && plan !== undefined ? (
        <article
          className={styles.answer}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-labelledby="assistant-answer-title"
        >
          <div className={styles.answerHeader}>
            <div>
              <p className={styles.kicker}>Server-rendered answer</p>
              <h4 id="assistant-answer-title">{answer.title}</h4>
            </div>
            <span className={answer.source === "openrouter" ? styles.successBadge : styles.badge}>
              {answer.sourceLabel}
            </span>
          </div>
          {answer.model ? <p className={styles.modelLine}>Returned free model: {answer.model}</p> : null}
          <div className={styles.paragraphs}>
            {answer.paragraphs.map((paragraph, index) => <p key={`${answer.factIds[index] ?? "fact"}-${index}`}>{paragraph}</p>)}
          </div>
          <AnswerCitations answer={answer} workbook={workbook} plan={plan} onSelect={onSelect} />
          {showRetry ? (
            <button className={styles.retryLink} type="button" onClick={() => void ask(lastQuestion)} disabled={cooldownRemaining > 0}>
              Ask again
            </button>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
