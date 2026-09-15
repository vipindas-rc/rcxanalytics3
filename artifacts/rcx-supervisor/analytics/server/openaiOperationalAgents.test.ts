import { describe, expect, it } from 'vitest'
import { createOpenAIOperationalAgents } from './openaiOperationalAgents.ts'
import type { PlanningContext } from './orchestration.ts'

const context: PlanningContext = {
 question: 'Show human versus AI agents as bars.',
 report: { id: 'agent-activity-report', title: 'Agent Activity', version: 1 },
 priorQuestions: ['How many agents are AI agents?'],
 scope: { period: { from: '2026-09-01', to: '2026-09-15' }, timezone: 'UTC', filters: [] },
 result: {
  datasetId: 'data-1', revisionId: 'revision-1', rows: [], fields: [], pagination: { offset: 0, limit: 20, total: 2 },
  evidence: { activeAgents: { ai: 3, human: 5, total: 8 }, handlingMinutes: { ai: 120, human: 380, total: 500 }, scope: { start: '2026-09-01', end: '2026-09-15' } },
 },
}

describe('OpenAI operational agents', () => {
 it('sends strict, role-specific plan, review, and repair requests', async () => {
  const requests: Request[] = []
  const outputs = [
   { metric: 'activeAgents', cohort: 'all', display: 'bar' },
   { valid: false, issues: ['Use the requested bar display.'] },
   { metric: 'handlingMinutes', cohort: 'human', display: 'kpi' },
  ]
  const agents = createOpenAIOperationalAgents({ apiKey: 'test-key', fetch: async (input, init) => {
   requests.push(new Request(input, init))
   return Response.json({ output_text: JSON.stringify(outputs.shift()) })
  } })

  await expect(agents.plan(context)).resolves.toEqual({ metric: 'activeAgents', cohort: 'all', display: 'bar' })
  await expect(agents.review!({ ...context, candidate: { metric: 'activeAgents', cohort: 'all', display: 'bar' }, issues: [] })).resolves.toEqual({ valid: false, issues: ['Use the requested bar display.'] })
  await expect(agents.repair!({ ...context, candidate: { metric: 'activeAgents', cohort: 'all', display: 'table' }, issues: ['Use the requested bar display.'], explicitIntent: { metric: 'activeAgents', cohort: 'all', display: 'bar' } })).resolves.toEqual({ metric: 'handlingMinutes', cohort: 'human', display: 'kpi' })

  const bodies = await Promise.all(requests.map(request => request.json() as Promise<any>))
  expect(requests.map(request => request.url)).toEqual(Array(3).fill('https://api.openai.com/v1/responses'))
  expect(requests.every(request => request.headers.get('authorization') === 'Bearer test-key')).toBe(true)
  expect(bodies.map(body => body.text.format.name)).toEqual(['operational_plan', 'operational_review', 'operational_repair'])
  expect(bodies.every(body => body.text.format.strict === true)).toBe(true)
  expect(bodies[0].text.format.schema.properties.metric.enum).toEqual(['activeAgents', 'handlingMinutes', 'records'])
  expect(bodies[1].text.format.schema.properties.valid.type).toBe('boolean')
  expect(bodies[2].text.format.schema.properties.display.enum).toEqual(['bar', 'donut', 'kpi', 'table', 'text'])
  expect(bodies[0].input.at(-1).content[0].text).toContain('"activeAgents":{"ai":3')
  expect(bodies[2].input.at(-1).content[0].text).toContain('"explicitIntent":{"metric":"activeAgents","cohort":"all","display":"bar"}')
  expect(bodies[2].input[0].content[0].text).toContain('must preserve')
 })

 it('fails before requesting when OpenAI is not configured', async () => {
  let called = false
  const agents = createOpenAIOperationalAgents({ apiKey: '', fetch: async () => { called = true; return Response.json({}) } })
  await expect(agents.plan(context)).rejects.toThrow('OpenAI API key is not configured')
  expect(called).toBe(false)
 })

 it('does not expose an OpenAI error body', async () => {
  const agents = createOpenAIOperationalAgents({ apiKey: 'test-key', fetch: async () => new Response('provider-secret-detail', { status: 429 }) })
  await expect(agents.plan(context)).rejects.toThrow('OpenAI API request failed (429)')
  await expect(agents.plan(context)).rejects.not.toThrow('provider-secret-detail')
 })
})
