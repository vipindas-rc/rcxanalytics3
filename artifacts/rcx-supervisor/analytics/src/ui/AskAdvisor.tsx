import { useRef, useState } from 'react'
import { IconButton, Menu, MenuItem, TextField, Tooltip } from '@ringcentral/spring-ui'
import { AiStarsMd, SendMd } from '@ringcentral/spring-icon'
import type { Artifact } from '../lib/model'

export function AskAdvisor({ artifact, onAsk }: { artifact: Artifact; onAsk: (question: string, trigger: HTMLElement) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [question, setQuestion] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const open = (event: React.MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)
  const send = (text: string) => {
    if (!text.trim() || !anchor) return
    const trigger = anchor
    setAnchor(null); setQuestion('')
    onAsk(text.trim(), trigger)
  }
  return <span className={`advisor-trigger ${anchor ? 'is-open' : ''}`}>
    <Tooltip title="Ask Advisor" delay={100}><IconButton symbol={AiStarsMd} aria-label="Ask Advisor" aria-haspopup="menu" aria-expanded={!!anchor} color="neutral" variant="contained" size="medium" onClick={open} /></Tooltip>
    <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} placement="bottom-end" className="advisor-menu">
      <MenuItem onClick={() => send(`Analyze ${artifact.title} further and identify the most important supported patterns.`)}>Analyze this further</MenuItem>
      <MenuItem onClick={() => send(`Help me understand ${artifact.title}, including the metric definition and the visible values.`)}>Help me understand this</MenuItem>
      <div className="advisor-menu-input">
        <TextField ref={input} className="advisor-question-field" fullWidth placeholder="Ask a question" value={question} onChange={event => setQuestion(event.target.value)} inputProps={{ 'aria-label': `Ask Advisor about ${artifact.title}`, onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); send(question) } } }} />
        <IconButton symbol={SendMd} aria-label="Send Advisor question" title="Send Advisor question" color="primary" variant="contained" size="medium" disabled={!question.trim()} onClick={() => send(question)} />
      </div>
    </Menu>
  </span>
}
