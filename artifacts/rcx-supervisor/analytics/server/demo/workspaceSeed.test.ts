import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../src/lib/model.ts'
import { assertSafeDemoWorkspace, sanitizeWorkspaceForDemo } from './workspaceSeed.ts'

const workspace = (): Workspace => ({
  version: 4, revision: 42, sessions: [], projects: [{ id: 'project-inbox', name: 'Analytics' }], datasets: [], artifacts: [], savedCharts: [], dashboards: [],
  requests: [{ id: 'request-1', sessionId: 'session-1', question: 'Queued question', status: 'pending', phase: 'Planning', userMessageId: 'message-1', createdAt: '2026-09-15T00:00:00.000Z' }],
  preferences: {}, briefings: [], responseCache: { cached: true },
})

describe('demo workspace safety', () => {
  it('removes mutable request and cache state while preserving synthetic workspace content', () => {
    const result = sanitizeWorkspaceForDemo(workspace())
    expect(result.requests).toEqual([])
    expect(result.responseCache).toEqual({})
    expect(result.projects).toEqual(workspace().projects)
    expect(result.revision).toBe(1)
  })

  it('rejects credential-shaped values before a workspace can become a demo seed', () => {
    const unsafe = workspace() as Workspace & { token?: string }
    unsafe.token = 'gho_abcdefghijklmnopqrstuvwxyz1234567890'
    expect(() => assertSafeDemoWorkspace(unsafe)).toThrow(/unsafe secret/i)
  })
})
