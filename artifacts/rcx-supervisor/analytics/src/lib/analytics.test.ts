import { describe, expect, it } from 'vitest'
import { applyView, capabilities, compilePresentation, createArtifact, generateDataset, normalizeChartType } from './analytics'
import type { ChartView, Renderer } from './model'
const data = () => generateDataset({ title: 'Annual sales', seed: 42, fields: [{ id: 'month', name: 'Month', type: 'date', values: Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`) }, { id: 'region', name: 'Region', type: 'category', values: ['North', 'South', 'East', 'West', 'Central'] }, { id: 'sales', name: 'Sales', type: 'number', min: 10, max: 100, precision: 2, unit: 'USD' }, { id: 'calls', name: 'Calls', type: 'number', min: 100, max: 200 }] })
const view = (chartType: string, extra: Partial<ChartView> = {}): ChartView => ({ chartType, x: 'month', y: 'sales', aggregation: 'sum', filters: [], ...extra })
const engines: Renderer[] = ['echarts', 'chartjs', 'plotly']
describe('typed synthetic analytics', () => {
  it('preserves all 60 rows, decimal precision and deterministic source values', () => { const a = data(); expect(a.rows).toHaveLength(60); expect(a.rows).toEqual(data().rows); expect(a.rows.some(r => Number(r.sales) % 1 !== 0)).toBe(true); const before = JSON.stringify(a.rows); for (const engine of engines) { const v = view('grouped bar', { series: 'region' }); expect(compilePresentation(createArtifact(a, v, 'Annual'), a, engine).rows).toHaveLength(60) } expect(JSON.stringify(a.rows)).toBe(before) })
  it.each(engines)('retains donut category totals and a hole in %s', renderer => { const d = data(), v = view('doughnut', { x: 'region' }); const p = compilePresentation(createArtifact(d, v, 'Donut'), d, renderer); expect(p.renderer).toBe(renderer); const totals = applyView(d, v).map(r => r.sales); if (renderer === 'echarts') { expect(p.spec.series[0].radius[0]).not.toBe('0%'); expect(p.spec.series[0].data.map((r: any) => r.value)).toEqual(totals) } else if (renderer === 'chartjs') { expect(p.spec.type).toBe('doughnut'); expect(p.spec.options.cutout).toBeTruthy(); expect(p.spec.data.datasets[0].data).toEqual(totals) } else { expect(p.spec.data[0].hole).toBeGreaterThan(0); expect(p.spec.data[0].values).toEqual(totals) } })
  it.each(engines)('preserves numeric scatter coordinates in %s', renderer => { const d = data(), v = view('scatter', { x: 'calls' }); const p = compilePresentation(createArtifact(d, v, 'Scatter'), d, renderer); if (renderer === 'echarts') expect(p.spec.series[0].data.map((r: any) => Array.isArray(r) ? r.slice(0, 2) : r.value.slice(0, 2))).toEqual(d.rows.map(r => [r.calls, r.sales])); else if (renderer === 'chartjs') expect(p.spec.data.datasets[0].data.map((r: any) => [r.x, r.y])).toEqual(d.rows.map(r => [r.calls, r.sales])); else { expect(p.spec.data[0].x).toEqual(d.rows.map(r => r.calls)); expect(p.spec.data[0].y).toEqual(d.rows.map(r => r.sales)) } })
  it('rejects ambiguous and invalid population pyramids without truncation', () => { expect(() => normalizeChartType('pyramid')).toThrow(/Clarify/); const d = data(); expect(capabilities(d, view('population pyramid', { series: 'region' })).every(c => !c.supported && /exactly two/.test(c.reason!))).toBe(true); const v = view('population pyramid', { series: 'region', filters: [{ field: 'region', operator: 'in', value: ['North', 'South'] }] }); const p = compilePresentation(createArtifact(d, v, 'Population'), d, 'echarts'); expect(p.rows).toHaveLength(24); expect(p.spec.series).toHaveLength(2); expect(p.spec.series.map((s: any) => s.name).sort()).toEqual(['North', 'South']) })
  it('compiles area, regression, and heatmap examples with compatible fields', () => {
    const d = data()
    expect(compilePresentation(createArtifact(d, view('area'), 'Area'), d, 'echarts').spec.series[0].type).toBe('line')
    expect(compilePresentation(createArtifact(d, view('regression', { x: 'calls', y: 'sales' }), 'Regression'), d, 'plotly').spec.data).toHaveLength(2)
    expect(compilePresentation(createArtifact(d, view('heatmap', { x: 'month', y: 'sales', series: 'region' }), 'Heatmap'), d, 'echarts').spec.series[0].type).toBe('heatmap')
  })
  it.each(engines)('combines bar and line with real aligned measures in %s', renderer => { const d = data(), v = view('combo', { y2: 'calls' }), p = compilePresentation(createArtifact(d, v, 'Combined'), d, renderer), expected = applyView(d, v); if (renderer === 'echarts') { expect(p.spec.series.map((s: any) => s.type)).toEqual(['bar', 'line']); expect(p.spec.series[1].data).toEqual(expected.map(r => r.calls)); expect(p.spec.series[1].yAxisIndex).toBe(1) } else if (renderer === 'chartjs') { expect(p.spec.data.datasets.map((s: any) => s.type)).toEqual(['bar', 'line']); expect(p.spec.data.datasets[1].data).toEqual(expected.map(r => r.calls)); expect(p.spec.data.datasets[1].yAxisID).toBe('y2') } else { expect(p.spec.data.map((s: any) => s.type)).toEqual(['bar', 'scatter']); expect(p.spec.data[1].y).toEqual(expected.map(r => r.calls)); expect(p.spec.data[1].yaxis).toBe('y2') } })
  it('computes ratio of totals and filters without mutation', () => { const d = data(); d.fields.push({ id: 'rate', name: 'Rate', type: 'number', unit: '%', numerator: 'sales', denominator: 'calls' }); const before = JSON.stringify(d.rows), v = view('bar', { y: 'rate', aggregation: 'ratio', filters: [{ field: 'region', operator: 'eq', value: 'North' }], sort: 'descending' }); const rows = applyView(d, v); expect(rows).toHaveLength(12); expect(rows.map(row => row.month)).toEqual([...rows.map(row => row.month)].sort()); const k = createArtifact(d, v, 'Ratio').kpis[0]; const filtered = d.rows.filter(r => r.region === 'North'); expect(k.value).toBeCloseTo(filtered.reduce((s, r) => s + Number(r.sales), 0) / filtered.reduce((s, r) => s + Number(r.calls), 0) * 100); expect(JSON.stringify(d.rows)).toBe(before); d.rows.forEach(r => { r.calls = 0 }); expect(() => applyView(d, v)).toThrow(/zero/) })
  it('rejects unsupported charts and invalid numeric inputs', () => { expect(() => normalizeChartType('banana')).toThrow(/Unsupported/); const d = data(); expect(() => createArtifact(d, view('bar', { filters: [{ field: 'sales', operator: 'gte', value: 'bad' }] }), 'Bad')).toThrow(/finite/) })
  it('calculates means and counts from source rows, retaining sorted categories', () => { const d = data(), v = view('bar', { x: 'region', aggregation: 'mean', sort: 'descending' }); const rows = applyView(d, v); expect(rows[0].sales).toBeCloseTo(Math.max(...['North', 'South', 'East', 'West', 'Central'].map(region => d.rows.filter(r => r.region === region).reduce((sum, r) => sum + Number(r.sales), 0) / 12))); expect(applyView(d, { ...v, aggregation: 'count' }).map(r => r.sales)).toEqual([12, 12, 12, 12, 12]); for (const renderer of engines) { const spec = compilePresentation(createArtifact(d, v, 'Sorted mean'), d, renderer).spec; const labels = renderer === 'echarts' ? spec.xAxis.data : renderer === 'chartjs' ? spec.data.labels : spec.data[0].x; expect(labels).toEqual(rows.map(r => r.region)) } })
  it('uses readable KPI labels for aggregate values', () => { const d = data(); expect(createArtifact(d, view('bar'), 'Sales').kpis[0].label).toBe('Total Sales'); expect(createArtifact(d, view('bar', { aggregation: 'mean' }), 'Sales').kpis[0].label).toBe('Average Sales') })
  it('sorts date dimensions chronologically and accepts ISO date ranges', () => { const d = data(), v = view('line', { filters: [{ field: 'month', operator: 'gte', value: '2026-03' }, { field: 'month', operator: 'lte', value: '2026-05' }] }); const rows = applyView(d, v); expect(rows.map(row => row.month)).toEqual(['2026-03', '2026-04', '2026-05']) })
  it('uses real funnel templates with every stage and explains compatible fallback', () => { const d = data(), v = view('funnel', { x: 'region' }); const p = compilePresentation(createArtifact(d, v, 'Funnel'), d, 'chartjs'); expect(p.renderer).toBe('echarts'); expect(p.notice).toMatch(/no verified funnel/); expect(p.spec.series[0].type).toBe('funnel'); expect(p.spec.series[0].data).toHaveLength(5); const plotly = compilePresentation(createArtifact(d, v, 'Funnel'), d, 'plotly'); expect(plotly.spec.data[0].type).toBe('funnel'); expect(plotly.spec.data[0].y).toHaveLength(5) })

})


describe('report data boundaries', () => {
  it('compares numeric ranges numerically across digit boundaries', () => {
    const dataset = data()
    dataset.rows = [2, 9, 10, 100].map(sales => ({ month: `value-${sales}`, region: 'North', sales, calls: 1 }))
    const filtered = applyView(dataset, view('table', { y: undefined, filters: [
      { field: 'sales', operator: 'gte', value: 9 },
      { field: 'sales', operator: 'lte', value: 10 },
    ] }))
    expect(filtered.map(row => row.sales)).toEqual([9, 10])
    expect(dataset.rows.map(row => row.sales)).toEqual([2, 9, 10, 100])
  })

  it.each(engines)('preserves a legitimate empty table in %s without replacement records', renderer => {
    const dataset = data()
    const before = structuredClone(dataset.rows)
    const emptyView = view('table', { y: undefined, filters: [{ field: 'region', operator: 'eq', value: 'No matching region' }] })
    const artifact = createArtifact(dataset, emptyView, 'Empty filtered report', renderer)
    const presentation = compilePresentation(artifact, dataset, renderer)
    expect(presentation.rows).toEqual([])
    expect(presentation.renderer).toBe(renderer)
    expect(dataset.rows).toEqual(before)
    expect(artifact.datasetId).toBe(dataset.id)
  })
})
