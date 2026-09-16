import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { IconButton, Menu, MenuItem, TextField, Tooltip } from '@ringcentral/spring-ui'
import { AiStarsMd, SendMd } from '@ringcentral/spring-icon'
import type { Artifact } from '../lib/model'

export function shouldSubmitAdvisorQuestion(event: { key: string; keyCode?: number; isComposing?: boolean; nativeEvent?: { isComposing?: boolean } }) {
  return event.key === 'Enter' && event.keyCode !== 229 && !event.isComposing && !event.nativeEvent?.isComposing
}

export function AskAdvisor({ artifact, onAsk }: { artifact: Artifact; onAsk: (question: string, trigger: HTMLElement) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const [question, setQuestion] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const setRoot = useCallback((node: HTMLSpanElement | null) => {
    setPortalContainer(node?.closest<HTMLElement>('.analytics-app') ?? node)
  }, [])
  const open = (event: ReactMouseEvent<HTMLElement>) => setAnchor(event.currentTarget)
  const send = (text: string) => {
    if (!text.trim() || !anchor) return
    const trigger = anchor
    setAnchor(null); setQuestion('')
    onAsk(text.trim(), trigger)
  }
  return <span ref={setRoot} className={`advisor-trigger ${anchor ? 'is-open' : ''}`}>
    <Tooltip title="Ask Advisor" delay={100} PopperProps={{ container: portalContainer }}><IconButton symbol={AiStarsMd} aria-label="Ask Advisor" aria-haspopup="menu" aria-expanded={!!anchor} color="neutral" variant="contained" size="medium" onClick={open} /></Tooltip>
    <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} placement="bottom-end" className="advisor-menu" PopperProps={{ container: portalContainer }}>
      <MenuItem onClick={() => send(`Analyze ${artifact.title} further and identify the most important supported patterns.`)}>Analyze this further</MenuItem>
      <MenuItem onClick={() => send(`Help me understand ${artifact.title}, including the metric definition and the visible values.`)}>Help me understand this</MenuItem>
      <div className="advisor-menu-input">
        <div className="advisor-menu-row">
          <div className="advisor-question-control">
            <TextField ref={input} className="advisor-question-field" fullWidth placeholder="Ask a question" value={question} onChange={event => setQuestion(event.target.value)} inputProps={{ 'aria-label': `Ask Advisor about ${artifact.title}`, onKeyDown: (event: ReactKeyboardEvent) => { if (shouldSubmitAdvisorQuestion(event)) { event.preventDefault(); send(question) } } }} />
          </div>
          <IconButton symbol={SendMd} aria-label="Send Advisor question" title="Send Advisor question" color="primary" variant="contained" size="medium" disabled={!question.trim()} onClick={() => send(question)} />
        </div>
      </div>
    </Menu>
  </span>
}
