# Spotlight Recents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render stable, one-line, meaningful Spotlight conversation results without changing stored titles.

**Architecture:** Add a small display-title resolver beside the Spotlight view that prefers the latest referenced artifact title and otherwise cleans boilerplate from the session title. Keep original titles in accessible metadata. Restore fixed-height one-line rows and verify the dialog does not move during filtering.

**Tech Stack:** React 19, TypeScript, Spring UI, CSS, Playwright

## Global Constraints

- Preserve stored conversations and workspace data.
- Use Spring components and theme tokens.
- Keep rows at least 44px high with visible keyboard focus.
- Keep the five-item Recents limit.

---

### Task 1: Compact Spotlight result labels

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `tests/e2e/advisor-dashboard.audit.spec.ts`

**Interfaces:**
- Consumes: `Session.messages[].artifactIds` and `Workspace.artifacts`
- Produces: `spotlightDisplayTitle(session: Session): string`

- [x] Add a browser test asserting a long stored title displays as a one-line artifact title, retains the original title as accessible context, and keeps the dialog top coordinate stable after filtering.
- [x] Run the focused test and confirm the current wrapped-row implementation fails.
- [x] Add `spotlightDisplayTitle`, use it for result text, and retain `session.title` in `title` and `aria-label`.
- [x] Restore one-line row layout with ellipsis only as an extreme-width fallback and keep the stable scroll frame.
- [x] Run the focused browser test, unit/API tests, production build, lint, and whitespace checks.
