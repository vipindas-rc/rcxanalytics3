import { describe, expect, it } from 'vitest'
import { AGENT_REPORT_WINDOW, agentReportFixture, defaultReportView, distinctActiveAgentsByType } from './agentReportFixture'

describe('agent report fixture', () => {
  it('uses one stable AI or human classification for every unique agent during a fourteen-day UTC scope', () => {
    expect(AGENT_REPORT_WINDOW).toEqual({ start: '2026-08-31T00:00:00.000Z', end: '2026-09-14T00:00:00.000Z', label: 'Synthetic data · 31 Aug–13 Sep 2026 UTC' })
    expect(new Set(agentReportFixture.agents.map(agent => agent.agentId)).size).toBe(agentReportFixture.agents.length)
    expect(agentReportFixture.agents.every(agent => agent.agentType === 'ai' || agent.agentType === 'human')).toBe(true)
    expect(agentReportFixture.activity.every(record => record.startedAt >= AGENT_REPORT_WINDOW.start && record.endedAt <= AGENT_REPORT_WINDOW.end)).toBe(true)
  })

  it('counts distinct active agents by type instead of activity rows', () => {
    const summary = distinctActiveAgentsByType(agentReportFixture)
    expect(summary.total).toBe(summary.ai + summary.human)
    expect(summary.total).toBeLessThan(agentReportFixture.activity.length)
    expect(summary.ai).toBe(agentReportFixture.agents.filter(agent => agent.agentType === 'ai' && agentReportFixture.activity.some(record => record.agentId === agent.agentId)).length)
  })

  it('provides inspectable plain-row default views for all supported experiences', () => {
    for (const reportId of ['agent-activity-overview', 'agent-activity', 'agent-activity-report', 'agent-conduct', 'agent-dispositions', 'agent-scorecard', 'agent-state', 'agent-disposition-report'] as const) {
      const view = defaultReportView(reportId)
      expect(view.columns.length).toBeGreaterThan(0)
      expect(view.rows.length).toBeGreaterThan(0)
      expect(view.scope).toContain('Synthetic data')
    }
  })

  it('keeps state intervals, dispositions, conduct and scorecards attached to known agents', () => {
    const agentIds = new Set(agentReportFixture.agents.map(agent => agent.agentId))
    for (const records of [agentReportFixture.stateIntervals, agentReportFixture.dispositions, agentReportFixture.conduct, agentReportFixture.scorecards]) {
      expect(records.every(record => agentIds.has(record.agentId))).toBe(true)
    }
    expect(agentReportFixture.dispositions.every(record => record.disposition.length > 0)).toBe(true)
    expect(agentReportFixture.scorecards.every(record => record.evaluationSampleCount > 0 && record.evaluationScore >= 0 && record.evaluationScore <= 100)).toBe(true)
  })
})
