# Analytics test commands

- `npm run test:deterministic` runs unit/API tests without external model calls or PostgreSQL.
- `npm run test:db` requires `TEST_DATABASE_URL` pointing at a local `rcx_test` template database with create/drop database privileges. It creates uniquely named disposable databases and never falls back to `DATABASE_URL` or `SYNTHETIC_DATABASE_URL`.
- `npm run test:gateway` requires the same `TEST_DATABASE_URL` template, builds and starts an isolated production Supervisor host, maps both Analytics pools to one disposable database, and then runs the non-intercepted gateway browser suite.
- `npm run eval:dry-run -- --provider openai --model <model> --pricing evaluation/pricing.example.json --max-input-tokens 800 --max-output-tokens 400 --max-calls 31 --max-minutes 10 --max-dollars 1` previews the bounded work with no provider requests.
- `npm run eval:live -- ...` additionally requires `EVAL_APPROVE_PAID=true`; live runs are one provider/model only, sequential, capped at three repetitions, and persist a resumable, sanitized ledger.

# Browser regression scope

The deterministic Playwright suite runs against the existing Vite listener at `http://127.0.0.1:5173` and intercepts `/api/*` in each test. It must never mutate `server/data/workspace.json`, run model inference, or start another app process. Run with `npm run test:e2e` after confirming the app listener; override `PLAYWRIGHT_BASE_URL` only when using a different existing listener. The package script is owned by the integration agent.

Acceptance targets are section 13 of `docs/plans/2026-09-12-conversational-analytics.md`: welcome, submission, inline report, follow-up context, responsive navigation/containment, renderer lifecycle, accessibility/error states, and session isolation. Browser assertions check actual rendered output and network payloads; data math and storage migration belong to unit/API tests.

The legacy `src/lib/chartPlan.test.ts` still contains a test named “normalizes pyramid aliases for Flint and keeps Chart.js usable,” which expects Chart.js to render a bar approximation for a pyramid. That assertion contradicts the no-substitution requirement. Replace it with a category-retention/explicit-capability assertion when the new registry lands. The existing UI hardcodes a 64% loading fill and current session persistence uses v1. Neither legacy result constitutes acceptance of the v2 design.

Fixture conversations and synthetic rows exist only in `tests/e2e/workspace.spec.ts`; they are seeded to exercise five distinct regional categories and a known total of 150. `/api/artifacts/artifact-regions/render` returns an ordinary ECharts option from the fixture. Renderer-output assertions should inspect the actual host and dataset table, while semantic compilation and row integrity remain in the analytics tests.

## Result interpretation

Analytics results are reported separately from Supervisor/Queue/preview/takeover and Demo Review smoke coverage. The deterministic browser suite uses intercepted fixtures by design; the gateway suite is the integration result and never intercepts Analytics APIs. A missing PostgreSQL template or Demo Review listener is **blocked/unavailable**, not a passing or skipped integration result. Live evaluation is pending explicit model, current price metadata, and approved dollar/token/call/time ceilings; dry runs are not live-model passes.
