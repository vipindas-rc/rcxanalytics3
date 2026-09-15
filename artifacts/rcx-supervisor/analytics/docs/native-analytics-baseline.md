# Native Analytics baseline — iframe reference

## Capture

This is the pre-cutover reference capture required by `native-analytics-harness-parity.md`. It was taken **2026-09-15T15:02:49.958Z**, before the host-edit failure reported during native work and without restarting or mutating the running host.

- Host: the already-running Replit development domain, HTTPS.
- Browser: Playwright Chromium 1187, headless; viewport 1440 × 900.
- Routes: direct `/analytics` and Supervisor root `/`.
- Workload: navigation only; no form submission, Analytics API mutation, database mutation, or provider/model call.
- Cold condition: fresh browser context for each measured navigation.
- Warm condition: one unmeasured prime navigation, followed by a measured navigation in the same fresh browser context.
- Timing: elapsed wall time is navigation through a fixed 1.5 second settling interval. `DOMContentLoaded` is the browser navigation timing for the host document. These are navigation measurements, not a claim about API/database/model latency.

Raw evidence remains local and ignored with the app artifact:

- `output/native-analytics-baseline/current-iframe-perf.raw.json`
- `output/native-analytics-baseline/current-iframe-analytics.png`

The reusable, read-only collector is `scripts/native-analytics-perf-baseline.mjs`. It requires an already-running host through `PLAYWRIGHT_BASE_URL`; it neither launches nor restarts an app.

## Five-run results

| Route | Cache | Wall elapsed runs (ms) | Median / range (ms) | Host DOMContentLoaded median / range (ms) | Host resource count |
| --- | --- | ---: | ---: | ---: | ---: |
| `/analytics` | cold | 3671, 4302, 3343, 4327, 5463 | 4302 / 3343–5463 | 2764 / 1812–3440 | 250 each |
| `/analytics` | warm | 4528, 3153, 4459, 3844, 3697 | 3844 / 3153–4528 | 2312 / 1618–2997 | 250 each |
| `/` | cold | 4382, 3900, 3854, 4009, 3904 | 3904 / 3854–4382 | 2204 / 2022–2610 | 250 each |
| `/` | warm | 4023, 3527, 3646, 6373, 5186 | 4023 / 3527–6373 | 2220 / 1717–4343 | 250 each |

The Analytics host document contained exactly one iframe in every measured `/analytics` run. The original collector saved reliable host timing and screenshot evidence, but its child-frame metric call used an incompatible Playwright frame API and therefore did **not** record a valid iframe-resource subtotal. Do not compare child transfer/parse cost from this capture. The replacement collector above measures the iframe document separately and explicitly reports a missing/failed frame rather than silently treating it as native.

Host resource transfer illustrates the cache split but is not an iframe bundle measurement: `/analytics` cold transfer was 9.17–13.67 MB versus 53.4–54.0 KB warm; `/` cold transfer was 11.27–13.88 MB versus 53.4–54.3 KB warm. Decoded resource bytes remain around 9.4–15.1 MB because the browser reports decoded cached resources too.

## Final native five-run comparison

The final stable-host capture is
`output/native-analytics-final/current-navigation-perf.raw.json`. It contains
20 samples (five cold and five warm document navigations for `/analytics` and
`/`), no Analytics iframe, and no captured Analytics errors.

| Route | Cache | Iframe baseline median / range (ms) | Final native median / range (ms) | Observed change |
| --- | --- | ---: | ---: | ---: |
| `/analytics` | cold | 4302 / 3343–5463 | 1719 / 1698–2126 | −2583 ms (−60.0%) |
| `/analytics` | warm | 3844 / 3153–4528 | 1616 / 1596–1635 | −2228 ms (−58.0%) |
| `/` Supervisor | cold | 3904 / 3854–4382 | 1707 / 1672–1821 | −2197 ms (−56.3%) |
| `/` Supervisor | warm | 4023 / 3527–6373 | 1685 / 1566–1822 | −2338 ms (−58.1%) |

There was no separately approved numeric performance SLO. The only honest
comparison target is **no regression against the preserved iframe navigation
baseline**; the observed medians are lower in all four cells. This is
directional evidence, not an inference/API/database latency claim: each value
includes the collector's fixed 1.5-second settling period, the warm condition
is a cached **document navigation** rather than a pure SPA transition, and the
pre- and post-cutover hosts are different runtime captures. The final result
therefore supports the navigation target but does not establish a model-speed
or backend-latency target.

## Baseline failures and limitations

1. **Root console warnings are baseline defects.** The five cold and five warm `/` samples each produced React/Juno warnings, including unsupported DOM props (`isActive`, `isSortable`, `inColor`, `disableMenu`, `isCurrentlyMonitoring`, `isInfoToolTipVisible`, `isHighlighted`, `isSelected`, `rowHeight`, `useDynamicHeight`, `isScrollDisabled`), invalid `tabindex`, non-boolean `clickable`/`closable`/`eclipsable`, and `findDOMNode` deprecation. These are Supervisor baseline defects and must not be relabeled as native Analytics regressions.
2. **No Analytics console errors were captured** in the ten original `/analytics` samples. This does not prove all Analytics actions work; it only covers direct navigation with no mutation.
3. **Child-frame resource timing is incomplete** as described above. Preserve the host median/range as the valid pre-change reference and re-run the reusable collector only once the main agent coordinates a stable host.
4. **Initial isolated PostgreSQL test state was blocked** because `TEST_DATABASE_URL` was not configured. A later approved ephemeral loopback run is recorded below; the test suite still deliberately refuses `DATABASE_URL` as a substitute.
5. **No standalone intercepted browser suite ran.** Its default listener is `127.0.0.1:5173`, which was absent, and starting/restarting the ordinary app is outside this task. The live host was used only for the read-only navigation capture.

## Deterministic suite result

At the capture checkpoint:

```text
npm run test:deterministic
Test Files  31 passed | 2 skipped (33)
Tests  176 passed | 8 skipped (184)
Duration 11.99s
```

This suite has deterministic doubles and temporary/local test state; it is not evidence of a live provider call or PostgreSQL integration pass. It is the baseline harness result to preserve.

## Approved ephemeral PostgreSQL results

An approved one-command local PostgreSQL 16.10 cluster was created under
`/tmp/native-analytics-*-postgres.*` with trust authentication, user
`rcx_qa`, and loopback-only listener `127.0.0.1:55000`. It created only
`rcx_test` and `rcx_synthetic_test`; all command environments unset
`DATABASE_URL`, `SYNTHETIC_DATABASE_URL`, `OPENAI_API_KEY`, and
`OPENAI_MODEL`. The cluster stopped and its `/tmp` directory was removed in
the shell `EXIT` trap after each command. No normal database or paid model was
contacted.

| Command | Result | Interpretation |
| --- | --- | --- |
| `TEST_DATABASE_URL=postgresql://rcx_qa@127.0.0.1:<unused-55xxx>/rcx_test npm run test:db` | **3 files; 17 tests passed** | The PostgreSQL `bigint` revision assertion now normalizes `Number(actual)` before retaining the expected workspace revision/increment semantics. |
| `TEST_SYNTHETIC_DATABASE_URL=postgresql://rcx_qa@127.0.0.1:<unused-55xxx>/rcx_synthetic_test npm run test:examples` | **1 file passed; 6 tests passed** | Persistent workflow-volume and queue-abandonment example coverage passed against the ephemeral database. |
| `TEST_DATABASE_URL=postgresql://rcx_qa@127.0.0.1:<unused-55xxx>/rcx_test npm run test:gateway` | **1 core native gateway test passed** | A fresh production build passed; the in-process lifecycle became ready; direct `/analytics-api` session/conversation/poll/reload persistence passed; no iframe and no separate `/api` traffic were observed. Playwright writes to process-unique `/tmp/native-gateway-results-<pid>` and runs only this core spec, avoiding concurrent readonly output. |

## Safe database and gateway procedure

The Task 8 harness has the correct isolated topology and must remain unchanged:

1. Set **only** `TEST_DATABASE_URL` to a loopback PostgreSQL `rcx_test` or `rcx_test_<run>` administration template with `CREATE/DROP DATABASE` permission. It must differ from `DATABASE_URL`.
2. `npm run test:db` first executes `scripts/require-test-database.mjs`. Each test invokes `createDisposableDatabase()`, creates a unique `rcx_test_<label>_<uuid>` database from `/postgres`, migrates operational and examples schemas, closes pools, then force-drops only that database.
3. `npm run test:gateway` uses the same disposable database, maps both `DATABASE_URL` and `SYNTHETIC_DATABASE_URL` of its isolated child host to it, uses `ANALYTICS_TEST_MODEL=deterministic`, and cleans up its child process/database in `finally`.
4. Never point either command at the normal Replit `DATABASE_URL`; never supply a remote host or an arbitrary database name. Missing `TEST_DATABASE_URL` is **blocked**, not skipped/passed integration coverage.

No paid evaluation was run. `eval:live` remains opt-in and requires its separate approval/budgets.