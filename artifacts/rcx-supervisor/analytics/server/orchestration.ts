import { z } from 'zod'
import type { AnalysisScope, Field, Filter, Row } from '../src/lib/model.ts'
import type { Answer } from './inference.ts'

export const intentSchema = z.object({
  metric: z.enum(['activeAgents', 'handlingMinutes', 'records']),
  cohort: z.enum(['ai', 'human', 'all']),
  display: z.enum(['bar', 'donut', 'kpi', 'table', 'text']),
}).strict()
export type OperationalIntent = z.infer<typeof intentSchema>
export type AnalysisPlan = OperationalIntent

type CohortTotals = { ai: number; human: number; total: number }
export type OperationalResult = {
  datasetId: string; revisionId: string; rows: Row[]; fields: Field[]
  pagination: { offset: number; limit: number; total: number }
  evidence: { activeAgents: CohortTotals; handlingMinutes: CohortTotals; scope: { start: string; end: string; agentType?: 'ai' | 'human' } }
}
export type OrchestrationBudget = { maxModelCalls: number; maxToolCalls: number; maxRepairCycles: number; deadlineMs: number }
export const DEFAULT_ORCHESTRATION_BUDGET: OrchestrationBudget = { maxModelCalls: 4, maxToolCalls: 6, maxRepairCycles: 1, deadlineMs: 120_000 }
export type OrchestrationState = 'received' | 'planning' | 'resolving-data' | 'computing' | 'preparing-output' | 'reviewing' | 'completed' | 'needs-clarification' | 'failed' | 'cancelled'
export type OrchestrationTrace = {
  state: OrchestrationState
  budget: OrchestrationBudget
  modelCalls: number
  toolCalls: number
  repairCycles: number
  stages: Array<{ state: OrchestrationState; at: number }>
  validation: { semanticIssues: string[]; reviewIssues: string[] }
  presentationCorrection?: string
}
export type OperationalTurnInput = {
  question: string
  report: { id: string; title: string; version: number }
  result: OperationalResult
  scope: AnalysisScope
  priorQuestions: string[]
  asOf?: string
  budget?: Partial<OrchestrationBudget>
}
export type OrchestrationContext = OperationalTurnInput
export type PlanningContext = OperationalTurnInput & { candidate?: unknown; issues?: string[]; explicitIntent?: OperationalIntent }
export type ReviewResult = { valid: boolean; issues: string[] }
export type PlannerReviewer = {
  plan: (context: PlanningContext) => Promise<unknown>
  review?: (context: PlanningContext) => Promise<ReviewResult>
  repair?: (context: PlanningContext) => Promise<unknown>
}
export type RequiredOperationalQuery = { revisionId: string; start: string; end: string; asOf?: string; agentType?: 'ai' | 'human'; intent: 'activity' | 'count' | 'comparison' | 'presence' }
export type PresentationPlan = { kind: 'text' | 'kpi' | 'table' | 'chart'; chartType?: OperationalIntent['display']; x?: string; y?: string; filters: Filter[]; correction?: string }
export type OperationalTurn = { intent: OperationalIntent; scope: AnalysisScope; presentation: PresentationPlan; answer?: Answer; queryRequired?: RequiredOperationalQuery; modelCalls: number; trace: OrchestrationTrace }

const normalized = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
function metricIn(question: string): OperationalIntent['metric'] | undefined {
  if (/handling (?:time|minutes)|active minutes|time spent handling/.test(question)) return 'handlingMinutes'
  if (/agent counts?|count (?:of )?(?:active |ai |human )*agents|number of (?:active |ai |human )*agents|how many .*agents|active agents/.test(question)) return 'activeAgents'
  if (/underlying (?:rows|records)|activity rows|handling segments/.test(question)) return 'records'
  return undefined
}
function requestedDisplay(question: string): OperationalIntent['display'] | undefined {
  if (/\b(donut|pie)\b/.test(question)) return 'donut'
  if (/\b(table|rows|records)\b/.test(question)) return 'table'
  if (/\bkpis?\b/.test(question)) return 'kpi'
  if (/\b(bars?|chart|compare|comparison)\b/.test(question)) return 'bar'
  return undefined
}
function explicitIntent(input: OperationalTurnInput): OperationalIntent | undefined {
  const question = normalized(input.question)
  let metric = metricIn(question)
  if (!metric && /\b(bar|bars|chart|donut|pie|kpi|table|rows|records|human|ai)\b/.test(question)) metric = [...input.priorQuestions].reverse().map(previous => metricIn(normalized(previous))).find(Boolean)
  if (!metric && /\b(bar|bars|chart|donut|pie|kpis?)\b/.test(question)) metric = 'activeAgents'
  if (/\b(rows|records)\b/.test(question) || (!metric && /\btable\b/.test(question))) metric = 'records'
  if (/^(open|show) (the )?(agent activity|report)$/.test(question) || !question) metric = 'records'
  if (!metric) return undefined
  const ai = /\b(ai|artificial intelligence)\b/.test(question), human = /\bhumans?\b/.test(question)
  const filter = input.scope.filters.find(item => item.field === 'agentType' && item.operator === 'eq')
  const inherited = filter?.value === 'ai' || filter?.value === 'human' ? filter.value : 'all'
  const cohortComparison = ai && human || /\ball agents\b|by agent type|versus/.test(question)
  const cohort = cohortComparison ? 'all' : ai ? 'ai' : human ? 'human' : inherited
  const display = requestedDisplay(question) ?? (metric === 'records' ? 'table' : /\b(share|proportion|composition|mix)\b/.test(question) && cohort === 'all' ? 'donut' : cohortComparison ? 'bar' : 'text')
  return { metric, cohort, display }
}
const clarification = (reviewIssues: string[] = []): Answer => ({
  kind: 'clarification',
  text: reviewIssues.length ? `I could not validate that request against the available evidence. ${reviewIssues[0]}` : 'Would you like to compare active agent counts, handling minutes, or inspect activity records?',
  choices: ['Compare active agents by agent type as a bar chart.', 'Show handling minutes by agent type as a bar chart.', 'Show the underlying activity records as a table.'],
  suggestions: [], charts: [], operations: [],
})
function suggestions(input: OperationalTurnInput, intent: OperationalIntent): string[] {
  const cohort = intent.cohort === 'all' ? 'by agent type' : `for ${intent.cohort === 'ai' ? 'AI' : 'human'} agents`
  const candidates = [`Compare active agents ${cohort} as a bar chart.`, `Show handling minutes ${cohort} as a bar chart.`, `Show the underlying activity records ${intent.cohort === 'all' ? '' : `for ${intent.cohort === 'ai' ? 'AI' : 'human'} agents `}as a table.`]
  const previous = new Set([input.question, ...input.priorQuestions].map(normalized))
  return candidates.filter(candidate => !previous.has(normalized(candidate))).slice(0, 2)
}
function semanticIssues(candidate: unknown): string[] {
  const parsed = intentSchema.safeParse(candidate)
  if (!parsed.success) return ['Use only the supported metric, cohort and display identifiers.']
  if (parsed.data.metric === 'records' && !['table', 'text'].includes(parsed.data.display)) return ['Raw records require a table or textual explanation, not an invented measure.']
  return []
}
function correctPresentation(intent: OperationalIntent): { intent: OperationalIntent; note?: string } {
  if (intent.display === 'donut' && intent.cohort !== 'all') return { intent: { ...intent, display: 'bar' }, note: 'A donut needs non-overlapping parts of a whole; a bar chart is clearer for one cohort.' }
  if (intent.metric === 'records' && intent.display !== 'table' && intent.display !== 'text') return { intent: { ...intent, display: 'table' }, note: 'A table is the appropriate view for raw records.' }
  return { intent }
}
function mergeExplicitSemantics(explicit: OperationalIntent, repaired: unknown): OperationalIntent | undefined {
  const parsed = intentSchema.safeParse(repaired)
  return parsed.success ? correctPresentation({ ...explicit, display: parsed.data.display }).intent : undefined
}
function presentation(intent: OperationalIntent, fields: Field[], filters: Filter[], correction?: string): PresentationPlan {
  const kind = intent.display === 'text' ? 'text' : intent.display === 'table' ? 'table' : intent.display === 'kpi' ? 'kpi' : 'chart'
  const y = intent.metric === 'activeAgents' ? 'activeAgents' : fields.some(field => field.id === 'handlingMinutes') ? 'handlingMinutes' : 'activeMinutes'
  return { kind, ...(kind === 'chart' ? { chartType: intent.display, x: 'agentType', y } : kind === 'kpi' ? { chartType: 'kpi', y } : {}), filters, ...(correction ? { correction } : {}) }
}

/** Pure controller: no database writes, raw SQL, network access, or model-generated numbers. */
export async function orchestrateOperationalTurn(input: OperationalTurnInput, agents?: PlannerReviewer): Promise<OperationalTurn> {
  const budget = { ...DEFAULT_ORCHESTRATION_BUDGET, ...input.budget }
  const startedAt = Date.now()
  const trace: OrchestrationTrace = { state: 'received', budget, modelCalls: 0, toolCalls: 0, repairCycles: 0, stages: [{ state: 'received', at: startedAt }], validation: { semanticIssues: [], reviewIssues: [] } }
  const transition = (state: OrchestrationState) => { trace.state = state; trace.stages.push({ state, at: Date.now() }) }
  const currentPresentation = (intent: OperationalIntent, filters: Filter[] = [], correction?: string) => presentation(intent, input.result.fields, filters, correction)
  const finish = (turn: Omit<OperationalTurn, 'intent' | 'modelCalls' | 'trace' | 'presentation'>, intent: OperationalIntent, filters: Filter[] = [], correction?: string): OperationalTurn => ({ ...turn, intent, presentation: currentPresentation(intent, filters, correction), modelCalls: trace.modelCalls, trace })
  const call = async <T>(state: OrchestrationState, operation: () => Promise<T>): Promise<T> => {
    if (trace.modelCalls >= budget.maxModelCalls) throw Error('The analysis call budget was exhausted before validation completed.')
    if (Date.now() - startedAt >= budget.deadlineMs) throw Error('The analysis deadline elapsed before validation completed.')
    transition(state); trace.modelCalls++
    return operation()
  }
  const review = async (candidate: unknown, issues: string[], explicit?: OperationalIntent): Promise<ReviewResult | undefined> => {
    if (!agents?.review) return undefined
    const result = await call('reviewing', () => agents.review!({ ...input, candidate, issues, explicitIntent: explicit }))
    if (!result.valid) trace.validation.reviewIssues.push(...result.issues)
    return result
  }
  let intent = explicitIntent(input)
  const explicit = intent
  let presentationCorrection: string | undefined
  if (intent) { const corrected = correctPresentation(intent); intent = corrected.intent; presentationCorrection = corrected.note }
  try {
    if (intent) {
      let issues = semanticIssues(intent); trace.validation.semanticIssues.push(...issues)
      const reviewed = await review(intent, issues, explicit)
      if (reviewed && !reviewed.valid) issues = [...issues, ...reviewed.issues, 'The reviewer rejected the proposed intent.']
      if (issues.length) {
        if (!agents?.repair || trace.repairCycles >= budget.maxRepairCycles) { transition('needs-clarification'); return finish({ scope: input.scope, answer: clarification(trace.validation.reviewIssues) }, intent, [], presentationCorrection) }
        trace.repairCycles++
        const repaired = await call('planning', () => agents.repair!({ ...input, candidate: intent, issues, explicitIntent: explicit }))
        const preserved = mergeExplicitSemantics(explicit!, repaired)
        if (!preserved) { transition('needs-clarification'); return finish({ scope: input.scope, answer: clarification(['The proposed correction did not use supported analytical semantics.']) }, intent, [], presentationCorrection) }
        intent = preserved
        issues = semanticIssues(intent); trace.validation.semanticIssues.push(...issues)
        const repairedReview = await review(intent, issues, explicit)
        if (repairedReview && !repairedReview.valid) issues = [...issues, ...repairedReview.issues, 'The reviewer rejected the repaired intent.']
        if (issues.length) { transition('needs-clarification'); return finish({ scope: input.scope, answer: clarification(trace.validation.reviewIssues) }, intent, [], presentationCorrection) }
      }
    } else if (agents) {
      let candidate: unknown = await call('planning', () => agents.plan(input))
      let issues = semanticIssues(candidate); trace.validation.semanticIssues.push(...issues)
      const reviewed = await review(candidate, issues)
      if (reviewed && !reviewed.valid) issues = [...issues, ...reviewed.issues, 'The reviewer rejected the proposed intent.']
      if (issues.length && agents.repair && trace.repairCycles < budget.maxRepairCycles) {
        trace.repairCycles++
        candidate = await call('planning', () => agents.repair!({ ...input, candidate, issues }))
        issues = semanticIssues(candidate); trace.validation.semanticIssues.push(...issues)
        const repairedReview = await review(candidate, issues)
        if (repairedReview && !repairedReview.valid) issues = [...issues, ...repairedReview.issues, 'The reviewer rejected the repaired intent.']
      }
      if (!issues.length) intent = intentSchema.parse(candidate)
    }
  } catch (error) { transition('failed'); throw error }
  if (!intent) { transition('needs-clarification'); const fallback: OperationalIntent = { metric: 'records', cohort: 'all', display: 'text' }; return finish({ scope: input.scope, answer: clarification(trace.validation.reviewIssues) }, fallback) }
  if (presentationCorrection) trace.presentationCorrection = presentationCorrection
  const filters: Filter[] = input.scope.filters.filter(filter => filter.field !== 'agentType')
  if (intent.cohort !== 'all') filters.push({ field: 'agentType', operator: 'eq', value: intent.cohort })
  const scope = { ...input.scope, filters }
  const resultScope = input.result.evidence.scope
  const onlineNow = Boolean(input.asOf && /\b(?:now|right now|currently|online)\b/.test(normalized(input.question)))
  const query: RequiredOperationalQuery = { revisionId: input.result.revisionId, start: scope.period.from, end: scope.period.to, ...(onlineNow ? { asOf: input.asOf } : {}), ...(intent.cohort !== 'all' ? { agentType: intent.cohort } : {}), intent: onlineNow && intent.metric === 'activeAgents' ? 'presence' : intent.metric === 'records' ? 'activity' : intent.metric === 'activeAgents' ? 'count' : 'comparison' }
  // Grouped evidence can answer a textual or KPI cohort request locally. A
  // chart needs a source query for that cohort because resolved renderers do
  // not reapply filters to already-grouped SQL rows.
  const needsCohort = ['bar', 'donut'].includes(intent.display) && (resultScope.agentType ?? 'all') !== intent.cohort
  const needsPeriod = Date.parse(resultScope.start) !== Date.parse(scope.period.from) || Date.parse(resultScope.end) !== Date.parse(scope.period.to)
  const fields = input.result.fields
  const numericField = intent.metric === 'activeAgents' ? 'activeAgents' : fields.some(field => field.id === 'handlingMinutes') ? 'handlingMinutes' : 'activeMinutes'
  const hasMetric = fields.some(field => field.id === numericField && field.type === 'number')
  const hasCohort = fields.some(field => field.id === 'agentType' && field.type === 'category')
  const isActivity = fields.some(field => field.id === 'agent' || field.id === 'interactionId')
  const needsRecords = intent.metric === 'records' && intent.display === 'table' && (!isActivity || (resultScope.agentType ?? 'all') !== intent.cohort)
  const incompleteAggregation = input.result.pagination.offset > 0 || input.result.pagination.total > input.result.rows.length
  if (needsCohort || needsPeriod || needsRecords || (intent.metric !== 'records' && intent.display !== 'text' && (!hasMetric || !hasCohort || incompleteAggregation))) { transition('resolving-data'); return finish({ scope, queryRequired: query }, intent, filters, presentationCorrection) }
  transition('computing')
  const totals = intent.metric === 'activeAgents' ? input.result.evidence.activeAgents : input.result.evidence.handlingMinutes
  if (Object.values(totals).some(value => !Number.isFinite(value) || value < 0)) throw new Error('Operational evidence contains invalid metric values.')
  if (intent.metric === 'activeAgents' && Object.values(totals).some(value => !Number.isSafeInteger(value))) throw new Error('Agent counts must be nonnegative integers.')
  const amount = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
  let text = `Showing ${input.report.title} activity records in the selected reporting period.`
  const timeLabel = onlineNow ? 'at the captured as-of time' : 'in the selected reporting period'
  const agentState = onlineNow ? 'online' : 'active'
  if (intent.metric === 'activeAgents') text = intent.cohort === 'all' ? `${amount(totals.ai)} ${agentState} AI agents and ${amount(totals.human)} ${agentState} human agents (${amount(totals.total)} total) ${timeLabel}.` : `${amount(totals[intent.cohort])} ${agentState} ${intent.cohort === 'ai' ? 'AI' : 'human'} agents ${timeLabel}.`
  if (intent.metric === 'handlingMinutes') text = intent.cohort === 'all' ? `${amount(totals.ai)} AI handling minutes and ${amount(totals.human)} human handling minutes (${amount(totals.total)} minutes total) in the selected reporting period.` : `${amount(totals[intent.cohort])} handling minutes for ${intent.cohort === 'ai' ? 'AI' : 'human'} agents in the selected reporting period.`
  if (presentationCorrection) text = `${text} ${presentationCorrection}`
  transition('preparing-output')
  const charts: Answer['charts'] = intent.display === 'text' ? [] : [{ title: intent.metric === 'records' ? input.report.title : intent.metric === 'activeAgents' ? 'Active Agents by Agent Type' : 'Handling Minutes by Agent Type', reuseDataset: true, fields: [], seed: 20260914, view: { chartType: intent.display, aggregation: 'sum', filters, ...(intent.metric !== 'records' ? { x: 'agentType', y: numericField } : {}) } }]
  transition('completed')
  return finish({ scope, answer: { kind: intent.display === 'text' ? 'text' : intent.display === 'table' ? 'report' : 'chart', text, choices: [], suggestions: suggestions(input, intent), charts, operations: [] } }, intent, filters, presentationCorrection)
}

/** Stable, data-source-agnostic entry point for composer, report, and Advisor adapters. */
export const orchestrateAnalysis = orchestrateOperationalTurn
