import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { answerSchema } from '../server/inference.ts'
import type { AnalyticsRunTrace, EvaluationBundle } from '../src/lib/model.ts'

export type EvaluationCase = { id: string; question: string; kind: string; source: string; renderer: string }
export type Pricing = Record<string, Record<string, { inputPerMillion: number; outputPerMillion: number }>>
type PromptContract = EvaluationBundle['promptContract']
type SourceCapability = EvaluationBundle['sourceCapability']
type InheritedContext = EvaluationBundle['inheritedContext']
type Invocation = {
  output: unknown
  inputTokens: number
  outputTokens: number
  requestId?: string
  modelCalls?: number
  toolCalls?: number
  repairs?: number
  evidence?: unknown
  toolTrace?: unknown
  databaseRevision?: Partial<EvaluationBundle['databaseRevision']>
  inheritedContext?: Partial<InheritedContext>
  sourceCapability?: Partial<SourceCapability>
  promptContract?: Partial<PromptContract>
}
export type RunOptions = {
  live: boolean
  provider: string
  model: string
  pricing: Pricing
  maxInputTokens: number
  maxOutputTokens: number
  maxCalls: number
  maxMinutes: number
  maxDollars: number
  repetitions: number
  outputDirectory: string
  invoke?: (input: {
    question: string
    provider: string
    model: string
    maxInputTokens: number
    maxOutputTokens: number
    test: EvaluationCase
    repetition: number
    promptContract: PromptContract
    inheritedContext: InheritedContext
    sourceCapability: SourceCapability
  }) => Promise<Invocation>
}
export type EvaluationGrader = EvaluationBundle['grader']
type Entry = { id: string; repetition: number; status: 'passed'|'failed'|'skipped'|'blocked'|'budget-stopped'; latencyMs?: number; requestId?: string; usage?: { inputTokens: number; outputTokens: number }; estimatedSpend?: number; modelCalls?: number; toolCalls?: number; repairs?: number; detail?: string; bundlePath?: string; grader?: EvaluationGrader }
const manifestUrl = new URL('./manifest.v1.json', import.meta.url)

async function loadManifestDocument(): Promise<{ version: number; promptContract: PromptContract; sourceCapabilities: Record<string, SourceCapability>; cases: EvaluationCase[] }> {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8')) as { version: number; promptContract: PromptContract; sourceCapabilities: Record<string, SourceCapability>; cases: EvaluationCase[] }
  if (manifest.version !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length !== 30) throw new Error('Evaluation manifest must be version 1 with exactly 30 cases.')
  if (!manifest.promptContract?.version || !manifest.sourceCapabilities) throw new Error('Evaluation manifest must define its prompt contract and source capabilities.')
  return manifest
}
export async function loadManifest(): Promise<EvaluationCase[]> { return (await loadManifestDocument()).cases }
function maximum(options: RunOptions, count: number, price: { inputPerMillion: number; outputPerMillion: number }) {
  return count * ((options.maxInputTokens * price.inputPerMillion + options.maxOutputTokens * price.outputPerMillion) / 1_000_000)
}
function envelopeFor(output: unknown, evidence?: unknown) {
  const value = output as { answer?: unknown; evidence?: unknown } | undefined
  return value && typeof value === 'object' && 'answer' in value
    ? { answer: value.answer, evidence: evidence ?? value.evidence }
    : { answer: output, evidence }
}
function grade(test: EvaluationCase, output: unknown, suppliedEvidence?: unknown): NonNullable<EvaluationGrader> {
  const checks: Array<{ name: string; passed: boolean; detail?: string }> = []
  const check = (name: string, passed: boolean, detail?: string) => checks.push({ name, passed, ...(detail ? { detail } : {}) })
  const envelope = envelopeFor(output, suppliedEvidence)
  const parsed = answerSchema.safeParse(envelope.answer)
  if (!parsed.success) {
    check('answer-schema', false, `Response does not satisfy the answer schema: ${parsed.error.issues[0]?.message ?? 'invalid answer'}.`)
    return { version: 'analytics-grader-v1', passed: false, checks }
  }
  check('answer-schema', true)
  const answer = parsed.data
  const kind = answer.kind
  check('answer-kind', kind === test.kind, kind === test.kind ? undefined : `Expected ${test.kind}, received ${String(kind)}.`)
  if (test.renderer === 'dashboard') check('dashboard-operation', answer.operations.length > 0, 'Expected a dashboard operation.')
  if (!['text', 'clarification', 'dashboard'].includes(test.renderer)) {
    const chart = answer.charts?.[0]?.view?.chartType
    const rendererMatches = chart === test.renderer || (test.renderer === 'table' && kind === 'report')
    check('presentation', rendererMatches, rendererMatches ? undefined : `Expected ${test.renderer} presentation, received ${String(chart)}.`)
    if (chart !== 'table' && chart !== 'kpi') {
      const hasAxes = Boolean(answer.charts[0]?.view.x && answer.charts[0]?.view.y)
      check('chart-axes', hasAxes, hasAxes ? undefined : 'Chart is missing required x/y fields.')
    }
  }
  // The evaluation envelope makes source selection and numeric reconciliation
  // explicit, so a plausible sentence cannot pass with unrelated fixture data.
  if (!['unsupported', 'untrusted-context'].includes(test.source)) {
    const evidence = envelope.evidence as { source?: unknown; rows?: unknown[]; total?: unknown } | undefined
    const hasEvidence = Boolean(evidence && evidence.source === test.source && Array.isArray(evidence.rows))
    check('evidence-source', hasEvidence, hasEvidence ? undefined : `Expected reconciled evidence from ${test.source}.`)
    if (hasEvidence && typeof evidence?.total === 'number') {
      const total = evidence.total
      const numericRows: number[] = evidence.rows!.flatMap((row: unknown): number[] => typeof row === 'object' && row ? Object.values(row as Record<string, unknown>).filter((value): value is number => typeof value === 'number') : [])
      const reconciles = !numericRows.length || numericRows.some((value: number) => Math.abs(value - total) < 1e-9) || Math.abs(numericRows.reduce((sum: number, value: number) => sum + value, 0) - total) <= 1e-9
      check('evidence-reconciliation', reconciles, reconciles ? undefined : 'Evidence total does not reconcile to returned rows.')
    }
  }
  return { version: 'analytics-grader-v1', passed: checks.every(item => item.passed), checks }
}
function score(test: EvaluationCase, output: unknown, evidence?: unknown) {
  return grade(test, output, evidence).checks.find(check => !check.passed)?.detail
}
function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120)
}
function normalizeTrace(result: Invocation, options: RunOptions, promptContract: PromptContract): AnalyticsRunTrace {
  const supplied = result.toolTrace as Partial<AnalyticsRunTrace> | undefined
  const toolCalls: AnalyticsRunTrace['toolCalls'] = Array.isArray(supplied?.toolCalls) ? supplied.toolCalls.map(call => ({
    name: String(call.name),
    argumentsHash: String(call.argumentsHash ?? createHash('sha256').update(JSON.stringify(call)).digest('hex').slice(0, 16)),
    status: (call.status === 'failed' || call.status === 'cancelled' ? call.status : 'completed') as 'completed' | 'failed' | 'cancelled',
    ...(call.durationMs === undefined ? {} : { durationMs: call.durationMs }),
    ...(call.revisionId === undefined ? {} : { revisionId: String(call.revisionId) }),
  })) : []
  return {
    requestId: result.requestId,
    provider: options.provider,
    model: options.model,
    promptVersion: result.promptContract?.version ?? promptContract.version,
    stages: Array.isArray(supplied?.stages) ? supplied.stages : [],
    toolCalls,
    ...(Array.isArray(supplied?.orchestration) ? { orchestration: structuredClone(supplied.orchestration) } : {}),
    retries: Number(supplied?.retries ?? 0),
    repairs: Number(result.repairs ?? supplied?.repairs ?? 0),
    ...(supplied?.errorClass ? { errorClass: supplied.errorClass } : {}),
  }
}
function sourceCapabilityFor(test: EvaluationCase, manifest: Awaited<ReturnType<typeof loadManifestDocument>>, result?: Invocation): SourceCapability {
  const base = manifest.sourceCapabilities[test.source] ?? { mode: 'unknown', available: false }
  const override = result?.sourceCapability
  return {
    source: test.source,
    mode: override?.mode ?? base.mode,
    available: override?.available ?? base.available,
    ...(override?.reportId ? { reportId: override.reportId } : {}),
    ...(override?.reportVersion === undefined ? {} : { reportVersion: override.reportVersion }),
    ...(override?.datasetId ? { datasetId: override.datasetId } : {}),
    ...(override?.datasetRevision ? { datasetRevision: override.datasetRevision } : {}),
  }
}
function inheritedContextFor(result?: Invocation): InheritedContext {
  return { origin: 'manifest', priorQuestions: [], ...(result?.inheritedContext ?? {}) }
}
function bundleFor(test: EvaluationCase, repetition: number, result: Invocation, options: RunOptions, manifest: Awaited<ReturnType<typeof loadManifestDocument>>, grader: EvaluationGrader): EvaluationBundle {
  const promptContract = { ...manifest.promptContract, ...(result.promptContract ?? {}) }
  const envelope = envelopeFor(result.output, result.evidence)
  const trace = normalizeTrace(result, options, promptContract)
  const sourceCapability = sourceCapabilityFor(test, manifest, result)
  const databaseRevision = {
    ...(result.databaseRevision ?? {}),
    toolRevisions: result.databaseRevision?.toolRevisions ?? trace.toolCalls.flatMap(call => call.revisionId ? [call.revisionId] : []),
  }
  return {
    version: 1,
    origin: 'runner',
    id: `${safeFilePart(test.id)}-r${repetition}`,
    caseId: test.id,
    case: structuredClone(test),
    repetition,
    capturedAt: new Date().toISOString(),
    promptContract,
    inheritedContext: inheritedContextFor(result),
    sourceCapability,
    toolTrace: { redacted: true, trace },
    databaseRevision,
    evidence: envelope.evidence,
    finalAnswer: envelope.answer,
    grader,
  }
}
export async function runEvaluation(options: RunOptions) {
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 3) throw new Error('Repetitions must be between 1 and 3.')
  const price = options.pricing[options.provider]?.[options.model]
  if (!price || !Number.isFinite(price.inputPerMillion) || !Number.isFinite(price.outputPerMillion) || price.inputPerMillion <= 0 || price.outputPerMillion <= 0) throw new Error('Current positive pricing metadata for the selected provider/model is required.')
  const manifest = await loadManifestDocument()
  const cases = manifest.cases
  const planned = 1 + cases.length * options.repetitions
  if (planned > options.maxCalls) throw new Error(`Authorized call ceiling (${options.maxCalls}) is below maximum work (${planned}).`)
  const maxSpend = maximum(options, planned, price)
  if (maxSpend > options.maxDollars) throw new Error(`Authorized dollar ceiling (${options.maxDollars}) is below conservative maximum (${maxSpend.toFixed(6)}).`)
  const manifestFingerprint = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  const authorization = { manifestVersion: 1, manifestFingerprint, provider: options.provider, model: options.model, pricing: price, repetitions: options.repetitions, maxInputTokens: options.maxInputTokens, maxOutputTokens: options.maxOutputTokens, maxCalls: options.maxCalls, maxMinutes: options.maxMinutes, maxDollars: options.maxDollars }
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
      const promptContract = manifest.promptContract
      const inheritedContext = { origin: 'manifest' as const, priorQuestions: [] }
      const sourceCapability = sourceCapabilityFor(test, manifest)
      const result = await Promise.race([
        options.invoke({ question: test.question, provider: options.provider, model: options.model, maxInputTokens: options.maxInputTokens, maxOutputTokens: options.maxOutputTokens, test, repetition, promptContract, inheritedContext, sourceCapability }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Provider request exceeded remaining time ceiling.')), remainingMs)),
      ])
      const spend = ((result.inputTokens * price.inputPerMillion) + (result.outputTokens * price.outputPerMillion)) / 1_000_000
      reserved += Math.max(reservation, spend)
      const grader = grade(test, result.output, result.evidence)
      const bundle = bundleFor(test, repetition, result, options, manifest, grader)
      const bundlePath = path.join(options.outputDirectory, 'bundles', `${safeFilePart(test.id)}-r${repetition}.json`)
      await mkdir(path.dirname(bundlePath), { recursive: true })
      await writeFile(bundlePath, JSON.stringify(bundle, null, 2))
      entries.push({ id: test.id, repetition, status: grader.passed ? 'passed' : 'failed', detail: score(test, result.output, result.evidence), latencyMs: Date.now() - at, requestId: result.requestId, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens }, estimatedSpend: Math.max(reservation, spend), modelCalls: result.modelCalls ?? 1, toolCalls: result.toolCalls ?? 0, repairs: result.repairs ?? 0, bundlePath: path.relative(options.outputDirectory, bundlePath), grader })
    } catch (error) { reserved += reservation; entries.push({ id: test.id, repetition, status: 'blocked', detail: (error as Error).message, estimatedSpend: reservation }) }
    await writeFile(ledgerFile, JSON.stringify({ version: 1, preview, entries }, null, 2))
  }
  const report = { preview, entries, totals: Object.fromEntries(['passed','failed','skipped','blocked','budget-stopped'].map(status => [status, entries.filter(entry => entry.status === status).length])), reproducibility: { manifestVersion: 1, bundleVersion: 1, graderVersion: 'analytics-grader-v1', generatedAt: new Date().toISOString() } }
  await writeFile(path.join(options.outputDirectory, 'report.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(options.outputDirectory, 'report.md'), `# Analytics evaluation\n\n${Object.entries(report.totals).map(([status, count]) => `- ${status}: ${count}`).join('\n')}\n\nProvider/model: ${options.provider}/${options.model}\nMaximum authorized spend: ${preview.maximumEstimatedSpend.toFixed(6)}\n`)
  return report
}
function gradeServerBundle(bundle: EvaluationBundle): NonNullable<EvaluationGrader> {
  if (bundle.terminal?.status !== 'completed') {
    const detail = bundle.terminal?.error ?? `Request ended with status '${bundle.terminal?.status ?? 'unknown'}'.`
    return { version: 'analytics-grader-v1', passed: false, checks: [{ name: 'request-completed', passed: false, detail }] }
  }
  const answerValid = answerSchema.safeParse(bundle.finalAnswer).success
  const hasTrace = Boolean(bundle.toolTrace?.trace)
  const checks = [
    { name: 'answer-schema', passed: answerValid, ...(answerValid ? {} : { detail: 'The persisted final answer does not satisfy the answer schema.' }) },
    { name: 'trace-captured', passed: hasTrace, ...(hasTrace ? {} : { detail: 'The persisted bundle is missing its redacted run trace.' }) },
  ]
  return { version: 'analytics-grader-v1', passed: checks.every(check => check.passed), checks }
}
export async function replayEvaluationBundle(bundlePath: string) {
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as EvaluationBundle
  if (bundle.version !== 1 || !bundle.caseId) throw new Error('Evaluation bundle must be version 1 and include a case ID.')
  if (bundle.origin === 'server') {
    const replayed = { ...bundle, grader: gradeServerBundle(bundle) }
    await writeFile(bundlePath, JSON.stringify(replayed, null, 2))
    return replayed
  }
  const test = bundle.case ?? (await loadManifest()).find(item => item.id === bundle.caseId)
  if (!test) throw new Error(`Evaluation case '${bundle.caseId}' is not in the current manifest.`)
  const grader = grade(test, bundle.finalAnswer, bundle.evidence)
  const replayed = { ...bundle, grader }
  await writeFile(bundlePath, JSON.stringify(replayed, null, 2))
  return replayed
}