import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { runEvaluation } from './runner.ts'
const pricing = { openai: { model: { inputPerMillion: 1, outputPerMillion: 2 } } }
const base = { provider: 'openai', model: 'model', pricing, maxInputTokens: 10, maxOutputTokens: 10, maxCalls: 31, maxMinutes: 1, maxDollars: 1, repetitions: 1, outputDirectory: '/tmp/analytics-evaluation-test' }
describe('evaluation guardrails', () => {
 it('previews all bounded work without invoking a provider', async () => expect((await runEvaluation({ ...base, live: false })).preview.plannedCalls).toBe(31))
 it('rejects missing pricing, excess repetitions, and inadequate budgets', async () => {
  await expect(runEvaluation({ ...base, live: false, pricing: {} })).rejects.toThrow(/pricing/i)
  await expect(runEvaluation({ ...base, live: false, repetitions: 4 })).rejects.toThrow(/Repetitions/)
  await expect(runEvaluation({ ...base, live: false, maxCalls: 1 })).rejects.toThrow(/call ceiling/)
 })
 it('rejects an incompatible resumable ledger before it can invoke a provider', async () => {
  const outputDirectory = '/tmp/analytics-evaluation-ledger-test'
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(`${outputDirectory}/ledger.json`, JSON.stringify({ preview: { fingerprint: 'different' }, entries: [] }))
  await expect(runEvaluation({ ...base, live: true, outputDirectory, invoke: async () => ({ output: {}, inputTokens: 1, outputTokens: 1 }) })).rejects.toThrow(/ledger does not match/)
 })
 it('marks fabricated or incomplete live evidence as failed', async () => {
  const outputDirectory = '/tmp/analytics-evaluation-scoring-test'
  const report = await runEvaluation({ ...base, live: true, outputDirectory, maxCalls: 31, invoke: async () => ({ output: { kind: 'report', text: 'Wrong', choices: [], suggestions: [], charts: [], operations: [] }, inputTokens: 1, outputTokens: 1 }) })
  expect('totals' in report && report.totals.failed).toBeGreaterThan(0)
 })
})