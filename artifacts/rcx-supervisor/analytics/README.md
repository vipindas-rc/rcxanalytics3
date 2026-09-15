# RCX conversational analytics concept

A local, Spring-based chat workspace. Ask a question to generate synthetic data and an inline report; refine it conversationally, switch rendering engines, inspect the rows, or save a chart into a project/dashboard.

## Run locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The API listens only on 127.0.0.1:5174. Node 24 is used for development. Spring packages require the existing RingCentral registry configuration.

Codex CLI must be installed and logged in (`codex login status`). The server uses the official Codex SDK with `gpt-5.6-luna`, low reasoning. No separate API key is configured. Inference needs internet and available account usage; dataset generation, storage, chart compilation, and rendering happen locally. No real datasets or uploads are used.

## Workflow

1. The server records an idempotent request in an independent conversation.
2. Codex returns validated text, a clarification, declarative dataset/chart recipes, or dashboard operations.
3. Typed seeded rows are generated locally. Follow-up views retain the same dataset revision.
4. A single capability registry validates field requirements and compiles supported chart templates through Flint.
5. The assistant answer contains bounded chart widgets. Rendering success ends the estimated button fill; failures expose retry/fallback actions.
6. Renderer switches recompile existing values without another model call.

All report values are synthetic. Numeric summaries come from the generated rows. Unsupported combinations are explained, not silently converted to bar charts. “Pyramid” is clarified as funnel or two-sided population pyramid.

## Local storage

`server/data/workspace.json` is versioned JSON containing sessions, datasets, immutable artifacts, projects, saved charts, dashboard revisions, and request state. Writes are serialized and atomic. Migration backs up older storage; a pre-change copy also exists under `server/data/backups/`. Keep these files to retain your work. A request interrupted by a server restart remains retryable.

Saved charts retain their exact artifact/dataset. Dashboard filters affect only widgets containing the named fields. Projects organize objects; they do not implicitly share data across conversations.

## Verification

```sh
npm test
npm run test:e2e
npm run build
npm run lint
```

The browser suite uses explicit API fixtures; it does not claim model correctness. Live Codex verification and visual findings are recorded in `docs/implementation/qa.md` and `docs/implementation/progress.md`.

## Design and scope

Spring light tokens, components, and icons are used throughout. The supplied Fin Operator references inform the quiet sidebar, welcome composer, stacked initial prompts, inline KPIs/charts, and follow-up structure. The [Shape of AI initial CTA pattern](https://www.shapeof.ai/patterns/cta) informs approachable starters and conversational continuation. The purple presentation backdrop and decorative controls were not part of the requested local application.

This is a local concept: no real-data connectors, sharing, schedules, subscription flow, uploads, or production MCP infrastructure. The complete implementation brief is in `docs/plans/2026-09-12-conversational-analytics.md`.

## Replit-ready demo and LLM handoff

A fresh clone can restore the reviewed synthetic demo workspace without committing local state:

```sh
cp .env.example .env
npm run db:migrate && npm run db:seed
npm run db:examples:migrate && npm run db:examples:seed
npm run demo:restore
npm run dev
```

The tracked `demo/workspace.seed.json` contains only synthetic workspace data. It excludes active requests, cached model output, credentials, and raw PostgreSQL data. `demo:restore` refuses to replace an existing workspace; pass `-- --force` only to intentionally reset it. See [LLM_HANDOFF.md](./LLM_HANDOFF.md) and the [project handoff](https://app.notion.com/p/3dc34de61dc68065bfaac51ef0d5c403?pvs=204) for provider setup and the product contract.
