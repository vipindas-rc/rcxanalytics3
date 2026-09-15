# RCX Analytics 3.0 — LLM and Replit handoff

This is a local conversational analytics prototype. Every user-visible number is synthetic and must come from calculated evidence, never from an invented prose value. Read [the Notion project handoff](https://app.notion.com/p/3dc34de61dc68065bfaac51ef0d5c403?pvs=204) before changing product behavior.

## Repository safety rules

- never commit `.env`, OpenAI keys, Codex tokens, GitHub tokens, raw PostgreSQL directories/dumps/WAL, or a user’s live workspace file.
- `demo/workspace.seed.json` is the only committed workspace data. It is a reviewed synthetic snapshot with request/cache state removed.
- Recreate PostgreSQL through the committed migrations and deterministic seed scripts. Do not use a raw database copy.
- Keep providers server-side. The browser must never receive `OPENAI_API_KEY` or a database URL.

## Fresh clone / Replit bootstrap

```sh
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run db:examples:migrate
npm run db:examples:seed
npm run demo:restore
npm run dev
```

`demo:restore` refuses to replace an existing `server/data/workspace.json`. Use `npm run demo:restore -- --force` only when intentionally resetting the workspace to the checked-in synthetic demo.

For Replit, put real provider credentials only in the Replit Secrets UI:

- Leave `AI_PROVIDER=codex` only if Codex CLI login is available in that environment.
- Otherwise set `AI_PROVIDER=openai`, `OPENAI_MODEL=gpt-5.6-luna`, and `OPENAI_API_KEY` as a Replit secret.
- Configure `DATABASE_URL` and `SYNTHETIC_DATABASE_URL` with Replit’s managed PostgreSQL URLs when available. Do not use browser-side database access.

## Operational contract

Question → context → structured plan → compatible synthetic records → persistence → evidence calculation → presentation → validation → response.

Preserve question metric, cohort, scope, time semantics, and requested presentation. Reuse compatible committed records. Zero results are valid and must not trigger replacement generation. Do not ask users to upload data or connect a source; this prototype’s data is synthetic.

## Verification

```sh
npm test
npm run build
npm run lint
npm run test:e2e
```

Database suites need isolated test database URLs. A passing browser fixture suite does not establish live-model correctness.
