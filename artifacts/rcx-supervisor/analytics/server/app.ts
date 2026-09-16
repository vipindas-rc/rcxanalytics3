import express from 'express'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AnalysisEvidence, AnalysisReference, ChartView, Dashboard, Dataset, Field, Filter, Renderer, ReportContext, Workspace } from '../src/lib/model.ts'
import { applyView, generateDataset, createArtifact, compilePresentation, compileResolvedPresentation } from '../src/lib/analytics.ts'
import { Store, id, now } from './store.ts'
import { normalizeSource, effectiveFilters, datasetVersion } from './context.ts'
import { ensureBriefings } from './briefing.ts'
import { answerSchema, type Answer, type Model } from './inference.ts'
import { findReport, findReportContent, REPORT_CATALOG, type PresentationPreference } from '../src/lib/reportCatalog.ts'
import { defaultReportView, distinctActiveAgentsByType } from '../src/lib/agentReportFixture.ts'
import { orchestrateOperationalTurn, type PlannerReviewer } from './orchestration.ts'
import { definitionForPlan, planGeneralAnalysis, type GeneralAnalysisPlan } from './generalPlan.ts'
import { FIXTURE_REPORT_IDS, OPERATIONAL_REPORT_IDS, definitionForCatalogContent, planForCatalogContent, reportContextCapability } from './reportCapabilities.ts'
type OperationalService = {
 ensureCoverage(input: { datasetId?: string; start: string; end: string; seed?: number }): Promise<{ datasetId: string; revisionId: string; start: string; end: string; generated: boolean }>
 query(input: { revisionId: string; start: string; end: string; asOf?: string; agentType?: 'ai' | 'human'; intent?: 'activity' | 'count' | 'comparison' | 'presence'; offset?: number; limit?: number }): Promise<{ datasetId: string; revisionId: string; rows: Record<string, string | number>[]; fields: Field[]; evidence: any; pagination: { offset: number; limit: number; total: number } }>
}
type SyntheticExamplesService = {
 prepareWorkflowVolume(input: { datasetId?: string; start: string; end: string; seed?: number }): Promise<{ datasetId: string; revisionId: string; start?: string; end?: string; generated: boolean }>
 queryWorkflowVolume(input: { revisionId: string; start: string; end: string }): Promise<{ datasetId: string; revisionId: string; rows: Record<string, string | number>[]; fields: Field[]; evidence: any; pagination: { offset: number; limit: number; total: number } }>
  prepareExample?(input: { domain: string; start: string; end: string; seed?: number; datasetId?: string; definition?: { title: string; version?: string; dimensions: Array<{ id: string; name: string; values?: string[] }>; measures: Array<{ id: string; name: string; unit: string; minimum?: number; maximum?: number; formula?: string }>; assumptions?: string[] }; recipe?: { entityCount?: number } }): Promise<{ datasetId: string; revisionId: string; start: string; end: string; generated: boolean }>
 queryExample?(input: { domain: string; revisionId: string; start: string; end: string }): Promise<{ datasetId: string; revisionId: string; rows: Record<string, string | number>[]; fields: Field[]; evidence: any; pagination: { offset: number; limit: number; total: number } }>
}
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status } }
const find = <T extends { id: string }>(items: T[], key: string, label: string): T => { const v = items.find(i => i.id === key); if (!v) throw new HttpError(404, `${label} not found.`); return v }
const renderer = (r: unknown): Renderer => { if (!['echarts','chartjs','plotly'].includes(String(r))) throw new HttpError(400,'Choose a supported renderer.'); return r as Renderer }
const title = (v: unknown) => { if (typeof v !== 'string' || !v.trim()) throw new HttpError(400,'Enter a title.'); return v.trim().slice(0,200) }
const filterSchema = z.object({
 field: z.string().min(1),
 operator: z.enum(['eq', 'in', 'gte', 'lte']),
 value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
}).strict()
const chartViewSchema = z.object({
 chartType: z.string().min(1),
 x: z.string().optional(),
 y: z.string().optional(),
 y2: z.string().optional(),
 series: z.string().optional(),
 aggregation: z.enum(['sum', 'mean', 'count', 'ratio']),
 numerator: z.string().optional(),
 denominator: z.string().optional(),
 filters: z.array(filterSchema),
 sort: z.enum(['ascending', 'descending']).optional(),
 orientation: z.enum(['horizontal', 'vertical']).optional(),
 target: z.number().optional(),
 labelField: z.string().optional(),
}).strict()
const parseFilter = (value: unknown): Filter => {
 const parsed = filterSchema.parse(value)
 if (parsed.value === undefined) throw new HttpError(400, 'Invalid dashboard filters.')
 return { field: parsed.field, operator: parsed.operator, value: parsed.value }
}
const parseFilters = (value: unknown): Filter[] => z.array(z.unknown()).parse(value).map(parseFilter)
const parseChartView = (value: unknown): ChartView => {
 const parsed = chartViewSchema.parse(value)
 return { ...parsed, filters: parseFilters(parsed.filters) }
}
function snapshot(d: Dashboard) { d.history.push({ revision: d.revision, title: d.title, widgets: structuredClone(d.widgets), filters: structuredClone(d.filters), createdAt: now() }); d.revision++ }
type SupportedReportId = 'agent-activity-overview' | 'agent-activity' | 'agent-activity-report' | 'agent-conduct' | 'agent-dispositions' | 'agent-scorecard' | 'agent-state' | 'agent-disposition-report'
function reportDataset(reportId: string, version: number): Dataset {
 const view = defaultReportView(reportId as SupportedReportId)
 const sample = view.rows[0] ?? {}
 const fields: Field[] = view.columns.map(id => ({ id, name: id.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()), type: typeof sample[id] === 'number' ? 'number' : id.toLowerCase().includes('at') ? 'date' : 'category' }))
 return { id: `report-${reportId}-v${version}`, title: view.title, seed: 20260914, fields, rows: structuredClone(view.rows) as Record<string, string | number>[], colors: {}, createdAt: '2026-09-14T00:00:00.000Z' }
}
const operationalAgentActivity = OPERATIONAL_REPORT_IDS
function isAgentTypeComparisonRequest(question: string) {
 const text = question.toLowerCase()
 const namesBothCohorts = /\b(?:ai|artificial intelligence)\b[\s\S]{0,80}\bhumans?\b|\bhumans?\b[\s\S]{0,80}\b(?:ai|artificial intelligence)\b/.test(text)
 return namesBothCohorts && /\bagents?\b/.test(text)
}
function implicitAgentActivityContext(question: string): ReportContext | undefined {
 if (!isAgentTypeComparisonRequest(question)) return undefined
 const report = findReport('agent-activity-report')
 if (!report) throw new HttpError(500, 'The Agent Activity definition is missing from the report catalog.')
 return { reportId: report.id, reportVersion: report.version, title: report.title, type: report.type, availability: 'supported', sourceUrl: report.sourceUrl }
}
function resolveReportContext(w: Workspace, body: any, prior?: ReportContext, operational?: OperationalService): ReportContext | undefined {
 const requested = prior?.reportId ?? body.reportId
 if (!requested) return undefined
 const report = findReport(requested)
 if (!report) throw new HttpError(400,'That report is not in the verified catalog.')
 const suppliedVersion = prior?.reportVersion ?? body.reportVersion
 if (suppliedVersion !== undefined && suppliedVersion !== report.version) throw new HttpError(409,'This report definition changed. Select it again to continue.')
 const selectedContentIds = Array.isArray(body.selectedContentIds) ? body.selectedContentIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 8) : prior?.selectedContentIds
 if (selectedContentIds?.length && (new Set(selectedContentIds).size !== selectedContentIds.length || findReportContent(report, selectedContentIds).length !== selectedContentIds.length)) throw new HttpError(400, 'Choose contents that belong to the selected report.')
 const presentationPreference: PresentationPreference | undefined = ['auto', 'chart', 'table'].includes(body.presentationPreference) ? body.presentationPreference : prior?.presentationPreference
 const selection = selectedContentIds?.length ? { selectedContentIds, presentationPreference: presentationPreference ?? 'auto' } : {}
 if (report.availability !== 'supported') return { reportId: report.id, reportVersion: report.version, title: report.title, type: report.type, availability: 'preview', sourceUrl: report.sourceUrl, ...selection }
  const capability = reportContextCapability({ reportId: report.id, reportVersion: report.version, title: report.title, type: report.type, availability: report.availability, sourceUrl: report.sourceUrl })
  if (capability === 'operational') {
  if (!operational) throw new HttpError(503, 'Persistent PostgreSQL storage is unavailable. Start the local database and retry.')
  return { reportId: report.id, reportVersion: report.version, title: report.title, type: report.type, availability: 'supported', sourceUrl: report.sourceUrl, ...selection }
 }
  if (!FIXTURE_REPORT_IDS.has(report.id)) throw new HttpError(400,'This report is available through the persisted synthetic content builder.')
 const dataset = reportDataset(report.id, report.version)
 if (!w.datasets.some(item => item.id === dataset.id)) w.datasets.push(dataset)
 return { reportId: report.id, reportVersion: report.version, title: report.title, type: report.type, availability: 'supported', datasetId: dataset.id, datasetVersion: datasetVersion(dataset), sourceUrl: report.sourceUrl, ...selection }
}
const defaultOperationalScope = { start: '2026-08-31T00:00:00.000Z', end: '2026-09-14T00:00:00.000Z' }
function validTimezone(value: unknown) {
 if (typeof value !== 'string' || !value) return 'UTC'
 try { return Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions().timeZone } catch { return 'UTC' }
}
function capturedRequestTime(body: any, prior?: { asOf?: string; timezone?: string }) {
 if (prior?.asOf && !Number.isNaN(Date.parse(prior.asOf))) return { asOf: prior.asOf, timezone: prior.timezone ?? 'UTC' }
 return { asOf: now(), timezone: validTimezone(body.timezone) }
}
function scopeForRequest(request: { question: string; asOf?: string }) {
 // The existing operational generator owns a fixed fourteen-day demonstration
 // period. `asOf` is still captured for a later presence query; it must not be
 // smuggled into activity-period aggregation until that adapter is available.
 if (!/\b(?:now|right now|currently|online)\b/i.test(request.question) || !request.asOf) return defaultOperationalScope
 const end = new Date(request.asOf)
 return { start: new Date(end.getTime() - 24 * 60 * 60 * 1000).toISOString(), end: end.toISOString() }
}
function operationalScope(body: any) {
 const start = typeof body.start === 'string' ? body.start : defaultOperationalScope.start
 const end = typeof body.end === 'string' ? body.end : defaultOperationalScope.end
 if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) throw new HttpError(400, 'Provide an ISO reporting period with an end after its start.')
 return { start, end }
}
function toOperationalDataset(report: ReportContext, result: Awaited<ReturnType<OperationalService['query']>>): Dataset {
 const queryIdentity = createHash('sha256').update(JSON.stringify({ fields: result.fields, rows: result.rows, pagination: result.pagination })).digest('hex').slice(0, 16)
 return { id: `operational-${result.datasetId}-${result.revisionId}-${queryIdentity}`, title: report.title, seed: 20260914, fields: result.fields, rows: structuredClone(result.rows), colors: {}, createdAt: '2026-09-14T00:00:00.000Z' }
}
function toAnalysis(report: ReportContext, result: Awaited<ReturnType<OperationalService['query']>>, scope: AnalysisReference['scope']) {
 const reference: AnalysisReference = { datasetId: result.datasetId, datasetRevision: result.revisionId, reportId: report.reportId, reportVersion: report.reportVersion, metricDefinitionVersion: 1, scope, queryId: 'agent-activity-v1' }
 const source = result.evidence
 const evidence: AnalysisEvidence = { id: `evidence-${result.revisionId}-${report.reportId}`, reference, metrics: [
  { id: 'activeAgents', version: 1, name: 'Active agents', formula: source.definitions.activeAgents, unit: 'agents', grain: 'agent', exclusions: [] },
  { id: 'interactions', version: 1, name: 'Interactions', formula: source.definitions.interactions, unit: 'interactions', grain: 'interaction', exclusions: [] },
  { id: 'handlingMinutes', version: 1, name: 'Handling minutes', formula: source.definitions.handlingMinutes, unit: 'minutes', grain: 'handling segment', exclusions: [] },
 ], facts: [{ metricId: 'activeAgents', value: source.activeAgents.total }, { metricId: 'interactions', value: source.interactions.total }, { metricId: 'handlingMinutes', value: source.handlingMinutes.total }, { metricId: 'transferredInteractions', label: 'Transferred interactions', value: source.interactions.transferred }], groups: structuredClone(result.rows), provenance: { synthetic: true, seed: 20260914, generatorVersion: source.provenance.generatorVersion, generatedAt: '2026-09-14T00:00:00.000Z' }, limitations: source.provenance.assumptions }
 return { reference, evidence }
}
function isWorkflowVolumeRequest(question: string, report?: ReportContext, sourceContext?: unknown) {
 return !report && !sourceContext && /\bworkflow\b.*\b(?:interaction )?volumes?\b|\bworkflow interaction\b/i.test(question)
}
function toWorkflowDataset(result: Awaited<ReturnType<SyntheticExamplesService['queryWorkflowVolume']>>): Dataset {
 const queryIdentity = createHash('sha256').update(JSON.stringify({ fields: result.fields, rows: result.rows, pagination: result.pagination })).digest('hex').slice(0, 16)
 return { id: `example-${result.datasetId}-${result.revisionId}-${queryIdentity}`, title: 'Workflow Interaction Volume', seed: 20260914, fields: result.fields, rows: structuredClone(result.rows), colors: {}, createdAt: '2026-09-14T00:00:00.000Z' }
}
function toWorkflowAnalysis(result: Awaited<ReturnType<SyntheticExamplesService['queryWorkflowVolume']>>, scope: { start: string; end: string }, timezone = 'UTC') {
 const reference: AnalysisReference = { datasetId: result.datasetId, datasetRevision: result.revisionId, metricDefinitionVersion: 1, scope: { period: { from: scope.start, to: scope.end }, timezone, filters: [] }, queryId: 'workflow-volume-v1' }
 const source = result.evidence
 const evidence: AnalysisEvidence = { id: `evidence-${result.revisionId}-workflow-volume`, reference, metrics: [{ id: 'interactionVolume', version: 1, name: 'Interaction volume', formula: source.definitions.interactionVolume, unit: 'interactions', grain: 'workflow-day', exclusions: [] }], facts: [{ metricId: 'interactionVolume', value: source.totalInteractions }], groups: structuredClone(result.rows), provenance: { synthetic: true, seed: 20260914, generatorVersion: source.provenance.generatorVersion, generatedAt: '2026-09-14T00:00:00.000Z' }, limitations: source.provenance.assumptions }
 return { reference, evidence }
}
function workflowAnswer(question: string): Answer {
 const requestedTable = /\b(table|rows|records)\b/i.test(question)
 const requestedText = /\b(explain|without (?:a )?chart|text)\b/i.test(question)
 const chartType = requestedTable ? 'table' : requestedText ? undefined : /\b(bar|column)\b/i.test(question) ? 'bar' : 'donut'
 return { kind: chartType ? (chartType === 'table' ? 'report' : 'chart') : 'text', text: chartType ? 'Showing persisted fictional workflow interaction volume for the selected reporting period.' : 'Workflow interaction volume is calculated from the persisted fictional workflow dataset for the selected reporting period.', choices: [], suggestions: chartType ? ['Show workflow interaction volume as a bar chart.', 'Show the underlying workflow rows.'] : ['Show workflow interaction volume as a donut chart.', 'Show the underlying workflow rows.'], charts: chartType ? [{ title: 'Workflow Interaction Volume', reuseDataset: true, fields: [], seed: 20260914, view: { chartType, x: 'workflow', y: 'interactionVolume', aggregation: 'sum', filters: [] } }] : [], operations: [] }
}
function syntheticDomain(value: string) {
 const domain = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
 return domain || 'custom-analytics'
}
function catalogContentPlan(question: string, report?: ReportContext): GeneralAnalysisPlan | undefined {
  if (!report) return undefined
 const definition = findReport(report.reportId)
 if (!definition) throw new HttpError(400, 'The selected report definition is unavailable.')
  return planForCatalogContent(question, definition, report.selectedContentIds ?? [], report.presentationPreference ?? 'auto').plan
}
function syntheticDefinition(question: string, report?: ReportContext) {
  if (report) {
    const catalog = findReport(report.reportId)
    if (!catalog) throw new HttpError(400, 'The selected report definition is unavailable.')
    const selected = definitionForCatalogContent(question, catalog, report.selectedContentIds ?? [], report.presentationPreference ?? 'auto')
    return { plan: selected.plan, domain: syntheticDomain(`${report.reportId}-${selected.plan.metric.id}-${selected.plan.grouping.id}`), title: report.title, definition: selected.definition, measure: selected.plan.metric }
  }
  const plan = catalogContentPlan(question, report) ?? planGeneralAnalysis(question)
  const title = `${plan.metric.name} by ${plan.grouping.name}`
  return { plan, domain: syntheticDomain(`${plan.entity.id}-${plan.metric.id}-${plan.grouping.id}`), title, definition: definitionForPlan(plan, title), measure: plan.metric }
}
function syntheticDataset(result: { datasetId: string; revisionId: string; rows: Record<string, string | number>[]; fields: Field[]; pagination: { offset: number; limit: number; total: number } }, title: string): Dataset {
 const key = createHash('sha256').update(JSON.stringify({ fields: result.fields, rows: result.rows, pagination: result.pagination })).digest('hex').slice(0, 16)
 return { id: `example-${result.datasetId}-${result.revisionId}-${key}`, title, seed: 20260914, fields: result.fields.map(field => field.unit === 'percent' ? { ...field, unit: '%' } : field), rows: structuredClone(result.rows), colors: {}, createdAt: '2026-09-14T00:00:00.000Z' }
}
function syntheticAnalysis(result: { datasetId: string; revisionId: string; rows: Record<string, string | number>[]; fields: Field[]; evidence: any }, scope: { start: string; end: string }, report?: ReportContext, timezone = 'UTC') {
 const reference: AnalysisReference = { datasetId: result.datasetId, datasetRevision: result.revisionId, ...(report ? { reportId: report.reportId, reportVersion: report.reportVersion } : {}), metricDefinitionVersion: 1, scope: { period: { from: scope.start, to: scope.end }, timezone, filters: [] }, queryId: createHash('sha256').update(JSON.stringify({ revision: result.revisionId, scope, timezone, fields: result.fields })).digest('hex').slice(0, 16) }
 const definitions = result.evidence.definitions ?? {}
 const metrics = result.fields.filter(field => field.type === 'number').map(field => ({ id: field.id, version: 1, name: field.name, formula: definitions[field.id] ?? `Persisted synthetic ${field.name.toLowerCase()}.`, unit: field.unit ?? 'units', grain: 'synthetic record', exclusions: [] }))
 const facts = metrics.map(metric => ({ metricId: metric.id, value: typeof result.evidence[metric.id] === 'number' ? result.evidence[metric.id] : null }))
 const provenance = result.evidence.provenance ?? { generatorVersion: 'generic-primitives-v1', assumptions: [] }
 return { reference, evidence: { id: `evidence-${result.revisionId}`, reference, metrics, facts, groups: structuredClone(result.rows), provenance: { synthetic: true, seed: 20260914, generatorVersion: provenance.generatorVersion, generatedAt: '2026-09-14T00:00:00.000Z' }, limitations: provenance.assumptions ?? [] } as AnalysisEvidence }
}
function syntheticAnswer(plan: GeneralAnalysisPlan, dataset: Dataset, title: string): Answer {
 const x = dataset.fields.find(field => field.id === plan.grouping.id)?.id
 const y = dataset.fields.find(field => field.id === plan.metric.id)?.id
 if (!x || !y) throw new HttpError(500, 'The validated synthetic definition does not contain the requested grouping and metric.')
 const chartType = plan.presentation === 'text' ? undefined : plan.presentation
 const ratio = plan.metric.aggregation === 'ratio' && dataset.fields.some(field => field.id === 'offered') && dataset.fields.some(field => field.id === 'abandoned')
 const aggregation = ratio ? 'ratio' : plan.metric.aggregation === 'ratio' ? 'mean' : plan.metric.aggregation
 const chart = chartType === 'table' ? undefined : chartType === 'kpi' ? { chartType: 'kpi', y, aggregation, filters: [] } : { chartType, x, y, aggregation, ...(ratio ? { numerator: 'abandoned', denominator: 'offered' } : {}), filters: [] }
 const metricLabel = plan.metric.name.toLowerCase()
 return {
  kind: chartType ? (chartType === 'table' ? 'report' : 'chart') : 'text',
  text: chartType ? `Showing ${metricLabel} by ${plan.grouping.name.toLowerCase()} from persisted synthetic records.` : `${title} is calculated from persisted synthetic records.`,
  choices: [],
  suggestions: [`Show ${plan.metric.name} by ${plan.grouping.name} as a table.`, `Explain ${plan.metric.name} by ${plan.grouping.name} without a chart.`],
  charts: chart ? [{ title, reuseDataset: true, fields: [], seed: 20260914, view: chart as any }] : [],
  operations: [],
 }
}
function validateSyntheticResult(plan: GeneralAnalysisPlan, result: { rows: Record<string, string | number>[]; fields: Field[] }) {
  const fieldIds = new Set<string>()
  for (const field of result.fields) {
   if (!field.id || fieldIds.has(field.id)) throw new HttpError(500, 'The prepared synthetic data returned duplicate field identities.')
   fieldIds.add(field.id)
   if (field.type === 'number' && !result.rows.every(row => typeof row[field.id] === 'number' || row[field.id] === undefined)) throw new HttpError(500, `The prepared synthetic metric '${field.id}' contains invalid values.`)
  }
  const grouping = result.fields.find(field => field.id === plan.grouping.id && field.type !== 'number')
  const metric = result.fields.find(field => field.id === plan.metric.id && field.type === 'number')
  if (!grouping || !metric) throw new HttpError(500, `The prepared data does not contain the requested ${plan.metric.name.toLowerCase()} by ${plan.grouping.name.toLowerCase()} fields.`)
  if (plan.metric.unit === 'percent' && !['%', 'percent'].includes(metric.unit ?? '')) throw new HttpError(500, `The prepared ${plan.metric.name.toLowerCase()} field has incompatible units.`)
}
function validatePlanBeforePublication(plan: GeneralAnalysisPlan, dataset: Dataset, answer: Answer) {
 const grouping = dataset.fields.find(field => field.id === plan.grouping.id && field.type !== 'number')
 const metric = dataset.fields.find(field => field.id === plan.metric.id && field.type === 'number')
 if (!grouping || !metric) throw new HttpError(500, 'The prepared data does not match the accepted analytical definition.')
 if (plan.metric.unit === 'percent' && !['%', 'percent'].includes(metric.unit ?? '')) throw new HttpError(500, 'The prepared metric has incompatible units.')
 for (const chart of answer.charts) {
  if (!chart.reuseDataset) throw new HttpError(500, 'A validated analysis cannot replace its committed dataset during publication.')
  if (chart.view.chartType === 'table' || chart.view.chartType === 'kpi') continue
  if (chart.view.x !== grouping.id || chart.view.y !== metric.id) throw new HttpError(500, 'The compiled presentation does not preserve the accepted grouping and metric.')
 }
}
function publicRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Inference failed. Retry this turn.'
  if (/Generic definition|prepared synthetic|requested .* fields|synthetic metric|synthetic data returned/i.test(message)) {
    return 'The selected report content could not be prepared because its data definition is out of sync. The request was not published.'
  }
  return message
}
function isAnalyticalQuestion(question: string, report?: ReportContext) {
 return !!report || /\b(chart|graph|table|kpi|report|dashboard|compare|trend|rate|count|volume|interactions?|agents?|queue|workflow|campaign|customer|time|minutes?|records?|data|metric|analytics?)\b/i.test(question)
}
function reportAnswer(report: ReportContext, dataset: Dataset | undefined, question: string): Answer {
 if (report.availability === 'preview') return { kind: 'report', text: `${report.title} is listed in the report catalog, but its data has not been added to this prototype yet. Choose a report marked “Data available” to inspect fixed synthetic rows.`, choices: [], suggestions: [], charts: [], operations: [] }
 if (!dataset) throw new HttpError(400,'The selected report fixture is unavailable. Select the report again.')
 const normalized = question.toLowerCase()
 const aiQuestion = /how many .*ai agents|ai agents.*how many|count .*ai agents/.test(normalized)
 if (aiQuestion) {
  const { ai, total } = distinctActiveAgentsByType()
  return { kind: 'report', text: `${ai} of ${total} active agents are AI agents in this fixed fourteen-day synthetic report scope. The count uses distinct agent IDs from the shared fixture, not activity-row totals.`, choices: [], suggestions: ['Show the activity rows for AI agents.', 'Compare active minutes by agent type.'], charts: [], operations: [] }
 }
 return { kind: 'report', text: `Showing ${report.title}. This is a fixed fourteen-day synthetic report fixture; its table is available below for inspection.`, choices: [], suggestions: ['How many agents are AI agents?', 'Show the report as a table.'], charts: [{ title: report.title, reuseDataset: true, fields: [], seed: 20260914, view: { chartType: 'table', aggregation: 'count', filters: [] } }], operations: [] }
}
export function createApp(store: Store, model: Model, operational?: OperationalService, operationalAgents?: PlannerReviewer, examples?: SyntheticExamplesService) {
 const app = express(); app.use(express.json({ limit: '64kb' })); const cache = new Map<string, Answer>(); const activeRequests = new Map<string, AbortController>(); let epoch = 0
 const updateRequestPhase = async (requestId: string, phase: string, runEpoch = epoch) => {
  if (runEpoch !== epoch) return
  await store.mutate(w => {
   if (runEpoch !== epoch) return
   const request = w.requests.find(item => item.id === requestId)
   if (request?.status === 'pending' && request.phase !== phase) {
    request.phase = phase
    const at = now()
    request.phaseHistory = [...(request.phaseHistory ?? []), { phase, at }].slice(-8)
   }
  })
 }
  app.get('/api/workspace', async (_q,r) => r.json(await store.read()))
 app.get('/api/reports', (_q,r) => r.json(REPORT_CATALOG))
 app.post('/api/reports/:id/query', async (q,r) => {
  const report = findReport(q.params.id)
  if (!report || !operationalAgentActivity.has(report.id)) throw new HttpError(404, 'This report does not have a persistent query yet.')
  if (!operational) throw new HttpError(503, 'Persistent PostgreSQL storage is unavailable. Start the local database and retry.')
  const scope = operationalScope(q.body)
  const coverage = await operational.ensureCoverage({ ...scope })
  const intent = q.body.intent === 'count' || q.body.intent === 'comparison' ? q.body.intent : 'activity'
  r.json(await operational.query({ revisionId: coverage.revisionId, ...scope, intent, agentType: q.body.agentType, offset: q.body.offset, limit: q.body.limit }))
 })
 app.post('/api/workspace/reset', async (_q,r) => { epoch++; activeRequests.forEach(controller => controller.abort()); activeRequests.clear(); cache.clear(); r.json(await store.mutate(w => { const briefingArtifactIds=new Set(w.briefings.flatMap(briefing=>briefing.widgets.map(widget=>widget.artifactId))); w.artifacts=w.artifacts.filter(artifact=>briefingArtifactIds.has(artifact.id)); const briefingDatasetIds=new Set(w.artifacts.map(artifact=>artifact.datasetId)); w.datasets=w.datasets.filter(dataset=>briefingDatasetIds.has(dataset.id)); w.sessions=[];w.projects=[{id:'project-inbox',name:'Analytics'}];w.savedCharts=[];w.dashboards=[];w.requests=[];w.preferences=Object.fromEntries(Object.entries(w.preferences).filter(([artifactId])=>briefingArtifactIds.has(artifactId)));w.responseCache={};return w })) })
 app.post('/api/briefings/ensure', async (_q,r) => r.json(await store.mutate(w => ensureBriefings(w))))
 app.get('/api/search', async (q,r) => { const w = await store.read(); const term = String(q.query.q ?? '').toLowerCase(); r.json(w.sessions.filter(s => JSON.stringify([s.title,s.messages]).toLowerCase().includes(term))) })
 app.post('/api/sessions', async (q,r) => r.status(201).json(await store.mutate(w => { const projectId = q.body.projectId ?? null; if(projectId) find(w.projects,projectId,'Project'); const advisor = q.body.advisor === true; const s = { id:id('session'),title: advisor ? 'Advisor' : 'New analytics chat',advisor,projectId,createdAt:now(),updatedAt:now(),messages:[] }; w.sessions.unshift(s); return s })))
 app.patch('/api/sessions/:id', async (q,r) => r.json(await store.mutate(w => { const s = find(w.sessions,q.params.id,'Conversation'); if(q.body.title !== undefined) { s.title=title(q.body.title); s.renamed=true } if('projectId' in q.body) { if(q.body.projectId) find(w.projects,q.body.projectId,'Project'); s.projectId=q.body.projectId ?? null } s.updatedAt=now(); return s })))
 app.delete('/api/sessions/:id', async(q,r) => { await store.mutate(w => { find(w.sessions,q.params.id,'Conversation'); if(w.requests.some(t => t.sessionId===q.params.id && t.status==='pending')) throw new HttpError(409,'Wait for the pending answer before deleting this conversation.'); w.sessions=w.sessions.filter(s=>s.id!==q.params.id) }); r.status(204).end() })
 app.post('/api/projects', async(q,r) => r.status(201).json(await store.mutate(w => { const p={id:id('project'),name:title(q.body.name)}; w.projects.push(p); return p })))
 app.patch('/api/projects/:id', async(q,r) => r.json(await store.mutate(w => { const p=find(w.projects,q.params.id,'Project'); p.name=title(q.body.name); return p })))
 app.delete('/api/projects/:id', async(q,r) => { await store.mutate(w => { find(w.projects,q.params.id,'Project'); if(w.requests.some(t => t.status === 'pending' && w.sessions.find(s => s.id === t.sessionId)?.projectId === q.params.id)) throw new HttpError(409,'Wait for pending project conversations before deleting this project.'); w.sessions.forEach(s => { if (s.projectId === q.params.id) s.projectId = null }); w.savedCharts = w.savedCharts.filter(s => s.projectId !== q.params.id); w.dashboards = w.dashboards.filter(d => d.projectId !== q.params.id); w.projects = w.projects.filter(p => p.id !== q.params.id) }); r.status(204).end() })
 app.post('/api/artifacts/:id/render', async(q,r) => { const engine=renderer(q.body.renderer); const w=await store.read(); const a=find(w.artifacts,q.params.id,'Artifact'); const sourceData=find(w.datasets,a.datasetId,'Dataset'); const filters=effectiveFilters(a.view.filters,q.body.filters,sourceData); const effective={...a,view:{...a.view,filters}}; const presentation=a.analysisReference ? compileResolvedPresentation(effective,sourceData,engine,{rows:applyView(sourceData, effective.view),kpis:a.kpis,evidence:a.evidence}) : compilePresentation(effective,sourceData,engine); await store.mutate(w=>{w.preferences[a.id]=presentation.renderer}); r.json(presentation) })
 app.post('/api/saved-charts', async(q,r) => { let created = false; const saved = await store.mutate(w=>{const a=find(w.artifacts,q.body.artifactId,'Artifact'); find(w.projects,q.body.projectId,'Project'); const existing=w.savedCharts.find(chart=>chart.artifactId===a.id&&chart.projectId===q.body.projectId); if(existing)return existing; const next={id:id('saved'),artifactId:a.id,projectId:q.body.projectId,title:q.body.title ? title(q.body.title):a.title}; w.savedCharts.push(next); created=true; return next}); r.status(created?201:200).json(saved) })
 app.delete('/api/saved-charts/:id', async(q,r)=>{await store.mutate(w=>{find(w.savedCharts,q.params.id,'Saved chart');w.savedCharts=w.savedCharts.filter(s=>s.id!==q.params.id)});r.status(204).end()})
 app.post('/api/dashboards',async(q,r)=>r.status(201).json(await store.mutate(w=>{const projectId=q.body.projectId??w.projects[0]?.id;find(w.projects,projectId,'Project');const d:Dashboard={id:id('dashboard'),projectId,title:title(q.body.title),revision:1,widgets:[],filters:[],history:[]};w.dashboards.push(d);return d})))
 app.patch('/api/dashboards/:id',async(q,r)=>r.json(await store.mutate(w=>{const d=find(w.dashboards,q.params.id,'Dashboard');if(q.body.revision!==d.revision)throw new HttpError(409,'Dashboard changed. Reload before editing.');validateDashboardPatch(w,q.body);snapshot(d);if(q.body.title!==undefined)d.title=title(q.body.title);if(q.body.widgets)d.widgets=q.body.widgets;if(q.body.filters)d.filters=q.body.filters;return d})))
 app.delete('/api/dashboards/:id',async(q,r)=>{await store.mutate(w=>{find(w.dashboards,q.params.id,'Dashboard');w.dashboards=w.dashboards.filter(d=>d.id!==q.params.id)});r.status(204).end()})
 app.post('/api/dashboards/:id/widgets',async(q,r)=>{ let created = false; const dashboard = await store.mutate(w=>{const d=find(w.dashboards,q.params.id,'Dashboard');const a=find(w.artifacts,q.body.artifactId,'Artifact');if(d.widgets.some(widget=>widget.artifactId===a.id))return d;snapshot(d);d.widgets.push({id:id('widget'),artifactId:a.id,title:q.body.title?title(q.body.title):a.title});created=true;return d}); r.status(created?201:200).json(dashboard) })
  app.get('/api/requests/:id',async(q,r)=>r.json(find((await store.read()).requests,q.params.id,'Request')))
  app.post('/api/requests/:id/cancel', async (q, r) => {
   const request = await store.mutate(w => {
    const current = find(w.requests, q.params.id, 'Request')
    if (current.status === 'pending') {
     current.status = 'cancelled'
     current.phase = 'Cancelled'
     current.phaseHistory = [...(current.phaseHistory ?? []), { phase: 'cancelled', at: now() }].slice(-8)
    }
    return current
   })
   activeRequests.get(q.params.id)?.abort()
   r.json(request)
  })
 app.post('/api/conversation',async(q,r)=>{
  let question = typeof q.body.question === 'string' ? q.body.question.trim() : ''
  if (question.length > 6000) throw new HttpError(400,'Enter a question of up to 6000 characters.')
 const requestId=title(q.body.requestId);const selected=q.body.renderer?renderer(q.body.renderer):'echarts'; let fresh=false
 const attempt=await store.mutate(w=>{
   const session=find(w.sessions,q.body.sessionId,'Conversation')
   const prior=q.body.retryOf?find(w.requests,q.body.retryOf,'Prior request'):undefined
   let reportContext=resolveReportContext(w,q.body,prior?.reportContext,operational)
   if (!question && reportContext) question = `Open ${reportContext.title}`
   if (!question) throw new HttpError(400,'Enter a question or select a report.')
   const existing=w.requests.find(t=>t.id===requestId)
   if(existing){if(existing.sessionId!==q.body.sessionId || existing.question!==question)throw new HttpError(409,'Request ID already belongs to a different turn.');return existing}
   if(w.requests.some(t=>t.sessionId===session.id&&t.status==='pending'))throw new HttpError(409,'This conversation already has an answer in progress.')
   if(q.body.contextDashboardId)find(w.dashboards,q.body.contextDashboardId,'Dashboard')
   let userMessageId=id('message')
    if(prior && (prior.sessionId!==session.id||!['failed','cancelled'].includes(prior.status)||prior.question!==question))throw new HttpError(409,'Only the same failed or cancelled turn can be retried.')
   const sourceContext=prior ? prior.sourceContext ?? normalizeSource(w,{contextArtifactId:prior.contextArtifactId,contextFilters:prior.contextFilters,sourceLabel:prior.sourceLabel},session) : normalizeSource(w,q.body,session)
   // An explicit source always wins. With no selected report or source, agent
   // cohort comparisons have a registered operational meaning and must not
   // fall through to a generic per-agent synthetic dataset.
   if (!reportContext && !sourceContext) reportContext = implicitAgentActivityContext(question)
   if(reportContext && sourceContext) throw new HttpError(400,'Choose either a report or a chart source for this question.')
   const contextDashboardId=prior ? prior.contextDashboardId : sourceContext?.dashboardId??q.body.contextDashboardId
   if(prior)userMessageId=prior.userMessageId
   else { const source=session.messages.slice().reverse().find(message=>message.role==='assistant'&&[...(message.choices??[]),...(message.suggestions??[])].includes(question)); if(source){delete source.choices;delete source.suggestions} session.messages.push({id:userMessageId,role:'user',text:question,createdAt:now(),requestId,sourceContext,reportContext,selectedFollowUpFrom:typeof q.body.selectedFollowUpFrom==='string'?q.body.selectedFollowUpFrom:source?.id}) }
   if(session.advisor&&sourceContext)session.advisorContext=structuredClone(sourceContext)
   if(reportContext) session.reportContext=structuredClone(reportContext)
   if(session.advisor&&!session.renamed&&session.title==='Advisor')session.title=question.slice(0,56)
   const captured = capturedRequestTime(q.body, prior)
   const createdAt = now()
   const t={id:requestId,sessionId:session.id,question,status:'pending' as const,phase:'initializing',phaseHistory:[{phase:'initializing',at:createdAt}],userMessageId,createdAt,asOf:captured.asOf,timezone:captured.timezone,sourceContext,reportContext,contextArtifactId:sourceContext?.artifactId,contextFilters:sourceContext?.filters??[],contextDashboardId,sourceLabel:sourceContext?.sourceLabel}
   w.requests.push(t);session.updatedAt=now();fresh=true;return t
  })
  r.status(202).json(attempt);if(fresh){const controller=new AbortController();activeRequests.set(attempt.id,controller);void run(attempt.id,selected,controller.signal).finally(()=>{if(activeRequests.get(attempt.id)===controller)activeRequests.delete(attempt.id)})}
 })
  async function run(requestId:string, selected:Renderer, signal?:AbortSignal){const runEpoch=epoch;const isPending=async()=>runEpoch===epoch&&(await store.read()).requests.find(item=>item.id===requestId)?.status==='pending';try{
   if(!await isPending())return
  await updateRequestPhase(requestId, 'planning', runEpoch)
  const w=await store.read();const request=find(w.requests,requestId,'Request');const s=find(w.sessions,request.sessionId,'Conversation');let reportContext=request.reportContext;const userMessage=s.messages.find(message=>message.id===request.userMessageId);const selectedSource=userMessage?.selectedFollowUpFrom?s.messages.find(message=>message.id===userMessage.selectedFollowUpFrom):undefined;const artifactId=reportContext ? undefined : request.contextArtifactId??selectedSource?.artifactIds?.at(-1)??s.messages.slice().reverse().find(m=>m.role==='assistant'&&m.artifactIds?.length)?.artifactIds?.at(-1);const sourceArtifact=w.artifacts.find(a=>a.id===artifactId);const artifact=sourceArtifact && request.contextFilters?.length ? {...sourceArtifact,view:{...sourceArtifact.view,filters:request.contextFilters}} : sourceArtifact;const reportDatasetId=reportContext?.datasetId;let dataset=reportDatasetId ? w.datasets.find(d=>d.id===reportDatasetId) : w.datasets.find(d=>d.id===artifact?.datasetId);const dashboard=w.dashboards.find(d=>d.id===request.contextDashboardId)
  let operationalResult: Awaited<ReturnType<OperationalService['query']>> | undefined
  let workflowResult: Awaited<ReturnType<SyntheticExamplesService['queryWorkflowVolume']>> | undefined
  let analysis: ReturnType<typeof toAnalysis> | undefined = artifact?.analysisReference && artifact.evidence ? { reference: artifact.analysisReference, evidence: artifact.evidence } : undefined
  let operationalAnswer: Answer | undefined
  let generalPlan: GeneralAnalysisPlan | undefined
   if (reportContext && reportContextCapability(reportContext) === 'operational') {
   if (!operational) throw new HttpError(503, 'Persistent PostgreSQL storage is unavailable. Start the local database and retry.')
   const scope = scopeForRequest(request)
   await updateRequestPhase(requestId, 'resolving-data', runEpoch)
   const coverage = await operational.ensureCoverage(scope)
   await updateRequestPhase(requestId, 'computing', runEpoch)
   const onlineNow = /\b(?:now|right now|currently|online)\b/i.test(request.question)
   operationalResult = await operational.query({ revisionId: coverage.revisionId, ...scope, ...(onlineNow ? { asOf: request.asOf } : {}), intent: onlineNow ? 'presence' : 'count' })
   const operationalScope = { period: { from: scope.start, to: scope.end }, timezone: request.timezone ?? 'UTC', filters: [] }
   const orchestrationInput = () => ({ question: request.question, report: { id: reportContext!.reportId, title: reportContext!.title, version: reportContext!.reportVersion }, result: operationalResult!, scope: operationalScope, priorQuestions: s.messages.filter(message => message.role === 'user' && message.id !== request.userMessageId).map(message => message.text), asOf: onlineNow ? request.asOf : undefined })
   let turn = await orchestrateOperationalTurn(orchestrationInput(), operationalAgents)
   if (turn.queryRequired) {
    await updateRequestPhase(requestId, 'computing', runEpoch)
    operationalResult = await operational.query(turn.queryRequired)
    turn = await orchestrateOperationalTurn(orchestrationInput(), operationalAgents)
   }
   if (!turn.answer) throw new HttpError(400, 'This request needs a supported Agent Activity query before it can be answered.')
   operationalAnswer = turn.answer
   dataset = toOperationalDataset(reportContext, operationalResult)
   analysis = toAnalysis(reportContext, operationalResult, turn.scope)
   reportContext = { ...reportContext, datasetId: dataset.id, datasetVersion: analysis.reference.datasetRevision, analysisReference: analysis.reference }
  }
  if (isWorkflowVolumeRequest(request.question, reportContext, request.sourceContext)) {
   if (!examples) throw new HttpError(503, 'Persistent synthetic examples storage is unavailable. Configure the separate examples database and retry.')
   const scope = scopeForRequest(request)
   await updateRequestPhase(requestId, 'resolving-data', runEpoch)
   const coverage = await examples.prepareWorkflowVolume(scope)
   await updateRequestPhase(requestId, 'computing', runEpoch)
   workflowResult = await examples.queryWorkflowVolume({ revisionId: coverage.revisionId, ...scope })
   dataset = toWorkflowDataset(workflowResult)
   analysis = toWorkflowAnalysis(workflowResult, scope, request.timezone)
   operationalAnswer = workflowAnswer(request.question)
  }
  // Every request without a compatible selected dataset receives committed
  // prototype records before any response text is composed. This deliberately
  // replaces the former catalog-preview and upload/connect fallback.
  if (!dataset && !operationalAnswer && isAnalyticalQuestion(request.question, reportContext)) {
   if (!examples) throw new HttpError(503, 'Persistent synthetic examples storage is unavailable. Start the local examples database and retry.')
   const scope = scopeForRequest(request)
   const generic = syntheticDefinition(request.question, reportContext)
   generalPlan = generic.plan
   // Queue Abandonment is the only established queue-rate definition. A
   // different requested queue metric (for example service level) receives a
   // separate compatible synthetic definition rather than abandonment rows.
   const queue = generic.plan.metric.id === 'abandonmentRate' && generic.plan.grouping.id === 'queue'
   const definition = queue
    ? { ...generic, domain: 'queue-abandonment', title: reportContext?.title ?? 'Queue Abandonment', definition: undefined }
    : generic
   if (!examples.prepareExample || !examples.queryExample) throw new HttpError(503, 'The configured synthetic examples service does not support general data preparation.')
   await updateRequestPhase(requestId, 'resolving-data', runEpoch)
   const coverage = await examples.prepareExample({ domain: definition.domain, ...scope, ...(queue ? {} : { definition: definition.definition, recipe: { entityCount: 5 } }) })
   await updateRequestPhase(requestId, 'computing', runEpoch)
   const syntheticResult = await examples.queryExample({ domain: definition.domain, revisionId: coverage.revisionId, ...scope })
    validateSyntheticResult(generic.plan, syntheticResult)
   dataset = syntheticDataset(syntheticResult, definition.title)
   analysis = syntheticAnalysis(syntheticResult, scope, reportContext, request.timezone)
   reportContext = reportContext ? { ...reportContext, availability: 'supported', datasetId: dataset.id, datasetVersion: analysis.reference.datasetRevision, analysisReference: analysis.reference } : undefined
   operationalAnswer = syntheticAnswer(generic.plan, dataset, definition.title)
  }
  const key=createHash('sha256').update(JSON.stringify({version:8,datasetVersion:dataset?datasetVersion(dataset):undefined,sourceContext:request.sourceContext,reportContext,sessionId:s.id,question:request.question.toLowerCase().trim(),artifact,datasetId:dataset?.id,dashboard,messages:s.messages.filter(m=>m.role==='assistant').slice(-4)})).digest('hex');const bypass=!reportContext&&/regenerat|new (?:data|values)|fresh data/i.test(request.question);let answer=operationalAnswer ?? (reportContext?reportAnswer(reportContext,dataset,request.question):bypass?undefined:cache.get(key) ?? w.responseCache?.[key] as Answer | undefined);const cached=!!answer && !reportContext
  if(!answer){if(!await isPending())return;await updateRequestPhase(requestId, 'planning', runEpoch);answer=answerSchema.parse(await model({question:request.question,session:s,artifact,dataset,dashboard,sourceContext:request.sourceContext,reportContext,signal}))}else{await updateRequestPhase(requestId, 'preparing-output', runEpoch);answer=answerSchema.parse(structuredClone(answer))}
  if(reportContext && answer.charts.some(chart=>!chart.reuseDataset))throw new HttpError(400,'That question cannot be answered from the selected report fixture. Choose a supported field or start a new synthetic example.')
   if(!await isPending())return
  await updateRequestPhase(requestId, 'preparing-output', runEpoch)
  const result=answer
  if (generalPlan && dataset) validatePlanBeforePublication(generalPlan, dataset, result)
  await updateRequestPhase(requestId, 'reviewing', runEpoch)
   let published=false
   await store.mutate(current=>{if(runEpoch!==epoch)return;const t=find(current.requests,requestId,'Request');if(t.status!=='pending')return;const session=find(current.sessions,t.sessionId,'Conversation');const ids:string[]=[]
   if (dataset && !current.datasets.some(item => item.id === dataset!.id)) current.datasets.push(dataset)
   if (reportContext) { t.reportContext = reportContext; session.reportContext = structuredClone(reportContext) }
   if (generalPlan) t.analysisPlan = structuredClone(generalPlan) as Record<string, unknown>
   for(const recipe of result.charts){let data=dataset;if(!recipe.reuseDataset){data=generateDataset({title:recipe.title,seed:recipe.seed,fields:recipe.fields});current.datasets.push(data!)}if(!data)throw new HttpError(400,'There is no contextual dataset to reuse.');const a=createArtifact(data,parseChartView(recipe.view),recipe.title,selected);if (analysis) { a.analysisReference=analysis.reference; a.evidence=analysis.evidence } current.artifacts.push(a);ids.push(a.id)}
   let changedDashboard:Dashboard|undefined
   if(result.kind==='dashboard'){if(!dashboard)throw new HttpError(400,'Select a dashboard before requesting changes.');const d=find(current.dashboards,dashboard.id,'Dashboard');if(d.revision!==dashboard.revision)throw new HttpError(409,'Dashboard changed while interpreting. Retry against its latest revision.');const beforeDashboard=structuredClone(d);for(const op of result.operations){if(op.action==='add'){const a=find(current.artifacts,op.artifactId??ids[0]??'','Artifact');if(!d.widgets.some(widget=>widget.artifactId===a.id))d.widgets.push({id:id('widget'),artifactId:a.id,title:op.title??a.title})}else if(op.action==='filter'){d.filters=parseFilters(op.filters??[])}else if(op.action==='rename'&&!op.widgetId){d.title=title(op.title)}else if(op.action==='reorder'){if(!op.widgetIds||op.widgetIds.length!==d.widgets.length||new Set(op.widgetIds).size!==d.widgets.length)throw new HttpError(400,'Reorder must include every widget once.');d.widgets=op.widgetIds.map(i=>find(d.widgets,i,'Widget'))}else{const widget=find(d.widgets,op.widgetId??'','Widget');if(op.action==='remove')d.widgets=d.widgets.filter(v=>v.id!==widget.id);if(op.action==='rename')widget.title=title(op.title);if(op.action==='reconfigure'){if(!op.view)throw new HttpError(400,'A new view is required.');const a=find(current.artifacts,widget.artifactId,'Artifact');const replacement=createArtifact(find(current.datasets,a.datasetId,'Dataset'),parseChartView(op.view),op.title??widget.title,selected);current.artifacts.push(replacement);widget.artifactId=replacement.id}}}if(JSON.stringify({title:d.title,widgets:d.widgets,filters:d.filters})!==JSON.stringify({title:beforeDashboard.title,widgets:beforeDashboard.widgets,filters:beforeDashboard.filters})){d.history.push({revision:beforeDashboard.revision,title:beforeDashboard.title,widgets:beforeDashboard.widgets,filters:beforeDashboard.filters,createdAt:now()});d.revision++}changedDashboard=d}
   session.messages.push({id:id('message'),role:'assistant',text:result.text,createdAt:now(),artifactIds:ids,suggestions:result.suggestions,choices:result.choices,requestId,reportContext:t.reportContext,analysisReference:analysis?.reference,evidence:analysis?.evidence,dashboardId:changedDashboard?.id,dashboardRevision:changedDashboard?.revision});if(!session.renamed&&(session.title==='New analytics chat'||session.title==='Advisor'))session.title=t.question.slice(0,56);session.updatedAt=now();t.status='completed';t.phase='Complete';t.artifactIds=ids;t.cached=cached; if (!bypass && !reportContext) { current.responseCache ??= {}; current.responseCache[key] = structuredClone(result); const keys = Object.keys(current.responseCache); if (keys.length > 100) for (const stale of keys.slice(0, keys.length - 100)) delete current.responseCache[stale] }
   published=true
   });if(published&&runEpoch===epoch&&!bypass)cache.set(key,result)
  }catch(error){if(runEpoch!==epoch)return;await store.mutate(w=>{const t=w.requests.find(item=>item.id===requestId);if(!t||t.status!=='pending'||runEpoch!==epoch)return;t.status='failed';t.phase='Could not complete';t.error=publicRequestError(error)})}}
 app.use((error:any,_q:express.Request,r:express.Response,_next:express.NextFunction)=>r.status(error.status??500).json({error:error.message??'Request failed.'}))
 return app
}
function validateDashboardPatch(w:Workspace,body:any){if(body.widgets){if(!Array.isArray(body.widgets)||new Set(body.widgets.map((v:any)=>v.id)).size!==body.widgets.length)throw new HttpError(400,'Widgets require unique IDs.');for(const v of body.widgets){title(v.id);title(v.title);find(w.artifacts,v.artifactId,'Artifact')}}if(body.filters&&(!Array.isArray(body.filters)||body.filters.some((filter:any)=>!filter||typeof filter.field!=='string'||!['eq','in','gte','lte'].includes(filter.operator)||filter.value===undefined)))throw new HttpError(400,'Invalid dashboard filters.')}
