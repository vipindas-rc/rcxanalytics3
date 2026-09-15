import { describe, expect, it } from 'vitest'
import type { Artifact, SourceContext } from '../lib/model'
import { followUpIdentity, resolveAdvisorSource } from './conversationContext'

const artifact = {
  id: 'workflow-volume',
  title: 'Workflow Interaction Volume',
  datasetId: 'workflow-data',
} as Artifact

describe('conversation context helpers', () => {
  it('keeps an Advisor source attached to the artifact that opened it', () => {
    const stale: SourceContext = {
      artifactId: 'queue-abandonment',
      filters: [{ field: 'queue', operator: 'eq', value: 'Sales' }],
      sourceLabel: 'Queue abandonment',
    }

    expect(resolveAdvisorSource(artifact, stale)).toEqual({
      artifactId: 'workflow-volume',
      datasetId: 'workflow-data',
      filters: [],
      sourceLabel: 'Workflow Interaction Volume',
    })
  })

  it('preserves matching explicit source details and gives each suggestion a stable identity', () => {
    const matching: SourceContext = {
      artifactId: 'workflow-volume',
      datasetId: 'workflow-data',
      filters: [{ field: 'channel', operator: 'eq', value: 'voice' }],
      sourceLabel: 'Workflow Interaction Volume · voice',
    }

    expect(resolveAdvisorSource(artifact, matching)).toEqual(matching)
    expect(followUpIdentity('message-17', 1)).toBe('message-17:1')
  })
})
