import { readFile } from 'node:fs/promises'
import { replayEvaluationBundle, runEvaluation } from './runner.ts'

const args = process.argv.slice(2)
const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
const replay = value('--replay')
if (replay) {
  console.log(JSON.stringify(await replayEvaluationBundle(replay), null, 2))
  process.exit(0)
}
const live = args.includes('--live')
const dryRun = args.includes('--dry-run')
if (live === dryRun) throw new Error('Choose exactly one of --dry-run or --live.')
if (live && process.env.EVAL_APPROVE_PAID !== 'true') throw new Error('Paid evaluation requires EVAL_APPROVE_PAID=true.')
const provider = value('--provider'), model = value('--model'), pricingFile = value('--pricing')
if (!provider || !model || !pricingFile) throw new Error('Provider, model, and current --pricing metadata are required.')
const number = (name: string) => { const parsed = Number(value(name)); if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`); return parsed }
const pricing = JSON.parse(await readFile(pricingFile, 'utf8'))
const options = { live, provider, model, pricing, maxInputTokens: number('--max-input-tokens'), maxOutputTokens: number('--max-output-tokens'), maxCalls: number('--max-calls'), maxMinutes: number('--max-minutes'), maxDollars: number('--max-dollars'), repetitions: Number(value('--repetitions') ?? 1), outputDirectory: value('--output') ?? 'output/evaluation' }
if (live) {
  if (provider !== 'openai' || !process.env.OPENAI_API_KEY) throw new Error('The approved live runner currently supports OpenAI and requires OPENAI_API_KEY.')
  Object.assign(options, { invoke: async ({ question, model, maxInputTokens, maxOutputTokens, promptContract, sourceCapability }: any) => {
    const prompt = `Return JSON only as {"answer":{"kind","text","choices","suggestions","charts","operations"},"evidence":{"source","rows","total"}}. Answer this fictional analytics request and identify/reconcile the synthetic source: ${question}`.slice(0, Math.max(1, maxInputTokens * 4))
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', signal: AbortSignal.timeout(Math.min(options.maxMinutes * 60_000, 120_000)), headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: [{ role: 'user', content: prompt }], max_output_tokens: maxOutputTokens, metadata: { evaluation: 'rcx-synthetic-v1', pipeline: 'provider-boundary' } }) })
    if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${await response.text()}`)
    const body: any = await response.json()
    const text = body.output_text ?? body.output?.flatMap((item: any) => item.content ?? []).find((content: any) => content.type === 'output_text')?.text
    return {
      output: JSON.parse(text),
      inputTokens: body.usage?.input_tokens ?? maxInputTokens,
      outputTokens: body.usage?.output_tokens ?? maxOutputTokens,
      requestId: body._request_id ?? body.id,
      modelCalls: 1,
      toolCalls: 0,
      repairs: 0,
      promptContract,
      sourceCapability,
      databaseRevision: { toolRevisions: [] },
      toolTrace: { stages: [{ name: 'provider.request', at: new Date().toISOString() }], toolCalls: [], retries: 0, repairs: 0 },
    }
  } })
}
console.log(JSON.stringify(await runEvaluation(options), null, 2))