import type { Model } from './inference.ts'

export type ProviderCapabilities = {
  provider: 'codex' | 'openai' | 'deterministic'
  model: string
  connected: boolean
  planner: boolean
  reviewer: boolean
  repair: boolean
  deterministic: boolean
  detail: string
}

export type SelectedProvider = { provider: 'codex' | 'openai'; model: Model }

export function providerCapabilities(input: {
  provider: 'codex' | 'openai' | 'deterministic'
  model?: string
  connected: boolean
  operationalReview: boolean
}): ProviderCapabilities {
  const model = input.model ?? (input.provider === 'openai' || input.provider === 'codex' ? 'gpt-5.6-luna' : 'deterministic-test')
  const planner = input.connected && input.provider !== 'deterministic' && input.operationalReview
  return {
    provider: input.provider,
    model,
    connected: input.connected,
    planner,
    reviewer: planner,
    repair: planner,
    deterministic: input.provider === 'deterministic',
    detail: input.connected
      ? input.provider === 'deterministic'
        ? 'Deterministic test provider is active; no external planner or reviewer ran.'
        : input.operationalReview
          ? `${input.provider} provider is configured (${model}).`
          : `${input.provider} provider is connected, but its orchestration adapter is unavailable.`
      : `${input.provider} provider is unavailable.`,
  }
}

export function selectProvider(options: {
 provider?: string
 directory: string
 codex: (directory: string) => Model
 openai: () => Model
}): SelectedProvider {
 if (options.provider?.trim().toLowerCase() === 'openai') return { provider: 'openai', model: options.openai() }
 return { provider: 'codex', model: options.codex(options.directory) }
}

export async function providerStatus(options: { provider: 'openai'; apiKey?: string; model?: string }) {
 if (!options.apiKey) return { provider: options.provider, connected: false, detail: 'OpenAI API key is not configured.' }
 return { provider: options.provider, connected: true, detail: `OpenAI Responses API configured (model: ${options.model || 'gpt-5.6-luna'}).` }
}
