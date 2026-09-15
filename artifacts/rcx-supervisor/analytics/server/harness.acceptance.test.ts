import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { Store } from './store.ts'
import { createApp } from './app.ts'
import type { Model } from './inference.ts'
import type { Dataset } from '../src/lib/model.ts'
import { createArtifact } from '../src/lib/analytics.ts'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function setup(model: Model, examples?: Parameters<typeof createApp>[4]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'harness-acceptance-'))
  const store = new Store(path.join(directory, 'workspace.json'))
  await store.initialize()
  const server = createApp(store, model, undefined, undefined, examples).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const api = async (route: string, body?: unknown): Promise<any> => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json()
    expect(response.ok, JSON.stringify(data)).toBe(true)
    return data
  }
  const finish = async (requestId: string) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const request = await api(`/requests/${requestId}`)
      if (request.status !== 'pending') {
        expect(request.status, request.error).toBe('completed')
        return request
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`Request ${requestId} did not finish`)
  }
  return { api, finish, store }
}

function dataset(id: string, title: string, rows: Dataset['rows']): Dataset {
  return {
    id, title, seed: 20260914, createdAt: '2026-09-14T00:00:00.000Z', colors: {}, rows,
    fields: [{ id: 'agentType', name: 'Agent Type', type: 'category' }, { id: 'activeAgents', name: 'Active agents', type: 'number', unit: 'agents' }],
  }
}

describe('unified harness acceptance', () => {
  it('prepares Queue abandonment data before writing an evidence-backed bar response without asking for uploads', async () => {
    const events: string[] = []
    const queueRows = [
      { queue: 'Sales', offered: 1000, abandoned: 30, abandonmentRate: 3 },
      { queue: 'Billing', offered: 200, abandoned: 20, abandonmentRate: 10 },
      { queue: 'Account Services', offered: 300, abandoned: 15, abandonmentRate: 5 },
      { queue: 'Returns', offered: 500, abandoned: 10, abandonmentRate: 2 },
      { queue: 'Technical Support', offered: 400, abandoned: 16, abandonmentRate: 4 },
    ]
    const prepare = async () => { events.push('prepare'); return { datasetId: 'queue-example', revisionId: 'queue-revision', generated: true } }
    const query = async () => {
      events.push('query')
      return {
        datasetId: 'queue-example', revisionId: 'queue-revision', rows: queueRows,
        fields: [{ id: 'queue', name: 'Queue', type: 'category' }, { id: 'offered', name: 'Offered', type: 'number', unit: 'calls' }, { id: 'abandoned', name: 'Abandoned', type: 'number', unit: 'calls' }, { id: 'abandonmentRate', name: 'Abandonment Rate', type: 'number', unit: 'percent' }],
        pagination: { offset: 0, limit: 5, total: 5 },
        evidence: {
          offered: 2400, abandoned: 91, abandonmentRate: 91 / 2400 * 100,
          definitions: { offered: 'Offered calls', abandoned: 'Abandoned offered calls', abandonmentRate: 'sum(abandoned) / sum(offered) * 100' },
          provenance: { synthetic: true, generatorVersion: 'queue-v1', definitionVersion: 'queue-definition-v1', assumptions: [] },
        },
      }
    }
    const examples = { prepareExample: prepare, queryExample: query, prepareQueueAbandonment: prepare, queryQueueAbandonment: query }
    const { api, finish } = await setup(async context => {
      events.push('write')
      expect(context.dataset?.rows).toEqual(queueRows)
      return { kind: 'chart', text: 'Queue abandonment comparison.', charts: [{ title: 'Queue abandonment', reuseDataset: true, fields: [], seed: 20260914, view: { chartType: 'bar', x: 'queue', y: 'abandonmentRate', aggregation: 'mean', filters: [] } }] }
    }, examples as unknown as NonNullable<Parameters<typeof createApp>[4]>)
    const session = await api('/sessions', {})
    await api('/conversation', { sessionId: session.id, requestId: 'queue-starter', question: 'Compare abandonment rates across five fictional queues as a bar chart.' })
    await finish('queue-starter')
    expect(events.slice(0, 2)).toEqual(['prepare', 'query'])
    const workspace = await api('/workspace')
    const response = workspace.sessions.find((item: { id: string }) => item.id === session.id).messages.at(-1)
    expect(response.text).not.toMatch(/upload|connect (?:a |your )?(?:data|source)|provide (?:the |your )?data|data.*not available/i)
    expect(response.evidence).toBeDefined()
    const artifact = workspace.artifacts.find((item: { id: string }) => item.id === response.artifactIds[0])
    expect(artifact.view).toMatchObject({ chartType: 'bar', x: 'queue', y: 'abandonmentRate' })
    const rendered = await api(`/artifacts/${artifact.id}/render`, { renderer: 'echarts' })
    expect(rendered.rows.map((row: { queue: string; abandonmentRate: number }) => [row.queue, row.abandonmentRate])).toEqual(queueRows.map(row => [row.queue, row.abandonmentRate]))
  })

  it('reuses persisted workflow evidence for a presentation-only follow-up', async () => {
    let preparations = 0
    const examples = {
      prepareWorkflowVolume: async () => { preparations++; return { datasetId: 'workflow-volume-v1', revisionId: 'workflow-revision-1', generated: true } },
      queryWorkflowVolume: async () => ({
        datasetId: 'workflow-volume-v1', revisionId: 'workflow-revision-1',
        rows: [{ workflow: 'Lead Follow-up', interactionVolume: 40 }, { workflow: 'Billing Inquiry', interactionVolume: 30 }],
        fields: [{ id: 'workflow', name: 'Workflow', type: 'category' as const }, { id: 'interactionVolume', name: 'Interaction Volume', type: 'number' as const, unit: 'interactions' }],
        pagination: { offset: 0, limit: 2, total: 2 },
        evidence: { totalInteractions: 70, definitions: { interactionVolume: 'Sum of non-overlapping daily workflow interaction counts.' }, provenance: { generatorVersion: 'workflow-volume-v1', assumptions: [] } },
      }),
    }
    const { api, finish } = await setup(async context => {
      expect(context.dataset?.rows).toEqual([{ workflow: 'Lead Follow-up', interactionVolume: 40 }, { workflow: 'Billing Inquiry', interactionVolume: 30 }])
      return { kind: 'chart', text: 'Workflow comparison.', charts: [{ title: 'Workflow volume', reuseDataset: true, fields: [], seed: 20260914, view: { chartType: 'bar', x: 'workflow', y: 'interactionVolume', aggregation: 'sum', filters: [] } }] }
    }, examples)
    const session = await api('/sessions', {})
    await api('/conversation', { sessionId: session.id, requestId: 'workflow-first', question: 'Compare fictional workflow interaction volumes by workflow as a donut chart.' })
    await finish('workflow-first')
    const firstWorkspace = await api('/workspace')
    const firstMessage = firstWorkspace.sessions.find((item: { id: string }) => item.id === session.id).messages.at(-1)
    const firstArtifact = firstWorkspace.artifacts.find((item: { id: string }) => item.id === firstMessage.artifactIds[0])
    const firstDataset = firstWorkspace.datasets.find((item: { id: string }) => item.id === firstArtifact.datasetId)
    await api('/conversation', { sessionId: session.id, requestId: 'workflow-follow-up', question: 'Show this as a bar chart.' })
    await finish('workflow-follow-up')
    const workspace = await api('/workspace')
    const lastMessage = workspace.sessions.find((item: { id: string }) => item.id === session.id).messages.at(-1)
    const lastArtifact = workspace.artifacts.find((item: { id: string }) => item.id === lastMessage.artifactIds[0])
    expect(preparations).toBe(1)
    expect(lastArtifact.datasetId).toBe(firstDataset.id)
    expect(lastArtifact.view.chartType).toBe('bar')
    expect(lastMessage.analysisReference).toEqual(firstMessage.analysisReference)
    const rendered = await api(`/artifacts/${lastArtifact.id}/render`, { renderer: 'echarts' })
    expect(rendered.rows).toEqual(firstDataset.rows)
    expect(lastMessage.text).not.toMatch(/upload|connect (?:a |your )?(?:data|source)|provide (?:the |your )?data|data.*not available/i)
  })

  it('uses the explicitly selected historical source rather than the latest chart', async () => {
    let selectedDataset: string | undefined
    const { api, finish, store } = await setup(async context => {
      selectedDataset = context.dataset?.id
      return { kind: 'text', text: 'Explaining the selected source.' }
    })
    const session = await api('/sessions', {})
    const older = dataset('older-dataset', 'Earlier agent comparison', [{ agentType: 'ai', activeAgents: 3 }])
    const newer = dataset('newer-dataset', 'Newer agent comparison', [{ agentType: 'human', activeAgents: 5 }])
    const artifacts = [older, newer].map(data => createArtifact(data, { chartType: 'bar', x: 'agentType', y: 'activeAgents', aggregation: 'sum', filters: [] }, data.title))
    await store.mutate(workspace => {
      workspace.datasets.push(older, newer)
      workspace.artifacts.push(...artifacts)
      workspace.sessions.find(item => item.id === session.id)!.messages.push(
        { id: 'older-answer', role: 'assistant', text: 'Earlier result', artifactIds: [artifacts[0].id], createdAt: '2026-09-14T00:00:00.000Z' },
        { id: 'newer-answer', role: 'assistant', text: 'Latest result', artifactIds: [artifacts[1].id], createdAt: '2026-09-14T00:01:00.000Z' },
      )
    })
    await api('/conversation', { sessionId: session.id, requestId: 'historical-follow-up', selectedFollowUpFrom: 'older-answer', question: 'Explain this without a chart.' })
    await finish('historical-follow-up')
    expect(selectedDataset).toBe(older.id)
  })

  it('preserves human-only chart rows and KPI agreement in all renderers', async () => {
    const { api, store } = await setup(async () => ({ kind: 'text', text: 'Unused' }))
    const data = dataset('cohort-evidence', 'Agent counts', [{ agentType: 'ai', activeAgents: 3 }, { agentType: 'human', activeAgents: 5 }])
    const artifact = createArtifact(data, { chartType: 'bar', x: 'agentType', y: 'activeAgents', aggregation: 'sum', filters: [{ field: 'agentType', operator: 'eq', value: 'human' }] }, 'Human agent counts')
    artifact.analysisReference = {
      datasetId: 'operational-agent-data', datasetRevision: 'immutable-revision', metricDefinitionVersion: 1,
      scope: { period: { from: '2026-08-31T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' }, timezone: 'UTC', filters: artifact.view.filters },
      queryId: 'human-agent-counts',
    }
    await store.mutate(workspace => { workspace.datasets.push(data); workspace.artifacts.push(artifact) })
    for (const renderer of ['echarts', 'chartjs', 'plotly']) {
      const presentation = await api(`/artifacts/${artifact.id}/render`, { renderer })
      expect(presentation.rows, renderer).toEqual([{ agentType: 'human', activeAgents: 5 }])
      expect(presentation.kpis[0].value, renderer).toBe(5)
    }
  })
})
