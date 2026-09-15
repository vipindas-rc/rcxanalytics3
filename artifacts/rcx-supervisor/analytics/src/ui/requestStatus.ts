import type { TurnRequest } from '../lib/model'

export type RequestStatus = { kind: 'working' | 'failed'; label: string }

const phaseLabels: Record<string, string> = {
  initializing: 'Initializing your analysis',
  planning: 'Understanding your question',
  'resolving-data': 'Preparing report data',
  computing: 'Calculating results',
  'preparing-output': 'Building your response',
  reviewing: 'Checking the result',
}

export const STATUS_DISPLAY_MS = 900

/** Pace recorded server events, including events that occurred between polls.
 * Completion waits for the last label; failures are surfaced immediately. */
export function paceRequest(previous: TurnRequest, received: TurnRequest, since: number, time: number): TurnRequest {
  if (received.status === 'failed' || previous.status !== 'pending') return received
  if (time - since < STATUS_DISPLAY_MS) return previous
  const history = received.phaseHistory ?? []
  const index = history.findIndex(entry => entry.phase === previous.phase)
  const next = index >= 0 ? history[index + 1] : undefined
  if (next) return { ...received, status: 'pending', phase: next.phase }
  return received
}

export function requestStatus(request: Pick<TurnRequest, 'status' | 'phase' | 'error'> | undefined, waiting: string[] = [], renderError?: string): RequestStatus | null {
  if (!request) return null
  if (request.status === 'failed') return { kind: 'failed', label: request.error ?? 'Could not complete this request.' }
  if (renderError) return { kind: 'failed', label: renderError }
  if (request.status === 'pending') return { kind: 'working', label: phaseLabels[request.phase] ?? (request.phase || 'Preparing your response') }
  if (waiting.length) return { kind: 'working', label: 'Preparing your chart' }
  return null
}
