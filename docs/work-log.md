# Work log

Record actual work and checks, not the schedule's estimates. Dates below use UTC. The assessment caps total effort at 12 hours, including planning, implementation, fixes, and delivery.

## Prior planning — 12 September 2026

- Read the email, nine-page brief, and all workbook sheets; calculated production comparison totals; wrote `PROJECT_PLAN.md` and `steps.md`.
- Selected OpenRouter free hosted models, documented the five evaluation criteria, and mapped the mandatory workflow and delivery requirements.
- AI coding assistance: Codex assisted with document/data inspection and planning. These activities are separate from the future in-product OpenRouter integration.
- Actual effort: not timed in those turns; the candidate must supply an honest estimate. The plan's 30-minute allowance is not a measured duration.
- Existing planning commit at the start of Step 01: `b013b3a`.

## Step 01 — Application foundation

- Started: 2026-09-12 20:47:59 UTC. Completion time and measured session duration will be recorded after verification.
- Initial repository: clean `main`, with the two planning files committed. No applicable `AGENTS.md` files were present.
- The workbook, PDF, and pack README were absent from the working tree. Restored those exact files from the original assessment ZIP in Downloads; their SHA-256 hashes match the earlier planning inspection. Preserved the pack README separately under `docs/` before replacing the root README.
- Installed and selected Node.js 24.21.0 / npm 11.19.0 for task commands without changing the user's global runtime default. `.nvmrc` and package engines pin the documented project runtime.
- Manually scaffolded Next.js App Router, strict TypeScript, CSS Modules, a semantic empty workspace, and a reusable header. No remote fonts, images, or model calls are needed to render the shell.
- Added exact dependency versions and npm lockfile, ESLint/Vitest configuration, run/check scripts, secret ignores, and placeholder OpenRouter configuration. Marked the project as ESM so Vitest loads its configuration without a CommonJS/ESM warning.
- Reader compatibility correction: an actual-file smoke check failed in ExcelJS 4.4.0 (`workbook.sheets` undefined). Inspection showed valid `x:workbook` / `x:sheets` elements in the supplied XML, while ExcelJS's parser matches unprefixed tag names. Replaced it with read-excel-file 9.3.10; a read-only smoke check passed for all four sheets, original row indexes, IDs, and numeric fractions using `trim: false`. Updated the plan and Step 03 instructions to match. This is dependency verification, not a workbook-route implementation.
- Removing ExcelJS also removed its vulnerable transitive UUID dependency; no override remains in the final package configuration. The earlier audit found two moderate entries for that dependency chain; the updated installation reported zero vulnerabilities. Retained ESLint 9.39.5 because the Next.js React plugin's declared peer range excludes ESLint 10, despite npm's deprecation notice.
- npm reports an unapproved optional `unrs-resolver` postinstall script; no script approval was added. The installed platform dependencies are sufficient for the verified lint/build commands.
- Architecture choice: one application and shared TypeScript reduce setup overhead; future server modules will own workbook validation and planning. read-excel-file, Zod, and decimal.js are installed for those later steps. No database, separate backend, provider SDK, or empty domain modules were added.
- The first development startup generated framework-owned `AGENTS.md` and `CLAUDE.md`. Read their instructions and the relevant bundled Next.js guides; preserve these generated instruction files in Git as the framework requests.
- Next.js setup/lint configuration follows the official [installation](https://nextjs.org/docs/app/getting-started/installation) and [ESLint](https://nextjs.org/docs/app/api-reference/config/eslint) guidance. Business tests will use [Vitest](https://vitest.dev/guide/).
- Verification completed: `npm ci` succeeded under Node 24.21.0 / npm 11.19.0; `npm run lint`, `npm run typecheck`, and `npm run build` passed; `npm audit --audit-level=moderate` reported zero vulnerabilities. A production server responded HTTP 200 and a response smoke check confirmed English metadata, truthful empty state, skip link, no `x-powered-by` header, and no exposed key. Screenshots were checked at 1440×1000 and 1024×768; the shell remained readable with no page-wide overflow.
- Verification completed: read-excel-file 9.3.10 read all four original workbook sheets, row positions, IDs, decimal fractions, and numeric cells without changes. Original PDF/workbook/preserved README hashes passed. Secret ignore checks and `git diff --check` passed.
- Expected limitation: `npm test` exits 1 with `No test files found`. This is intentional at Step 01; no domain test coverage exists yet and Step 02/05 must add it. No live OpenRouter inference was attempted because this step only creates configuration placeholders; no API key is required or stored.
- npm install emitted a warning about an unapproved optional `unrs-resolver` postinstall script; it did not affect the verified checks. ESLint 9.39.5 emits a deprecation warning, documented in the README, because the Next.js React plugin's declared peer range excludes ESLint 10.
- Approximate active effort for Step 01: 1 hour 15 minutes, including the workbook-reader compatibility investigation, setup, documentation, checks, and cleanup. An interruption/overnight wall-clock gap is excluded. The candidate should revise this estimate if their own timer differs.
- Step 01 exit condition passed. The next step is Step 02, domain contracts and validation; it was not executed as part of Step 01.

## Step 02 — Domain contracts and server validation — 13 September 2026

- Completed the domain contract and validation step. Approximate active effort: 35 minutes, including implementation, fixture correction, documentation, and verification; no idle wall-clock time is included.
- Added `src/lib/types.ts` with source-backed raw records, validated farm/client/station/reference inputs, content-version and snapshot contracts, calculated comparison/allocation/balance/outcome/KPI shapes, and structured validation issues. Source inputs and calculated outputs are separate types.
- Added `src/lib/validation.ts`, a React/network-independent Zod structure gate and Decimal-based validator. It validates IDs, station cardinality, modes, A/B/C/D segments and reference uniqueness, finite numeric values, mix bounds/exact totals, expected-capacity precision, 5 t quantity rules, prices, and local ratio. It never coerces or repairs invalid input and includes sheet/row/cell/entity/field/corrective metadata in issues.
- Added `tests/validation.test.ts` with 15 focused checks covering a valid representative snapshot, source metadata, duplicate/missing IDs, invalid modes/segments, reference/station errors, mix arithmetic, negative/non-finite values, capacity precision, non-5 t quantities, non-mutation, and the initial T6 subcases. Zero-demand `COMPLETE` and zero-denominator `N/A` behavior are documented in the contracts and README for later result/UI work.
- Updated `README.md`, `steps.md`, and `PROJECT_PLAN.md` to reflect the Step 02 boundary and current validation coverage. Step 03 workbook parsing and production comparisons were not started.
- Verification passed: `npm test` (15 tests), `npm run lint`, `npm run typecheck`, `git diff --check`, and `sha256sum --check docs/source-checksums.sha256` (workbook, PDF, and preserved README all OK).
- Limitation: the validator accepts optional source metadata for small unit fixtures and supplies a fallback sheet/row; the Step 03 loader must provide exact source cell addresses. No workbook route, planning engine, browser integration, or OpenRouter request was added.
- Commit: `e10fc7f` (`feat: add domain contracts and validation`).

## Step 03 — Workbook loading and production comparisons — 13 September 2026

- Completed the workbook-loading and production-comparison step. Approximate active effort: 50 minutes, including workbook/API inspection, implementation, runtime setup, tests, build verification, and documentation; idle wall-clock time is excluded.
- Added `src/lib/workbook.ts`, a server-side `read-excel-file/node` loader using `trim: false`. It reads the fixed supported tables by their declared headers, ignores title/merged rows, preserves 1-based source cells, rejects missing headers and unsupported structure, supports `WORKBOOK_PATH`, and leaves the original workbook untouched.
- Added `src/lib/calculations.ts` for Decimal-backed expected segment tonnes, actual totals, and farm/segment/overall variances. Added `DataHealth` and `WorkbookData` contracts without mixing source records and calculated results.
- Added uncached Node `GET /api/workbook`. Valid workbook data returns the snapshot, content-derived SHA-256 version, data health, and comparisons. Validation failures return structured 422 issues; unreadable files return a safe 500 response without filesystem details or stack traces.
- Added `tests/workbook.test.ts`: the real workbook loads with 20 farms and 10 clients, source locations are retained, baseline production comparisons are reproduced (600 t expected, 560 t actual; A -11.7 t, B -8.3 t, C -27.9 t, D +7.9 t), versions are stable across reads, required headers are checked, route caching is disabled, and unreadable overrides are handled safely.
- Documented the separate-copy `WORKBOOK_PATH` override/reload procedure in `README.md`. The supplied workbook remains the default authoritative input and was not edited.
- The shell initially had Node 20.20.0 despite the prior setup note; installed and used the pinned Node 24.21.0 / npm 11.19.0 before final checks. This installation is outside the repository.
- Verification passed under Node 24.21.0 / npm 11.19.0: `npm test` (20 tests), `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`, and `sha256sum --check docs/source-checksums.sha256`. The build reports `/api/workbook` as dynamic. No OpenRouter request was made; it is outside this step.
- Limitation: the browser shell is not connected to the workbook route, and allocation/planning/business views remain for later steps. Workbook support intentionally targets the supplied literal-cell table layout rather than a generic spreadsheet importer.
- Implementation milestone commit: `faec61c` (`feat: add workbook loading and production comparisons`).

## Step 04 — Deterministic planning engine — 13 September 2026

- Completed the exact deterministic planning policy. Approximate active effort: 10 minutes, including policy review, implementation, focused tests, documentation, and verification; idle wall-clock time is excluded.
- Added `src/lib/planner.ts`. It copies actual farm-segment receipts into private Decimal balances, orders clients by export price descending then explicit ID ascending, selects EXACT/MINIMUM-compatible supply by smallest quality upgrade then farm ID, allocates 5 t units within demand/supply/station limits, and fixes each shortage reason at that client's processing point.
- Added local residual valuation from the station ratio and each residual segment's reference price, farm-segment balances, client outcomes, KPIs, stable output ordering, deterministic trace IDs, and runtime conservation/compatibility invariant checks. `src/lib/calculations.ts` now also orders farm comparisons by ID so shuffled source rows produce the same business result.
- Extended `src/lib/types.ts` with `allocationId` and `residualId` for stable trace records. The validated source snapshot remains immutable; the engine does not write to the workbook or depend on a model.
- Added `tests/planner.test.ts` with focused T1–T5 checks: real-workbook baseline, price/ID/quality ordering and shuffled-input determinism, EXACT/MINIMUM compatibility and client-price upgrade revenue, processing-time shortage reasons and zero denominators, and changed reference-price local value.
- Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (25 tests), `npm run lint`, `npm run typecheck`, and `npm run build`. The build completed with the existing dynamic `/api/workbook` route. The first attempted test command included unsupported Vitest option `--runInBand`; the documented command then passed.
- Verification also includes `git diff --check` and `sha256sum --check docs/source-checksums.sha256`; the supplied workbook, PDF, and preserved pack README remain unchanged. No live OpenRouter request was made; provider integration is outside this step.
- Limitation: Step 05 still owns completion of the full six-group core matrix, including the remaining parameterized T6 validation cases. The planning route and browser workspace are not implemented yet.
- Implementation milestone commit: `fd5f0bf` (`feat: implement deterministic planning policy`).

## Step 05 — Six core test groups — 13 September 2026

- Completed the six offline core groups with independently specified fixtures in `tests/core-groups.test.ts`; no routes, UI, assistant, or later-step features were started.
- T1 now parses the supplied workbook and asserts all published KPIs, all ten client outcomes and shortage reasons, exact residual composition, and farm-segment trace conservation.
- T2 covers price and ID ties, quality-fit before farm ID, unchanged snapshots, repeat-call determinism, and identical output after shuffling source rows.
- T3 covers EXACT/MINIMUM compatibility, requested-quality preference, rejection of worse fruit, upgrade levels, and client-price revenue.
- T4 covers demand/supply/station limits, 5 t units, per-farm-segment/global conservation, zero actual/demand/capacity cases, partial/unserved states, and shortage-reason precedence at processing time.
- T5 covers residual trace/value, reference-price changes, expected-mix changes that affect comparisons without changing actual-supply allocation, and changed supply/demand/priority/capacity behavior.
- T6 adds parameterized missing/duplicate IDs, invalid mode/segment/reference rows, incomplete references, bad mix fractions/totals, missing/string/nonfinite/negative numeric values, invalid quantities/capacity precision, station cardinality/parameters, and missing workbook headers. Assertions require source locations and corrective text.
- Approximate active effort: 55 minutes, including requirements review, fixture/test implementation, two expectation corrections found by the first run, strict TypeScript fixes, and final checks. Idle wall-clock time is excluded.
- Verification passed under Node.js 24.21.0 / npm 11.19.0: `npm test` (64 tests across 4 files), `npm run lint`, `npm run typecheck`, and `npm run build`. `git diff --check` and `sha256sum --check docs/source-checksums.sha256` also passed; all three preserved source hashes remain unchanged.
- Limitation: the browser planning route/workspace and OpenRouter assistant remain unimplemented by design; live inference was not attempted because it is outside this step.
- Milestone commit: `90753c1` (`test: complete six core test groups`).

## Step 06 — Planning routes and workspace state — 13 September 2026

- Completed the Load → Compare → Plan connection. Approximate active effort: 35 minutes, including Next.js guidance review, route/workspace implementation, one CSS Modules build fix, tests, and production-route smoke checks; idle wall-clock time is excluded.
- Added uncached `POST /api/plan`. It accepts only a strict SHA-256 input version, reloads the server-configured workbook, validates it, rejects stale versions with HTTP 409, returns source issues with HTTP 422, and never accepts browser allocations, KPIs, or filesystem paths.
- Added `src/lib/workspace.ts` with explicit unloaded, loading, loaded, planning, planned, invalid-data, server-error, and stale-result states. Request IDs ignore late responses, reset clears dependent results, and matching input versions are required before a plan enters the workspace.
- Replaced the truthful empty page with an interactive client workspace. Load/reload, Generate/Regenerate plan, Reset, loading/error/retry states, source health, server-produced comparisons, and a recommendation-only result shell are wired without browser-side business calculations or approval/execution controls.
- Added route and reducer coverage in `tests/plan-route.test.ts` and `tests/workspace.test.ts`. The assistant remains intentionally absent until Steps 11–13, so there are no assistant answers to preserve across a version change.
- Verification passed: `npm test` (71 tests across 6 files), `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`, and a production server smoke check. The smoke check returned page 200, workbook 200 with actual 560 t, matching plan 200 with 500 t export/60 t local, and stale plan 409 with `STALE_INPUT_VERSION`; the plan response was `no-store`.
- The first production build exposed unscoped element selectors in the new CSS Module; scoping table rules to the local comparison-table class fixed it before the successful build. No source workbook, PDF, or credential files were changed.
- Limitation: the detailed decision overview, production/commercial drill-downs, trace navigation, evidence catalog, and assistant are intentionally deferred to later steps. The production smoke check exercised the routes and server-rendered initial shell; a manual visual/keyboard review remains in Step 14.
- Implementation milestone commit: `feaa849` (`feat: connect planning routes and workspace state`).
