# Atlas Fresh — Daily Apple Export Planner

A browser workspace for the daily Production–Commercial committee: compare expected production with actual receipts, prepare a traceable export allocation, and explain client risk and local-market residuals. All assessment data is synthetic. Final approval remains with the teams.

## Current status

Step 17 completes the README, architecture decisions, and transparency record on top of the connected Production, Commercial, and Allocation & Local trace workspace. After loading, the decision overview can focus all 20 farm records on a segment, client, or local residual; each farm keeps planned capacity/mix separate from actual receipts and exposes keyboard-operable expected/actual, balance, residual, and served-client details. After plan generation, Commercial prioritizes the three at-risk clients while retaining all seven complete orders, with processing-point shortage evidence and farm-segment allocation drill-downs. The trace view lists every export allocation and local residual, exposes per-farm/segment conservation, and carries allocation/local row selections through shared navigation. The evidence catalog derives version-bound risk, production-gap, and local-residual facts, validates strict fact-ID selections, and renders deterministic summaries without a key. `POST /api/assistant` reloads the source, recomputes the plan, sends only the relevant fact context to OpenRouter when configured, and renders server-approved facts. The browser panel offers three plan-linked questions, a bounded free-text path, grounded answer provenance, actionable citations, loading/retry/cooldown states, and honest no-key/provider/stale/invalid-output handling. The default, changed-input, and clean-clone workflows passed their recorded checks; the detailed evidence is in [docs/verification.md](docs/verification.md), and the delivery disclosure is in [docs/delivery-notes.md](docs/delivery-notes.md). Walkthrough and submission assets remain for Step 18.

Follow [steps.md](steps.md) one step at a time. The technical/business specification is in [PROJECT_PLAN.md](PROJECT_PLAN.md); actual progress and checks are recorded in [docs/work-log.md](docs/work-log.md).

## Start locally

Prerequisites: Git, Node.js **24.21.0**, and npm **11.19.0** (bundled with that Node release). Initial installation needs internet access to download dependencies. No API key, database, Docker, or local AI runtime is needed.

Run every command from the repository root: the directory containing `package.json`, `src/`, and the supplied workbook. In the supplied checkout that is `/home/x-hunter/Downloads/Qarizmi_Technical_Assessment_Atlas_Fresh/Qarizmi_Atlas Fresh_Weekend_Technical_Assessment_Pack`; after cloning elsewhere, use that clone's root instead.

From the repository root — the directory containing `package.json` — use nvm to select the pinned runtime, then start:

```bash
cd "/home/x-hunter/Downloads/Qarizmi_Technical_Assessment_Atlas_Fresh/Qarizmi_Atlas Fresh_Weekend_Technical_Assessment_Pack"
nvm install
nvm use
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Stop the server with Ctrl+C. If the port is occupied, stop the other server or run `npm run dev -- --port 3001` and open that port.

If Node.js is managed with mise instead, run `mise install node@24.21.0`, then prefix the same npm commands with `mise exec node@24.21.0 --`, for example `mise exec node@24.21.0 -- npm ci`. A directly installed matching Node/npm pair also works. Package engine checks reject unsupported versions instead of silently installing with a different runtime.

## Checks and production mode

Run from the repository root after `npm ci`:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Next.js/TypeScript lint checks; warnings fail the check. |
| `npm run typecheck` | Generate Next.js route types and run strict TypeScript checks. |
| `npm test` | Run the current Vitest validation, workbook, and planning suite once. |
| `npm run build` | Build the production application. |
| `npm start` | Serve the existing production build on port 3000. |

Stop the development server before serving production on the same port. Validation coverage begins in Step 02 and is completed across the core test groups in Step 05; allocation/local trace checks are covered in Step 10; grounded evidence and deterministic-summary checks are covered in Step 11; provider and panel checks arrive in Steps 12–13. Step 01 smoke checks are recorded separately, not represented as domain coverage.

The development and production paths are alternatives. For production, run `npm run build` and then `npm start` from the same repository root. For development, use `npm run dev`; pass a different port only when needed, for example `npm run dev -- --port 3001`.

## Configuration

No environment file is required to run the current application. `.env.example` documents optional server-only settings. When needed, copy it to the Git-ignored `.env.local` and edit it privately:

- `OPENROUTER_API_KEY`: optional server-only key for the explanation route; never use `NEXT_PUBLIC_*` for it or commit a real value. Create/configure it privately in OpenRouter's [key settings](https://openrouter.ai/settings/keys).
- `OPENROUTER_MODEL`: defaults to `openrouter/free`. The server accepts only that free router or an explicitly configured zero-cost model ID ending in `:free`; paid IDs are rejected before inference and returned model metadata must also be free.
- `WORKBOOK_PATH`: optional server-only override for a separate edited XLSX copy. Leave it unset to use the supplied root workbook.

Workbook loading, planning, the server-owned evidence catalog, and deterministic summaries need no API key. Configured OpenRouter use requires internet access, a private API key, and available free-model capacity. The adapter uses native server-side `fetch` against OpenRouter's [chat completions endpoint](https://openrouter.ai/docs/api_reference/authentication), sends non-streaming strict JSON Schema output, records the requested and returned free model, and never sends a request from the browser. The deterministic summary is always labelled `Deterministic summary — no model used` and is not presented as model output. OpenRouter free routing and availability are subject to the current [free-router behavior](https://openrouter.ai/docs/guides/routing/routers/free-router) and [rate/credit limits](https://openrouter.ai/docs/api_reference/limits).

To enable the optional provider, copy `.env.example` to the ignored `.env.local`, set the key privately, optionally set a currently available model ID ending in `:free`, and restart the development or production process. No alternative free model was used or verified for this assessment; the default `openrouter/free` route remains the recorded configuration. Without a key, the product returns the deterministic summary and an `AI unavailable` diagnostic. On provider, network, timeout, refusal, truncation, invalid-output, rate-limit, or paid-model errors, the model result is not accepted; the UI keeps the failure separate from any deterministic fallback and offers an explicit retry where appropriate.

## Workbook loading

`GET /api/workbook` reads `Atlas_Fresh_Production_Commercial_Data.xlsx` from the repository root by default. It returns validated source records, source sheet/row/cell locations, a content-derived SHA-256 input version, data health, and production comparisons. The route is uncached and never accepts a browser-provided filesystem path.

To test a changed workbook, copy the original first, edit only the copy, and start the server with an absolute or repository-relative override:

```bash
cp Atlas_Fresh_Production_Commercial_Data.xlsx /tmp/atlas-fresh-edited.xlsx
WORKBOOK_PATH=/tmp/atlas-fresh-edited.xlsx npm run dev
```

Reload the workspace or request `http://localhost:3000/api/workbook` again after changing the copy. Unset `WORKBOOK_PATH` and restart to return to the authoritative root workbook. Never edit or replace the supplied original.

Environment variables are read by the server. Restart the running process after changing `.env.local` or `WORKBOOK_PATH`; then use `Load workbook`/Reload in the interface and regenerate the plan. The browser cannot provide a filesystem path or authoritative KPI/allocation data.

## Architecture and choices

- Next.js App Router with React and TypeScript keeps the interface and future server routes in one application with one install/start path.
- CSS Modules and system fonts provide a small, maintainable visual foundation without a UI framework or build-time font download.
- `src/lib/types.ts` defines source-backed inputs separately from calculated outputs; `src/lib/validation.ts` applies Zod structure checks and Decimal-based domain rules without importing React, Next.js, or network code. `src/lib/planner.ts` applies the exact price/ID, compatibility, quality-fit, 5 t, capacity, shortage-reason, residual, and conservation policy on the server.
- `src/lib/evidence.ts` builds stable, input-version-bound facts for client risk, farm/segment production gaps, and local residuals. `src/lib/assistant.ts` classifies supported planning topics, validates strict intent/fact-ID selections and required coverage, and renders only server-approved factual text and citations. `src/lib/openrouter.ts` is a bounded, free-only native-fetch adapter; `src/app/api/assistant/route.ts` reloads the source and recomputes evidence for each request.
- Vitest is configured for `tests/**/*.test.ts` in a Node environment. The suite covers validation, workbook loading, the decision overview projection, six explicit offline core groups (T1–T6), allocation/local trace projections and rendering, grounded evidence/summary boundaries, and the T7/T8 assistant groups for server-owned answers, citations, provider failures, stale versions, and tampered browser payloads. Browser interaction checks cover the assistant in Step 13 and the full responsive/accessibility/failure-state review in Step 14.
- The supplied workbook is the authoritative input. Computed results will remain transient; this single-snapshot assessment does not need database persistence.
- OpenRouter uses native server-side `fetch`; the model selects only server fact IDs and never chooses allocations, calculates KPIs, writes files, approves a plan, or takes an external action.

The current source is `src/app` (layout, root page, global/page CSS, and the workbook/plan/assistant routes), `src/components` (shared header, planning workspace, decision overview, Production view, Commercial view, Allocation & Local trace, and Assistant panel), and `src/lib` (domain contracts, validation, workbook parsing, production calculations, planning, overview, farm/client/trace projections, workspace state, evidence, deterministic assistant boundaries, and the OpenRouter adapter). Dependencies are exact-pinned in `package.json` with transitive versions captured in `package-lock.json`.

### Server routes and data flow

| Route | Server-owned behavior |
| --- | --- |
| `GET /api/workbook` | Reads the default workbook or server-only `WORKBOOK_PATH`, validates it, computes expected-versus-actual comparisons, and returns the content-derived SHA-256 input version and data health. |
| `POST /api/plan` | Accepts only the input version, reloads and validates the source, runs the deterministic planner, and returns allocations, balances, outcomes, explanations, trace rows, and KPIs. |
| `POST /api/assistant` | Accepts only a bounded question and input version, reloads and replans the source, builds relevant evidence, then uses the optional OpenRouter selector or deterministic summary. |

All three routes are dynamic and sent with `Cache-Control: no-store`. The browser never supplies or authorizes a plan, KPI, allocation, filesystem path, approval, or external action. A stale content version produces a reloadable conflict instead of mixing snapshots; invalid source data prevents planning and returns source-aware issues.

## Domain contract and validation

`src/lib/validation.ts` accepts normalized source rows with unknown values and returns either a typed input snapshot or source-aware validation issues. `src/lib/workbook.ts` reads the supported literal-cell tables using `read-excel-file/node`, preserves 1-based Excel locations, and rejects missing table structure before validation. `src/lib/calculations.ts` computes expected segment tonnes, actual totals, and variances on the server. `src/lib/planner.ts` creates private available balances from actual receipts, allocates in 5 t units, and calculates trace rows, residuals, outcomes, and KPIs without mutating source inputs. Farms, clients, station parameters, and reference prices retain their source sheet, row, and cell metadata. Calculated comparisons, allocations, balances, outcomes, and KPIs have separate output types in `src/lib/types.ts`, so source inputs cannot be confused with later results.

The validator rejects missing/non-finite numbers, duplicate or blank IDs, unsupported modes or segments, incomplete/duplicate references, invalid mix totals, negative values, invalid precision, and quantities that are not multiples of 5 t. Expected mix totals use `decimal.js` equality; calculations use Decimal values and round only for display. Allocations, actual receipts, client demand, and station capacity remain in 5 t units, while expected capacity and expected segment tonnes are not incorrectly forced onto that grid. A zero-demand client is treated as `COMPLETE`; ratios whose denominator is zero are represented as `null` and shown as `N/A` with context. No `NaN` or `Infinity` is emitted.

After a plan exists, `src/lib/evidence.ts` derives the smallest relevant context for three supported topics: every at-risk client, ranked farm/segment and aggregate production gaps, and the current local residual with segment composition, constraints, and calculated reference value. Every fact carries the plan's content-derived input version, exact server values, server-owned allowed text, and references that resolve to existing farm, client, segment, allocation, or residual records. `src/lib/assistant.ts` accepts only a strict intent plus ordered fact IDs; unknown, cross-intent, duplicate, stale, or incomplete selections are rejected. Deterministic answers render catalog text and references only, while questions about weather, future forecasts, logistics, approvals, or external actions are explicitly unavailable in this snapshot.

The workbook reader is [read-excel-file](https://github.com/catamphetamine/read-excel-file). A dependency smoke check confirmed that its Node entry point reads the original workbook's XML namespaces, row positions, IDs, and numbers without modifying the file. This replaces the initial ExcelJS choice, which failed on that workbook.

The planner is deterministic: clients sort by export price descending and then `client_id`; compatible farm/segment balances sort by smallest quality upgrade and then `farm_id`; MINIMUM clients consume the requested segment before better-quality upgrades. It allocates consecutive 5 t units until demand, compatible supply, or station capacity is exhausted, fixes the shortage reason at that client's processing point, sends remaining actual tonnes local, and returns stable trace ordering. Exported fruit earns the served client's price; local value uses each residual segment's reference price and the station local ratio.

ESLint remains on 9.39.5 because the Next.js configuration's React plugin does not yet declare ESLint 10 compatibility; npm may report its deprecation. The work log records dependency audit results and installation warnings.

## Assessment materials and integrity

The original files are preserved:

- `Atlas_Fresh_Production_Commercial_Data.xlsx` — unchanged authoritative data, outside `public/`.
- `Qarizmi_Atlas Fresh_Weekend_Technical_Assessment.pdf` — the supplied nine-page brief.
- [docs/assessment-pack-readme.md](docs/assessment-pack-readme.md) — byte-for-byte copy of the pack README, including its outdated PDF/DOCX filenames.

The actual supplied PDF is the one named above; no DOCX was included. Verify the originals from the repository root on Linux with:

```bash
sha256sum --check docs/source-checksums.sha256
```

Use a separate workbook copy for future changed-input checks. Do not replace the original with edited data or saved results.

## Assumptions, boundaries, and decisions

The supported input is the supplied literal-cell layout: `Read Me`, `Farms`, `Clients`, and `Station` sheets with the declared tables and headers. This is a single synthetic daily snapshot and one station, not a general spreadsheet importer. The workbook contains no farm-to-client assignments, so the interface describes shared segment supply evidence and never claims that a particular farm caused a particular client shortage.

The workspace is designed for the reviewed 1024 px and 1440 px widths, with the assistant beside the trace only when the wider layout supports it. Dense tables scroll within labelled regions; the page itself avoids horizontal overflow. The UI retains semantic tables, native expandable details, visible focus, status/alert messaging, and reduced-motion-aware cross-view navigation. This is a browser review, not a completed screen-reader or independent usability study.

The application is read-only with respect to planning: it prepares a recommendation for Production and Commercial, while final approval and execution stay with the teams. There is no database because the assessment is a single snapshot; the source workbook is reloaded for each route and calculated results are transient. This keeps the clean start reproducible and avoids stale process-local state, at the cost of not providing history, approvals, or multi-day collaboration.

The main trade-offs are deliberately small and explicit: a fixed workbook reader is more reliable for the supplied format than a generic importer; pure server-independent domain modules make the policy and tests auditable; Decimal arithmetic avoids money/ratio drift; native HTML/CSS avoids an additional UI dependency; and the model is constrained to selecting server fact IDs rather than generating business numbers. These choices address the five evaluation criteria as follows:

| Criterion | Evidence in this project |
| --- | --- |
| E1 — Problem and constraints | Exact ordering, compatibility, capacity, conservation, 5 t, shortage-reason, production-versus-actual, local-residual, and human-approval boundaries. |
| E2 — Technical choices | Next.js App Router, server validation/planning, `read-excel-file`, Zod, Decimal, no database, native server-side OpenRouter fetch, and free-only model policy. |
| E3 — Code and UX | Typed pure modules, 117 offline tests, connected decision views, evidence navigation, loading/errors/recovery, keyboard review, and target-width checks. |
| E4 — Reproducibility | Pinned Node/npm and lockfile, default workbook, no-key startup, documented commands, and the Step 16 clean-clone proof. |
| E5 — Transparency | Actual verification, the rejected truncated provider smoke, explicit screen-reader/usability omissions, AI-use disclosure, time record, and [delivery notes](docs/delivery-notes.md). |

The next three production steps are intentionally outside this assessment: validate the workflow and allocation policy with committee users; add versioned daily snapshots and explicit human approval records; then harden access controls, monitoring, and provider reliability.

## Transparency

The application implementation and verification are complete through Step 17. Workbook loading, validation, production comparisons, the deterministic planning engine, six core offline test groups, the planning route, the Load → Compare → Plan workspace, the decision overview, farm-level Production view, client-level Commercial view, connected Allocation & Local trace, version-bound evidence catalog, strict fact selection, deterministic no-key summaries, the free-only OpenRouter adapter, the assistant route, the browser assistant panel, T7/T8, the formal responsive/accessibility/failure-state review, the acceptance/changed-input audit, and the clean-clone/production-startup proof are available. Walkthrough, repository publication, video, optional deployment, and submission-email assets remain for Step 18. A live smoke was attempted with the already-present ignored private configuration; OpenRouter returned `TRUNCATED_OUTPUT`, so no model answer or citation was accepted. The key was not printed, returned to the browser, or committed; successful live inference remains unverified. No real screen-reader or independent usability session was performed. [The work log](docs/work-log.md), [verification record](docs/verification.md), and [delivery notes](docs/delivery-notes.md) record AI coding assistance, actual checks, time evidence, limitations, and remaining delivery work.
