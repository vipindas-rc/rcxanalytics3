import { assembleChartjs, assembleECharts, assemblePlotly, ecAllTemplateDefs, cjsAllTemplateDefs, plAllTemplateDefs } from 'flint-chart'
import type { AnalysisEvidence, Artifact, Capability, ChartView, Dataset, Field, InspectionMetadata, Kpi, Presentation, Renderer, Row } from './model.js'

const engines: Renderer[] = ['echarts', 'chartjs', 'plotly']
const templates = { echarts: ecAllTemplateDefs, chartjs: cjsAllTemplateDefs, plotly: plAllTemplateDefs }
const names: Record<string, string> = { bar: 'Bar Chart', 'grouped-bar': 'Grouped Bar Chart', 'stacked-bar': 'Stacked Bar Chart', line: 'Line Chart', area: 'Area Chart', scatter: 'Scatter Plot', regression: 'Regression', heatmap: 'Heatmap', pie: 'Pie Chart', funnel: 'Funnel Chart', 'population-pyramid': 'Pyramid Chart' }
export function normalizeChartType(type: string): string {
  const key = type.trim().toLowerCase().replace(/ chart$| plot$/g, '').replace(/[ _]+/g, '-')
  if (key === 'pyramid') throw new Error('Clarify pyramid: ordered funnel or population pyramid with exactly two comparison groups?')
  const alias: Record<string, string> = { doughnut: 'donut', 'area-chart': 'area', 'regression-chart': 'regression', 'bar-and-line': 'combo', 'bar-line': 'combo', 'combination': 'combo', 'grouped': 'grouped-bar', 'stacked': 'stacked-bar', 'population': 'population-pyramid' }
  const result = alias[key] ?? key
  if (!(result in names) && !['donut', 'combo', 'table', 'kpi'].includes(result)) throw new Error(`Unsupported chart type: ${type}. Choose bar, line, area, scatter, regression, heatmap, pie, donut, funnel, population pyramid, combo, KPI or table.`)
  return result
}
const finite = (value: unknown): number => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Numeric values must be finite numbers.'); return value }
const field = (dataset: Dataset, id?: string, numeric = false): Field => {
  const found = dataset.fields.find(f => f.id === id)
  if (!found || (numeric && found.type !== 'number')) throw new Error(`Missing ${numeric ? 'numeric ' : ''}field: ${id ?? '(unspecified)'}.`)
  return found
}
export function generateDataset(recipe: { title: string; seed: number; fields: Field[] }): Dataset {
  if (!Number.isInteger(recipe.seed) || !recipe.fields.length || new Set(recipe.fields.map(f => f.id)).size !== recipe.fields.length) throw new Error('Recipe requires an integer seed and unique fields.')
  let state = recipe.seed >>> 0
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 }
  let rows: Row[] = [{}]
  const colors: Record<string, number> = {}
  for (const f of recipe.fields.filter(f => f.type !== 'number')) {
    if (!f.values?.length || new Set(f.values).size !== f.values.length || f.values.some(v => typeof v !== 'string' || !v.length)) throw new Error(`Field ${f.id} requires unique category values.`)
    if (rows.length * f.values.length > 10000) throw new Error('Synthetic recipe exceeds 10000 rows.')
    rows = rows.flatMap(row => f.values!.map((value, i) => { colors[`${f.id}:${value}`] = i; return { ...row, [f.id]: value } }))
  }
  if (!recipe.fields.some(f => f.type !== 'number')) rows = Array.from({ length: 30 }, () => ({}))
  for (const f of recipe.fields.filter(f => f.type === 'number' && !f.numerator && !f.denominator)) {
    const min = finite(f.min ?? 0), max = finite(f.max ?? 100), precision = f.precision ?? 0
    if (max < min || !Number.isInteger(precision) || precision < 0 || precision > 8) throw new Error(`Invalid numeric range/precision for ${f.id}.`)
    for (const row of rows) row[f.id] = Number((min + random() * (max - min)).toFixed(precision))
  }
  for (const f of recipe.fields.filter(f => f.type === 'number' && (f.numerator || f.denominator))) {
    if (!f.numerator || !f.denominator) throw new Error(`Derived field ${f.id} requires numerator and denominator.`)
    for (const row of rows) { const denominator = finite(row[f.denominator]); if (!denominator) throw new Error(`Zero denominator for ${f.id}.`); row[f.id] = Number((finite(row[f.numerator]) / denominator * (f.unit === '%' ? 100 : 1)).toFixed(f.precision ?? 2)) }
  }
  return { id: crypto.randomUUID(), title: recipe.title, seed: recipe.seed, fields: structuredClone(recipe.fields), rows, colors, createdAt: new Date().toISOString() }
}
function filtered(dataset: Dataset, view: ChartView): Row[] {
  for (const f of view.filters ?? []) { const def = field(dataset, f.field); if (['gte', 'lte'].includes(f.operator) && !['number', 'date'].includes(def.type)) throw new Error('Range filters require numeric or date fields.'); if (!['eq', 'in', 'gte', 'lte'].includes(f.operator)) throw new Error('Unsupported filter operator.'); const values = Array.isArray(f.value) ? f.value : [f.value]; for (const value of values) { if (def.type === 'number') finite(value); else if (typeof value !== 'string') throw new Error('Category and date filters require strings.') } }
  return dataset.rows.filter(row => (view.filters ?? []).every(f => {
    if (f.operator === 'eq') return row[f.field] === f.value
    if (f.operator === 'in') return Array.isArray(f.value) && f.value.includes(row[f.field])
    const numeric = field(dataset, f.field).type === 'number'
    const left = numeric ? finite(row[f.field]) : String(row[f.field])
    const right = numeric ? finite(f.value) : String(f.value)
    return f.operator === 'gte' ? left >= right : left <= right
  }))
}
function aggregate(rows: Row[], dataset: Dataset, view: ChartView, id: string): number {
  const def = field(dataset, id, true)
  if (view.aggregation === 'count') return rows.length
  const numerator = view.numerator ?? def.numerator, denominator = view.denominator ?? def.denominator
  if (view.aggregation === 'ratio' || (def.numerator && def.denominator)) {
    field(dataset, numerator, true); field(dataset, denominator, true)
    const total = rows.reduce((s, r) => s + finite(r[denominator!]), 0)
    if (total === 0) throw new Error('Ratio unavailable: denominator total is zero.')
    return rows.reduce((s, r) => s + finite(r[numerator!]), 0) / total * (def.unit === '%' ? 100 : 1)
  }
  if (view.aggregation === 'sum' && def.unit === '%') throw new Error('Percentages cannot be summed. Select mean or declare numerator and denominator.')
  const sum = rows.reduce((s, r) => s + finite(r[id]), 0)
  if (view.aggregation === 'mean') return rows.length ? sum / rows.length : 0
  if (view.aggregation !== 'sum') throw new Error('Unsupported aggregation.')
  return sum
}
export function applyView(dataset: Dataset, view: ChartView): Row[] {
  const type = normalizeChartType(view.chartType), source = filtered(dataset, view)
  if (['scatter', 'regression'].includes(type)) { field(dataset, view.x, true); field(dataset, view.y, true); return source.map(r => { finite(r[view.x!]); finite(r[view.y!]); return { ...r } }) }
  if (type === 'table' && !view.y) return source.map(r => ({ ...r }))
  field(dataset, view.y, true)
  const dimensions = [view.x, view.series].filter((id): id is string => !!id)
  for (const id of dimensions) field(dataset, id)
  const groups = new Map<string, Row[]>()
  for (const row of source) { const key = JSON.stringify(dimensions.map(d => row[d])); groups.set(key, [...(groups.get(key) ?? []), row]) }
  const result = [...groups.values()].map(rows => ({ ...Object.fromEntries(dimensions.map(d => [d, rows[0][d]])), [view.y!]: aggregate(rows, dataset, view, view.y!), ...(view.y2 ? { [view.y2]: aggregate(rows, dataset, view, view.y2) } : {}) }))
  const x = view.x ? field(dataset, view.x) : undefined
  if (x?.type === 'date') result.sort((a, b) => String(a[view.x!]).localeCompare(String(b[view.x!])))
  else if (view.sort) result.sort((a, b) => (finite(a[view.y!]) - finite(b[view.y!])) * (view.sort === 'ascending' ? 1 : -1))
  return result
}
function validate(dataset: Dataset, view: ChartView, resolvedRows?: Row[]): void {
  const type = normalizeChartType(view.chartType), rows = resolvedRows ?? applyView(dataset, view)
  if (resolvedRows) {
    if (view.y) { field(dataset, view.y, true); rows.forEach(row => finite(row[view.y!])) }
    if (view.x && type === 'scatter') rows.forEach(row => finite(row[view.x!]))
    if (view.y2) rows.forEach(row => finite(row[view.y2!]))
  }
  if (!['kpi', 'table'].includes(type)) { const x = field(dataset, view.x, ['scatter', 'regression'].includes(type)); if (!['scatter', 'regression'].includes(type) && x.type === 'number') throw new Error('This chart requires a category or date axis.') }
  if (['grouped-bar', 'stacked-bar', 'population-pyramid', 'heatmap'].includes(type)) field(dataset, view.series)
  if (['pie', 'donut', 'funnel'].includes(type)) {
    if (view.series && view.series !== view.x) throw new Error('This chart requires one category dimension. Remove the series grouping first.')
    if (rows.length && (rows.some(r => finite(r[view.y!]) < 0) || rows.reduce((s, r) => s + finite(r[view.y!]), 0) <= 0)) throw new Error('This chart requires nonnegative values and a positive total.')
  }
  if (type === 'population-pyramid') { if (rows.length && new Set(rows.map(r => r[view.series!])).size !== 2) throw new Error('Population pyramid requires exactly two explicit comparison groups.'); if (rows.some(r => finite(r[view.y!]) < 0)) throw new Error('Population counts must be nonnegative.') }
  if (type === 'combo') { field(dataset, view.y2, true); if (view.series) throw new Error('Combo supports two measures on one shared category axis; remove series grouping.') }
}
function template(type: string, renderer: Renderer): string { return type === 'donut' ? renderer === 'echarts' ? 'Pie Chart' : renderer === 'chartjs' ? 'Doughnut Chart' : 'Donut Chart' : names[type] }
export function capabilities(dataset: Dataset, view: ChartView, resolvedRows?: Row[]): Capability[] {
  let error: string | undefined
  try { validate(dataset, view, resolvedRows) } catch (e) { error = (e as Error).message }
  return engines.map(renderer => { if (error) return { renderer, supported: false, reason: error }; const type = normalizeChartType(view.chartType); const supported = ['table', 'kpi', 'combo'].includes(type) || templates[renderer].some(t => t.chart === template(type, renderer)); return { renderer, supported, ...(supported ? {} : { reason: `${renderer} has no verified ${type} template. Choose another renderer.` }) } })
}
function compile(dataset: Dataset, view: ChartView, renderer: Renderer, title: string, rows: Row[]): any {
  const type = normalizeChartType(view.chartType)
  if (['table', 'kpi'].includes(type)) return { type, rows }
  if (type === 'combo') {
    const bar = compile(dataset, { ...view, chartType: 'bar', y2: undefined }, renderer, title, rows)
    const line = compile(dataset, { ...view, chartType: 'line', y: view.y2, y2: undefined }, renderer, title, rows)
    const first = field(dataset, view.y, true), second = field(dataset, view.y2, true), dual = first.unit !== second.unit
    const label = (f: Field) => `${f.name}${f.unit ? ` (${f.unit})` : ''}`
    if (renderer === 'echarts') { bar.yAxis = [{ ...bar.yAxis, name: label(first) }, ...(dual ? [{ type: 'value', name: label(second) }] : [])]; bar.series = [...bar.series.map((s: any) => ({ ...s, name: first.name })), ...line.series.map((s: any) => ({ ...s, name: second.name, yAxisIndex: dual ? 1 : 0 }))]; bar.legend = { show: true, data: [first.name, second.name] } }
    if (renderer === 'chartjs') { bar.data.datasets = [...bar.data.datasets.map((s: any) => ({ ...s, type: 'bar', label: first.name })), ...line.data.datasets.map((s: any) => ({ ...s, type: 'line', label: second.name, yAxisID: dual ? 'y2' : 'y' }))]; bar.options.scales.y.title = { display: true, text: label(first) }; if (dual) bar.options.scales.y2 = { type: 'linear', position: 'right', title: { display: true, text: label(second) }, grid: { drawOnChartArea: false } }; bar.options.plugins.legend.display = true }
    if (renderer === 'plotly') { bar.data = [...bar.data.map((s: any) => ({ ...s, name: first.name })), ...line.data.map((s: any) => ({ ...s, name: second.name, yaxis: dual ? 'y2' : 'y' }))]; bar.layout.yaxis.title = { text: label(first) }; if (dual) bar.layout.yaxis2 = { overlaying: 'y', side: 'right', title: { text: label(second) } }; bar.layout.showlegend = true }
    return bar
  }
  const encodings: any = ['pie', 'donut'].includes(type) ? { color: { field: view.x }, size: { field: view.y } } : type === 'funnel' ? { y: { field: view.x }, size: { field: view.y } } : type === 'heatmap' ? { x: { field: view.x }, y: { field: view.series }, color: { field: view.y } } : { x: { field: view.x }, y: { field: view.y }, ...(view.series ? { color: { field: view.series }, ...(type === 'grouped-bar' ? { group: { field: view.series } } : {}) } : {}) }
  const input: any = { data: { values: rows }, semantic_types: Object.fromEntries(dataset.fields.map(f => [f.id, f.type === 'number' ? 'Quantity' : 'Category'])), chart_spec: { chartType: template(type, renderer), encodings, title, chartProperties: { innerRadius: type === 'donut' ? 55 : 0, dodge: 'global', sort: 'none' }, baseSize: { width: 760, height: 400 } } }
  const spec = renderer === 'echarts' ? assembleECharts(input) : renderer === 'chartjs' ? assembleChartjs(input) : assemblePlotly(input)
  if (['bar', 'grouped-bar', 'stacked-bar', 'line', 'area'].includes(type)) {
    const categories = [...new Set(rows.map(r => String(r[view.x!])))], groups = view.series ? [...new Set(rows.map(r => String(r[view.series!])))]: []
    const valuesFor = (name: string) => categories.map(category => { const row = rows.find(r => String(r[view.x!]) === category && (!view.series || String(r[view.series]) === name)); return row ? row[view.y!] : null })
    if (renderer === 'echarts') { const axis = Array.isArray(spec.xAxis) ? spec.xAxis[0] : spec.xAxis; axis.data = categories; spec.series.forEach((s: any, i: number) => { s.data = valuesFor(groups.includes(s.name) ? s.name : groups[i] ?? s.name) }) }
    if (renderer === 'chartjs') { spec.data.labels = categories; spec.data.datasets.forEach((s: any, i: number) => { s.data = valuesFor(groups.includes(s.label) ? s.label : groups[i] ?? s.label) }) }
    if (renderer === 'plotly') { spec.data.forEach((s: any, i: number) => { s.x = categories; s.y = valuesFor(groups.includes(s.name) ? s.name : groups[i] ?? s.name) }); spec.layout.xaxis = { ...spec.layout.xaxis, categoryorder: 'array', categoryarray: categories } }
  }
  // Flint infers compass/month ordering. The declared view order is authoritative.
  if (['pie', 'donut'].includes(type)) {
    const labels = rows.map(r => String(r[view.x!])), values = rows.map(r => r[view.y!])
    if (renderer === 'echarts') spec.series[0].data = labels.map((name, i) => ({ name, value: values[i] }))
    if (renderer === 'chartjs') { spec.data.labels = labels; spec.data.datasets[0].data = values }
    if (renderer === 'plotly') { spec.data[0].labels = labels; spec.data[0].values = values; spec.data[0].sort = false }
  }
  const categoryLabels = view.labelField ? rows.map(row => String(row[view.labelField!])) : []
  if (type === 'scatter' && categoryLabels.length) {
    if (renderer === 'plotly') {
      spec.data.forEach((trace: any) => { trace.text = categoryLabels; trace.hovertemplate = '%{text}<br>%{x}: %{y}<extra></extra>'; trace.mode = 'markers+text'; trace.textposition = 'top center' })
    }
    if (renderer === 'echarts') spec.series.forEach((series: any) => { series.label = { ...series.label, show: true, formatter: ({ dataIndex }: any) => categoryLabels[dataIndex] } })
  }
  if (view.orientation === 'horizontal' && ['bar', 'grouped-bar', 'stacked-bar'].includes(type)) {
    if (renderer === 'echarts') {
      const categoryAxis = Array.isArray(spec.xAxis) ? spec.xAxis[0] : spec.xAxis
      const valueAxis = Array.isArray(spec.yAxis) ? spec.yAxis[0] : spec.yAxis
      spec.xAxis = { ...valueAxis, type: 'value' }
      spec.yAxis = { ...categoryAxis, type: 'category', data: categoryAxis.data }
      spec.series.forEach((series: any) => { series.label = { ...series.label, show: true, position: 'right', formatter: ({ value }: any) => `${value}` } })
    }
    if (renderer === 'chartjs') { spec.options = { ...spec.options, indexAxis: 'y', scales: { ...spec.options?.scales, x: { ...spec.options?.scales?.x, stacked: type === 'stacked-bar', max: type === 'stacked-bar' ? 100 : undefined }, y: { ...spec.options?.scales?.y, stacked: type === 'stacked-bar' } } } }
    if (renderer === 'plotly') { spec.data.forEach((trace: any) => { const x = trace.x; trace.x = trace.y; trace.y = x; trace.orientation = 'h' }) }
  }
  if (typeof view.target === 'number') {
    if (renderer === 'echarts') spec.series[0] = { ...spec.series[0], markLine: { symbol: 'none', label: { formatter: `Target ${view.target}%` }, lineStyle: { type: 'dashed' }, data: [{ [view.orientation === 'horizontal' ? 'xAxis' : 'yAxis']: view.target }] } }
    if (renderer === 'plotly') spec.layout = { ...spec.layout, shapes: [{ type: 'line', [view.orientation === 'horizontal' ? 'x0' : 'y0']: view.target, [view.orientation === 'horizontal' ? 'x1' : 'y1']: view.target, [view.orientation === 'horizontal' ? 'y0' : 'x0']: 0, [view.orientation === 'horizontal' ? 'y1' : 'x1']: 1, xref: view.orientation === 'horizontal' ? 'x' : 'paper', yref: view.orientation === 'horizontal' ? 'paper' : 'y', line: { dash: 'dot' } }] }
  }
  return spec
}
export function compilePresentation(artifact: Artifact, dataset: Dataset, preferred: Renderer): Presentation {
  const rows = applyView(dataset, artifact.view)
  return compileResolvedPresentation(artifact, dataset, preferred, { rows })
}
/** Rows and KPIs have already been computed by the query engine. Never aggregate them here. */
export function compileResolvedPresentation(artifact: Artifact, dataset: Dataset, preferred: Renderer, result: { rows: Row[]; kpis?: Kpi[]; evidence?: AnalysisEvidence; inspection?: InspectionMetadata }): Presentation {
  const rows = structuredClone(result.rows)
  const availability = capabilities(dataset, artifact.view, rows), failures: string[] = []
  const metadata = { fields: dataset.fields, ...(result.kpis ? { kpis: result.kpis } : {}), ...(result.evidence ? { evidence: result.evidence } : {}), ...(result.inspection ? { inspection: result.inspection } : {}) }
  for (const renderer of [preferred, ...engines.filter(e => e !== preferred)]) {
    const capability = availability.find(c => c.renderer === renderer)!
    if (!capability.supported) { failures.push(capability.reason!); continue }
    try { const spec = rows.length ? JSON.parse(JSON.stringify(compile(dataset, artifact.view, renderer, artifact.title, rows))) : { type: 'empty', rows: [] }; return { artifactId: artifact.id, renderer, spec, rows, capabilities: availability, ...metadata, ...(renderer !== preferred ? { notice: `${failures.join(' ')} Displayed with ${renderer}, preserving the requested chart.` } : {}) } } catch (e) { failures.push(`${renderer}: ${(e as Error).message}`) }
  }
  throw new Error(failures.join(' '))
}
export function createArtifact(dataset: Dataset, view: ChartView, title: string, renderer: Renderer = 'echarts'): Artifact {
  validate(dataset, view)
  const rows = applyView(dataset, view), source = filtered(dataset, view)
  const kpiLabel = (id: string) => {
    const name = field(dataset, id).name
    if (view.aggregation === 'sum' || view.aggregation === 'count') return `Total ${name}`
    if (view.aggregation === 'mean') return `Average ${name}`
    return name
  }
  const kpis = view.y && source.length ? [view.y, ...(view.y2 ? [view.y2] : [])].map(id => ({ label: kpiLabel(id), value: aggregate(source, dataset, view, id), unit: field(dataset, id).unit })) : []
  return { id: crypto.randomUUID(), title, datasetId: dataset.id, view: structuredClone({ ...view, chartType: normalizeChartType(view.chartType) }), renderer, createdAt: new Date().toISOString(), kpis, summary: `Synthetic data: ${source.length} source rows; ${rows.length} displayed rows.${kpis.map(k => ` ${k.label}: ${Number(k.value.toFixed(2))}${k.unit ? ` ${k.unit}` : ''}.`).join('')}` }
}
