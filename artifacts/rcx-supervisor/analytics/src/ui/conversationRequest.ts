import type { ConversationInput, SourceContext } from '../lib/model'

type ReportSource = { id: string; version: number }

type RequestOptions = {
  sessionId: string
  requestId: string
  question: string
  sourceContext?: SourceContext
  report?: ReportSource
  dashboardId?: string | null
  retryOf?: string
  selectedFollowUpFrom?: string
  selectedContentIds?: string[]
  presentationPreference?: 'auto' | 'chart' | 'table'
}

/**
 * Every composer uses this envelope. Source selection is expressed once here,
 * making a follow-up from Advisor equivalent to one from the main conversation.
 */
export function createConversationRequest(options: RequestOptions): ConversationInput {
  if (options.report && options.sourceContext) throw new Error('Choose either a report or a chart source for this question.')
  const source = options.sourceContext
  return {
    sessionId: options.sessionId,
    requestId: options.requestId,
    question: options.question,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    ...(source ? {
      contextArtifactId: source.artifactId,
      contextFilters: source.filters,
      contextDashboardId: source.dashboardId,
      sourceLabel: source.sourceLabel,
      sourceContext: source,
    } : options.dashboardId ? { contextDashboardId: options.dashboardId } : {}),
    ...(options.report ? { reportId: options.report.id, reportVersion: options.report.version } : {}),
    ...(options.selectedContentIds?.length ? { selectedContentIds: options.selectedContentIds, presentationPreference: options.presentationPreference ?? 'auto' } : {}),
    ...(options.retryOf ? { retryOf: options.retryOf } : {}),
    ...(options.selectedFollowUpFrom ? { selectedFollowUpFrom: options.selectedFollowUpFrom } : {}),
  }
}
