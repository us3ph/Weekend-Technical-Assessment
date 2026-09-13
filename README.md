# Atlas Fresh — Daily Apple Export Planner

A browser workspace for the daily Production–Commercial committee: compare expected production with actual receipts, prepare a traceable export allocation, and explain client risk and local-market residuals. All assessment data is synthetic. Final approval remains with the teams.

## Current status

Step 11 completes the connected Production, Commercial, and Allocation & Local trace workspace plus the server-owned evidence boundary. After loading, the decision overview can focus all 20 farm records on a segment, client, or local residual; each farm keeps planned capacity/mix separate from actual receipts and exposes keyboard-operable expected/actual, balance, residual, and served-client details. After plan generation, Commercial prioritizes the three at-risk clients while retaining all seven complete orders, with processing-point shortage evidence and farm-segment allocation drill-downs. The trace view lists every export allocation and local residual, exposes per-farm/segment conservation, and carries allocation/local row selections through shared navigation. The evidence catalog now derives version-bound risk, production-gap, and local-residual facts, validates strict fact-ID selections, and renders deterministic summaries without a key. The OpenRouter provider and browser assistant panel remain later steps.

Follow [steps.md](steps.md) one step at a time. The technical/business specification is in [PROJECT_PLAN.md](PROJECT_PLAN.md); actual progress and checks are recorded in [docs/work-log.md](docs/work-log.md).

## Start locally

Prerequisites: Git, Node.js **24.21.0**, and npm **11.19.0** (bundled with that Node release). Initial installation needs internet access to download dependencies. No API key, database, Docker, or local AI runtime is needed.

From the repository root — the directory containing `package.json` — use nvm to select the pinned runtime, then start:

```bash
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

## Configuration

No environment file is required for the current application. `.env.example` documents optional settings for later steps. When needed, copy it to the Git-ignored `.env.local` and edit it privately:

- `OPENROUTER_API_KEY`: optional server-only key for the future explanation assistant; never use `NEXT_PUBLIC_*` for it or commit a real value.
- `OPENROUTER_MODEL`: defaults to `openrouter/free`; the planned integration permits free hosted models only.
- `WORKBOOK_PATH`: optional server-only override for a separate edited XLSX copy. Leave it unset to use the supplied root workbook.

The OpenRouter provider remains a placeholder until Step 12. Workbook loading, planning, the server-owned evidence catalog, and deterministic summaries need no API key; configured OpenRouter use will require internet and a private API key. The deterministic summary is always labelled `Deterministic summary — no model used` and is not presented as model output.

## Workbook loading

`GET /api/workbook` reads `Atlas_Fresh_Production_Commercial_Data.xlsx` from the repository root by default. It returns validated source records, source sheet/row/cell locations, a content-derived SHA-256 input version, data health, and production comparisons. The route is uncached and never accepts a browser-provided filesystem path.

To test a changed workbook, copy the original first, edit only the copy, and start the server with an absolute or repository-relative override:

```bash
cp Atlas_Fresh_Production_Commercial_Data.xlsx /tmp/atlas-fresh-edited.xlsx
WORKBOOK_PATH=/tmp/atlas-fresh-edited.xlsx npm run dev
```

Reload the workspace or request `http://localhost:3000/api/workbook` again after changing the copy. Unset `WORKBOOK_PATH` and restart to return to the authoritative root workbook. Never edit or replace the supplied original.

## Architecture and choices

- Next.js App Router with React and TypeScript keeps the interface and future server routes in one application with one install/start path.
- CSS Modules and system fonts provide a small, maintainable visual foundation without a UI framework or build-time font download.
- `src/lib/types.ts` defines source-backed inputs separately from calculated outputs; `src/lib/validation.ts` applies Zod structure checks and Decimal-based domain rules without importing React, Next.js, or network code. `src/lib/planner.ts` applies the exact price/ID, compatibility, quality-fit, 5 t, capacity, shortage-reason, residual, and conservation policy on the server.
- `src/lib/evidence.ts` builds stable, input-version-bound facts for client risk, farm/segment production gaps, and local residuals. `src/lib/assistant.ts` classifies only supported planning topics, validates strict intent/fact-ID selections and required coverage, and renders only server-approved factual text and citations. It does not call a model.
- Vitest is configured for `tests/**/*.test.ts` in a Node environment. The suite covers validation, workbook loading, the decision overview projection, six explicit offline core groups (T1–T6), allocation/local trace projections and rendering, and grounded evidence/summary boundaries, including changed-input and invariant checks; provider and panel checks arrive in Steps 12–13.
- The supplied workbook is the authoritative input. Computed results will remain transient; this single-snapshot assessment does not need database persistence.
- OpenRouter will use native server-side `fetch`; the model will explain server-calculated facts and will never choose allocations or calculate KPIs.

The current source is `src/app` (layout, root page, global/page CSS, and the workbook/plan routes), `src/components` (shared header, planning workspace, decision overview, Production view, Commercial view, and Allocation & Local trace), and `src/lib` (domain contracts, validation, workbook parsing, production calculations, planning, overview, farm/client/trace projections, workspace state, evidence, and deterministic assistant boundaries). Dependencies are exact-pinned in `package.json` with transitive versions captured in `package-lock.json`.

## Domain contract and validation

`src/lib/validation.ts` accepts normalized source rows with unknown values and returns either a typed input snapshot or source-aware validation issues. `src/lib/workbook.ts` reads the supported literal-cell tables using `read-excel-file/node`, preserves 1-based Excel locations, and rejects missing table structure before validation. `src/lib/calculations.ts` computes expected segment tonnes, actual totals, and variances on the server. `src/lib/planner.ts` creates private available balances from actual receipts, allocates in 5 t units, and calculates trace rows, residuals, outcomes, and KPIs without mutating source inputs. Farms, clients, station parameters, and reference prices retain their source sheet, row, and cell metadata. Calculated comparisons, allocations, balances, outcomes, and KPIs have separate output types in `src/lib/types.ts`, so source inputs cannot be confused with later results.

The validator rejects missing/non-finite numbers, duplicate or blank IDs, unsupported modes or segments, incomplete/duplicate references, invalid mix totals, negative values, invalid precision, and quantities that are not multiples of 5 t. Expected mix totals use `decimal.js` equality. A zero-demand client is treated as `COMPLETE`; ratios whose denominator is zero are represented as `null` and must be shown as `N/A` by later views.

After a plan exists, `src/lib/evidence.ts` derives the smallest relevant context for three supported topics: every at-risk client, ranked farm/segment and aggregate production gaps, and the current local residual with segment composition, constraints, and calculated reference value. Every fact carries the plan's content-derived input version, exact server values, server-owned allowed text, and references that resolve to existing farm, client, segment, allocation, or residual records. `src/lib/assistant.ts` accepts only a strict intent plus ordered fact IDs; unknown, cross-intent, duplicate, stale, or incomplete selections are rejected. Deterministic answers render catalog text and references only, while questions about weather, future forecasts, logistics, approvals, or external actions are explicitly unavailable in this snapshot.

The workbook reader is [read-excel-file](https://github.com/catamphetamine/read-excel-file). A dependency smoke check confirmed that its Node entry point reads the original workbook's XML namespaces, row positions, IDs, and numbers without modifying the file. This replaces the initial ExcelJS choice, which failed on that workbook.

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

## Transparency

This is an incomplete assessment implementation at Step 11. Workbook loading, validation, production comparisons, the deterministic planning engine, six core offline test groups, the planning route, the Load → Compare → Plan workspace, the decision overview, farm-level Production view, client-level Commercial view, connected Allocation & Local trace, version-bound evidence catalog, strict fact selection, and deterministic no-key summaries are available. The real OpenRouter path, browser assistant panel, formal UX/accessibility review, acceptance audit, clean-clone proof, and delivery assets remain for later steps. [The work log](docs/work-log.md) records AI coding assistance, actual checks, time evidence, and remaining work.
