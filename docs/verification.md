# Step 15 — Acceptance and changed-input verification

Date: 13 September 2026. Scope: the supplied default workbook, two temporary edited workbook copies, the production build, and the browser workflow. The edited copies were created outside the repository and were never used to replace the authoritative source.

## Result summary

Acceptance A–I and email criteria E1–E5 have recorded evidence below. The Step 16 section records the clean-clone installation/start/tests/build proof separately from the Step 15 source-change audit.

| Requirement | Actual result | Evidence |
| --- | --- | --- |
| A — Correct input totals, segments, and capacity | PASS. The default API/UI showed 20 farms, 10 clients, station capacity 500 t, expected 600 t, actual 560 t, and A/B/C/D variances of -11.7/-8.3/-27.9/+7.9 t. | `GET /api/workbook`, browser baseline review, T1/T6 |
| B — Exact export/local/rate/value baseline | PASS. The plan returned 500 t export, 60 t local, 89.3% export rate, EUR 549,500 export revenue, EUR 4,500 local value, and EUR 554,000 total value. | `POST /api/plan`, Decision overview UI, T1/T5 |
| C — C02/C09 segment shortages; C08 capacity shortage | PASS. C02 is 40/50 t with 10 t remaining and `INSUFFICIENT_COMPATIBLE_SEGMENT`; C09 is 30/50 t with 20 t remaining and the same reason; C08 is 20/50 t with 30 t remaining and `STATION_CAPACITY_REACHED`. | Plan response and Commercial UI cards |
| D — Every tonne traces to a destination | PASS. The plan trace and residual tables rendered, with existing T1/T4 conservation checks covering every farm/segment balance; the browser trace showed 500 t export and 60 t local. | `src/lib/planner.ts`, Allocation & Local browser review, T1/T4 |
| E — Supply, demand, capacity, compatibility, conservation limits | PASS. Existing T2–T5 checks passed, and the changed-capacity run recalculated downstream allocation, residual, revenue, value, trace, and evidence facts without changing the policy constants. | T2–T5, changed-input API/UI review |
| F — Server validation with actionable errors | PASS. F01 `actual_A_t = 27` returned HTTP 422 with `Farms`, row 5, cell H5, entity F01, and the corrective multiple-of-5 message. Planning stayed disabled; reloading the valid source restored data health and enabled planning. | Invalid-copy API/UI and recovery browser review, T6 |
| G — Configured model path, supported evidence, honest failure | PASS with limitation. T7/T8 and the route/provider matrix passed. The existing configured smoke returned `TRUNCATED_OUTPUT`; no model answer or citation was accepted. Blank-key changed-input runs returned `MISSING_API_KEY`; unsupported questions reported that no model request was made. | T7/T8, assistant route tests, actual provider status, stale checks |
| H — Coherent workflow, business connections, loading/errors, accessibility | PASS for the reviewed scope. Default and changed plans flowed through overview, Commercial, trace, assistant evidence, reset, and recovery. Step 14’s 1024/1440 px keyboard/landmark/overflow review remains the accessibility evidence; no independent usability or screen-reader session was performed. | Step 14 record, browser audit, timed self-review below |
| I — Clean-clone start/tests/build | PASS. A fresh clone outside the original directory installed, tested, linted, typechecked, built, started in production, and served the seeded workspace and deterministic no-key summary with no private configuration. | Step 16 section below |

## Baseline and changed-input results

The default source content version was `46620fea508ebcdac184c5f8514d7f15f44c9863380ee8e410a1b1091bb923cb`. The browser review at 1440 px confirmed that plan-dependent values were “Not calculated yet” before planning, then showed the baseline values in the first decision view. It retained all ten client cards, seven complete orders, the three required risk cards, the dynamic `60 t` local question, a deterministic no-key answer, and grounded C02 evidence.

A valid temporary copy changed only Station `B5` (`export_conditioning_capacity_t`) from 500 to 495. With `WORKBOOK_PATH` selected, the API and browser both showed:

- 495 t exported and 65 t local; station utilization remained 100%.
- EUR 546,000 export revenue, EUR 4,875 local value, and EUR 550,875 total value.
- C08 at 15 t allocated and 35 t remaining, still `STATION_CAPACITY_REACHED`.
- C02 at 40 t/10 t and C09 at 30 t/20 t, both retaining `INSUFFICIENT_COMPATIBLE_SEGMENT`.
- The trace changed to 65 t and EUR 4,875, while local evidence and the assistant’s server-owned answer changed to the new capacity/value. The suggested question changed to “Why are 65 t going local, and what is its estimated value?”.

The changed copy’s content version was `461c35006a27323dfb6c0c3371e8f12fb2161bd355ba8d01daa6fe5fad4641dd`. Sending the old default version to both `/api/plan` and `/api/assistant` returned HTTP 409 `STALE_INPUT_VERSION`. In the browser, the old answer disappeared after reload; questions were disabled until the new plan existed, and the post-change grounded answer did not reuse the old 60 t text.

A separate invalid temporary copy changed only F01’s Farms `H5` (`actual_A_t`) from 25 to 27. `GET /api/workbook` and `POST /api/plan` returned HTTP 422. The browser displayed the source-specific `Farms row 5, H5` message, disabled Generate plan, and recovered to valid data after the copy was replaced by the default source and Reload workbook was pressed.

## Automated and browser checks

Under Node.js 24.21.0 / npm 11.19.0:

- `npm test` — 14 files, 117 tests passed.
- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `npm run build` — passed; the four application routes built, with workbook/plan/assistant routes dynamic.
- `git diff --check` — passed.
- `sha256sum --check docs/source-checksums.sha256` — original workbook, PDF, and preserved pack README all passed.

Chrome automation self-reviewed the default and changed workflows at the target widths, including pre-plan honesty, baseline and changed metrics, C02/C09/C08 details, local evidence, invalid-source recovery, unsupported assistant behavior, no-key fallback, and stale-answer removal. The measured self-review reached an understandable planned situation in 2.37 seconds and reached an allocation trace after selecting the C02 shortage in 1.68 seconds. These are self-review timings, not an independent usability study.

## Email criteria E1–E5

| Criterion | Evidence recorded in this audit |
| --- | --- |
| E1 — Problem and business constraints | Exact price/ID and quality-fit ordering, 5 t units, capacity/compatibility/conservation rules, production-versus-actual distinction, shortage reasons, local residuals, and the human approval boundary are verified by T1–T6 and the connected views. |
| E2 — Technical choices and justification | The README and PROJECT_PLAN document the single Next.js app, server-owned validation/planning, Decimal arithmetic, no database, free-only OpenRouter path, transient calculations, evidence boundary, and trade-offs. |
| E3 — Code quality and user experience | Typed pure domain modules, 117 offline tests, connected overview/Production/Commercial/trace/assistant views, loading/error/recovery states, keyboard/focus/landmark checks, and target-width review are recorded. |
| E4 — Reproducibility | Node/npm and dependencies are pinned, the default workbook and no-key path work, and the documented commands passed in both the prior audit and the Step 16 clean clone. |
| E5 — Transparency | This record distinguishes deterministic fallback from model output, records the actual `TRUNCATED_OUTPUT` provider result and unverified successful live inference, notes the absent screen-reader session, and links the work log for actual time and Codex/OpenRouter disclosure. |

## Step 16 — Clean-clone and production-startup verification

Date: 13 September 2026. Scope: a fresh clone at `/tmp/atlas-fresh-step16.so2ehV/repo`, with the working repository and user files left in place. The clone was made from the committed Step 15 application state; the pending `.gitignore` and `steps.md` changes were documentation/ignore-only and introduced no runtime or dependency difference.

### Clean-clone checks

The clone was clean before installation. The documented `.nvmrc` selected Node.js 24.21.0 and npm 11.19.0. With `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `WORKBOOK_PATH` unset and no private `.env` file present:

- `npm ci` — passed; 381 packages added, 382 packages audited, 0 vulnerabilities. Initial installation requires network access. The existing ESLint deprecation and npm install-script notices were informational.
- `npm test` — passed; 14 files, 117 tests.
- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `npm run build` — passed; `/`, `/api/workbook`, `/api/plan`, and `/api/assistant` built successfully.

### Production and development smokes

After `npm run build`, `npm start -- --hostname 127.0.0.1 --port 3137` served the seeded page. `GET /api/workbook` returned a valid source from the clone with 20 farms, 10 clients, one station, and version `46620fea508ebcdac184c5f8514d7f15f44c9863380ee8e410a1b1091bb923cb`. Using that server-owned version, `POST /api/plan` returned 500 t export, 60 t local, EUR 549,500 export revenue, EUR 4,500 local value, and 3 at-risk clients. `POST /api/assistant` for the supported risk question returned `source=deterministic`, `Deterministic summary — no model used`, provider status `unavailable`, code `MISSING_API_KEY`, and three fact IDs.

The documented `npm run dev -- --hostname 127.0.0.1 --port 3138` command also served the page and returned the same valid workbook version. These routes resolved the bundled workbook by repository-relative startup context rather than the original absolute directory.

### Reproducibility and integrity boundaries

The clean-clone install, test, lint, typecheck, build, and no-key route smokes made no inference call and required no private account, database, local model runtime, or paid service. OpenRouter live success remains unverified as recorded in Step 15; the no-key deterministic path is the reproducible default. The tracked-file audit confirmed that source/configuration/lockfiles and the supplied workbook/PDF are tracked, while `.env.local`, `node_modules`, and `.next` are ignored and untracked. `.env.example` contains a blank API key and placeholders only; no likely provider keys or private-key markers were found in tracked files. The original workbook, supplied PDF, preserved pack README, and checksum manifest were not modified.

The first combined verification process ended before `npm ci` had completed, and two initial probe assertions used incorrect response nesting/baseline expectations. The documented commands and corrected source-derived assertions were rerun successfully; no dependency, runtime, or command fix was required.

## Remaining limitations and handoff

Successful live OpenRouter inference remains unverified: the configured smoke was truncated, so no model answer or citation was accepted. No real screen-reader session or independent usability session was performed. The authoritative workbook, supplied PDF, preserved pack README, checksum manifest, and credential files were not modified. Temporary edited copies and the verification clone were outside the repository. The next step is Step 17 README/transparency finalization.
