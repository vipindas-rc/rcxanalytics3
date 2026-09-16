import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { replayEvaluationBundle, runEvaluation } from './runner.ts'
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
   const outputDirectory = await mkdtemp('/tmp/analytics-evaluation-scoring-test-')
  const report = await runEvaluation({ ...base, live: true, outputDirectory, maxCalls: 31, invoke: async () => ({ output: { kind: 'report', text: 'Wrong', choices: [], suggestions: [], charts: [], operations: [] }, inputTokens: 1, outputTokens: 1 }) })
  expect('totals' in report && report.totals.failed).toBeGreaterThan(0)
  expect('totals' in report && report.totals.blocked).toBe(0)
  expect(await readdir(path.join(outputDirectory, 'bundles'))).toHaveLength(31)
 })
  it('persists a versioned bundle that replays without invoking a provider', async () => {
   const outputDirectory = await mkdtemp('/tmp/analytics-evaluation-bundle-test-')
   const report = await runEvaluation({
    ...base,
    live: true,
    outputDirectory,
    invoke: async ({ test }) => ({
     output: { kind: test.kind, text: 'Reproducible answer', choices: [], suggestions: [], charts: test.renderer === 'text' ? [] : [{ title: 'Result', reuseDataset: true, fields: [], seed: 1, view: { chartType: test.renderer === 'table' ? 'table' : test.renderer, x: 'group', y: 'value', aggregation: 'sum', filters: [] } }], operations: test.renderer === 'dashboard' ? [{ action: 'add', artifactId: 'artifact-1' }] : [] },
     evidence: { source: test.source, rows: [{ value: 1 }], total: 1 },
     toolTrace: { toolCalls: [{ name: 'query', arguments: { secret: 'must-not-persist' }, status: 'completed', revisionId: 'revision-1' }] },
     databaseRevision: { datasetRevision: 'revision-1' },
     inputTokens: 1,
     outputTokens: 1,
    }),
   })
   const bundlePath = path.join(outputDirectory, 'bundles', '01-agent-count-r0.json')
   const bundle = JSON.parse(await readFile(bundlePath, 'utf8'))
   expect(bundle.version).toBe(1)
   expect(bundle.promptContract.version).toBe('analytics-prompt-v1')
   expect(bundle.sourceCapability.source).toBe('agent-activity-report')
   expect(bundle.databaseRevision.datasetRevision).toBe('revision-1')
   expect(bundle.evidence.source).toBe('agent-activity-report')
   expect(bundle.finalAnswer.kind).toBe('report')
   expect(bundle.toolTrace.redacted).toBe(true)
   expect(JSON.stringify(bundle)).not.toContain('must-not-persist')
   const before = JSON.stringify(bundle.grader)
   const replayed = await replayEvaluationBundle(bundlePath)
   expect(replayed.grader).toEqual(bundle.grader)
   expect(JSON.stringify(replayed.grader)).toBe(before)
   expect('reproducibility' in report && report.reproducibility.bundleVersion).toBe(1)
  })
})