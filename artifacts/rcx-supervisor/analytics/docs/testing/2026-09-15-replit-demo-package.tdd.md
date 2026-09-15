# Replit demo package — TDD evidence

## Source

Derived from `docs/superpowers/plans/2026-09-15-replit-demo-package.md`.

## User journeys

- A Replit user can restore a reviewed synthetic RCX workspace after cloning, without receiving another user’s local runtime state.
- An LLM can start the project and configure a provider without being instructed to commit API credentials.
- A developer cannot accidentally replace an existing workspace using the normal demo restore command.

## RED/GREEN evidence

| Behavior | RED evidence | GREEN evidence | Commit |
|---|---|---|---|
| Demo sanitizer clears requests/cache and rejects secret-shaped values | `npm test -- server/demo/workspaceSeed.test.ts` failed because `workspaceSeed.ts` did not exist | Same command passed: 2 tests | `4afb796` → `2bb64c2` |
| Demo export/restore is safe | `npm test -- server/demo/seedCli.test.ts` failed because `seedCli.ts` did not exist | Same command passed: 1 test | `1bababf` → `ee5c6bb` |
| Replit/LLM onboarding artifacts exist and remain credential-free | `npm test -- server/demo/seedCli.test.ts` failed because `.env.example` did not exist | Same command passed: 2 tests | `c987f66` → `bb5e93c` |

## Final verification

| Guarantee | Command | Result |
|---|---|---|
| Unit/API contracts and new demo tests pass | `npm test` | 157 passed, 16 skipped because DB-dependent suites need dedicated URLs |
| Client compiles and bundles | `npm run build` | passed; Vite reported existing large-chunk warnings |
| Lint has no errors | `npm run lint` | exit 0; existing warnings remain |
| Raw local runtime files are not tracked | `git ls-files` safety scan | no `.env`, workspace JSON, PostgreSQL directory, `node_modules`, or `dist` tracked |
| Demo seed contains no credential-shaped values | `rg` secret scan | no secret matches; `.env.example` contains intentional local database placeholders only |

## Deliberate limits

The checked-in seed restores the visible synthetic workspace. Operational and examples PostgreSQL data is reproduced by migrations plus deterministic seeding, rather than a raw local PostgreSQL directory. A fresh clone therefore does not carry current live request history, filesystem-specific process state, credentials, or arbitrary user runtime data.
