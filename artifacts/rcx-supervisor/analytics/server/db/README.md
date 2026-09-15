# Persistent synthetic records

This first slice implements Agent Activity from coherent interactions and handling segments. It does not implement the rest of the report catalog. Analytics workspace state is owned by PostgreSQL; an existing workspace JSON file is imported once when the database workspace row does not yet exist. Legacy dataset values remain separate.

## Local setup

Prerequisites: Node.js with `--env-file` support and PostgreSQL 17. The tracked Compose file remains the portable setup. This Mac uses a local Homebrew PostgreSQL 17 cluster at the same loopback address because its Colima VM cannot verify the container registry certificate.

From `flint-chart-lab`:

```sh
cp .env.database.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

The database listens only on `127.0.0.1:54329`. Compose credentials are local development values. The named volume survives container restarts; do not remove it to fix application errors. The `npm` server scripts load `.env`; the Codex provider and existing login are unchanged.

### Native PostgreSQL fallback

When Docker image pulls are unavailable, initialize the same local-only database with Homebrew PostgreSQL 17:

```sh
brew install postgresql@17
initdb -D server/data/postgres --username=rcx_local --auth=trust
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D server/data/postgres -o '-p 54329 -h 127.0.0.1' -l server/data/postgres.log start
createdb -h 127.0.0.1 -p 54329 -U rcx_local rcx_analytics
createdb -h 127.0.0.1 -p 54329 -U rcx_local rcx_test
```

Use the same `.env` URLs afterwards. The native data directory, log and `.env` are ignored by Git.

`migrateDatabase(pool)` applies versioned SQL atomically under an advisory lock and rejects checksum changes to applied migrations. `--seed` repeatedly ensures the fixed 31 August–14 September 2026 UTC scenario; it does not replace prior records.

## Service contract

`PostgresOperationalService` accepts a `pg.Pool`. The caller owns pool shutdown.

- `ensureCoverage({ datasetId?, start, end, seed? })` returns `{ datasetId, revisionId, start, end, generated }`.
- `query({ revisionId, start, end, agentType?, intent?, offset?, limit? })` returns rows, typed fields, full computed evidence and pagination. Intent is `activity`, `count`, or `comparison`; agent type is `ai` or `human`.
- Periods are half-open, at most 366 days. Stored event ownership is UTC; the initial interface reports UTC.
- Activity rows represent handling segments. Distinct interactions count transfers once. AI and human interaction counts overlap; evidence explicitly reports the overlap.
- Table pages default to 100 rows, at most 1,000. Evidence totals always use all matching records.
- No data is generated in `query`. Missing revision coverage is an explicit error; generation must be requested by the caller.

Coverage is deterministic for a seed and generator version. Owner-day generation writes complete interaction lifecycles, including midnight crossings. One preceding owner day supplies carry-in events; duration calculations clip segments to scope. Filters returning zero do not generate data.

Generation, validation, coverage publication and revision manifests commit in one transaction. An advisory lock and unique coverage keys deduplicate concurrent requests. Published batches, events and manifests are immutable through database triggers. Expanded coverage creates a new manifest while old revisions retain identical values.

## Verification and isolation

```sh
npx vitest run server/operational/generator.test.ts
```

Database acceptance tests require a separate local database named according to `tests/integration/databaseSafety.ts`, with `TEST_DATABASE_URL` different from `DATABASE_URL`. They never reset the working database. Without that URL the integration tests skip; this is not evidence of a PostgreSQL runtime pass.

## Supabase later

Point the same server-side connection interface at PostgreSQL hosted by Supabase and apply the same SQL migrations with deployment credentials. Keep SQL/query compilation on the server. Before introducing users, add workspace/tenant access boundaries, least-privilege roles, authenticated APIs and corresponding scope in evidence/cache identities. No Supabase functions, browser database access or vector storage is required for this slice.
