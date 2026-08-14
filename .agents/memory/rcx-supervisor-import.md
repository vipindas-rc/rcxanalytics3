---
name: rcx-supervisor import quirks
description: Sharp edges of the rcx-supervisor artifact imported from the Cherry-picking repo (own Express+Vite server, React 18, vendored proto tree).
---

# rcx-supervisor import quirks

- Artifact was imported wholesale from the Cherry-picking GitHub repo into a fresh `createArtifact` shell; only `.replit-artifact/` is the new scaffold's. It is NOT the standard react-vite scaffold: its own Express server (`server/index.ts`, tsx) serves Vite middleware and binds `PORT`; `BASE_PATH` is unused (previewPath `/`).
- Typecheck script is `check` (plain `tsc`), not `typecheck`; root typecheck skips this package. `client/src/proto` is excluded from tsc — never import `@/proto/...` outside the proto tree; use the ambient `@proto` module (`client/src/proto-module.d.ts`).
- Only React 18 artifact in a React 19 workspace; tsconfig `paths` pin react types locally. Keep that pin.
- Views pruned: `?view=` normalizes to `supervisor-3` (default, clean URL) or `supervisor-2`; agent/supervisor/cherry-picking/agent-2 branches remain as dead code but are unreachable. Takeover mode is gated on classic `isSupervisorView` and therefore always downgrades to preview — this matches the source repo's behavior for view 2/3, not a regression.
- Console warnings (MUI adaptV4Theme, styled-components isActive prop) come from vendored RingCX code; pre-existing noise, ignore.

**Why:** future edits that "clean up" the tsconfig pin, rename the check script, or re-enable takeover for view 2/3 would break the build or change source-faithful behavior.


## Exposing proto code to the page
The `@proto` alias resolves to `proto/AgentTablePanel.tsx` (vite.config.ts) and the proto tree is excluded from tsc — anything the page imports must be BOTH re-exported from AgentTablePanel.tsx and hand-declared in `client/src/proto-module.d.ts`, or `pnpm run check` fails with "no exported member".
## URL modal whitelist
New `?modal=` dialog ids silently self-close unless added to the `MODAL_IDS` whitelist in `client/src/hooks/useUrlState.ts` — a cleanup effect strips unknown ids as stale. Add the id there AND to the readOnly close-list in AgentTablePanel before debugging "dialog won't open" from a deep link.

## Flow-scoped mock data
The queue store keeps two independent row sets (compact vs extended) so high-volume demo flows don't leak row counts into the other flows; any new "high volume" flow variant needs its own set or a seeded-volume prop plus a remount key, never a global cap change. The ambient `@proto` module declarations must be updated in lockstep with AgentTablePanel's exported props/hooks or `tsc` fails.
