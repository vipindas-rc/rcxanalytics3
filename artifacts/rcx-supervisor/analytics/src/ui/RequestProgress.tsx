import type { TurnRequest } from '../lib/model'
import { requestStatus } from './requestStatus'
import { SquareLoader } from './SquareLoader'

export function RequestProgress({ request, waiting = [] }: { request: Pick<TurnRequest, 'status' | 'phase' | 'phaseHistory'>; waiting?: string[] }) {
  const status = requestStatus(request, waiting)
  if (status?.kind !== 'working') return null
  return <div role="status" aria-live="polite" aria-label={status.label} className="thinking request-progress" data-phase={request.phase}>
    <span aria-hidden="true"><SquareLoader /></span>
    <span className="request-progress-label">{status.label}</span>
  </div>
}
