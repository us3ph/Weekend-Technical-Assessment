# Atlas Fresh — Daily Apple Export Planner

A browser workspace for the daily Production–Commercial committee: compare expected production with actual receipts, prepare a traceable export allocation, and explain client risk and local-market residuals. All assessment data is synthetic. Final approval remains with the teams.

## Current status

Step 02 establishes the shared domain contracts and server-side validation: source-backed records retain workbook locations, valid inputs become typed immutable data, and invalid values return actionable structured issues. Workbook loading, allocation, business views, and the OpenRouter assistant are not implemented yet. The page shows no invented results.

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
| `npm test` | Run the current Vitest validation suite once. |
| `npm run build` | Build the production application. |
| `npm start` | Serve the existing production build on port 3000. |

Stop the development server before serving production on the same port. Validation coverage begins in Step 02 and is completed across the core test groups in Step 05; assistant checks arrive in Step 13. Step 01 smoke checks are recorded separately, not represented as domain coverage.

## Configuration

No environment file is required for the current application. `.env.example` documents optional settings for later steps. When needed, copy it to the Git-ignored `.env.local` and edit it privately:

- `OPENROUTER_API_KEY`: optional server-only key for the future explanation assistant; never use `NEXT_PUBLIC_*` for it or commit a real value.
- `OPENROUTER_MODEL`: defaults to `openrouter/free`; the planned integration permits free hosted models only.
- `WORKBOOK_PATH`: future server-only override for a separate edited XLSX copy. Leave it unset to use the supplied root workbook when Step 03 implements loading.

These settings remain placeholders until the workbook and assistant steps. No workbook or inference request is performed yet. Later OpenRouter use will require internet and an API key; the core planner and honest deterministic summary will remain available without a key. Free-model quotas and availability will be handled in the integration step.

## Architecture and choices

- Next.js App Router with React and TypeScript keeps the interface and future server routes in one application with one install/start path.
- CSS Modules and system fonts provide a small, maintainable visual foundation without a UI framework or build-time font download.
- `src/lib/types.ts` defines source-backed inputs separately from calculated outputs; `src/lib/validation.ts` applies Zod structure checks and Decimal-based domain rules without importing React, Next.js, or network code. Future modules will add workbook parsing, allocation, and grounded evidence.
- Vitest is configured for `tests/**/*.test.ts` in a Node environment. The current validation suite covers representative valid data and the initial T6 invalid-input subcases; the remaining core groups are scheduled for Step 05.
- The supplied workbook is the authoritative input. Computed results will remain transient; this single-snapshot assessment does not need database persistence.
- OpenRouter will use native server-side `fetch`; the model will explain server-calculated facts and will never choose allocations or calculate KPIs.

The current source is `src/app` (layout, root page, global/page CSS), `src/components` (shared header), and `src/lib` (domain contracts and validation). Dependencies are exact-pinned in `package.json` with transitive versions captured in `package-lock.json`.

## Domain contract and validation

`src/lib/validation.ts` accepts normalized source rows with unknown values and returns either a typed input snapshot or source-aware validation issues. Farms, clients, station parameters, and reference prices retain their source sheet, row, and cell metadata. Calculated comparisons, allocations, balances, outcomes, and KPIs have separate output types in `src/lib/types.ts`, so source inputs cannot be confused with later results.

The validator rejects missing/non-finite numbers, duplicate or blank IDs, unsupported modes or segments, incomplete/duplicate references, invalid mix totals, negative values, invalid precision, and quantities that are not multiples of 5 t. Expected mix totals use `decimal.js` equality. A zero-demand client is treated as `COMPLETE`; ratios whose denominator is zero are represented as `null` and must be shown as `N/A` by later views.

The workbook reader is [read-excel-file](https://github.com/catamphetamine/read-excel-file). A dependency smoke check confirmed that its Node entry point reads the original workbook's XML namespaces, row positions, IDs, and numbers without modifying the file. This replaces the initial ExcelJS choice, which failed on that workbook. The application loader itself is still scheduled for Step 03.

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

This is an incomplete assessment implementation at Step 02. There is no workbook loader, planning engine, business UI, or live AI integration yet. [The work log](docs/work-log.md) records AI coding assistance, actual checks, time evidence, and remaining work. The final delivery notes, clean-clone acceptance audit, and 3–5-minute walkthrough are scheduled in later steps.
