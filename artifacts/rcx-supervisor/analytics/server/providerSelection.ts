import type { Model } from './inference.ts'

export type SelectedProvider = { provider: 'codex' | 'openai'; model: Model }

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
