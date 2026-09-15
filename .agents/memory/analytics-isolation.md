---
name: Analytics isolation
description: Conversational Analytics is a React 19 source import isolated within the React 18 Supervisor shell.
---

# Analytics isolation

Keep Conversational Analytics in an isolated bundle and loopback service rather than importing its runtime, styles, or providers into Supervisor.

**Why:** Supervisor remains React 18 with legacy dependencies, while Analytics requires React 19 and its own Spring provider. Platform routing also reserves `/api` for the standalone API artifact, so the Analytics browser gateway must use a distinct same-origin prefix.

**How to apply:** Preserve the host content-only iframe boundary and proxy the Analytics service through its non-conflicting gateway. Do not use the standalone API artifact for Analytics calls. Any future deep-link bridge must validate exact origin, source window, message schema, and allowed Analytics paths.