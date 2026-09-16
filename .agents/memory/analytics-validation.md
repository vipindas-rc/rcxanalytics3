---
name: Analytics validation harness
description: Test-runner boundaries and host requirements for Analytics verification.
---

# Analytics validation harness

Analytics validation has three separate contexts: deterministic Vitest runs only the `src`, `server`, and `evaluation` trees; standalone browser coverage uses the Analytics Playwright config with intercepted API fixtures; native browser coverage requires a running Supervisor host and an explicit `PLAYWRIGHT_BASE_URL`.

**Why:** The generic Vitest script also discovers Playwright gateway files and fails during collection, while native browser checks cannot use the standalone Vite port because they need Supervisor's native routes.

**How to apply:** Use the package's deterministic script for unit/integration checks, the standalone Playwright config for fixture-driven UI tests, and the native gateway config only against a running Supervisor host or the isolated gateway harness.