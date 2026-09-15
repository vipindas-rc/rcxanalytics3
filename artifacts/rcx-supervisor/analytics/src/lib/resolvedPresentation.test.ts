import { describe, expect, it } from 'vitest'
import { compilePresentation, compileResolvedPresentation, createArtifact } from './analytics'
import type { Dataset, Renderer } from './model'

const dataset: Dataset = { id: 'source', title: 'Agents', seed: 1, createdAt: '2026-09-14', colors: {}, fields: [{ id: 'type', name: 'Type', type: 'category' }, { id: 'agents', name: 'Agents', type: 'number' }], rows: [{ type: 'AI', agents: 1 }, { type: 'Human', agents: 1 }] }
const view = { chartType: 'bar', x: 'type', y: 'agents', aggregation: 'count' as const, filters: [] }
const engines: Renderer[] = ['echarts', 'chartjs', 'plotly']

describe('computed presentations', () => {
  it.each(engines)('does not aggregate SQL count results again in %s', renderer => {
    const artifact = createArtifact(dataset, view, 'Agent counts')
    const rows = [{ type: 'AI', agents: 200 }, { type: 'Human', agents: 37 }]
    const before = structuredClone(rows)
    const p = compileResolvedPresentation(artifact, dataset, renderer, { rows, kpis: [{ label: 'Agents', value: 237 }] })
    expect(p.rows).toEqual(rows)
    expect(p.kpis).toEqual([{ label: 'Agents', value: 237 }])
    const actual = renderer === 'echarts' ? p.spec.series[0].data : renderer === 'chartjs' ? p.spec.data.datasets[0].data : p.spec.data[0].y
    expect(actual).toEqual([200, 37])
    expect(rows).toEqual(before)
  })
  it.each(engines)('keeps empty charts empty in %s without invented KPIs', renderer => {
    const artifact = createArtifact(dataset, { ...view, filters: [{ field: 'type', operator: 'eq', value: 'Absent' }] }, 'Empty chart')
    expect(artifact.kpis).toEqual([])
    expect(compilePresentation(artifact, dataset, renderer)).toMatchObject({ renderer, rows: [], spec: { type: 'empty' } })
  })
  it('validates computed rows even when legacy source rows are valid', () => {
    const artifact = createArtifact(dataset, view, 'Agent counts')
    expect(() => compileResolvedPresentation(artifact, dataset, 'echarts', { rows: [{ type: 'AI', agents: Infinity }] })).toThrow(/finite/)
  })
})
