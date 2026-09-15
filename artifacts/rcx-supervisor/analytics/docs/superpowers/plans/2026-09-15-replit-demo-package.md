# Clone-safe Replit Demo Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh clone reproducibly restore a safe synthetic RCX Analytics demo without publishing credentials or raw local database storage.

**Architecture:** A pure TypeScript sanitizer turns the locally persisted workspace into a stable demo seed. A bootstrap CLI validates the committed seed and writes it only when the destination is absent or explicitly replaced. PostgreSQL remains reproduced by migrations and deterministic seed commands, while documentation gives Replit and LLMs a safe startup contract.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest, npm, PostgreSQL migrations, Express/Vite.

## Global Constraints

- Commit only synthetic demo state; never commit `.env`, credential-shaped values, raw PostgreSQL directories, dumps, WAL, logs, or user-private runtime files.
- A fresh clone must have an explicit, documented bootstrap path.
- Existing `server/data/workspace.json` must never be overwritten without `--force`.
- Keep OpenAI credentials server-only; Codex remains the default provider path.
- Preserve existing migration and deterministic seed scripts.

---

### Task 1: Create a safe workspace-seed contract

**Files:**
- Create: `server/demo/workspaceSeed.ts`
- Create: `server/demo/workspaceSeed.test.ts`

**Interfaces:**
- Produces `sanitizeWorkspaceForDemo(workspace: Workspace): Workspace`.
- Produces `assertSafeDemoWorkspace(workspace: Workspace): void`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(sanitizeWorkspaceForDemo(workspace).requests).toEqual([])
expect(() => assertSafeDemoWorkspace(workspaceWithSecret)).toThrow(/unsafe/i)
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- server/demo/workspaceSeed.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement sanitization**

```ts
export function sanitizeWorkspaceForDemo(workspace: Workspace): Workspace {
  return { ...workspace, requests: [], responseCache: {} }
}
```

Extend it to recursively reject keys/value strings matching credentials and remove active request/runtime cache state.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `npm test -- server/demo/workspaceSeed.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/demo/workspaceSeed.ts server/demo/workspaceSeed.test.ts
git commit -m "feat: add safe demo workspace sanitizer"
```

### Task 2: Add deterministic seed export and restore commands

**Files:**
- Create: `server/demo/seedCli.ts`
- Create: `server/demo/seedCli.test.ts`
- Create: `demo/workspace.seed.json`
- Modify: `package.json`

**Interfaces:**
- `writeDemoSeed(sourcePath, targetPath): Promise<void>` creates a sanitized tracked snapshot.
- `restoreDemoWorkspace(seedPath, targetPath, force): Promise<void>` refuses non-empty targets unless force is true.
- Package scripts are `demo:export` and `demo:restore`.

- [ ] **Step 1: Write failing restore tests**

```ts
await expect(restoreDemoWorkspace(seed, existing, false)).rejects.toThrow(/already exists/i)
await restoreDemoWorkspace(seed, missing, false)
expect(await readFile(missing, 'utf8')).toContain('sessions')
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- server/demo/seedCli.test.ts`  
Expected: FAIL because the CLI helpers do not exist.

- [ ] **Step 3: Implement minimal filesystem-safe export/restore helpers**

Use `mkdir`, `access`, `readFile`, and `writeFile`; validate every JSON seed with `assertSafeDemoWorkspace`; create no database dump.

- [ ] **Step 4: Generate and validate committed demo data**

Run: `npm run demo:export`  
Expected: writes `demo/workspace.seed.json` that passes secret scanning and has no requests/response cache.

- [ ] **Step 5: Run the test to verify GREEN and commit**

```bash
npm test -- server/demo/seedCli.test.ts
git add server/demo/seedCli.ts server/demo/seedCli.test.ts demo/workspace.seed.json package.json
git commit -m "feat: add reproducible demo workspace seed"
```

### Task 3: Provide Replit and LLM onboarding

**Files:**
- Create: `.env.example`
- Create: `LLM_HANDOFF.md`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- `.env.example` exposes only local database URLs and commented provider configuration.
- `LLM_HANDOFF.md` describes the source-of-truth, safe startup, test commands, and secret policy.

- [ ] **Step 1: Write a documentation assertion**

```ts
expect(readFileSync('LLM_HANDOFF.md', 'utf8')).toContain('never commit')
expect(readFileSync('.env.example', 'utf8')).not.toMatch(/sk-|gho_/)
```

- [ ] **Step 2: Run it to verify RED**

Run: `npm test -- server/demo/seedCli.test.ts`  
Expected: FAIL until onboarding artifacts exist.

- [ ] **Step 3: Add instructions**

Document install, environment setup, database migrations/seeds, demo restore, app start, verification, synthetic-data limitations, and provider selection. Link the GitHub repository and the Notion handoff.

- [ ] **Step 4: Run test to verify GREEN and commit**

```bash
npm test -- server/demo/seedCli.test.ts
git add .env.example LLM_HANDOFF.md README.md .gitignore server/demo/seedCli.test.ts
git commit -m "docs: add Replit and LLM onboarding"
```

### Task 4: Validate and publish

**Files:**
- Modify: `docs/implementation/qa.md` only if results need recording.

- [ ] **Step 1: Verify the committed tree**

```bash
git ls-files | rg '(^\.env$|server/data/(workspace|postgres)|node_modules|^dist/)' && exit 1 || true
git diff --check
```

Expected: no secret/local runtime file is tracked and no whitespace errors.

- [ ] **Step 2: Run project checks**

```bash
npm test
npm run build
npm run lint
```

Expected: unit suite and build pass; preserve factual warnings/skips if any.

- [ ] **Step 3: Push the commits**

```bash
git push origin main
```

Expected: GitHub main contains the application, demo seed, migrations, onboarding, and no local credentials/database internals.
