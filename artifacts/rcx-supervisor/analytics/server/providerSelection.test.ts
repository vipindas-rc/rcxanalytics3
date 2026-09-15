import { describe, expect, it } from 'vitest'
import { providerStatus, selectProvider } from './providerSelection.ts'
import type { Model } from './inference.ts'

const model: Model = async () => ({ kind: 'text', text: 'Ready' })

describe('provider selection', () => {
 it('selects OpenAI only when it is explicitly configured', () => {
  const selected = selectProvider({ provider: 'openai', directory: '/sandbox', openai: () => model, codex: () => model })
  expect(selected.provider).toBe('openai')
  expect(selected.model).toBe(model)
 })

 it('uses Codex for an absent or unsupported provider setting', () => {
  expect(selectProvider({ directory: '/sandbox', openai: () => model, codex: () => model }).provider).toBe('codex')
  expect(selectProvider({ provider: 'other', directory: '/sandbox', openai: () => model, codex: () => model }).provider).toBe('codex')
 })

 it('reports OpenAI configuration without exposing the API key', async () => {
  const status = await providerStatus({ provider: 'openai', apiKey: 'super-secret-key', model: 'gpt-5.6-luna' })
  expect(status).toEqual({ provider: 'openai', connected: true, detail: 'OpenAI Responses API configured (model: gpt-5.6-luna).' })
  expect(JSON.stringify(status)).not.toContain('super-secret-key')
 })

 it('reports a missing OpenAI key clearly', async () => {
  await expect(providerStatus({ provider: 'openai', apiKey: '' })).resolves.toEqual({ provider: 'openai', connected: false, detail: 'OpenAI API key is not configured.' })
 })
})
