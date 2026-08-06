---
name: Upstream sibling-repo ports via synthetic merge base
description: How to merge features from the sibling GitHub copy of rcx-supervisor whose git history is unrelated to this workspace.
---

The GitHub sibling repo (AI-Agents-in-CX-Supervisor-View-Monitoring) shares no git ancestry with this workspace, so plain `git merge` cannot three-way merge.

**Why:** The workspace was seeded from an upstream snapshot, not forked — histories are unrelated, but the trees share a common baseline.

**How to apply:** In a scratch clone, find the upstream commit whose tree best matches the local import baseline (tree-similarity scan), create a synthetic commit reusing the local `main` tree with that upstream commit as parent, then merge the upstream branch onto it. Most files auto-merge; resolve remaining conflicts favoring local for memory files, tsconfig/vite/artifact config, and URL-state routing.

Pitfalls to check after any such merge:
- Auto-merge can mix incompatible data models across files (e.g. one side's multi-select array filter state vs the other's single-select strings). After resolving, grep for stale sentinel comparisons (like `!== "All"` on a value that became an array) — they typecheck-pass in the tsc-excluded proto tree and silently break behavior.
- Upstream memory files and attached_assets screenshots merge in as adds — strip them.
- Page code is typechecked but the vendored proto tree is tsc-excluded: proto-side errors (e.g. duplicate re-exports) surface only at Vite runtime, so restart the workflow and watch logs.
