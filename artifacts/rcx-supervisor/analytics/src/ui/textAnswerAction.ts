import type { Message } from '../lib/model'

/** Only offer a visualization when this answer has analytical context. */
export function textAnswerAction(message: Message, hasSource: boolean) {
  if (message.role !== 'assistant' || message.artifactIds?.length || message.dashboardId || message.choices?.length) return null
  const chartSuggestion = message.suggestions?.find(prompt => /\b(chart|graph|plot)\b/i.test(prompt))
  if (chartSuggestion) return { label: 'Show as chart', prompt: chartSuggestion }
  if (!message.evidence && !message.analysisReference && !message.reportContext && !hasSource) return null
  if ((message.evidence?.groups.length ?? 0) > 1) return {
    label: 'Show as chart',
    prompt: 'Show the comparison from this answer as a chart, keeping the same metric, filters and reporting period.',
  }
  return {
    label: 'Show as table',
    prompt: 'Show the data supporting this answer as a table, keeping the same metric, filters and reporting period.',
  }
}
