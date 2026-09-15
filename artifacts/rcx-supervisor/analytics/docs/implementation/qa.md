# Browser regression scope

The deterministic Playwright suite runs against the existing Vite listener at `http://127.0.0.1:5173` and intercepts `/api/*` in each test. It must never mutate `server/data/workspace.json`, run model inference, or start another app process. Run with `npm run test:e2e` after confirming the app listener; override `PLAYWRIGHT_BASE_URL` only when using a different existing listener. The package script is owned by the integration agent.

Acceptance targets are section 13 of `docs/plans/2026-09-12-conversational-analytics.md`: welcome, submission, inline report, follow-up context, responsive navigation/containment, renderer lifecycle, accessibility/error states, and session isolation. Browser assertions check actual rendered output and network payloads; data math and storage migration belong to unit/API tests.

The legacy `src/lib/chartPlan.test.ts` still contains a test named “normalizes pyramid aliases for Flint and keeps Chart.js usable,” which expects Chart.js to render a bar approximation for a pyramid. That assertion contradicts the no-substitution requirement. Replace it with a category-retention/explicit-capability assertion when the new registry lands. The existing UI hardcodes a 64% loading fill and current session persistence uses v1. Neither legacy result constitutes acceptance of the v2 design.

Fixture conversations and synthetic rows exist only in `tests/e2e/workspace.spec.ts`; they are seeded to exercise five distinct regional categories and a known total of 150. `/api/artifacts/artifact-regions/render` returns an ordinary ECharts option from the fixture. Renderer-output assertions should inspect the actual host and dataset table, while semantic compilation and row integrity remain in the analytics tests.
