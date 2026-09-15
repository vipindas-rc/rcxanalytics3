import type { Workspace } from '../../src/lib/model.ts'

const unsafeKey = /(api[_-]?key|access[_-]?token|auth(orization)?|password|secret|private[_-]?key)/i
const unsafeValue = /(?:sk-[A-Za-z0-9_-]{12,}|gho_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|postgres(?:ql)?:\/\/[^\s"']+@)/i

function findUnsafe(value: unknown, path = 'workspace'): string | undefined {
  if (typeof value === 'string') return unsafeValue.test(value) ? path : undefined
  if (!value || typeof value !== 'object') return undefined
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (unsafeKey.test(key)) return childPath
    const match = findUnsafe(child, childPath)
    if (match) return match
  }
  return undefined
}

export function assertSafeDemoWorkspace(workspace: Workspace): void {
  const unsafePath = findUnsafe(workspace)
  if (unsafePath) throw new Error(`Unsafe secret-shaped value at ${unsafePath}.`)
  if (workspace.requests.length > 0) throw new Error('Demo workspace must not contain request runtime state.')
  if (Object.keys(workspace.responseCache ?? {}).length > 0) throw new Error('Demo workspace must not contain response cache state.')
}

export function sanitizeWorkspaceForDemo(workspace: Workspace): Workspace {
  const clean: Workspace = {
    ...structuredClone(workspace),
    revision: 1,
    requests: [],
    responseCache: {},
  }
  assertSafeDemoWorkspace(clean)
  return clean
}
