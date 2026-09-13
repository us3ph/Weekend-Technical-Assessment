# Atlas Fresh — Daily Apple Export Planner: Project Plan

Status: Steps 01–04 application foundation, validation, workbook loading, production comparisons, and deterministic planning are complete; later implementation steps have not started.

Execution guide: [steps.md](steps.md) translates this plan into individually executable agent tasks. The selected model provider is OpenRouter, using free hosted models only.

Prepared for Youssef on 12 September 2026. All product copy, documentation, and code comments will be in English. Target: a complete submission within the assessment's 10–12-hour timebox, with an 11-hour working plan and 1-hour contingency. Record actual time, including analysis, testing, and delivery preparation.

## 1. Goal and authoritative materials

Build one browser-based workspace that helps the daily Production–Commercial committee compare expected production with actual receipts, generate the prescribed export allocation, understand client shortages and local-market value, and ask for grounded explanations. A manager should understand the situation in under one minute and trace a shortage or allocation in under three minutes.

The supplied sources are:

- `Qarizmi_Atlas Fresh_Weekend_Technical_Assessment.pdf`: the nine-page product brief, allocation policy, acceptance checklist, and scoring rubric.
- `Atlas_Fresh_Production_Commercial_Data.xlsx`: the authoritative synthetic input, with `Read Me`, `Farms`, `Clients`, and `Station` sheets.
- `docs/assessment-pack-readme.md`: the preserved pack introduction and submission summary; root `README.md` now contains application instructions.
- The recruitment email: submit a repository URL, a 3–5-minute video URL, optional deployment URL, approximate time spent, and private-repository access instructions if needed.

The supplied README refers to `Qarizmi_Universal_Weekend_Technical_Assessment.pdf` and a DOCX that are not present. Use the actual PDF listed above; no missing document is needed to begin.

The email says to reply **before 18 September 2026**, without an exact cutoff time. Plan to send by 17 September, allowing time to check repository and video access. Do not assume an end-of-day deadline on the 18th.

Production and Commercial keep responsibility for approving execution. The product prepares a recommendation; it does not approve a plan or contact anyone.

## 2. Scope and priorities

The recruitment email specifies these five evaluation criteria, translated into English:

1. Understanding of the problem and business constraints.
2. Technical choices and their justification.
3. Code quality and user experience.
4. Reproducibility: the evaluator must be able to run the project by following its instructions.
5. Transparency: what works, what does not work, and what would be improved with more time.

Demonstrate these through the exact policy and traceable explanations; documented architecture decisions; readable code, tests, and usable interactions; a verified clean-start README; and an honest delivery note. These email criteria complement the PDF's weighted rubric below.

| Evaluation area | Weight | Planned response |
| --- | ---: | --- |
| User experience and product judgment | 40% | Clear overview, connected drill-downs, visible local impact, useful errors, keyboard access. |
| Data and planning correctness | 25% | Exact deterministic policy, validation, traceable balances, calculated baseline and invariants. |
| Full-stack engineering and tests | 15% | Server routes, typed domain logic, focused tests, reproducible build. |
| Grounded AI assistant | 10% | One real configurable model path, evidence validation, honest fallback. |
| Delivery and ownership | 10% | Clean-start README, meaningful commits, walkthrough, time and AI-use disclosure. |

The mandatory journey is **Load → Compare → Plan → Decide → Explain**. Every phase below contributes to that journey.

Keep these outside the implementation: authentication, roles, approval workflows, database persistence, season forecasting, a mathematical optimizer, ML training, vector search/RAG infrastructure, external business integrations, manual allocation editing, capacity-scenario UI, multiple days/stations/products, microservices, mobile apps, and a spreadsheet clone. Upload UI, charts, Docker, CI, and deployment are optional; none displaces mandatory work.

## 3. Workbook findings and acceptance targets

The workbook contains 20 farms, 10 clients, and station `STATION-01`. Farm and client headers are on row 4, with records beginning on row 5. The Station sheet contains two tables: station parameters at rows 4–5 and segment reference prices at rows 16–20. Titles, merged cells, and explanatory text must not be parsed as records.

Read columns by their declared headers. Detect missing sheets, headers, and tables explicitly. The supplied layout is the supported format; a generic spreadsheet importer is unnecessary. Farm/client counts describe this baseline and must not become allocation constants.

| Table | Source fields |
| --- | --- |
| Farms | `farm_id`, `farm_name`, `expected_daily_capacity_t`, `expected_A_pct` through `expected_D_pct`, `actual_A_t` through `actual_D_t` |
| Clients | `client_id`, `client_name`, `acceptance_mode`, `requested_segment`, `demand_t`, `export_price_per_t_eur` |
| Station parameters | `station_id`, `export_conditioning_capacity_t`, `local_market_ratio` |
| Segment references | `segment`, `reference_export_price_per_t_eur` |

Expected mix values are decimal fractions: `0.9` means 90%. There is no farm-to-client mapping. Expected production is a comparison baseline; actual farm-segment receipts are the only allocation supply.

The following production totals were independently calculated from the workbook during planning:

| Segment | Expected tonnes | Actual tonnes | Actual minus expected |
| --- | ---: | ---: | ---: |
| A | 101.7 | 90.0 | -11.7 |
| B | 168.3 | 160.0 | -8.3 |
| C | 207.9 | 180.0 | -27.9 |
| D | 122.1 | 130.0 | +7.9 |
| Total | 600.0 | 560.0 | -40.0 |

The brief and workbook publish these required planning results. They are test expectations, not values to embed in application responses:

| Metric | Baseline target |
| --- | ---: |
| Station capacity / exported volume | 500.0 t / 500.0 t |
| Station utilization | 100.0% |
| Export rate | 89.3% displayed; calculated as 500 / 560 |
| Local residual | 60.0 t |
| Export revenue | EUR 549,500 |
| Local value | EUR 4,500 |
| Total value | EUR 554,000 |
| At-risk clients | 3 |

The following client quantities are derived expectations from applying the stated policy to the workbook; the implementation must verify them:

| Client | Demand | Expected allocation | Remaining | Expected result |
| --- | ---: | ---: | ---: | --- |
| C02 | 50 t | 40 t | 10 t | PARTIAL — `INSUFFICIENT_COMPATIBLE_SEGMENT` |
| C09 | 50 t | 30 t | 20 t | PARTIAL — `INSUFFICIENT_COMPATIBLE_SEGMENT` |
| C08 | 50 t | 20 t | 30 t | PARTIAL — `STATION_CAPACITY_REACHED` |

The other seven clients should be complete. The expected residual is 60 t of D: `60 × 0.10 × EUR 750 = EUR 4,500`. All farm-level allocations and residuals still need to be calculated and tested during implementation.

## 4. Proposed technical approach

Use one TypeScript application with a Next.js browser interface and server routes. This is a proposed implementation choice, not an assessment requirement or an assumption about the candidate's existing expertise.

| Component | Choice and purpose |
| --- | --- |
| Runtime | Node.js 24 LTS and npm; pin the tested runtime and commit the dependency lockfile. Node 24 is currently an LTS release according to the [Node release table](https://nodejs.org/en/about/previous-releases). |
| Application | Next.js App Router and React, with explicit server route handlers for workbook loading, planning, and explanations. See the [route-handler documentation](https://nextjs.org/docs/app/getting-started/route-handlers). |
| Styling | Plain CSS/CSS Modules, a small set of reusable components, system fonts, and semantic HTML. Focus effort on the workspace layout and interactions. |
| Workbook parsing | [read-excel-file](https://github.com/catamphetamine/read-excel-file), using its Node entry point on the server. A Step 01 compatibility check confirmed that it reads the unchanged supplied XLSX. |
| Validation | [Zod](https://zod.dev/) for parsed inputs, request bodies, and assistant output; additional domain checks for cross-field rules. |
| Arithmetic | Integer counts of 5 t allocation units; [decimal.js](https://mikemcl.github.io/decimal.js/) for expected quantities, prices, ratios, and money. Round only for display. |
| Tests | [Vitest](https://vitest.dev/guide/) for the pure planning engine, validation, parser integration, and assistant boundaries. |
| Model integration | Server-side HTTP calls to OpenRouter, defaulting to `openrouter/free`; optionally configure a verified available `:free` model. The [free-router documentation](https://openrouter.ai/docs/guides/routing/routers/free-router) describes routing to free hosted models. |
| Storage | The unchanged source workbook and transient computed results; no database. |

The original default environment had Node 20.20.0 and npm 10.8.2. Step 01 pins the project to Node 24.21.0 and npm 11.19.0, with exact dependency versions and a lockfile. The [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) documents setup and build commands.

Reader decision from Step 01: ExcelJS 4.4.0 could not parse the supplied workbook's valid `x:`-prefixed XML elements. Replaced that preliminary choice with read-excel-file 9.3.10 after checking all four sheets, row positions, IDs, and numeric cells against the original file. Step 03 must use `trim: false` so the reader does not silently clean text values; business validation remains separate. No source XML or workbook values were modified.

One application keeps startup and debugging simple. Domain modules remain independent of React and HTTP, so the business policy can be tested and explained directly. OpenRouter inference requires an API key and internet access when enabled; ordinary application startup, planning, and automated tests must work without either. No local model installation is part of the project.

### Planned responsibilities and API

| Server route | Responsibility |
| --- | --- |
| `GET /api/workbook` | Read the configured server-side workbook, validate it, and return the normalized snapshot, production comparisons, data-health summary, and input version. |
| `POST /api/plan` | Reload and validate the source, check the requested input version, run the policy, and return all allocations, balances, statuses, explanations, and KPIs. |
| `POST /api/assistant` | Receive a question and input version; reproduce the server plan and derive the evidence context before calling the model or deterministic summary path. |

The browser never supplies authoritative KPIs or allocation results. Each route uses the same validation and calculation modules. Reading this small workbook again is acceptable and avoids database or process-local session requirements. Disable result caching for these routes. A content-derived input version prevents explanations from referring to a different snapshot; a mismatch returns a clear reload action.

Use a server-only `WORKBOOK_PATH` setting for an evaluator's edited copy, with the supplied workbook as the default. Do not accept arbitrary filesystem paths from the browser. Document how to switch to a copy, reload, and rerun the plan without editing application code or the original source file.

Return structured validation issues containing sheet, row/cell, entity ID when available, field, and a corrective message. For a missing ID, the sheet and row identify the problem. Suggested response classes: 400 malformed request, 422 invalid workbook data, 409 changed snapshot, and 500 source-read or unexpected server failure. Do not expose internal stack traces in the UI.

Suggested structure when implementation starts:

```text
src/
  app/                 workspace page and API route handlers
  components/          overview, production, commercial, trace, assistant
  lib/
    workbook.ts        XLSX parsing and source locations
    validation.ts      input schemas and business validation
    planner.ts         deterministic allocations and shortage reasons
    calculations.ts    comparisons, balances, and KPIs
    evidence.ts        facts linked to farm/client/segment IDs
    assistant.ts       model request, output validation, fallback
    types.ts           shared data contracts
tests/                 core and assistant tests
docs/                  original pack README, walkthrough, delivery notes
PROJECT_PLAN.md
steps.md               one-step-at-a-time execution guide
README.md              final application instructions
.env.example           placeholder configuration only
```

Keep the original workbook and PDF unchanged. Before replacing the pack's root README with application instructions, preserve its contents as `docs/assessment-pack-readme.md`. Do not store generated results in the workbook or use captured baseline JSON as the runtime data source.

## 5. Validation and deterministic planning contract

### Validation before planning

- Require nonempty, unique farm and client IDs, and a valid single station record. Do not restrict IDs to the particular baseline list.
- Require the declared sheets/columns, valid `EXACT` or `MINIMUM` modes, and segments from A/B/C/D.
- Require exactly one reference price for each segment; reject missing or duplicate segment entries.
- Require finite numeric values. Missing values are errors, not implicit zeros.
- Require every expected mix fraction to be between 0 and 1, and each farm's four fractions to sum to 1 using decimal arithmetic.
- Require nonnegative expected daily capacity with at most one decimal place. Do not apply the 5 t rule to expected capacity or expected segment tonnes.
- Require actual A/B/C/D receipts, client demand, and station capacity to be nonnegative multiples of 5 t.
- As explicit numeric-domain assumptions, require nonnegative finite client/reference prices and a finite local ratio from 0 to 1. Read the ratio and prices from the workbook, including when valid values change.
- Reject invalid data with source-specific messages. Do not normalize invalid modes, rescale percentages, round invalid tonnages, or otherwise repair inputs silently.

Example error: `Farms, row 5, F01, actual_A_t: 27 is invalid; enter a nonnegative multiple of 5 tonnes.`

### Allocation policy, in exact execution order

1. Validate all inputs before producing a plan.
2. Create separate available balances from each farm's actual A/B/C/D receipts.
3. Sort clients by their export price descending, then `client_id` ascending using an explicit, stable ID comparison.
4. For the current client, retain positive compatible balances: EXACT accepts only its requested segment; MINIMUM accepts that segment or better.
5. Sort those balances by smallest quality upgrade, then `farm_id` ascending. For MINIMUM C, consume C before B before A, regardless of farm ID.
6. Allocate in 5 t units, stopping at the client's demand, available compatible supply, or remaining station capacity. Aggregating consecutive units into one allocation row is allowed.
7. Record the client's final status and shortage reason at this point in processing.
8. Continue through every client, including after capacity becomes zero so all statuses are produced.
9. Send every remaining actual farm-segment tonne to the local market and calculate its local value from its own segment reference price.
10. Return consistently ordered results with allocations, upgrades, revenues, farm/segment balances, client outcomes, evidence, and KPIs. Keep volatile request metadata separate from deterministic business results.

Quality order is A, B, C, D, from highest to lowest. A higher-quality tonne does not receive its segment reference export price when exported: it receives the served client's price.

Status rules: COMPLETE when allocation equals demand; PARTIAL when allocation is positive but below demand; UNSERVED when allocation is zero and demand is positive. A zero-demand client is COMPLETE because its demand is satisfied; document this interpretation of the brief's overlapping zero case.

For a partial or unserved client, use `STATION_CAPACITY_REACHED` if station capacity is exhausted when that client finishes processing. Otherwise use `INSUFFICIENT_COMPATIBLE_SEGMENT`. Preserve that reason even if later clients eventually fill the station. This is essential: C02 and C09 must retain segment-shortage reasons even though final station utilization is 100%.

### Calculations and invariants

- Expected segment tonnes = expected daily capacity × expected segment fraction.
- Segment variance = actual segment tonnes − expected segment tonnes; total farm variance = actual farm total − expected capacity.
- Export rate = exported tonnes / actual received tonnes; station utilization = exported tonnes / station capacity.
- Export revenue = sum of allocation tonnes × served client price.
- Local value = sum of residual farm-segment tonnes × local ratio × that segment's reference price.
- Total value = export revenue + local value; at-risk count = partial clients + unserved clients.
- For zero actual receipts or zero station capacity, show the corresponding undefined percentage as `N/A` with a short explanation. Keep quantities and values valid; never emit NaN or Infinity.

Check total export ≤ station capacity, client export ≤ demand, farm-segment export ≤ actual supply, compatibility of every allocation, nonnegative balances, and export + local = actual received. Check conservation per farm/segment as well as globally. All allocation and residual tonnes must remain in 5 t units.

If useful within the timebox, show residual reference value minus local value as a clearly labelled reference-price discount. Do not describe it as guaranteed lost sales, profit, or achievable extra revenue: the station constraint and client demand still apply.

## 6. Workspace design and interactions

Use one workspace with a persistent overview and three detail views: Production, Commercial, and Allocation & Local. Place a compact explanation panel alongside the content at 1440 px and below it at 1024 px.

The top of the page shows source/data health, expected versus actual tonnage, station usage, export rate, local tonnes and local value, export revenue, total value, and the at-risk count. Group these so the most urgent facts fit in the first viewport. Include `Load workbook`, `Generate plan`, and a predictable reload/reset action; disable planning until validation succeeds.

Before planning, show validated production comparisons and mark allocation-dependent metrics as not yet calculated. Do not substitute zero for a result that does not exist.

| View | Required information and interaction |
| --- | --- |
| Overview | Four segment comparison rows/bars and a short exception summary linking to risks and residuals. Data validity and business shortages have distinct labels. |
| Production | All farms; expected capacity and A/B/C/D mix; actual A/B/C/D; total and segment variances; residual local tonnes. Expand a row for its full segment comparison and served clients. |
| Commercial | Every client ID/name, rule, requested segment, demand, allocated, remaining, export revenue, status, and readable shortage reason. Selecting a client reveals its supplying farms/segments. |
| Allocation & Local | Allocation rows with farm ID, segment, client ID, tonnes, quality upgrade, and export revenue; a distinct residual table with farm ID, segment, local tonnes, local unit price, and local value. |
| Assistant | Three suggested questions, a small question input, visible model/fallback state, and clickable evidence references that reveal the relevant records. |

Connect supply gaps to client risk through shared segments and actual allocation traces. For example, F01 and F04 have A variances of -6.5 t and -6.0 t; the A overview should link those gaps to A-compatible demand and C02's unmet demand. Explain that this is a shared supply constraint, not a pre-existing F01-to-C02 obligation. The workbook contains no historical assignment or evidence that one farm alone caused a client's shortage.

Do not imply that every negative farm variance creates an unserved client. Segment C is below production plan but the baseline's C orders can still be fully served. Explain remaining D fruit alongside A/B shortages so managers can see why those tonnes cannot satisfy higher-quality requirements.

Implement loading, initial empty, valid-but-no-receipts, invalid-workbook, server-error, changed-snapshot, and assistant-failure states. Preserve the last successfully loaded view where useful, clearly mark stale results, and offer an explicit retry/reload without mixing snapshots.

Use native buttons and tables, visible focus, meaningful headings/labels, sufficient contrast, status text as well as color, accessible error announcements, and keyboard-operable expandable details. Avoid whole-page horizontal overflow at 1024 px; detailed tables may use contained scrolling. Check the complete workflow at both 1024 px and 1440 px.

## 7. Grounded assistant plan

Implement one real OpenRouter integration using native server-side `fetch`. Send requests to `https://openrouter.ai/api/v1/chat/completions` with a Bearer token from `OPENROUTER_API_KEY`; use `OPENROUTER_MODEL=openrouter/free` by default. The [OpenRouter authentication documentation](https://openrouter.ai/docs/api_reference/authentication) describes the key and request headers. Keep the key in an ignored local environment file, never in `NEXT_PUBLIC_*`, browser requests, logs, screenshots, or committed files. Commit only blank/placeholder configuration in `.env.example`.

Allow only `openrouter/free` or a currently available, verified zero-cost model ID ending in `:free`. Reject paid model configuration before making an inference request; do not silently switch to a paid model or enable paid tools/plugins. Model availability must be checked when implementing and preparing the demo. With the free router, record the actual model returned by the API as well as the requested route; the underlying model can change between requests. This does not affect the deterministic planning engine.

Request non-streaming JSON with `response_format.type=json_schema`, a strict schema, and `provider.require_parameters=true`, then independently validate the response on the server. OpenRouter's [structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs) explains endpoint-dependent support and parameter enforcement. If no suitable free endpoint is available, show the provider-unavailable state and labelled deterministic summary; do not weaken grounding or introduce a paid fallback.

Use a bounded request timeout and output size, one in-flight request per panel, and explicit user retry. Handle missing/invalid keys, 402 account restrictions, 429 rate limits, provider/server errors, timeouts, empty/refused/truncated responses, and invalid output. Respect `Retry-After` when supplied. Free inference is quota-limited and availability varies; do not promise unlimited requests or require buying credits. Link to the current [limits documentation](https://openrouter.ai/docs/api_reference/limits) in setup notes.

The assistant stays read-only and has no allocation, approval, filesystem-write, or external-action tools.

Support these three intents, using the current plan's quantities in suggested question text:

1. Which clients are at risk and why?
2. Which farm/segment gaps matter most today?
3. Why is the current residual going local, and what is its estimated value? The baseline wording is “Why are 60 t going local?”

Grounding strategy:

- Build a server-owned catalog of facts from the validated snapshot and calculated plan. Each fact has a stable identifier, exact values, an allowed explanation, and resolvable farm/client/segment references.
- Limit the context to the question's relevant facts. Do not send the workbook binary, unrelated records, credentials, or invented background.
- Have the real model select and order relevant fact IDs in a strict schema. Render factual sentences and numbers from the server's approved facts. This deliberately constrains the assistant to evidence selection and explanation assembly.
- Validate the response schema, intent, fact membership, citation relationships, and required fact coverage. Reject unknown IDs, extra unsupported claims, or incomplete answers; do not render raw model prose or newly generated numbers.
- For client-risk questions, cover every at-risk client. For local questions, cover quantity, composition, constraint, and local value. For gaps, use server-calculated rankings and explain the connection to compatible demand without claiming unsupported causality.
- Make citations actionable: a farm/client reference opens its detail; a segment reference opens its comparison and relevant balances. All numeric explanations must resolve to the same input version as the visible plan.

Without an API key, explicitly show `AI unavailable — OpenRouter API key not configured` and `Deterministic summary — no model used`. On provider failure, timeout, or invalid output, explain that the model answer could not be used and separately label any deterministic summary. Do not present fallback text as an AI-generated answer. Keep model configuration details in setup documentation; product users only need the availability state and explanation source.

For unsupported questions, such as weather causes, future forecasts, or delivery confirmation, say the information is unavailable in the supplied snapshot. Do not manufacture an answer from a nearby fact. Free-form questions are limited to the three supported planning topics; document this limitation.

A provider mock verifies boundaries but does not replace the real integration. When an OpenRouter key is configured, run a small actual free-model smoke check and record the requested route, returned model, date, and result without secrets. Keep ordinary tests offline and do not consume API quota during builds. If no key or free endpoint is available, record live inference as unverified and disclose the exact limitation while retaining the implemented provider path and honest fallback. Do not ask the candidate to paste a key into the conversation.

## 8. Verification and acceptance checklist

Write six meaningful core test cases/groups, with parameterized subcases where appropriate, plus two assistant checks. Write these alongside the related implementation, not entirely at the end.

| Test | Evidence it must provide |
| --- | --- |
| T1 — Workbook baseline | Parse the real workbook and reproduce all public metrics, segment comparisons, the three partial clients and reasons, and the expected residual composition. |
| T2 — Ordering and determinism | Higher price wins; equal prices break by client ID; quality fit precedes farm ID; equal-fit supply breaks by farm ID; shuffled source rows produce identical business results without mutating inputs. |
| T3 — Compatibility | EXACT rejects other segments; MINIMUM accepts better but not worse segments; consume the requested segment before upgrades; upgrade export revenue uses the client price. |
| T4 — Hard limits and reasons | Station, demand, and farm-segment caps hold; 5 t units and conservation hold; include exhausted capacity, incompatible supply, zero capacity/supply/demand, and reason-at-processing-time behavior. |
| T5 — Local value and changed inputs | Every residual traces to its farm/segment and is valued using the correct reference and ratio. Changing a reference price changes local value without changing client order or export revenue. Relevant changes to supply, demand, price priority, and capacity recompute the affected results. |
| T6 — Validation | Parameterize duplicate/missing IDs, invalid modes/segments, incomplete references, bad fractions/sums, negative/nonfinite/missing values, invalid expected-capacity precision, non-5 t quantities, and invalid station data; assert actionable source locations. |
| T7 — Grounded answer | A valid structured provider response produces server-owned facts and resolvable citations for supported questions; numeric answers match the current plan. |
| T8 — Assistant boundaries | Unsupported question, unknown fact/entity ID, invalid schema, missing/invalid key, 402/429/5xx responses, timeout, and empty/refused/truncated output produce honest states. Paid model configuration is rejected before inference; no case changes allocations or accepts browser-supplied KPIs. |

Valid input changes must propagate where relevant; do not assume every field change must alter every KPI. For example, changing expected mix changes comparisons, while allocations continue to use actual supply.

Map the final result to the brief's acceptance IDs:

| ID | Completion evidence |
| --- | --- |
| A — Inputs | Correct loaded totals, segment values, and capacity in both API and UI. |
| B — Baseline | T1 passes with exact revenue/value totals and correctly rounded export rate. |
| C — Clients | C02/C09 retain segment-shortage reasons; C08 has a capacity reason. |
| D — Trace | Every allocation and residual resolves to source farm/segment records; client and farm drill-downs work. |
| E — Limits | T3/T4 pass, including per-farm-segment conservation. |
| F — Validation | T6 passes and the browser displays a useful invalid-input example with a recovery path. |
| G — Assistant | T7/T8 pass; provider configuration and actual verification status are documented. |
| H — UX | Manual timed review: situation understood in <1 minute; trace found in <3 minutes; keyboard and both target widths checked. |
| I — Reproducible | Fresh local clone installs, starts, tests, and builds using the README alone, with no model configuration required. |

The final verification pass includes lint, type checking, automated tests, production build/start, the seeded workflow, one invalid workbook copy, one valid changed-input copy, and assistant fallback/error behavior. Recheck the original workbook's hash to confirm it is unchanged. No application tests are claimed to have run during planning.

## 9. Implementation sequence and time budget

| Phase | Budget | Work and exit condition |
| --- | ---: | --- |
| 1. Requirements and design | 0.5 h | Read the pack, inspect data, capture this plan and baseline expectations, settle the main workspace arrangement. |
| 2. Project foundation | 0.5 h | Initialize the repository, preserve pack materials, set up runtime/dependencies/scripts, create the workspace shell and time log. |
| 3. Workbook and validation | 1.0 h | Implement the server loader, source-aware validation, comparison results, and T6; valid data loads and invalid data is rejected visibly. |
| 4. Planning engine | 2.0 h | Implement policy, deterministic output, balances, KPIs, shortage evidence, and T1–T5; baseline and constraints pass. |
| 5. Decision workspace | 3.0 h | Build overview, production/commercial views, allocation/local trace, linked exceptions, loading/errors, keyboard behavior, and responsive layout. |
| 6. Assistant | 2.0 h | Implement evidence catalog, real OpenRouter free-model adapter, strict output checks, honest summaries/failure states, and T7/T8. |
| 7. Acceptance and fixes | 1.0 h | Run complete checks, inspect both widths, exercise changed/invalid data, and verify startup/build from a clean clone. |
| 8. Delivery | 1.0 h | Finish README and disclosure, record/upload walkthrough, verify access, and prepare submission details. |
| Planned total | 11.0 h | All mandatory requirements and delivery assets targeted. |
| Contingency | 1.0 h | Fix acceptance blockers and packaging issues. Stop at 12 hours and report any unfinished requirements honestly. |

Treat these as estimates, not hours to claim afterward. The timebox is a cap, not a minimum. Do not add optional infrastructure while mandatory items remain. If time slips, simplify visual decoration and optional conveniences first; explicitly disclose any mandatory omission that cannot be completed within the cap.

Use meaningful commits at working milestones: setup, input validation, planning policy/tests, workspace, assistant, and delivery. Keep an honest history of the actual work; do not fabricate elapsed time or earlier progress.

## 10. Delivery plan

The final application README should contain a short product description, prerequisites and pinned runtime, one clean-start path, test/lint/typecheck/build/start commands, architecture and policy summary, workbook-copy override instructions, optional model setup, assumptions, tested behavior, known limitations, and the next three production steps.

Planned command contract, to be implemented and verified during coding:

```text
npm ci
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

Development and production start are alternative run modes. The README will provide their exact working directory and local URL. Default startup must not require `.env` values, API access, a local model runtime, Docker, or a database. Optional OpenRouter setup belongs in a separate short section: create a key in the user's account, configure it privately in `.env.local`, select the free route/model, and restart the development server. Document internet/quota requirements and the honest no-key fallback.

Prepare a concise delivery note listing the AI coding tools actually used, their role, the candidate's verification, actual approximate time, intentional omissions, and any unverified behavior. For this planning stage, AI assistance was used to read and cross-check the assessment, inspect workbook data, and draft this plan; application implementation has not begun. Update the note from actual work rather than claiming future checks in advance.

Suggested 4-minute walkthrough, aimed at Production and Commercial:

| Time | Demonstration |
| --- | --- |
| 0:00–0:30 | Explain the daily decision, load the workbook, and show data health. |
| 0:30–1:15 | Show expected versus actual production, the A gap, station capacity, and the generated plan's export/local value. |
| 1:15–2:15 | Open C02, C09, and C08 to distinguish segment shortages from capacity; trace one allocation to its supplying farms. |
| 2:15–3:00 | Open local residual by farm/segment and explain its EUR 4,500 baseline value. |
| 3:00–3:35 | Ask a supported assistant question and follow an evidence reference; honestly demonstrate configured-model or fallback mode. |
| 3:35–4:00 | Briefly show validation/recovery, mention reproducibility, actual time, AI use, and the main limitation. |

Record with the synthetic workbook only. Keep credentials and private account details out of the screen recording, repository, and documentation. A published video URL and repository URL require the candidate's account/access choices; prepare the local project and recording material before that delivery step. This planning request does not publish a repository, upload a video, deploy the app, or send an email.

Submission checklist:

- [ ] Repository URL opens for the evaluator; private access instructions are supplied if applicable.
- [ ] Clean-clone instructions work without paid services or model access.
- [ ] Tests/build pass, with actual results and limitations accurately stated.
- [ ] Original source workbook is intact; no credentials or real client data are included.
- [ ] Video URL opens and its duration is between 3 and 5 minutes.
- [ ] Optional deployment URL is included only if a working deployment exists.
- [ ] Approximate actual time and AI-use disclosure are included.
- [ ] Reply to the recruiter before 18 September 2026; target 17 September.

Proposed next three production steps to describe, without implementing them in this assessment: validate the workflow and allocation policy with committee users; introduce versioned daily snapshots and an explicit human approval record; harden operations with access controls, monitoring, and provider reliability checks.

## 11. Current completion state

- [x] Read the supplied README and all nine PDF pages.
- [x] Inspect all four workbook sheets and identify their actual schemas.
- [x] Calculate expected/actual segment totals and document published planning targets.
- [x] Map mandatory requirements, tests, UX, assistant boundaries, delivery, and time budget.
- [x] Create this English planning file.
- [x] Select OpenRouter free hosted inference and add the email's five evaluation criteria.
- [x] Create the ordered agent execution guide in `steps.md`.
- [x] Complete Step 01 application foundation: runnable Next.js shell, pinned tooling, preserved materials, and documented checks.
- [x] Complete Step 02 domain contracts and validation.
- [x] Complete Step 03 workbook loading, source-aware parsing, and production comparisons.
- [x] Complete Step 04 deterministic planning policy, balances, residuals, KPIs, and focused T1–T5 checks.

The next implementation step is to complete the six core test groups in Step 05. The current focused engine checks do not yet claim the full T6 validation matrix.
