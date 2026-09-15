# Memory index

- [rcx-supervisor import quirks](rcx-supervisor-import.md) — imported artifact with own Express+Vite server, React 18 pin, `check` script, excluded proto tree; view 2/3 pruning + takeover gating notes.
- [Upstream ports via synthetic merge base](upstream-port-merge.md) — sibling GitHub repo has unrelated history; graft local tree onto the matching upstream commit and merge.
- [Figma design access](figma-access.md) — no Figma connector; use FIGMA_ACCESS_TOKEN with the REST images API to export frames (share links need login).
- [Git authentication on Replit](git-auth-replit-askpass.md) — stale GIT_ASKPASS can override valid GitHub CLI credentials; SSH is the reliable fallback.
- [Interaction modal URL cleanup](interaction-modal-url-cleanup.md) — invalid targets replace the full route; malformed optional modal state removes only that optional parameter.
- [Analytics isolation](analytics-isolation.md) — keep React 19 Analytics in content boundary; `/api` belongs to separate artifact, so use non-conflicting gateway.
