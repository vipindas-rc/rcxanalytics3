import { describe, expect, it, vi } from 'vitest'
import { orchestrateAnalysis, orchestrateOperationalTurn, type OperationalTurnInput } from './orchestration.ts'

const input = (question: string): OperationalTurnInput => ({
  question, report: { id: 'agent-activity-report', title: 'Agent Activity', version: 1 }, priorQuestions: [],
  scope: { period: { from: '2026-09-01', to: '2026-09-15' }, timezone: 'UTC', filters: [] },
  result: { datasetId: 'dataset', revisionId: 'revision', fields: [{ id: 'agentType', name: 'Agent Type', type: 'category' }, { id: 'activeAgents', name: 'Active Agents', type: 'number' }, { id: 'handlingMinutes', name: 'Handling Minutes', type: 'number', unit: 'minutes' }], rows: [{ agentType: 'ai', activeAgents: 3, handlingMinutes: 120 }, { agentType: 'human', activeAgents: 5, handlingMinutes: 380 }], pagination: { total: 2, offset: 0, limit: 2 }, evidence: { activeAgents: { ai: 3, human: 5, total: 8 }, handlingMinutes: { ai: 120, human: 380, total: 500 }, scope: { start: '2026-09-01', end: '2026-09-15' } } },
})

describe('operational turn orchestration', () => {
  it('exposes a source-agnostic orchestration entry point with answer, presentation, and trace', async () => {
    const result = await orchestrateAnalysis(input('How many agents are AI agents?'))
    expect(result.answer?.kind).toBe('text')
    expect(result.presentation.kind).toBe('text')
    expect(result.trace.state).toBe('completed')
  })
  it('answers agent counts from complete evidence without AI or a forced chart', async () => {
    const plan = vi.fn()
    const result = await orchestrateOperationalTurn(input('How many agents are AI agents?'), { plan })
    expect(result.answer?.text).toMatch(/3 active AI agents/)
    expect(result.answer?.charts).toEqual([])
    expect(result.intent).toMatchObject({ metric: 'activeAgents', cohort: 'ai', display: 'text' })
    expect(result.modelCalls).toBe(0)
    expect(plan).not.toHaveBeenCalled()
  })
  it.each(['bar', 'bars', 'bar chart'])('uses agent counts, not handling minutes, for %s', async display => {
    const result = await orchestrateOperationalTurn(input(`Compare AI and human agent counts as ${display}`))
    expect(result.answer?.charts[0].view).toMatchObject({ chartType: 'bar', x: 'agentType', y: 'activeAgents' })
    expect(result.answer?.text).toMatch(/3.*5/)
  })
  it('reviews an explicit plan once without letting the reviewer rewrite its metric', async () => {
    const review = vi.fn().mockResolvedValue({ valid: true, issues: [] })
    const result = await orchestrateOperationalTurn(input('Compare AI and human agent counts as bars'), { plan: vi.fn(), review })
    expect(review).toHaveBeenCalledTimes(1)
    expect(result.modelCalls).toBe(1)
    expect(result.answer?.charts[0].view.y).toBe('activeAgents')
  })
  it('keeps an explicit user request when a reviewer incorrectly rejects it', async () => {
    const repair = vi.fn().mockResolvedValue({ metric: 'handlingMinutes', cohort: 'human', display: 'bar' })
    const result = await orchestrateOperationalTurn(input('Show human vs AI in bar charts'), {
      plan: vi.fn(),
      review: vi.fn().mockResolvedValueOnce({ valid: false, issues: ['Unnecessary objection'] }).mockResolvedValueOnce({ valid: true, issues: [] }),
      repair,
    })
    expect(result.intent).toMatchObject({ metric: 'activeAgents', cohort: 'all', display: 'bar' })
    expect(result.answer?.charts[0].view.y).toBe('activeAgents')
    expect(repair).toHaveBeenCalledTimes(1)
    expect(result.modelCalls).toBe(3)
    expect(result.trace.validation.reviewIssues).toContain('Unnecessary objection')
  })
  it('chooses a donut for an unqualified share question with two complete cohorts', async () => {
    const result = await orchestrateOperationalTurn(input('What share of active agents are AI versus human?'))
    expect(result.intent).toMatchObject({ metric: 'activeAgents', cohort: 'all', display: 'donut' })
    expect(result.answer?.charts[0].view).toMatchObject({ chartType: 'donut', x: 'agentType', y: 'activeAgents' })
  })
  it('changes an unsuitable single-cohort donut to a bar and records why', async () => {
    const result = await orchestrateOperationalTurn(input('Show AI active agents as a donut chart'))
    expect(result.intent).toMatchObject({ metric: 'activeAgents', cohort: 'ai', display: 'bar' })
    expect(result.queryRequired).toMatchObject({ agentType: 'ai', intent: 'count' })
    expect(result.trace.presentationCorrection).toMatch(/donut/i)
  })
  it('stops with clarification when a rejected explicit request cannot be repaired inside the budget', async () => {
    const result = await orchestrateOperationalTurn(input('Show human vs AI in bar charts'), {
      plan: vi.fn(),
      review: vi.fn().mockResolvedValue({ valid: false, issues: ['Evidence does not support this request.'] }),
    })
    expect(result.answer?.kind).toBe('clarification')
    expect(result.trace.state).toBe('needs-clarification')
    expect(result.trace.validation.reviewIssues).toContain('Evidence does not support this request.')
  })
  it('records bounded planning and review stages in the orchestration trace', async () => {
    const result = await orchestrateOperationalTurn(input('Help me compare this'), {
      plan: vi.fn().mockResolvedValue({ metric: 'activeAgents', cohort: 'all', display: 'bar' }),
      review: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    })
    expect(result.trace.modelCalls).toBe(2)
    expect(result.trace.modelCalls).toBeLessThanOrEqual(result.trace.budget.maxModelCalls)
    expect(result.trace.stages.map(stage => stage.state)).toEqual(expect.arrayContaining(['received', 'planning', 'reviewing', 'completed']))
  })
  it('selects handling minutes and respects an AI cohort chart filter', async () => {
    const result = await orchestrateOperationalTurn(input('Show handling minutes for AI agents as a KPI'))
    expect(result.answer?.charts[0].view).toMatchObject({ chartType: 'kpi', y: 'handlingMinutes', filters: [{ field: 'agentType', operator: 'eq', value: 'ai' }] })
    expect(result.answer?.text).toContain('120')
  })
  it('requests a fresh query when switching from filtered AI scope to human', async () => {
    const request = input('Show human agent counts as bars')
    request.result.evidence.scope.agentType = 'ai'
    request.scope.filters = [{ field: 'agentType', operator: 'eq', value: 'ai' }]
    const result = await orchestrateOperationalTurn(request)
    expect(result.answer).toBeUndefined()
    expect(result.queryRequired).toMatchObject({ agentType: 'human', intent: 'count' })
  })
  it('requests a cohort query when an unfiltered result is narrowed to humans', async () => {
    const result = await orchestrateOperationalTurn(input('Show only human agents as a bar chart'))
    expect(result.queryRequired).toMatchObject({ agentType: 'human', intent: 'count' })
    expect(result.answer).toBeUndefined()
  })
  it('does not invent a count field or count raw segments as agents', async () => {
    const request = input('Compare active agents as bars')
    request.result.fields = [{ id: 'agent', name: 'Agent', type: 'category' }, { id: 'activeMinutes', name: 'Handling Minutes', type: 'number' }]
    const result = await orchestrateOperationalTurn(request)
    expect(result.answer).toBeUndefined()
    expect(result.queryRequired?.intent).toBe('count')
  })
  it('shows table inspection without requiring a numerical metric', async () => {
    const result = await orchestrateOperationalTurn(input('Show the underlying rows as a table'))
    expect(result.intent.display).toBe('table')
    expect(result.queryRequired?.intent).toBe('activity')
  })
  it('retains agent-count semantics when a table is explicitly requested', async () => {
    const result = await orchestrateOperationalTurn(input('Compare AI and human agent counts as a table'))
    expect(result.intent).toMatchObject({ metric: 'activeAgents', display: 'table' })
    expect(result.answer?.charts[0].view).toMatchObject({ chartType: 'table', y: 'activeAgents' })
    expect(result.queryRequired).toBeUndefined()
  })
  it('inherits the previous metric for a presentation-only follow-up', async () => {
    const request = input('Show it as bars')
    request.priorQuestions = ['How many agents are active?']
    const result = await orchestrateOperationalTurn(request)
    expect(result.answer?.charts[0].view.y).toBe('activeAgents')
  })
  it('does not aggregate a partial handling-record page for a complete chart', async () => {
    const request = input('Show handling minutes as bars')
    request.result.fields = [{ id: 'agentType', name: 'Agent Type', type: 'category' }, { id: 'activeMinutes', name: 'Handling Minutes', type: 'number' }]
    request.result.pagination.total = 100
    const result = await orchestrateOperationalTurn(request)
    expect(result.queryRequired?.intent).toBe('comparison')
    expect(result.answer).toBeUndefined()
  })
  it('omits repeated suggestions including punctuation and case variations', async () => {
    const request = input('How many agents are active?')
    request.priorQuestions = ['COMPARE ACTIVE AGENTS BY AGENT TYPE AS A BAR CHART!!!', 'Show handling minutes by agent type as a bar chart.']
    const result = await orchestrateOperationalTurn(request)
    expect(result.answer?.suggestions).not.toContain('Compare active agents by agent type as a bar chart.')
    expect(result.answer?.suggestions).not.toContain('Show handling minutes by agent type as a bar chart.')
    expect(result.answer?.suggestions?.length).toBeGreaterThan(0)
  })
  it('uses at most one repair and four calls for ambiguous intent', async () => {
    const plan = vi.fn().mockResolvedValue({ metric: 'salary', cohort: 'all', display: 'bar' })
    const repair = vi.fn().mockResolvedValue({ metric: 'activeAgents', cohort: 'all', display: 'bar' })
    const review = vi.fn().mockResolvedValue({ valid: true, issues: [] })
    const result = await orchestrateOperationalTurn(input('Help me compare this'), { plan, repair, review })
    expect(result.answer?.charts[0].view.y).toBe('activeAgents')
    expect(result.modelCalls).toBeLessThanOrEqual(4)
    expect(repair).toHaveBeenCalledTimes(1)
  })
  it('returns a clarification rather than looping or accepting invalid repaired semantics', async () => {
    const invalid = { metric: 'salary', cohort: 'all', display: 'bar' }
    const repair = vi.fn().mockResolvedValue(invalid)
    const result = await orchestrateOperationalTurn(input('Help me compare this'), { plan: vi.fn().mockResolvedValue(invalid), repair, review: vi.fn().mockResolvedValue({ valid: true, issues: [] }) })
    expect(result.answer?.kind).toBe('clarification')
    expect(result.answer?.charts).toEqual([])
    expect(repair).toHaveBeenCalledTimes(1)
    expect(result.modelCalls).toBeLessThanOrEqual(4)
  })
})
