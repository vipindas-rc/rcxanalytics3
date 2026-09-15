# Replit setup

Set `DATABASE_URL` and `EXAMPLES_DATABASE_URL` using workspace database configuration. The Analytics application owns its `rcx_data` schema and never replaces Supervisor data.

Set `RCX_DEMO_BOOTSTRAP=true` only for the local synthetic-data prototype. It imports bounded demo records.

The server orchestrator selects its model provider from `AI_PROVIDER`. Store provider credentials in Secrets; never add them to source files, examples, or handoff documents.