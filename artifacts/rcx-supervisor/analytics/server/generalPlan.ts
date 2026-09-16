import { z } from 'zod'

/**
 * The shared, provider-neutral representation used before a synthetic
 * definition is created.  It deliberately describes meaning rather than a
 * database table, so an unknown domain can be persisted without first adding
 * a phrase-specific branch to the conversation route.
 */
export const generalAnalysisPlanSchema = z.object({
  originalQuestion: z.string().min(1),
  entity: z.object({ id: z.string().min(1), name: z.string().min(1), grain: z.string().min(1) }).strict(),
  metric: z.object({ id: z.string().min(1), name: z.string().min(1), unit: z.enum(['items', 'percent', 'minutes', 'hours', 'score', 'currency']), aggregation: z.enum(['sum', 'mean', 'count', 'ratio']), formula: z.string().min(1).optional() }).strict(),
  grouping: z.object({ id: z.string().min(1), name: z.string().min(1), values: z.array(z.string().min(1)).min(1).max(20) }).strict(),
  cohorts: z.array(z.string().min(1)).max(10),
  time: z.object({ kind: z.enum(['instant', 'period']), requestedNow: z.boolean() }).strict(),
  presentation: z.enum(['bar', 'line', 'area', 'pie', 'donut', 'histogram', 'scatter', 'regression', 'heatmap', 'table', 'kpi', 'text']),
  assumptions: z.array(z.string().min(1)).max(6),
}).strict()

export type GeneralAnalysisPlan = z.infer<typeof generalAnalysisPlanSchema>
export type GenericDefinition = { title: string; version?: string; dimensions: Array<{ id: string; name: string; values: string[] }>; measures: Array<{ id: string; name: string; unit: string; minimum: number; maximum: number; formula?: string }>; assumptions: string[] }

const QUEUES = ['Sales', 'Billing', 'Account Services', 'Returns', 'Technical Support']
const CHANNELS = ['Voice', 'Digital', 'Chat', 'Email']
const PLANS = ['Starter', 'Growth', 'Enterprise']
const AGENT_TYPES = ['AI', 'Human']
const AGENTS = ['Atlas Assist', 'Avery Patel', 'Cedar Assist', 'Jordan Lee', 'Mika Santos']
const CAMPAIGNS = ['Renewal Outreach', 'Lead Follow-up', 'Billing Education', 'Customer Onboarding']
const FALLBACK = ['Segment A', 'Segment B', 'Segment C', 'Segment D', 'Segment E']

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'analysis'
const words = (value: string) => value.replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).filter(Boolean)
const titleCase = (value: string) => words(value).map(word => word[0]?.toUpperCase() + word.slice(1).toLowerCase()).join(' ')

function groupingFor(question: string) {
  const text = question.toLowerCase()
  if (/\bai\b.*\bhuman|\bhuman.*\bai\b|by agent type|agent types?/.test(text)) return { id: 'agentType', name: 'Agent type', values: AGENT_TYPES }
  if (/\bqueues?\b|by queue/.test(text)) return { id: 'queue', name: 'Queue', values: QUEUES }
  if (/\bchannels?\b|by channel/.test(text)) return { id: 'channel', name: 'Channel', values: CHANNELS }
  if (/\bplans?\b|by plan/.test(text)) return { id: 'plan', name: 'Plan', values: PLANS }
  if (/\bagents?\b|by agent/.test(text)) return { id: 'agent', name: 'Agent', values: AGENTS }
  if (/\bcampaigns?\b|by campaign/.test(text)) return { id: 'campaign', name: 'Campaign', values: CAMPAIGNS }
  if (/\b(?:day|daily|week|weekly|month|monthly|trend|over time)\b/.test(text)) return { id: 'period', name: 'Period', values: ['Week 1', 'Week 2', 'Week 3', 'Week 4'] }
  return { id: 'category', name: 'Category', values: FALLBACK }
}

function metricFor(question: string) {
  const text = question.toLowerCase()
  const named = [
    [/\babandon(?:ed|ment)? rates?\b/, 'abandonmentRate', 'Abandonment rate', 'percent', 'ratio', 1, 95],
    [/\bservice level\b/, 'serviceLevel', 'Service level', 'percent', 'mean', 45, 98],
    [/\bacceptance rate\b/, 'acceptanceRate', 'Acceptance rate', 'percent', 'mean', 35, 95],
    [/\b(?:conversion|adoption|retention)(?: rate)?\b/, 'rate', 'Rate', 'percent', 'mean', 5, 95],
    [/\b(?:handling|handle|active) (?:time|minutes?)\b/, 'handlingMinutes', 'Handling minutes', 'minutes', 'sum', 3, 45],
    [/\b(?:wait|waiting) (?:time|minutes?)\b/, 'waitMinutes', 'Wait time', 'minutes', 'mean', 1, 60],
    [/\b(?:satisfaction|quality)\b/, 'score', 'Score', 'score', 'mean', 55, 100],
    [/\b(?:revenue|cost|spend)\b/, 'amount', 'Amount', 'currency', 'sum', 100, 10000],
    [/\b(?:volume|interactions?|calls?|tickets?|orders?)\b/, 'count', 'Count', 'items', 'sum', 10, 300],
    [/\b(?:how many|count|number of)\b/, 'count', 'Count', 'items', 'count', 1, 100],
  ] as const
  const match = named.find(([pattern]) => pattern.test(text))
  if (match) return { id: match[1], name: match[2], unit: match[3], aggregation: match[4], minimum: match[5], maximum: match[6] } as const
  const stripped = text.replace(/\b(show|compare|plot|chart|graph|as|a|an|the|by|for|of|in|with|and|versus|vs|over|time|please)\b/g, ' ').replace(/\s+/g, ' ').trim()
  const label = titleCase(stripped || 'Measure')
  return { id: slug(label), name: label, unit: 'items' as const, aggregation: 'sum' as const, minimum: 10, maximum: 250 }
}

function presentationFor(question: string, grouping: { id: string }, metric: { unit: string }) : GeneralAnalysisPlan['presentation'] {
  const text = question.toLowerCase()
  if (/\b(table|rows?|records?|inspect|underlying)\b/.test(text)) return 'table'
  if (/\b(explain|without (?:a )?(?:chart|graph)|text)\b/.test(text)) return 'text'
  if (/\bkpis?\b/.test(text)) return 'kpi'
  if (/\bheatmap\b/.test(text)) return 'heatmap'
  if (/\b(?:scatter|relationship)\b/.test(text)) return 'scatter'
  if (/\bregression\b/.test(text)) return 'regression'
  if (/\barea\b/.test(text)) return 'area'
  if (/\b(?:line|trend|over time|daily|weekly|monthly)\b/.test(text)) return 'line'
  if (/\b(?:pie|donut|composition|mix|share)\b/.test(text)) return grouping.id === 'period' ? 'bar' : 'donut'
  if (/\b(?:histogram|distribution)\b/.test(text)) return 'histogram'
  if (/\b(?:bar|column|compare|versus| vs )\b/.test(text)) return 'bar'
  return metric.unit === 'items' && grouping.id === 'category' ? 'kpi' : 'bar'
}

/** Parse only stable analytical semantics. The model adapter can supply the
 * same JSON schema later; this deterministic implementation is the safe local
 * fallback and keeps planning behaviour independent of provider choice. */
export function planGeneralAnalysis(question: string): GeneralAnalysisPlan {
  const grouping = groupingFor(question)
  const metric = metricFor(question)
  const text = question.toLowerCase()
  const requestedNow = /\b(?:now|right now|currently|online)\b/.test(text)
  const plan = {
    originalQuestion: question,
    entity: { id: slug(grouping.name), name: grouping.name, grain: requestedNow ? 'presence interval' : 'daily synthetic record' },
    metric: { id: metric.id, name: metric.name, unit: metric.unit, aggregation: metric.aggregation },
    grouping,
    cohorts: grouping.id === 'agentType' ? grouping.values : [],
    time: { kind: requestedNow ? 'instant' as const : 'period' as const, requestedNow },
    presentation: presentationFor(question, grouping, metric),
    assumptions: [`This persisted synthetic definition uses ${grouping.name.toLowerCase()} records generated deterministically for the requested analysis.`],
  }
  return generalAnalysisPlanSchema.parse(plan)
}

export function definitionForPlan(plan: GeneralAnalysisPlan, title?: string): GenericDefinition {
  return {
    title: title ?? `${plan.metric.name} by ${plan.grouping.name}`,
    dimensions: [{ id: plan.grouping.id, name: plan.grouping.name, values: plan.grouping.values }],
    measures: [{ id: plan.metric.id, name: plan.metric.name, unit: plan.metric.unit === 'percent' ? '%' : plan.metric.unit, minimum: plan.metric.unit === 'percent' ? 1 : 5, maximum: plan.metric.unit === 'percent' ? 95 : plan.metric.unit === 'score' ? 100 : plan.metric.unit === 'currency' ? 10000 : 300, ...(plan.metric.formula ? { formula: plan.metric.formula } : {}) }],
    assumptions: plan.assumptions,
  }
}
