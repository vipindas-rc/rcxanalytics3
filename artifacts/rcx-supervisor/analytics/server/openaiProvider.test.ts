import { describe, expect, it } from 'vitest'
import { openAIModel } from './openaiProvider.ts'
import type { ModelContext } from './inference.ts'

const context: ModelContext = {
 question: 'Show human versus AI agents in a bar chart.',
 session: { id: 'session-1', title: 'Test', advisor: false, projectId: null, createdAt: 'now', updatedAt: 'now', messages: [] },
}

const answer = {
 kind: 'chart', text: 'Human and AI agent counts are shown.', choices: [], suggestions: [], charts: [{
  title: 'Agents by type', reuseDataset: true, fields: [], seed: 7,
  view: { chartType: 'bar', x: 'agentType', y: 'activeAgents', aggregation: 'sum', filters: [], sort: null },
 }], operations: [],
}

describe('openAIModel', () => {
 it('posts a strict structured-output request and returns the parsed answer', async () => {
  let request: Request | undefined
  const model = openAIModel({ apiKey: 'test-key', model: 'gpt-5.6-luna', fetch: async (input, init) => {
   request = new Request(input, init)
   return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] })
  } })

  await expect(model(context)).resolves.toEqual({ ...answer, charts: [{ ...answer.charts[0], view: { chartType: 'bar', x: 'agentType', y: 'activeAgents', aggregation: 'sum', filters: [] } }] })
  expect(request?.url).toBe('https://api.openai.com/v1/responses')
  expect(request?.headers.get('authorization')).toBe('Bearer test-key')
  const body = await request!.json() as any
  expect(body.model).toBe('gpt-5.6-luna')
  expect(body.reasoning).toEqual({ effort: 'low' })
  expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'analytics_answer' })
  expect(body.text.format.schema.additionalProperties).toBe(false)
 })

 it('removes nullable fields before returning the answer', async () => {
  const model = openAIModel({ apiKey: 'test-key', fetch: async () => Response.json({ output_text: JSON.stringify({ ...answer, charts: [{ ...answer.charts[0], view: { ...answer.charts[0].view, x: null } }] }) }) })
  await expect(model(context)).resolves.toEqual({ ...answer, charts: [{ ...answer.charts[0], view: { chartType: 'bar', y: 'activeAgents', aggregation: 'sum', filters: [] } }] })
 })

 it('fails clearly before sending a request when no API key is configured', async () => {
  let called = false
  const model = openAIModel({ apiKey: '', fetch: async () => { called = true; return Response.json({}) } })
  await expect(model(context)).rejects.toThrow('OpenAI API key is not configured')
  expect(called).toBe(false)
 })

 it('does not expose an API response body in errors', async () => {
  const model = openAIModel({ apiKey: 'secret-key', fetch: async () => new Response('provider secret detail', { status: 401 }) })
  await expect(model(context)).rejects.toThrow('OpenAI API request failed (401)')
  await expect(model(context)).rejects.not.toThrow('provider secret detail')
 })
})
