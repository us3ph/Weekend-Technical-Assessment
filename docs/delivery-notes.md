# Atlas Fresh — Delivery notes

Date: 13 September 2026
Status: Step 17 complete; Step 18 walkthrough and submission actions remain pending.

## What works

The repository contains a runnable browser workspace for the synthetic daily Production–Commercial decision:

- Load the authoritative workbook, validate source data, and compare expected production with actual receipts.
- Generate the deterministic export recommendation under the stated price, quality, compatibility, demand, station-capacity, 5 t, shortage-reason, residual, and conservation rules.
- Review the decision overview, all farms in Production, all clients in Commercial, and every export/local destination in Allocation & Local.
- Follow shared farm, segment, client, allocation, and residual selections across views.
- Ask the three supported grounded questions about client risk, production gaps, or local residual/value.
- Use a deterministic no-key summary, or optionally use the server-only OpenRouter free-model selector. The model can select fact IDs only; the server renders the approved text and citations.
- Exercise invalid workbook recovery, changed-input recalculation, stale-version protection, provider failures, cooldowns, and reset/reload behavior without changing the source workbook.

The recorded default baseline is 20 farms, 10 clients, 500 t station capacity, 560 t actual receipts, 500 t export, 60 t local, EUR 549,500 export revenue, EUR 4,500 local value, EUR 554,000 total value, and three at-risk clients. These figures are verification results from the workbook, not runtime constants.

## Verification completed

The detailed evidence is in [docs/verification.md](verification.md). Under Node.js 24.21.0 and npm 11.19.0, the clean clone passed:

- `npm ci` — 381 packages added, 382 audited, 0 vulnerabilities.
- `npm test` — 117 tests across 14 files.
- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm start` and `npm run dev` — both served the workspace and resolved the workbook from the clone's repository context.
- `sha256sum --check docs/source-checksums.sha256` — the original workbook, PDF, and preserved pack README passed.

The browser review covered the default workflow, a valid copy with station capacity changed from 500 t to 495 t, an invalid F01 actual-A value of 27 t, stale assistant results, no-key fallback, evidence navigation, target widths, keyboard/focus behavior, and representative recovery states. The measured 2.37-second decision read and 1.68-second shortage-to-trace path were self-review timings, not an independent usability study.

## Known failures and unverified paths

- A live smoke using the already-present ignored private configuration reached OpenRouter but returned `TRUNCATED_OUTPUT`. The adapter discarded it; no model answer or citation was accepted. Successful live inference and free-model availability remain unverified.
- The no-key path is the reproducible default. It returns `Deterministic summary — no model used`, an `AI unavailable` diagnostic, and server-owned facts. Mocked provider fixtures cover the model-labelled rendering path but are not a live-provider result.
- No real screen-reader session or independent usability session was performed. The accessibility evidence is a manual Chrome review of semantic landmarks, tables, labels, focus, keyboard disclosures, announcements, contained scrolling, and the 1024 px/1440 px layouts.
- The repository has no deployed URL, video URL, or completed submission email. Publication, upload, deployment, and sending remain account-dependent Step 18 actions and were not inferred or performed.
- npm may report the existing optional install-script notice and ESLint 9.39.5 deprecation warning. They did not prevent the recorded checks; ESLint remains pinned because the Next.js configuration's declared React-plugin range does not yet include ESLint 10.

## Intentional omissions

This assessment does not implement authentication or roles, an approval workflow, database/history, versioned daily snapshots, season forecasting, a mathematical optimizer, manual allocation editing, scenario UI, multiple days/stations/products, generic spreadsheet import, external business integrations, or autonomous execution. The product is a read-only recommendation tool: Production and Commercial retain approval and execution responsibility. The fixed reader targets the supplied workbook layout, which keeps the assessment auditable and small but is not a general-purpose Excel importer.

## Time and AI-use disclosure

The timed step records show approximately 12 hours 45 minutes of active implementation and delivery effort through Step 17. This is about 45 minutes above the stated 12-hour cap before adding the earlier planning time, which was not timed; the overrun and uncertainty are reported here rather than hidden.

| Step | Approximate active effort |
| --- | ---: |
| 01 | 1 h 15 m |
| 02 | 35 m |
| 03 | 50 m |
| 04 | 10 m |
| 05 | 55 m |
| 06 | 35 m |
| 07 | 45 m |
| 08 | 50 m |
| 09 | 45 m |
| 10 | 50 m |
| 11 | 35 m |
| 12 | 50 m |
| 13 | 55 m |
| 14 | 45 m |
| 15 | 1 h 05 m |
| 16 | 35 m |
| 17 | 30 m |
| **Recorded total** | **12 h 45 m** |

Codex, an AI coding agent, assisted in this shared workspace with assessment/document inspection, workbook and repository inspection, implementation, test and browser-check execution, clean-clone verification, and documentation. The in-product OpenRouter integration is a separate optional runtime dependency. It was not used as a coding assistant, and it is constrained to selecting server-owned evidence IDs; it did not calculate the plan or author accepted factual text.

No separate candidate-run verification session is recorded. The automated, Chrome, checksum, and clean-clone checks described here were executed in the shared workspace with Codex assistance. The candidate should review the final repository, run the documented commands, and make the account-dependent submission choices before delivery.

## Important decisions and evaluation coverage

- E1: the exact business policy is explicit and deterministic, including price/ID priority, quality fit, capacity, compatibility, 5 t units, shortage reasons, residual valuation, and conservation. Production expectation is kept separate from actual allocation supply.
- E2: one Next.js App Router application, pure TypeScript domain modules, server-side validation, Decimal arithmetic, fixed-format workbook parsing, no database, and native server-side OpenRouter fetch keep the system inspectable and reproducible. The trade-off is less generality and no operational history.
- E3: typed modules, focused tests, connected views, semantic HTML, keyboard navigation, contained dense tables, loading/error/recovery states, and evidence links support the decision journey. Accessibility review coverage is manual, not screen-reader-complete.
- E4: `.nvmrc`, package engines, exact dependencies, lockfile, default workbook, no-key behavior, and the Step 16 clean clone make the documented start reproducible without a paid service or model account. Initial dependency installation still needs internet access.
- E5: [README.md](../README.md), [docs/verification.md](verification.md), and [docs/work-log.md](work-log.md) distinguish what passed from what is unverified, record the rejected live provider result, disclose AI assistance and time, and preserve the original source hashes.

## Next three production steps

1. Validate the workflow and allocation policy with Production–Commercial committee users.
2. Add versioned daily snapshots and explicit human approval records.
3. Harden access controls, monitoring, and provider reliability.

These steps are recommendations for a production system, not implemented assessment scope.
