# Atlas Fresh — Step-by-step agent execution guide

Status: Steps 01–15 are complete. Later steps have not started; unchecked tasks are not claims of completed work.

This guide implements [PROJECT_PLAN.md](PROJECT_PLAN.md), the planning file already present in this directory. There is no separate `plan.md`. Read that plan for the full business contract and source references. Use English throughout. The selected AI provider is **OpenRouter with free hosted models only**.

## How to execute one step at a time

Give the coding agent this instruction, replacing `NN` with the desired step number:

> Read PROJECT_PLAN.md and steps.md. Execute Step NN only. Inspect the current repository and earlier completion records first, preserve existing work, implement the step, and run its verification. Update this step's checklist and the work log with actual results, time, and remaining issues. Do not start the next step. Finish with changed files, verification results, and the next step number.

The agent must follow these execution rules:

1. Read applicable repository instructions and the selected step before editing. Treat the assessment's mandatory rules and the user's OpenRouter/free-only choice as constraints.
2. Check prerequisites from actual files and checks. A ticked box alone is not proof; do not redo completed work unnecessarily. If a prerequisite has a small defect required by this step, fix it and record the change.
3. Implement only the requested step and necessary prerequisite repairs. Stop after its verification and handoff so the user can choose the next step.
4. Mark a task complete only when its work and check have succeeded. Record failed, blocked, and unverified work explicitly. A provider outage must not be reported as a successful live AI test.
5. Track actual time in `docs/work-log.md`, including planning and fixes. Record estimates as estimates. Maintain meaningful commits at working milestones, using the configured author identity and staging only relevant files.
6. Keep source data separate from computed results. Never change the original workbook, fabricate baseline responses, or let a model perform allocation calculations.
7. Use the existing TypeScript/Next.js plan. Keep the core runnable without API credentials. A missing OpenRouter key does not block implementing or testing the adapter with mocked responses.
8. Keep credentials in ignored server-side environment configuration. Never request a key in chat, expose it to the browser, print it, or include it in commits or recordings.
9. Use routine technical judgment inside a step. Ask for missing user choices only when necessary, such as a repository destination or video account; finish all independent local preparation first. Do not publish, deploy, upload, or send email merely because this guide mentions delivery.
10. Respect the total 10–12-hour cap. Simplify optional features first, reserve delivery time, and document unfinished mandatory work if the cap is reached. Do not continue silently past it.

For each completed step, append to the work log: step/date, actual elapsed effort, files changed, decisions and rationale, checks and results, limitations, and commit identifier if a commit was made. The agent's final handoff should be short and factual.

## Evaluation criteria to demonstrate

These are the five criteria from the recruitment email, translated into English. They apply throughout the guide and complement the PDF's weighted rubric.

| ID | Evaluation criterion | Required evidence | Main steps |
| --- | --- | --- | --- |
| E1 | Understanding of the problem and business constraints. | Exact allocation policy, production/commercial distinction, constraints, useful shortage explanations, human approval boundary. | 02–05, 07–11, 15 |
| E2 | Technical choices and their justification. | Explain the single application, server validation/engine, arithmetic, no database, free OpenRouter integration, and trade-offs. | 01–04, 11–12, 17 |
| E3 | Code quality and user experience. | Readable typed modules, meaningful tests, connected views, accessibility, loading/errors, evidence links. | 02–16 |
| E4 | Reproducibility: the evaluator can run the project by following its instructions. | Pinned runtime/lockfile, default workbook, documented commands, clean-clone proof, no required API key. | 01, 03, 12, 16–17 |
| E5 | Transparency: what works, what does not work, and what would be improved with more time. | Actual test results, live-model verification status, limitations, AI coding-tool disclosure, actual time, next three production steps. | Every handoff, 12–13, 15–18 |

The PDF allocates 40 points to UX/product judgment, 25 to correctness, 15 to engineering/tests, 10 to grounded AI, and 10 to delivery. Preserve effort for the interface and delivery as well as the algorithm.

## Budget and order

The existing requirements/plan work has a 30-minute allowance within the overall budget; log the real time separately. The implementation steps below total 630 minutes. Together, the planned effort is **660 minutes / 11 hours**, plus **60 minutes of contingency**, with a hard stop at 12 hours.

| Step | Task | Budget | Depends on |
| --- | --- | ---: | --- |
| 01 | Repository and application foundation | 30 min | Existing plan |
| 02 | Domain contracts and validation | 30 min | 01 |
| 03 | Workbook loading and production comparisons | 30 min | 02 |
| 04 | Deterministic planning engine | 60 min | 03 |
| 05 | Complete the six core test groups | 60 min | 04 |
| 06 | Planning routes and workspace state | 20 min | 05 |
| 07 | Decision overview | 40 min | 06 |
| 08 | Production view | 40 min | 07 |
| 09 | Commercial view | 35 min | 08 |
| 10 | Allocation/local trace and connected drill-downs | 25 min | 09 |
| 11 | Evidence catalog and deterministic explanations | 30 min | 10 |
| 12 | Real OpenRouter free API integration | 50 min | 11 |
| 13 | Assistant panel and two assistant test groups | 40 min | 12 |
| 14 | Responsive, accessible, and failure-state polish | 20 min | 13 |
| 15 | Full acceptance and changed-input verification | 30 min | 14 |
| 16 | Clean-clone and production verification | 30 min | 15 |
| 17 | Final README and transparency notes | 25 min | 16 |
| 18 | Walkthrough and submission preparation | 35 min | 17 |

The budgets are targets, not instructions to skip completion checks or claim time that was not spent. Write focused tests alongside the related modules; Step 05 completes their coverage.

## Step 01 — Establish the repository and application foundation

Objective: a runnable project with preserved assessment materials and a documented start path.

Agent tasks:

- [x] Inspect the current files and Git state; preserve existing user changes. Initialize Git only if needed.
- [x] Read the actual PDF, pack README, workbook layout, and project plan. Preserve the original README as `docs/assessment-pack-readme.md` before creating application instructions.
- [x] Record source workbook/PDF hashes and create `docs/work-log.md` with the task/time record. Keep the originals intact.
- [x] Configure Node.js 24 LTS for this project; pin the tested version. Scaffold Next.js App Router with TypeScript and CSS/CSS Modules without overwriting the supplied files.
- [x] Add compatible, pinned dependencies for read-excel-file, Zod, decimal.js, and Vitest. Commit the npm lockfile. Use native `fetch` for OpenRouter. Reader selection was corrected during Step 01 after ExcelJS failed to read the original workbook's XML namespace format; see the work log.
- [x] Establish `src/app`, `src/components`, `src/lib`, `tests`, and `docs` as needed. Avoid creating empty abstraction layers without a purpose.
- [x] Define `dev`, `test`, `lint`, `typecheck`, `build`, and `start` scripts. Initial absence of tests must not be represented as passing domain coverage.
- [x] Ignore build artifacts, dependencies, and private environment files; explicitly allow `.env.example`. Include blank `OPENROUTER_API_KEY`, default `OPENROUTER_MODEL=openrouter/free`, and an explanation of the optional `WORKBOOK_PATH` override.
- [x] Create the minimal root page and layout with English language metadata, semantic structure, and system fonts. Avoid build-time remote font dependencies.
- [x] Write the initial README start instructions and a short rationale for the stack, single app, and no database. Create a meaningful setup commit when the foundation works.

Verification: dependency installation, development startup, lint/typecheck, and an initial production build succeed without API configuration. Check that secret files are ignored and original source hashes still match.

Exit condition: the app opens locally; its exact start commands and runtime are recorded. Handoff: Step 02.

## Step 02 — Define domain contracts and server validation

Objective: all calculations receive valid, typed data with actionable source errors.

Agent tasks:

- [x] Define types for segments, acceptance modes, farms, clients, station/reference prices, input snapshot/version, comparisons, allocations, balances, client outcomes, KPIs, and validation issues.
- [x] Distinguish source inputs from calculated outputs. Keep names and source sheet/row/cell metadata for clear error reporting.
- [x] Implement nonempty/unique farm and client IDs, one valid station, EXACT/MINIMUM mode checks, and A/B/C/D segment checks without hard-coding baseline IDs or counts.
- [x] Require all numeric fields to be present and finite. Require complete, unique A/B/C/D reference prices.
- [x] Validate each expected mix fraction in [0, 1] and a total of exactly 1 using the agreed decimal arithmetic. Expected capacity is nonnegative with at most one decimal place.
- [x] Validate actual A/B/C/D tonnes, demand, and station capacity as nonnegative multiples of 5. Do not apply that restriction to expected segment tonnes.
- [x] Validate nonnegative finite prices and local ratio in [0, 1], documenting these numeric-domain assumptions.
- [x] Return structured issues with sheet, entity ID when present, row/cell, field, and corrective text. For missing IDs, identify the row. Never silently repair input.
- [x] Document zero-demand clients as COMPLETE and undefined percentages at zero denominators as N/A. Begin T6 validation subcases.

Verification: valid representative inputs pass; missing/duplicate IDs, invalid modes/segments/mix, negatives, and non-5 t quantities fail with useful locations. Keep domain modules independent of React and network calls.

Exit condition: one reusable validation contract serves all server entry points. Handoff: Step 03.

## Step 03 — Read the workbook and compute production comparisons

Objective: load the authoritative XLSX through a server route and show trustworthy production data.

Agent tasks:

- [x] Implement a server-only read-excel-file loader using `read-excel-file/node`, with `trim: false`, a default path to the supplied workbook, and a server environment override for an edited copy. Its raw row arrays retain the source positions needed for validation errors.
- [x] Read required sheets/tables by their headers: Farms/Clients row 4 with data from row 5, Station parameters rows 4–5, references rows 16–20. Ignore titles/merged explanatory cells; reject missing structure explicitly.
- [x] Preserve source locations while parsing. Support the provided literal-cell workbook format; handle unsupported cell types explicitly rather than accepting stale or malformed values silently.
- [x] Run all Step 02 validation before returning a usable snapshot. Keep original data unchanged.
- [x] Calculate expected segment tonnes, actual totals, per-farm/per-segment variances, and overall production totals on the server with decimal arithmetic.
- [x] Build a content-derived input version and a data-health summary. Stable business data must not depend on request timestamps.
- [x] Implement uncached `GET /api/workbook`, with structured validation errors and a safe server-error response.
- [x] Start the real-workbook integration test and document the workbook override/reload procedure.

Verification: 20 farms and 10 clients load; total expected = 600 t, actual = 560 t, capacity = 500 t. Compare these calculated segment results:

| Segment | Expected | Actual | Variance |
| --- | ---: | ---: | ---: |
| A | 101.7 t | 90 t | -11.7 t |
| B | 168.3 t | 160 t | -8.3 t |
| C | 207.9 t | 180 t | -27.9 t |
| D | 122.1 t | 130 t | +7.9 t |

Exit condition: the route returns validated inputs and comparisons; bad or unreadable files produce honest errors. Handoff: Step 04.

## Step 04 — Implement the exact deterministic planning policy

Objective: calculate allocations, statuses, residuals, and value entirely on the server.

Agent tasks, in execution order:

- [x] Build independent available balances from actual farm-segment receipts only. Do not mutate the validated snapshot.
- [x] Sort clients by export price descending, then client ID ascending using a stable comparison.
- [x] For each client, filter positive supply by EXACT/MINIMUM compatibility. A is highest quality; MINIMUM accepts the requested segment or better.
- [x] Sort compatible balances by smallest upgrade, then farm ID. For MINIMUM C, use C before B before A even if a better segment comes from a lower farm ID.
- [x] Allocate in integer 5 t units, respecting demand, farm-segment balance, and remaining station capacity. Aggregate consecutive units into trace rows if useful.
- [x] Return each allocation's farm ID, segment, client ID, tonnes, upgrade information, and revenue based on the served client's price.
- [x] Finalize each client's demand/allocated/remaining/revenue/status and shortage reason when that client is processed. Capacity exhausted takes precedence at that moment; otherwise use insufficient compatible segment.
- [x] Preserve earlier segment-shortage reasons when later clients fill the station. Still produce outcomes for all clients after capacity becomes zero.
- [x] Send every remaining actual farm-segment tonne to local; price it using the workbook's ratio and that segment's reference export price. Local fruit does not consume the export station's capacity.
- [x] Return farm/segment actual-export-local balances and all server-calculated KPIs: expected, actual, station capacity/use, export rate, local volume/value, export revenue, total value, and at-risk count.
- [x] Enforce compatibility, nonnegative balances, demand/supply/capacity limits, 5 t units, and conservation per farm-segment and globally. Keep display rounding out of allocation decisions.
- [x] Define stable output ordering and deterministic identifiers for trace/evidence records. Document the policy and arithmetic decisions in `src/lib/planner.ts` and the application README.

Verification: begin T1–T5 with the workbook baseline and small focused fixtures. Check C02 and C09 retain `INSUFFICIENT_COMPATIBLE_SEGMENT`, while C08 receives `STATION_CAPACITY_REACHED`.

Exit condition: one pure engine produces an executable plan with no hard-coded baseline results, model dependency, or generic optimization solver. Handoff: Step 05.

## Step 05 — Complete the six meaningful core test groups

Objective: prove correctness beyond the supplied happy path.

- [x] T1: parse the actual workbook and assert the entire public baseline, production totals, all client statuses, residual composition, and trace conservation.
- [x] T2: assert price ordering, client-ID ties, quality-fit ordering, farm-ID ties, unchanged input objects, repeat-call determinism, and identical business results after shuffling source rows.
- [x] T3: assert EXACT rejects other segments, MINIMUM accepts upgrades but never worse fruit, requested segment is preferred, and upgrade revenue uses client price.
- [x] T4: assert all hard limits and conservation, zero actual/demand/capacity behavior, partial/unserved states, and reason precedence at processing time.
- [x] T5: assert local residual/value and relevant changed-input behavior. A reference-price change affects residual value but not client order or export revenue; expected-mix changes affect comparisons but not actual supply.
- [x] T6: complete parameterized invalid-ID/mode/segment/reference/mix/numeric/quantity/capacity cases, including missing structure and expected-capacity precision, with actionable errors.
- [x] Use independently specified expected outcomes and intentionally constrained fixtures. Avoid tests that merely repeat the implementation's calculations.
- [x] Fix failures, run the six groups, and create a meaningful engine/validation milestone commit with actual check results.

Required baseline assertions: export 500 t; local 60 t, all D; export rate 500/560, displayed 89.3%; export revenue EUR 549,500; local value EUR 4,500; total EUR 554,000; three at-risk clients. C02 gets 40/50 t, C09 30/50 t, C08 20/50 t; the other seven are COMPLETE.

Exit condition: all six groups pass offline, including changed valid input and invariant checks. Handoff: Step 06.

## Step 06 — Connect planning routes and workspace state

Objective: establish Load → Compare → Plan without browser-side business calculations.

- [x] Implement uncached `POST /api/plan`: read and validate the server workbook, verify the requested input version, calculate the plan, and return the complete structured result.
- [x] Reject malformed requests and changed snapshots clearly. Never accept authoritative allocations, KPIs, or arbitrary file paths from the browser.
- [x] Create a workspace state model for unloaded, loading, loaded/unplanned, planning, planned, invalid-data, server-error, and stale-result states.
- [x] Wire Load workbook, Generate plan, and reload/reset controls. Disable actions while invalid or pending and prevent out-of-order responses from mixing snapshots.
- [x] Keep generation separate from approval: the app prepares a recommendation and has no execution-confirmation action.
- [x] Add the shared overview/detail shell and API error presentation. Reload/reset clears dependent plan state; assistant answers do not exist until Step 13.

Verification: load, compare, generate, reload, and fail/retry work through the browser and routes. A version mismatch offers reload, and a client-supplied result cannot override the engine.

Exit condition: the full server-calculated plan reaches one coherent workspace. Handoff: Step 07.

## Step 07 — Build the decision overview

Objective: the committee understands the current situation in the first viewport.

- [x] Show data-health/source status separately from business exceptions.
- [x] Lead with expected vs actual tonnes, export station usage/capacity, export rate, local tonnes/value, export revenue, total value, and at-risk count.
- [x] Show A/B/C/D expected/actual comparisons with useful signed variances. Use clear units and consistent EUR/tonnage formatting.
- [x] Add a short result-driven exception summary for segment gaps, client risk, and local impact; wire its links into the workspace selection state.
- [x] Display uncalculated plan metrics as not yet calculated, not zero. Handle genuine zero values and N/A ratios explicitly.
- [x] Keep 60 t and all other baseline figures out of runtime copy constants; derive headings and summaries from the current result.

Verification: baseline cards match the server response, and loading/reset states do not show misleading figures. Check the main decision content at 1024 px and 1440 px.

Exit condition: business situation and next inspection action are clear without narration. Handoff: Step 08.

## Step 08 — Build the Production view

Objective: every farm's production gap and downstream allocation can be inspected.

- [x] Show all farm IDs/names, expected capacity/mix, actual A/B/C/D receipts, total variance, useful segment variances, and residual local tonnes.
- [x] Add keyboard-operable farm details for full expected/actual segment comparisons and the clients served by each farm.
- [x] Support selection from a segment or overview exception, and a clear reset of active filters. Reuse the same server result throughout.
- [x] Keep planned production visibly distinct from actual supply. Retain all farms, including zero-supply farms.
- [x] Prepare ID/segment anchors or a shared selection handler for later trace and assistant links.

Verification: inspect F01 and F04 A deficits (-6.5 t and -6.0 t), and F20's C deficit (-18.9 t) alongside actual D receipt. Check that displayed local balances reconcile with the engine.

Exit condition: a manager can move from a segment gap to its farms and actual served clients. Handoff: Step 09.

## Step 09 — Build the Commercial view

Objective: explain complete, partial, and unserved orders with traceable reasons.

- [x] Show every client ID/name, acceptance rule, requested segment, demand, allocated, remaining, export revenue, status, and readable shortage reason.
- [x] Surface at-risk clients and allow inspection of all clients; use text labels as well as status color.
- [x] Expand/select a client to show its supplying farm-segment allocations, including upgrades and client-price revenue.
- [x] Explain the relevant segment supply and higher-priced allocations using calculated evidence. Link back to production comparisons.
- [x] Distinguish a compatibility shortage from capacity reached at this client's processing point. Do not infer causes solely from final station usage.

Verification: C02, C09, and C08 show the expected quantities and distinct reasons. All seven complete clients remain discoverable, and an unserved fixture renders correctly.

Exit condition: each client risk has a useful explanation and an allocation drill-down. Handoff: Step 10.

- Completed the Commercial view only. Added a pure client projection over the matching server plan, including compatible actual supply, higher-priority compatible allocations, processing-time station room, and the engine-owned shortage reason. The projection keeps allocation-dependent fields absent before plan generation.
- Added the keyboard-operable Commercial view with all client requests, an at-risk-first layout, complete-client discovery, readable status/reason labels, expandable farm-segment allocation rows, upgrade levels, client-price revenue, production links, and shared client/segment focus state. No farm is described as the cause of a shortage; farm links expose shared supply evidence for later trace work.
- Added Commercial view tests for the seeded C02/C09/C08 quantities and reasons, all seven complete clients, pre-plan absence, client-price allocation rows, and a zero-capacity unserved fixture rendered with the capacity reason.
- Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (77 tests across 9 files), `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Chrome headless smoke passed the pre-plan state, generated-plan C02/C09/C08 checks, seven complete clients, allocation detail, Commercial-to-Production focus handoff, and 1024/1440 px page-width checks.
- Limitation: allocation/local is still a separate view planned for Step 10; Production links currently land on the existing Production view/farm anchors. The evidence catalog and assistant remain intentionally deferred.
- Commit: final single Step 09 implementation/documentation milestone; the hash is recorded in the final handoff.

## Step 10 — Complete allocation/local trace and connected navigation

Objective: every exported or local tonne has a visible source and destination.

- [x] Show allocation rows with farm ID, segment, client ID, tonnes, quality upgrade, and export revenue.
- [x] Show a separate local residual table with farm ID, segment, residual tonnes, local unit price, and local value, plus totals.
- [x] Connect overview, farm, client, segment, allocation, and local selections through one predictable navigation/filter pattern with a reset action.
- [x] Explain why remaining D cannot satisfy A/B requirements and why the final eligible D order is constrained by station capacity.
- [x] Avoid inventing farm-client obligations. Show shared supply evidence; do not claim a specific farm caused a specific shortage without source support.
- [x] Preserve the distinction between production-plan gaps and demand shortages: C production is below forecast while baseline C orders are complete.
- [x] If a reference-price discount is displayed, label it as a reference comparison, never guaranteed lost profit or achievable additional sales.

Verification: follow at least one client → allocation → farm path and one farm → local path. Totals reconcile: export + local = actual, including per farm/segment.

Exit condition: the manager can trace a shortage or allocation in under three minutes. Handoff: Step 11.

- Completed the Allocation & Local trace and connected navigation only. Added a pure trace projection and a plan-linked view with every allocation row, every positive local residual, totals, and an expandable per-farm/segment conservation audit.
- Extended the shared selection state with allocation IDs and local residual/farm identity. Overview, Production, Commercial, and trace row actions now carry one focus across sections and Reset clears it. Client allocation rows focus the connected farm/client/trace evidence; farm local cells focus the exact farm/segment residual.
- Added server-fact explanations for the remaining D quality constraint, the final D-eligible station-capacity case, and the C production-gap versus complete-C-demand distinction. Copy explicitly describes shared supply evidence and labels local values as calculated reference comparisons rather than guaranteed lost profit.
- Added `tests/trace.test.ts` covering baseline export/local totals, residual rows and conservation, selection targeting, explanations, rendered trace tables, and honest pre-plan absence.
- Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (81 tests across 10 files), `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`, and original-source checksum verification. Browser smoke confirmed the existing Load → Generate plan journey and the new trace sections at the target widths; no source workbook or credentials were changed.
- Limitation: evidence catalog, assistant, formal keyboard/responsive audit, changed-input acceptance pass, and delivery work remain intentionally deferred to later steps.
- Commit: single Step 10 implementation/documentation milestone; the hash is recorded in the final handoff.

## Step 11 — Create grounded facts and deterministic summaries

Objective: assemble explanations from approved server facts before integrating a provider.

- [x] Build a catalog of stable fact IDs, exact server values, allowed factual text, and valid farm/client/segment references tied to the input version.
- [x] Support risk, production-gap, and local-residual intents. Derive rankings and numeric summaries on the server, including relationships between compatible quality and unmet demand.
- [x] Prepare the minimum relevant context for each intent; exclude workbook binaries, unrelated records, secrets, and invented background.
- [x] Define a strict response schema for intent and selected/ordered fact IDs. Check required fact coverage, versions, and references as well as schema shape.
- [x] Render factual sentences and numbers from the catalog; never render unvalidated model-generated values or claims. Show citations that resolve to existing records.
- [x] Implement the clearly labelled deterministic summary for supported topics. Unsupported questions state that the answer is unavailable in this snapshot.
- [x] Keep weather, future forecasts, logistics, approval, and external actions outside the assistant's capabilities. Treat user question text as data, not authority to change the planning policy.

Verification: risk summaries cover all at-risk clients; local explanations include quantity, segment composition, constraint, and value; gaps use actual calculated evidence. Reject unknown/mismatched facts and incomplete required coverage.

Exit condition: honest no-key summaries work, and a model can select evidence without calculating or inventing it. Handoff: Step 12.

- Completed Step 11 only. Added a pure server-owned evidence catalog with stable version-bound fact IDs for all at-risk clients, ranked negative farm/segment and aggregate segment gaps, the complete local residual summary, and local residual detail rows. Facts retain exact calculated values, approved factual text, and resolvable farm/client/segment/trace references.
- Added strict assistant boundaries without a provider call: supported risk, production-gap, and local-residual question classification; minimum intent-specific contexts; Zod validation for ordered fact IDs; input-version, intent, unknown-ID, duplicate, and required-coverage checks; deterministic rendering from catalog text only; and an explicit unsupported response for weather, forecasts, logistics, approvals, and external actions.
- Added `tests/evidence.test.ts` covering the baseline's three at-risk clients and reasons, local 60 t/D composition and EUR 4,500 reference value, ranked F01/F04/F20 gaps, compatible unmet-demand relationships, context isolation, resolvable citations, version mismatch, strict selection rejection, and no-key/unsupported summaries.
- Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (88 tests across 11 files), `npm run typecheck`, `npm run lint`, and `git diff --check`. No OpenRouter request was made; the provider route, browser assistant, live-model verification, and T7/T8 remain deferred to Steps 12–13.
- Limitation: deterministic summaries are implemented as server-independent library output for the next provider/panel steps; they are not yet rendered in the browser workspace. Original source files and credentials remain untouched.
- Commit: single Step 11 implementation/documentation milestone; the hash is recorded in the final handoff.

## Step 12 — Implement the real OpenRouter free API path

Objective: a working hosted model integration when a private API key is configured.

- [x] Recheck the official [free-router documentation](https://openrouter.ai/docs/guides/routing/routers/free-router). Default to `OPENROUTER_MODEL=openrouter/free`; allow only the free router or an explicitly configured zero-cost `:free` alternative, and reject non-free returned metadata. Record returned model metadata because the free router may select different models.
- [x] Keep `OPENROUTER_API_KEY` server-only in ignored `.env.local`; `.env.example` has an empty key. The user creates/configures their key privately through [OpenRouter's key page](https://openrouter.ai/settings/keys).
- [x] Implement native server `fetch` to `https://openrouter.ai/api/v1/chat/completions` with Bearer authorization and JSON content type, following [authentication documentation](https://openrouter.ai/docs/api_reference/authentication). Do not make inference calls directly from the browser.
- [x] Send the user's supported question and minimum fact context. Request non-streaming JSON Schema output with `strict: true` and `provider.require_parameters: true`; independently validate it using Step 11. See [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
- [x] Reject paid model IDs before inference; never strip a `:free` suffix, fall back to paid routing, enable paid plugins, or instruct the user to buy credits. If a free compatible endpoint is unavailable, use the honest failure/summary path.
- [x] Bound timeout and output size. Handle missing/invalid keys, 402 account errors, 429 limits, 5xx/provider failures, network errors, aborts/timeouts, refusals, empty/truncated output, invalid JSON/schema, and unknown/inappropriate facts. Respect retry timing from [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits); avoid automatic retry loops.
- [x] Implement `POST /api/assistant`: validate question/version, reload the authoritative source, recompute the plan, reject stale versions, derive evidence, then call the adapter or summary path. Do not trust browser KPIs.
- [x] Keep sanitized diagnostic model/status information separate from credentials and raw provider errors. No allocation changes or external-action tools are available to the model.
- [x] Use mocked provider responses for repeatable automated checks. No private key is configured in this environment, so no live request was made; requested/returned model metadata is covered by the mock contract.
- [x] Record live inference as unverified because credentials/provider availability were not available. The real adapter, offline checks, and deterministic fallback are complete; the mock is not reported as a live integration.

Verification: the request/response contract works under mocked success/failure; paid configuration is rejected before any inference call; model text cannot inject values. A live success is claimed only when an actual request succeeds and its evidence passes validation. No key reaches client bundles, responses, or logs.

Exit condition: real OpenRouter adapter and honest failure states exist; actual live-check status is documented. Handoff: Step 13.

- Completed Step 12 only. Approximate active effort: 50 minutes, including official provider-documentation review, adapter/route implementation, mocked failure coverage, strict checks, and documentation; idle wall-clock time is excluded.
- Added `src/lib/openrouter.ts` with a native server-side, non-streaming OpenRouter Chat Completions adapter. It defaults to `openrouter/free`, rejects paid model IDs before inference, accepts only free variants, records requested/returned model metadata, sends intent-specific evidence context, requests strict JSON Schema output with `provider.require_parameters`, bounds response/timeout size, and never retries automatically. The model can return only an evidence selection; server-owned text and citations are rendered after independent Step 11 validation.
- Added `src/app/api/assistant/route.ts`. It accepts only a question and SHA-256 input version, reloads the authoritative workbook, recomputes the deterministic plan, rejects stale snapshots, derives the version-bound catalog, skips unsupported questions, and returns either a model-labelled server-rendered answer or a separately labelled deterministic fallback. Browser KPIs, allocations, credentials, and raw provider errors are not accepted or returned.
- Added `tests/openrouter.test.ts` and `tests/assistant-route.test.ts` covering mocked success, strict request shape, free-only model enforcement, missing/invalid credentials, 402/429/403/404/5xx failures, Retry-After capture without retry loops, network/timeout, refusal, truncation, invalid JSON/selection, stale input, unsupported questions, browser result injection, and server-rendered text protection. The intentionally injected extra model prose is rejected by the strict schema.
- Updated `src/lib/assistant.ts`, `.env.example`, `README.md`, and `PROJECT_PLAN.md` for the model-labelled answer boundary and private configuration behavior. The browser assistant panel remains intentionally deferred to Step 13.
- Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (112 tests across 13 files), `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. No live OpenRouter request was made because no private key was configured; live inference and actual provider availability remain unverified. Original workbook, PDF, preserved pack README, checksum manifest, and credential files remain unchanged.
- Built-app smoke passed with both OpenRouter variables unset: `GET /api/workbook` returned the content version, and `POST /api/assistant` returned three risk facts with `source=deterministic`, `status=unavailable`, and `code=MISSING_API_KEY`. The private key was not printed or sent.
- Limitation: there is no browser assistant panel yet, and this environment cannot claim a live model/citation smoke result. The next step is Step 13.
- Commit: single Step 12 implementation/documentation milestone; the final hash is reported in the handoff.

## Step 13 — Build the assistant panel and its two test groups

Objective: managers can ask supported questions and inspect their evidence.

- [x] Add three suggested questions for client risk, farm/segment gaps, and local residual/value, plus a small free-text input limited to those topics.
- [x] Derive the local question's quantity from the current plan. Disable questions until a valid plan exists and prevent simultaneous duplicate requests.
- [x] Show thinking/loading, validated model answer, no-key summary, unsupported question, timeout/provider failure, invalid-output, and stale-snapshot states honestly.
- [x] Label summaries `Deterministic summary — no model used`; do not imply a failed model response was accepted. Make retry predictable and respect rate-limit cooldowns.
- [x] Link every cited farm/client/segment to the correct detail and make navigation usable with the keyboard. Clear answers on data reset/version change.
- [x] T7: test supported grounded answers against server facts and resolvable references, including all required risk/local facts and no invented numeric content.
- [x] T8: parameterize unsupported questions, unknown/mismatched IDs, malformed/incomplete output, missing/invalid keys, account/rate/provider errors, timeout/refusal/truncation, paid-model configuration, and tampered browser data; assert honest handling and unchanged allocations.
- [x] Run all eight test groups offline and create a meaningful assistant milestone commit with the real-provider verification status.

Implementation: `src/components/AssistantPanel.tsx` and its CSS Module are mounted after the trace view. The panel sends only the question and visible content version, validates the returned answer/citation shape against the visible workbook/plan, and uses existing selection navigation for farm/client/segment/allocation/residual evidence. `tests/assistant.test.ts` records T7/T8; the earlier provider and route tests remain part of those assistant boundaries.

Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (117 tests across 14 files), `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. A browser smoke on an explicit blank-key process verified the no-key fallback and citation navigation. A separate live smoke used the already-present ignored private configuration; OpenRouter returned `TRUNCATED_OUTPUT`, so no model answer or citation was accepted. The key was not printed, returned to the browser, or committed. The original workbook, PDF, preserved pack README, checksum manifest, and credential files remain unchanged.

Limitation: the formal full-workspace responsive/accessibility and failure-state audit remains Step 14. The panel's offline fixture exercises the validated provider rendering path; it does not substitute for live provider availability.

Verification: all three supported questions work in summary mode; a validated provider fixture drives the real answer rendering path; failures cannot masquerade as AI success. If configured live inference is available, inspect its citations in the browser.

Exit condition: the Explain journey is complete with honest provenance and recovery. Handoff: Step 14.

## Step 14 — Review accessibility, target widths, and failure states

Objective: finish the mandatory UX details across the full workspace.

- [x] Review at 1024 px and 1440 px. Keep key decisions visible; put the assistant beside the content at wider sizes and below when space is limited.
- [x] Prevent page-wide overflow. Give dense detail tables contained scrolling and keep important labels/values legible.
- [x] Verify keyboard navigation, visible focus, button/input labels, headings, table semantics, expandable rows, and evidence navigation; restore focus predictably after closing details.
- [x] Check contrast and ensure statuses/variances are communicated with text/signs as well as color. Announce errors and loading results appropriately.
- [x] Exercise unloaded, loading, loaded/unplanned, planning, valid zero-data, validation-error, source/server-error, stale-result, no-key, provider-failure, and successful-result states.
- [x] Verify Retry/Reload/Reset preserve useful context without mixing snapshots. Ensure the page never claims data is valid when validation failed or displays placeholder results as real results.
- [x] Simplify visual extras if needed; prioritize the connected decision journey and make a working UX milestone commit.

Verification: passed under Node.js 24.21.0 / npm 11.19.0 with the full Load → Compare → Plan → Decide → Explain workflow at 1024 px and 1440 px. Chrome keyboard probes passed disclosure open/close focus restoration, destination focus after evidence selection, labelled tables/scroll regions, and zero unnamed buttons/captionless tables. Browser fixtures passed unloaded/loading, valid zero-data, validation 422, source/server 500, stale plan 409, no-key deterministic answer, provider failure, and retry/recovery states. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`, and original-source checksum verification passed. A real screen-reader session was not performed; native landmarks, headings, tables, status/alert semantics, and keyboard behavior were checked in Chrome, and this remains a precise manual-review limitation.

Exit condition: mandatory UX states and accessibility checks are recorded as passed with the screen-reader limitation above. Handoff: Step 15.

### Step 14 completion record — 13 September 2026

- Completed Step 14 only. Approximate active effort: 45 minutes, including the repository/Next.js accessibility-guide review, browser review, focused implementation, state probes, strict checks, and documentation; idle wall-clock time is excluded.
- Added a wide-layout grid that places the assistant beside the trace at 1440 px and returns it below the workspace at 1024 px. Added contained, keyboard-focusable labelled regions for dense tables, reduced-motion-aware destination scrolling, predictable focus restoration after closing farm/client/conservation disclosures, and focusable destination view landmarks.
- Strengthened loading, focus, selection, answer, cooldown, invalid-data, server-error, stale-result, and assistant failure announcements with native status/alert semantics and atomic updates. Non-2xx assistant responses explicitly state that no model answer was used.
- Browser review passed at 1024 px and 1440 px with document width equal to the viewport, correct assistant placement, no unnamed buttons, captions on all tables, labelled scroll regions, keyboard disclosure/focus checks, and selection navigation. Response fixtures exercised unloaded, loading, valid zero-data, validation-error, source/server-error, stale-result, no-key, provider-failure, deterministic successful-result, and recovery states without editing the authoritative workbook.
- Remaining limitation: no real screen-reader session was run; live successful OpenRouter inference remains unverified because the earlier configured smoke returned `TRUNCATED_OUTPUT`. The next step is Step 15.
- Commit: final single Step 14 implementation/documentation milestone; the hash is reported in the handoff.

## Step 15 — Audit every acceptance criterion and changed inputs

Objective: prove the product matches the brief, including evaluator changes.

- [x] Create a concise actual-results checklist in `docs/verification.md` covering acceptance A–I and email criteria E1–E5. Use the coverage map below.
- [x] Run all automated tests, lint, and type checking. Fix failures relevant to the requested scope.
- [x] Recheck every public baseline metric and C02/C09/C08 quantities/reasons in both server results and the interface.
- [x] Create a separate valid workbook copy, reduce station capacity from 500 to 495 t, select it through `WORKBOOK_PATH`, and reload. Expect export 495 t, local 65 t, C08 allocation 15 t, export revenue EUR 546,000, local value EUR 4,875, and total EUR 550,875. These are verification expectations, never application constants.
- [x] Confirm dependent cards, balances, client details, evidence, and local-question wording update. Keep C02/C09's segment-shortage reasons intact.
- [x] Use an invalid workbook copy, such as F01 actual A = 27 t. Confirm server rejection, the correct sheet/farm/field message, disabled planning, and successful recovery after reloading valid data.
- [x] Verify no stale assistant answer survives a changed snapshot. Check both grounded/unsupported behavior and actual provider status without requiring API calls in tests.
- [x] Timed UX review: the situation is understood in under one minute; one shortage/allocation is traced in under three minutes. If only self-reviewed, say so explicitly.
- [x] Restore the default source selection, verify original workbook/PDF hashes, and record failures/omissions truthfully. Do not modify the originals to create demo errors.

Exit condition: A–I and E1–E5 have recorded evidence, and all in-scope fixable blockers are resolved within the timebox. Handoff: Step 16.

### Step 15 completion record — 13 September 2026

- Completed Step 15 only. Approximate active effort: 1 hour 5 minutes, including the acceptance evidence record, default and changed-input API/UI checks, invalid-copy recovery, stale-answer review, timed self-review, strict checks, and documentation; idle wall-clock time is excluded.
- Added [docs/verification.md](docs/verification.md), a concise actual-results checklist for acceptance A–I and email criteria E1–E5. It records the exact default and 495 t capacity results, C02/C09/C08 outcomes, invalid F01 validation/recovery, stale/unsupported/no-key behavior, provider status, and original-source integrity.
- No application code change was required: the existing implementation passed all Step 15 checks. The valid temporary copy changed only Station `B5` from 500 to 495; the invalid temporary copy changed only Farms `H5` for F01 from 25 to 27. Both remained outside the repository.
- Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (117 tests across 14 files), `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`, and `sha256sum --check docs/source-checksums.sha256`. Chrome self-review covered default/changed metrics, plan-dependent UI, C02/C09/C08 cards, dynamic local evidence, invalid-source recovery, stale answer removal, unsupported no-request, and no-key fallback.
- Actual provider status: the existing configured smoke returned `TRUNCATED_OUTPUT`; no model answer or citation was accepted. Changed-input checks forced blank provider variables and returned `MISSING_API_KEY`; successful live inference remains unverified. No real screen-reader or independent usability session was performed; the timed result is explicitly self-reviewed.
- Acceptance I is recorded as pending Step 16 clean-clone proof. The original workbook, PDF, preserved pack README, checksum manifest, and credential files were unchanged. The pre-existing `.gitignore` edit and `steps.md` Step 14-record removal were preserved.
- Next step: Step 16 — Verify a clean clone and production startup.

## Step 16 — Verify a clean clone and production startup

Objective: the evaluator can reproduce the project without the development environment.

- [ ] Ensure necessary source/configuration/lockfiles are committed, and private environment files/build artifacts are excluded. Inspect pending changes before creating the verification clone.
- [ ] Make a fresh local clone in a separate temporary directory, preserving the working directory and user's files. Use the documented runtime and README instructions only.
- [ ] With no API key or private `.env` file, run `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Run `npm start` after the build and exercise the seeded workspace and deterministic summary. Also verify the documented development command if not already proven from this clone.
- [ ] Confirm workbook paths work outside the original absolute directory and that production routes can read the bundled/source workbook correctly.
- [ ] Confirm installation/build/tests require no inference call, private account, database, local model runtime, or paid service. Document that initial package installation requires network access.
- [ ] Inspect tracked files for accidental secrets; verify `.env.example` contains placeholders only. Do not print secret values during inspection.
- [ ] Record commands and actual outcomes in `docs/verification.md`. If a fix changes dependencies, runtime behavior, or commands, recheck the affected clean-clone path.

Exit condition: clean-clone installation, tests, build, and production workflow succeed as documented, with any real limitation explicit. Handoff: Step 17.

## Step 17 — Finalize README, decisions, and transparency

Objective: deliver concise instructions and evidence that a reviewer can trust.

- [ ] Finish the root README: product purpose, prerequisites/pinned runtime, exact working directory, one clean-start path, local URL, test/lint/typecheck/build/start commands, and dev/production alternatives.
- [ ] Explain the server routes, pure planning engine, workbook parsing/validation, deterministic ordering, decimal/5 t arithmetic, evidence boundary, and why no persistence is needed.
- [ ] Document the default workbook and edited-copy override/reload procedure, layout assumptions, zero-demand/zero-denominator behavior, and unchanged-source policy.
- [ ] Document optional OpenRouter setup: private API key configuration, default free route, verified free-model alternative if used, required internet, rate/availability limitations, and restart instructions. Include no-key/provider-failure behavior and live verification status.
- [ ] Create `docs/delivery-notes.md`: what works, known failures/unverified paths, intentional omissions, actual approximate time, AI coding tools used and their roles, and what the candidate independently verified.
- [ ] Distinguish AI used to help write code from the OpenRouter model used inside the product. Do not claim tests, a real model response, or a usability session that did not happen.
- [ ] Include the next three production steps from the plan: validate the workflow/policy with users; add versioned daily snapshots and explicit human approval records; harden access, monitoring, and provider reliability.
- [ ] Explain important trade-offs and how the work addresses E1–E5. Link to the verification record without turning the README into an oversized process log.
- [ ] Confirm final instructions match Step 16, record any remaining mandatory omissions explicitly, and make a documentation milestone commit.

Exit condition: setup, technical justification, actual verification, and limitations are understandable without the conversation. Handoff: Step 18.

## Step 18 — Prepare the walkthrough and submission

Objective: prepare all required delivery assets and support the candidate's final submission.

- [ ] Create `docs/walkthrough.md` with a 3–5-minute script and demonstration checklist using the plan's roughly four-minute timeline.
- [ ] Cover loading/data health, expected vs actual, generated export/local value, the three client risks, one farm-client trace, local residual value, an assistant question with evidence, recovery behavior, and honest limitations/time/AI disclosure.
- [ ] Prepare the application in its default baseline state. Show actual configured-model or clearly labelled fallback behavior; never simulate a successful live AI call for the recording.
- [ ] Review the recording flow for visible credentials, private account information, or non-synthetic data. Include only the assessment data and safe product screens.
- [ ] Prepare `docs/submission-email.md` with placeholders for repository URL, access instructions if private, video URL, optional deployed URL, and approximate actual time. Keep the draft in English as requested.
- [ ] Finish all local assets before requesting any missing repository destination, visibility/access choice, or video-upload destination. Use existing authorization when provided; do not infer permission to send an email from this guide.
- [ ] With the candidate's chosen destination and authorization, publish the repository and supply access instructions. If publication is not authorized or available, report the prepared local repository and the remaining action accurately.
- [ ] Have the candidate record/upload the walkthrough, or assist using available tools when authorized. Verify the resulting URL and 3–5-minute duration; a script or local recording alone is not the required video URL.
- [ ] Verify repository/video access for an evaluator. Include a live app URL only if an optional deployment was separately requested and actually works; deployment does not replace clean-clone proof.
- [ ] Fill the submission draft with actual URLs and time once available. The candidate replies before 18 September 2026; target 17 September because no exact cutoff time was supplied.
- [ ] Mark delivery complete only when the required URLs, access information, and time are ready. Record anything still awaiting the candidate; do not claim the email was sent unless it was actually sent with authorization.

Exit condition: repository URL, 3–5-minute video URL, access instructions where needed, actual time, and honest disclosure are ready for the reply. Any account-dependent work is explicitly identified.

## Final coverage map

Use this table during Step 15 and before submission. A row is complete only when its checks have evidence.

| Requirement | Where implemented | Where verified |
| --- | --- | --- |
| A — Correct input totals, segments, and capacity | 02–03, 07–08 | T1/T6, 15 |
| B — Exact calculated export/local/rate/value baseline | 04, 07, 10 | T1/T5, 15 |
| C — C02/C09 segment shortages; C08 capacity shortage | 04, 09 | T1/T4, 15 |
| D — Every export/local tonne traces to farm/segment/client or local | 04, 08–10 | T1/T4, 15 |
| E — Supply, demand, capacity, compatibility, conservation limits | 02, 04 | T2–T5, 15 |
| F — Server validation with actionable errors | 02–03, 06, 14 | T6, invalid-copy check in 15 |
| G — Real configured model path, supported evidence, honest failure | 11–13 | T7/T8, live check status in 12/15 |
| H — Coherent workspace, business connections, loading/errors, accessibility | 06–14 | 14–15, timed walkthrough |
| I — Documented clean-clone start/tests/build | 01, 03, 16–17 | 16 |
| Six core tests plus grounded/failure assistant checks | 02–05, 13 | 05, 13, 15–16 |
| Changed valid inputs recalculate relevant results | 02–06, 11–13 | T2/T5, changed-copy check in 15 |
| Original workbook intact; no credentials/real client data | 01–18 | Hash and tracked-file checks in 15–16, recording review in 18 |
| Human approval retained; no autonomous external execution | 04, 06, 11–13 | Code/UX review in 15, disclosure in 17 |
| Meaningful history, concise README, AI-use/time/limitations note | 01–17 | 16–17 |
| Repository URL, 3–5-minute video URL, access, time, deadline | 18 | Final URL/duration/access checks in 18 |
| Email criteria E1–E5 | Criteria table above | 15, 17–18 |

## Step completion tracker

Do not pre-check these while writing documentation. Update each only after executing its exit checks; retain separate pending subitems for unverified live inference or delivery actions.

- [x] Step 01 — Foundation.
- [x] Step 02 — Domain and validation.
- [x] Step 03 — Workbook and production comparisons.
- [x] Step 04 — Planning engine.
- [x] Step 05 — Six core test groups.
- [x] Step 06 — Routes and workspace state.
- [x] Step 07 — Overview.
- [x] Step 08 — Production.
- [x] Step 09 — Commercial.
- [x] Step 10 — Allocation/local trace.
- [x] Step 11 — Evidence and summaries.
- [x] Step 12 — OpenRouter adapter and recorded live-check status (live inference unverified without a private key).
- [x] Step 13 — Assistant panel and tests (live inference remains unverified without a private key).
- [x] Step 14 — UX/accessibility/failure review (screen-reader session not performed; live inference remains unverified).
- [x] Step 15 — Acceptance and changed inputs (acceptance I awaits Step 16 clean-clone proof).
- [ ] Step 16 — Clean-clone proof.
- [ ] Step 17 — README and transparency.
- [ ] Step 18 — Walkthrough and submission assets.
