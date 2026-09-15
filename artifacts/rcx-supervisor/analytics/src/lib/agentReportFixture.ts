import type { Dataset, Field, Row } from './model.js'

export type AgentType = 'ai' | 'human'
export type AgentProfile = { agentId: string; agentName: string; agentType: AgentType; team: string }
export type AgentActivityRecord = { activityId: string; agentId: string; startedAt: string; endedAt: string; channel: 'voice' | 'digital'; interactionsHandled: number; activeMinutes: number }
export type AgentStateInterval = { intervalId: string; agentId: string; state: 'Available' | 'Busy' | 'Break' | 'Offline'; startedAt: string; endedAt: string; durationMinutes: number }
export type AgentDispositionRecord = { interactionId: string; agentId: string; occurredAt: string; disposition: 'Resolved' | 'Follow-up' | 'Escalated' | 'No response'; channel: 'voice' | 'digital' }
export type AgentConductRecord = { eventId: string; agentId: string; occurredAt: string; eventType: 'policy_acknowledged' | 'quality_review_completed' | 'coaching_completed'; count: number }
export type AgentScorecard = { agentId: string; evaluationScore: number; evaluationSampleCount: number; qualityReviews: number; interactionsHandled: number }
export type AgentReportFixture = { definition: string; agents: readonly AgentProfile[]; activity: readonly AgentActivityRecord[]; stateIntervals: readonly AgentStateInterval[]; dispositions: readonly AgentDispositionRecord[]; conduct: readonly AgentConductRecord[]; scorecards: readonly AgentScorecard[] }
export type ReportDefaultView = { reportId: string; title: string; scope: string; columns: readonly string[]; rows: readonly Record<string, string | number>[]; definition: string }

export const AGENT_REPORT_WINDOW = { start: '2026-08-31T00:00:00.000Z', end: '2026-09-14T00:00:00.000Z', label: 'Synthetic data · 31 Aug–13 Sep 2026 UTC' } as const

const agents: readonly AgentProfile[] = [
  { agentId: 'agt-001', agentName: 'Avery Patel', agentType: 'human', team: 'Enterprise' },
  { agentId: 'agt-002', agentName: 'Jordan Lee', agentType: 'human', team: 'Enterprise' },
  { agentId: 'agt-003', agentName: 'Mika Santos', agentType: 'human', team: 'Growth' },
  { agentId: 'agt-004', agentName: 'Noah Kim', agentType: 'human', team: 'Growth' },
  { agentId: 'agt-005', agentName: 'Riley Morgan', agentType: 'human', team: 'Support' },
  { agentId: 'agt-101', agentName: 'Atlas Assist', agentType: 'ai', team: 'Automation' },
  { agentId: 'agt-102', agentName: 'Beacon Assist', agentType: 'ai', team: 'Automation' },
  { agentId: 'agt-103', agentName: 'Cedar Assist', agentType: 'ai', team: 'Automation' },
]

const date = (day: number, hour: number): string => `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
const activity: readonly AgentActivityRecord[] = Array.from({ length: 26 }, (_, index) => {
  const agent = agents[index % agents.length]
  const day = 1 + Math.floor(index / 2)
  const hour = 8 + (index % 5)
  const activeMinutes = 24 + (index % 4) * 9
  return { activityId: `act-${String(index + 1).padStart(3, '0')}`, agentId: agent.agentId, startedAt: date(day, hour), endedAt: `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(activeMinutes).padStart(2, '0')}:00.000Z`, channel: index % 3 === 0 ? 'digital' : 'voice', interactionsHandled: 2 + (index % 6), activeMinutes }
})

const stateIntervals: readonly AgentStateInterval[] = activity.map((record, index) => ({ intervalId: `state-${String(index + 1).padStart(3, '0')}`, agentId: record.agentId, state: index % 5 === 0 ? 'Break' : index % 4 === 0 ? 'Offline' : index % 3 === 0 ? 'Available' : 'Busy', startedAt: record.startedAt, endedAt: record.endedAt, durationMinutes: record.activeMinutes }))
const dispositions: readonly AgentDispositionRecord[] = activity.map((record, index) => ({ interactionId: `int-${String(index + 1).padStart(3, '0')}`, agentId: record.agentId, occurredAt: record.endedAt, disposition: ['Resolved', 'Follow-up', 'Escalated', 'No response'][index % 4] as AgentDispositionRecord['disposition'], channel: record.channel }))
const conduct: readonly AgentConductRecord[] = agents.map((agent, index) => ({ eventId: `conduct-${String(index + 1).padStart(3, '0')}`, agentId: agent.agentId, occurredAt: date(2 + index, 14), eventType: ['policy_acknowledged', 'quality_review_completed', 'coaching_completed'][index % 3] as AgentConductRecord['eventType'], count: 1 + (index % 2) }))
const scorecards: readonly AgentScorecard[] = agents.map((agent, index) => ({ agentId: agent.agentId, evaluationScore: 78 + index * 2, evaluationSampleCount: 3 + (index % 4), qualityReviews: 2 + (index % 3), interactionsHandled: activity.filter(record => record.agentId === agent.agentId).reduce((total, record) => total + record.interactionsHandled, 0) }))

export const agentReportFixture: AgentReportFixture = { definition: 'Synthetic, fixed fourteen-day UTC agent records for prototype-only report exploration.', agents, activity, stateIntervals, dispositions, conduct, scorecards }

export function distinctActiveAgentsByType(fixture: AgentReportFixture = agentReportFixture): { ai: number; human: number; total: number } {
  const activeIds = new Set(fixture.activity.map(record => record.agentId))
  const active = fixture.agents.filter(agent => activeIds.has(agent.agentId))
  const ai = active.filter(agent => agent.agentType === 'ai').length
  const human = active.filter(agent => agent.agentType === 'human').length
  return { ai, human, total: ai + human }
}

const agent = (id: string): AgentProfile => agents.find(item => item.agentId === id)!
const activityRows = (): Record<string, string | number>[] => activity.map(record => ({ agent: agent(record.agentId).agentName, agentType: agent(record.agentId).agentType, channel: record.channel, interactionsHandled: record.interactionsHandled, activeMinutes: record.activeMinutes, startedAt: record.startedAt }))
const defaultViews: Record<string, () => Omit<ReportDefaultView, 'reportId' | 'scope' | 'definition'>> = {
  'agent-activity-overview': () => { const counts = distinctActiveAgentsByType(); return { title: 'Agent Activity Overview', columns: ['metric', 'value'], rows: [{ metric: 'Active agents', value: counts.total }, { metric: 'AI active agents', value: counts.ai }, { metric: 'Human active agents', value: counts.human }, { metric: 'Interactions handled', value: activity.reduce((sum, record) => sum + record.interactionsHandled, 0) }] } },
  'agent-activity': () => ({ title: 'Agent Activity', columns: ['agent', 'agentType', 'channel', 'interactionsHandled', 'activeMinutes', 'startedAt'], rows: activityRows() }),
  'agent-activity-report': () => ({ title: 'Agent Activity', columns: ['agent', 'agentType', 'channel', 'interactionsHandled', 'activeMinutes', 'startedAt'], rows: activityRows() }),
  'agent-conduct': () => ({ title: 'Agent Conduct', columns: ['agent', 'eventType', 'count', 'occurredAt'], rows: conduct.map(record => ({ agent: agent(record.agentId).agentName, eventType: record.eventType, count: record.count, occurredAt: record.occurredAt })) }),
  'agent-dispositions': () => ({ title: 'Agent Dispositions', columns: ['disposition', 'count'], rows: ['Resolved', 'Follow-up', 'Escalated', 'No response'].map(disposition => ({ disposition, count: dispositions.filter(record => record.disposition === disposition).length })) }),
  'agent-scorecard': () => ({ title: 'Agent Scorecard', columns: ['agent', 'agentType', 'evaluationScore', 'evaluationSampleCount', 'qualityReviews', 'interactionsHandled'], rows: scorecards.map(({ agentId, ...record }) => ({ agent: agent(agentId).agentName, agentType: agent(agentId).agentType, ...record })) }),
  'agent-state': () => ({ title: 'Agent State', columns: ['state', 'durationMinutes'], rows: ['Available', 'Busy', 'Break', 'Offline'].map(state => ({ state, durationMinutes: stateIntervals.filter(record => record.state === state).reduce((sum, record) => sum + record.durationMinutes, 0) })) }),
  'agent-disposition-report': () => ({ title: 'Agent Disposition Overview', columns: ['agent', 'disposition', 'channel', 'occurredAt'], rows: dispositions.map(record => ({ agent: agent(record.agentId).agentName, disposition: record.disposition, channel: record.channel, occurredAt: record.occurredAt })) }),
}

export function defaultReportView(reportId: keyof typeof defaultViews): ReportDefaultView {
  const view = defaultViews[reportId]()
  return { reportId, ...view, scope: AGENT_REPORT_WINDOW.label, definition: agentReportFixture.definition }
}

/** A reusable typed dataset for server-side report resolution; all rows are synthetic. */
export function agentReportDataset(): Dataset {
  const fields: Field[] = [
    { id: 'agent', name: 'Agent', type: 'category', values: agents.map(item => item.agentName) },
    { id: 'agentType', name: 'Agent type', type: 'category', values: ['ai', 'human'] },
    { id: 'channel', name: 'Channel', type: 'category', values: ['voice', 'digital'] },
    { id: 'interactionsHandled', name: 'Interactions handled', type: 'number' },
    { id: 'activeMinutes', name: 'Active minutes', type: 'number', unit: 'minutes' },
    { id: 'startedAt', name: 'Started at', type: 'date' },
  ]
  return { id: 'agent-reports-v1', title: 'Synthetic agent report fixture', seed: 20260914, fields, rows: activityRows() as Row[], colors: {}, createdAt: AGENT_REPORT_WINDOW.end }
}
