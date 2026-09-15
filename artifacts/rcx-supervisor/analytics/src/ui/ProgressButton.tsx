import { useEffect, useRef, useState } from 'react'
import { Button } from '@ringcentral/spring-ui'
import { SquareLoader } from './SquareLoader'

type Props = { busy: boolean; label: string; busyLabel?: string; disabled?: boolean; onClick: () => void; className?: string; failed?: boolean; color?: 'primary' | 'neutral' }
export function ProgressButton({ busy, label, busyLabel = 'Working…', disabled, onClick, className = '', failed = false, color = 'primary' }: Props) {
  const wasBusy = useRef(false)
  const [finishing, setFinishing] = useState(false)
  useEffect(() => {
    if (busy) { wasBusy.current = true; return }
    if (!wasBusy.current) return
    wasBusy.current = false
    const frame = requestAnimationFrame(() => { setFinishing(!failed) })
    const timer = setTimeout(() => { setFinishing(false) }, 180)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [busy, failed])
  return <Button data-testid="progress-button" loading={busy} className={`progress-action ${busy ? 'is-working' : ''} ${finishing ? 'is-finishing' : ''} ${className}`} color={color} variant="contained" disabled={disabled || busy} onClick={onClick}>
    <span className="progress-label">{busy && <span className="action-indicator"><SquareLoader /></span>}{busy ? busyLabel : label}</span>
  </Button>
}
