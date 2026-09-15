# Clone-safe Replit demo package

## Goal
A fresh clone can start RCX Analytics with a recognizable, fully synthetic demo workspace while keeping local credentials and PostgreSQL internals out of Git.

## Design
- Add a committed `demo/workspace.seed.json` snapshot produced from the existing workspace after sanitization. It retains synthetic conversations, saved artifacts, projects, dashboards, and datasets, but removes pending/cancelled request runtime state, response-cache entries, and any unrecognized secret-shaped values.
- Add a script that validates the snapshot before writing it to `server/data/workspace.json`. It refuses to overwrite an existing workspace unless `--force` is supplied.
- Keep database reproducibility source based: tracked SQL migrations plus deterministic `db:seed` / `db:examples:seed` commands. Do not commit PostgreSQL data directories, dumps, WAL files, or a raw database image.
- Add an `.env.example` that contains no secret. It explains choosing either Codex login or OpenAI API credentials and directs users to leave `AI_PROVIDER=codex` by default.
- Document a Replit/local bootstrap flow in the README and an `LLM_HANDOFF.md`: install, configure environment, run migrations/seeds, hydrate the demo workspace, and run the app. Both documents explicitly prohibit committing credentials and state that the data is synthetic.

## Validation
- Unit test the sanitizer and bootstrap command behavior.
- Verify the committed snapshot contains no `OPENAI_API_KEY`, `sk-`, `gho_`, database URL, or active request.
- Verify a generated workspace can be restored without overwriting a non-empty workspace by default.
- Run the unit suite, build, lint, whitespace check, then push the resulting commits.
