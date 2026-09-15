import { describe, expect, it } from 'vitest'
import { createConversationRequest } from './conversationRequest'

describe('createConversationRequest', () => {
  it('uses the same source envelope for an ordinary follow-up and Advisor follow-up', () => {
    const sourceContext = {
      artifactId: 'workflow-card',
      datasetId: 'workflow-example',
      filters: [{ field: 'workflow', operator: 'eq' as const, value: 'Billing inquiry' }],
      sourceLabel: 'Workflow Interaction Volume · Billing inquiry',
    }
    const base = {
      sessionId: 'session-1',
      requestId: 'request-1',
      question: 'Explain this without a chart.',
      sourceContext,
      selectedFollowUpFrom: 'assistant-4',
    }

    const request = createConversationRequest(base)
    expect(request).toMatchObject({
      ...base,
      contextArtifactId: 'workflow-card',
      contextFilters: sourceContext.filters,
      sourceLabel: sourceContext.sourceLabel,
    })
    expect(request.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  })

  it('keeps an explicit report separate from a chart source', () => {
    expect(() => createConversationRequest({
      sessionId: 'session-1',
      requestId: 'request-1',
      question: 'Show the details.',
      report: { id: 'agent-activity', version: 1 },
      sourceContext: { artifactId: 'workflow-card', filters: [] },
    })).toThrow(/either a report or a chart source/i)

    const request = createConversationRequest({
      sessionId: 'session-1', requestId: 'request-1', question: 'Open this report',
      report: { id: 'agent-activity', version: 1 },
    })
    expect(request).toMatchObject({
      sessionId: 'session-1', requestId: 'request-1', question: 'Open this report',
      reportId: 'agent-activity', reportVersion: 1,
    })
    expect(request.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  })
})
