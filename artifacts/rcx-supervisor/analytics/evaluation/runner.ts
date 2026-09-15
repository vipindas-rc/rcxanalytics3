import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { answerSchema } from '../server/inference.ts'

export type EvaluationCase = { id: string; question: string; kind: string; source: string; renderer: string }
export type Pricing = Record<string, Record<string, { inputPerMillion: number; outputPerMillion: number }>>
export type RunOptions = { live: boolean; provider: string; model: string; pricing: Pricing; maxInputTokens: number; maxOutputTokens: number; maxCalls: number; maxMinutes: number; maxDollars: number; repetitions: number; outputDirectory: string; invoke?: (input: { question: string; provider: string; model: string; maxInputTokens: number; maxOutputTokens: number }) => Promise<{ output: unknown; inputTokens: number; outputTokens: number; requestId?: string; modelCalls?: number; toolCalls?: number; repairs?: number }> }
type Entry = { id: string; repetition: number; status: 'passed'|'failed'|'skipped'|'blocked'|'budget-stopped'; latencyMs?: number; requestId?: string; usage?: { inputTokens: number; outputTokens: number }; estimatedSpend?: number; modelCalls?: number; toolCalls?: number; repairs?: number; detail?: string }
const manifestUrl = new URL('./manifest.v1.json', import.meta.url)

export async function loadManifest(): Promise<EvaluationCase[]> {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length !== 30) throw new Error('Evaluation manifest must be version 1 with exactly 30 cases.')
  return manifest.cases
}
function maximum(options: RunOptions, count: number, price: { inputPerMillion: number; outputPerMillion: number }) {
  return count * ((options.maxInputTokens * price.inputPerMillion + options.maxOutputTokens * price.outputPerMillion) / 1_000_000)
}
function score(test: EvaluationCase, output: any) {
  const envelope = output?.answer ? output : { answer: output, evidence: undefined }
  const parsed = answerSchema.safeParse(envelope.answer)
  if (!parsed.success) return `Response does not satisfy the answer schema: ${parsed.error.issues[0]?.message ?? 'invalid answer'}.`
  const answer = parsed.data
  const kind = answer.kind
  if (kind !== test.kind) return `Expected ${test.kind}, received ${String(kind)}.`
  if (test.renderer === 'dashboard' && !answer.operations.length) return 'Expected a dashboard operation.'
  if (!['text', 'clarification', 'dashboard'].includes(test.renderer)) {
    const chart = answer.charts?.[0]?.view?.chartType
    if (!(chart === test.renderer || (test.renderer === 'table' && kind === 'report'))) return `Expected ${test.renderer} presentation, received ${String(chart)}.`
    if (chart !== 'table' && chart !== 'kpi' && (!answer.charts[0]?.view.x || !answer.charts[0]?.view.y)) return 'Chart is missing required x/y fields.'
  }
  // The evaluation envelope makes source selection and numeric reconciliation
  // explicit, so a plausible sentence cannot pass with unrelated fixture data.
  if (!['unsupported', 'untrusted-context'].includes(test.source)) {
    const evidence = envelope.evidence as { source?: unknown; rows?: unknown[]; total?: unknown } | undefined
    if (!evidence || evidence.source !== test.source || !Array.isArray(evidence.rows)) return `Expected reconciled evidence from ${test.source}.`
    if (typeof evidence.total === 'number') {
      const total = evidence.total
      const numericRows: number[] = evidence.rows.flatMap((row: unknown): number[] => typeof row === 'object' && row ? Object.values(row as Record<string, unknown>).filter((value): value is number => typeof value === 'number') : [])
      if (numericRows.length && !numericRows.some((value: number) => Math.abs(value - total) < 1e-9) && Math.abs(numericRows.reduce((sum: number, value: number) => sum + value, 0) - total) > 1e-9) return 'Evidence total does not reconcile to returned rows.'
    }
  }
  return undefined
}
export async function runEvaluation(options: RunOptions) {
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 3) throw new Error('Repetitions must be between 1 and 3.')
  const price = options.pricing[options.provider]?.[options.model]
  if (!price || !Number.isFinite(price.inputPerMillion) || !Number.isFinite(price.outputPerMillion) || price.inputPerMillion <= 0 || price.outputPerMillion <= 0) throw new Error('Current positive pricing metadata for the selected provider/model is required.')
  const cases = await loadManifest()
  const planned = 1 + cases.length * options.repetitions
  if (planned > options.maxCalls) throw new Error(`Authorized call ceiling (${options.maxCalls}) is below maximum work (${planned}).`)
  const maxSpend = maximum(options, planned, price)
  if (maxSpend > options.maxDollars) throw new Error(`Authorized dollar ceiling (${options.maxDollars}) is below conservative maximum (${maxSpend.toFixed(6)}).`)
  const authorization = { manifestVersion: 1, provider: options.provider, model: options.model, pricing: price, repetitions: options.repetitions, maxInputTokens: options.maxInputTokens, maxOutputTokens: options.maxOutputTokens, maxCalls: options.maxCalls, maxMinutes: options.maxMinutes, maxDollars: options.maxDollars }
  const preview = { ...authorization, plannedCalls: planned, maximumEstimatedSpend: maxSpend, live: options.live, fingerprint: createHash('sha256').update(JSON.stringify(authorization)).digest('hex') }
  if (!options.live) return { preview, entries: [] as Entry[] }
  if (!options.invoke) throw new Error('A provider transport is required for live evaluation.')
  await mkdir(options.outputDirectory, { recursive: true })
  const ledgerFile = path.join(options.outputDirectory, 'ledger.json')
  let entries: Entry[] = []
  try {
    const prior = JSON.parse(await readFile(ledgerFile, 'utf8'))
    if (prior.preview?.fingerprint !== preview.fingerprint) throw new Error('Existing evaluation ledger does not match this approved manifest, pricing, model, or budget.')
    entries = prior.entries ?? []
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
  const priorAttempts = entries.filter(entry => entry.status !== 'budget-stopped').length
  if (priorAttempts > options.maxCalls) throw new Error('Existing ledger has already reached or exceeded the authorized call ceiling.')
  const started = Date.now()
  let reserved = entries.reduce((sum, entry) => sum + (entry.estimatedSpend ?? 0), 0)
  const scheduled: Array<{ test: EvaluationCase; repetition: number }> = [
    { test: cases[0]!, repetition: -1 },
    ...cases.flatMap(item => Array.from({ length: options.repetitions }, (_, repetition) => ({ test: item, repetition }))),
  ]
  for (const { test, repetition } of scheduled) {
    if (entries.some(entry => entry.id === test.id && entry.repetition === repetition)) continue
    const reservation = maximum(options, 1, price)
    if (entries.filter(entry => entry.status !== 'budget-stopped').length >= options.maxCalls || Date.now() - started > options.maxMinutes * 60_000 || reserved + reservation > options.maxDollars) { entries.push({ id: test.id, repetition, status: 'budget-stopped', detail: 'Call, time, or dollar ceiling reached before request.' }); break }
    const at = Date.now()
    try {
      const remainingMs = options.maxMinutes * 60_000 - (at - started)
      if (remainingMs <= 0) throw new Error('Time ceiling reached before provider request.')
      const result = await Promise.race([
        options.invoke({ question: test.question, provider: options.provider, model: options.model, maxInputTokens: options.maxInputTokens, maxOutputTokens: options.maxOutputTokens }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Provider request exceeded remaining time ceiling.')), remainingMs)),
      ])
      const spend = ((result.inputTokens * price.inputPerMillion) + (result.outputTokens * price.outputPerMillion)) / 1_000_000
      reserved += Math.max(reservation, spend)
      entries.push({ id: test.id, repetition, status: score(test, result.output) ? 'failed' : 'passed', detail: score(test, result.output), latencyMs: Date.now() - at, requestId: result.requestId, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens }, estimatedSpend: Math.max(reservation, spend), modelCalls: result.modelCalls ?? 1, toolCalls: result.toolCalls ?? 0, repairs: result.repairs ?? 0 })
    } catch (error) { reserved += reservation; entries.push({ id: test.id, repetition, status: 'blocked', detail: (error as Error).message, estimatedSpend: reservation }) }
    await writeFile(ledgerFile, JSON.stringify({ version: 1, preview, entries }, null, 2))
  }
  const report = { preview, entries, totals: Object.fromEntries(['passed','failed','skipped','blocked','budget-stopped'].map(status => [status, entries.filter(entry => entry.status === status).length])), reproducibility: { manifestVersion: 1, generatedAt: new Date().toISOString() } }
  await writeFile(path.join(options.outputDirectory, 'report.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(options.outputDirectory, 'report.md'), `# Analytics evaluation\n\n${Object.entries(report.totals).map(([status, count]) => `- ${status}: ${count}`).join('\n')}\n\nProvider/model: ${options.provider}/${options.model}\nMaximum authorized spend: ${preview.maximumEstimatedSpend.toFixed(6)}\n`)
  return report
}