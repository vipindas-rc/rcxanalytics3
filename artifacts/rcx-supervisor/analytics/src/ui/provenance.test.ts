import { describe, expect, it } from 'vitest'
import type { Artifact, Dataset } from '../lib/model'
import { provenanceItems } from './provenance'

const dataset = { id: 'workflow-example', title: 'Workflow examples', seed: 9, fields: [], rows: [], createdAt: '2026-09-14T00:00:00.000Z', colors: {} } as Dataset
const artifact = {
  id: 'workflow-volume', title: 'Workflow Interaction Volume', datasetId: dataset.id,
  view: { chartType: 'donut', aggregation: 'sum', filters: [] }, renderer: 'echarts', createdAt: '2026-09-14T00:00:00.000Z', summary: '', kpis: [],
  evidence: {
    id: 'evidence-1', reference: { datasetId: dataset.id, datasetRevision: 'revision-2', metricDefinitionVersion: 1, scope: { period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' }, timezone: 'UTC', filters: [] }, queryId: 'query-1' },
    metrics: [], facts: [], groups: [], provenance: { synthetic: true, seed: 9, generatorVersion: 'workflow-v1', generatedAt: '2026-09-14T00:00:00.000Z' }, limitations: ['Fictional workflow interaction data.'],
  },
} as Artifact

describe('provenanceItems', () => {
  it('keeps generated-data provenance available on demand without a persistent synthetic label', () => {
    expect(provenanceItems(artifact, dataset)).toEqual([
      ['Source', 'Generated example'],
      ['Period', 'Sep 1, 2026 – Sep 14, 2026'],
      ['Definition', 'workflow-v1'],
      ['Limitations', 'Fictional workflow interaction data.'],
    ])
  })
})
