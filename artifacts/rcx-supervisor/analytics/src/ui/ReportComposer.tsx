import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Text, Textarea } from '@ringcentral/spring-ui'
import type { PresentationPreference, ReportDefinition } from '../lib/reportCatalog'
import { findReportContent, searchReports } from '../lib/reportCatalog'
import './ReportComposer.css'

export type SlashReportInput = { isSlashCommand: boolean; query: string }
export type ResolvedPastedReport<T extends Pick<ReportDefinition, 'id' | 'title'> = ReportDefinition> = { report: T; question: string }
export type ReportContentsSelection = { contentIds: string[]; presentation: PresentationPreference; question: string }
export type CatalogTypeFilter = 'all' | 'reports' | 'dashboards'

export function filterReportsByType<T extends Pick<ReportDefinition, 'type'>>(reports: readonly T[], filter: CatalogTypeFilter): T[] {
  return filter === 'all' ? [...reports] : reports.filter(report => report.type === (filter === 'reports' ? 'report' : 'dashboard'))
}

export function selectedContentsQuestion(report: Pick<ReportDefinition, 'title' | 'contents'>, contentIds: readonly string[], presentation: PresentationPreference): string {
  const labels = findReportContent(report as ReportDefinition, contentIds).map(content => content.label)
  const suffix = presentation === 'auto' ? '' : ` as a ${presentation}`
  return `Show ${labels.join(' and ')}${suffix}.`
}

/** The picker identifies a catalog item without making a data-availability claim. */
export function reportOptionMeta(report: Pick<ReportDefinition, 'type'>): string {
  return report.type
}

export function parseSlashReportInput(value: string): SlashReportInput {
  const trimmed = value.trimStart()
  if (!trimmed.startsWith('/')) return { isSlashCommand: false, query: '' }
  return { isSlashCommand: true, query: trimmed.slice(1).trim() }
}

export function resolvePastedReportInput<T extends Pick<ReportDefinition, 'id' | 'title'>>(value: string, reports: T[]): ResolvedPastedReport<T> | null {
  const command = parseSlashReportInput(value)
  if (!command.isSlashCommand) return null
  const normalized = command.query.toLocaleLowerCase()
  const match = reports
    .filter(report => normalized === report.title.toLocaleLowerCase() || normalized.startsWith(`${report.title.toLocaleLowerCase()} `))
    .sort((left, right) => right.title.length - left.title.length)[0]
  if (!match) return null
  return { report: match, question: command.query.slice(match.title.length).trim() }
}

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit: (selection?: ReportContentsSelection) => void
  selectedReport: ReportDefinition | null
  onSelectReport: (report: ReportDefinition) => void
  onRemoveReport: () => void
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
}

export function ReportComposer({
  value,
  onChange,
  onSubmit,
  selectedReport,
  onSelectReport,
  onRemoveReport,
  disabled = false,
  placeholder = 'What would you like to understand?',
  ariaLabel = 'Ask an analytics question',
}: Props) {
  const shell = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [dismissed, setDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [composing, setComposing] = useState(false)
  const [contentIds, setContentIds] = useState<string[]>([])
  const [presentation, setPresentation] = useState<PresentationPreference>('auto')
  const [contentsOpen, setContentsOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<CatalogTypeFilter>('all')
  const command = parseSlashReportInput(value)
  const paletteOpen = !dismissed && command.isSlashCommand
  const query = command.query
  const matches = useMemo(() => searchReports(query), [query])
  const filteredMatches = useMemo(() => filterReportsByType(matches, typeFilter), [matches, typeFilter])
  const activeReport = filteredMatches[activeIndex] ?? null

  useEffect(() => setActiveIndex(index => Math.min(index, Math.max(filteredMatches.length - 1, 0))), [filteredMatches.length, query, typeFilter])

  const focusInput = () => requestAnimationFrame(() => shell.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus())
  const selectReport = (report: ReportDefinition, question?: string) => {
    onSelectReport(report)
    onChange(question ?? (command.isSlashCommand ? '' : value))
    setDismissed(true)
    setContentsOpen(true)
    setContentIds(report.contents.filter(content => content.defaultSelected).map(content => content.id))
    setPresentation('auto')
    focusInput()
  }
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value
    const pasted = (event.nativeEvent as InputEvent).inputType === 'insertFromPaste'
    const pastedReport = pasted ? resolvePastedReportInput(next, searchReports('')) : null
    if (pastedReport) {
      selectReport(pastedReport.report, pastedReport.question)
      return
    }
    setDismissed(false)
    onChange(next)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing || event.nativeEvent.isComposing) return
    if (paletteOpen) {
      if (event.key === 'ArrowDown' && filteredMatches.length) { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, filteredMatches.length - 1)); return }
      if (event.key === 'ArrowUp' && filteredMatches.length) { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); return }
      if (event.key === 'Enter') { event.preventDefault(); if (activeReport) selectReport(activeReport); return }
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); return }
    }
    if (event.key === 'Enter' && !event.shiftKey && (value.trim() || selectedReport)) { event.preventDefault(); onSubmit() }
  }
  const selectedContents = selectedReport ? findReportContent(selectedReport, contentIds) : []
  const submitContents = (overview = false) => {
    if (!selectedReport) return
    const ids = overview ? selectedReport.contents.filter(content => content.defaultSelected).map(content => content.id) : contentIds
    if (!ids.length) return
    const question = selectedContentsQuestion(selectedReport, ids, presentation)
    onChange(question)
    onSubmit({ contentIds: ids, presentation, question })
    setContentsOpen(false)
  }
  return <div className="report-composer" ref={shell}>
    <div className={`report-composer-field ${selectedReport ? 'has-report' : ''}`}>
      {selectedReport && <div className="report-composer-chip" aria-label={`Selected report: ${selectedReport.title}`}>
        <span className="report-composer-chip-copy"><span>{selectedReport.title}</span><span>{selectedReport.type}</span></span>
        <button type="button" className="report-composer-chip-remove" disabled={disabled} onClick={onRemoveReport} aria-label={`Remove ${selectedReport.title}`}>×</button>
      </div>}
      <Textarea
        className="report-composer-textarea"
        clearBtn={false}
        minRows={1}
        maxRows={4}
        variant="outlined"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        inputProps={{
          'aria-label': ariaLabel,
          'aria-autocomplete': 'list',
          'aria-controls': paletteOpen ? listId : undefined,
          'aria-activedescendant': paletteOpen && activeReport ? `${listId}-${activeReport.id}` : undefined,
          'aria-expanded': paletteOpen,
          role: 'combobox',
          onKeyDown: handleKeyDown,
          onCompositionStart: () => setComposing(true),
          onCompositionEnd: () => setComposing(false),
        }}
      />
      {paletteOpen && <div className="report-composer-palette" id={listId} role="listbox" aria-label="Reports" aria-live="polite">
        <div className="report-composer-palette-heading"><Text>{query ? 'Matching reports' : 'Choose a report'}</Text><Text>Type / to filter</Text></div>
        <div className="report-composer-filters" role="group" aria-label="Catalog type"><button type="button" aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All ({matches.length})</button><button type="button" aria-pressed={typeFilter === 'reports'} onClick={() => setTypeFilter('reports')}>Reports ({matches.filter(report => report.type === 'report').length})</button><button type="button" aria-pressed={typeFilter === 'dashboards'} onClick={() => setTypeFilter('dashboards')}>Dashboards ({matches.filter(report => report.type === 'dashboard').length})</button></div>
        {filteredMatches.length ? <div className="report-composer-options">{filteredMatches.map((report, index) => <button key={report.id} id={`${listId}-${report.id}`} type="button" role="option" aria-selected={index === activeIndex} className={`report-composer-option ${index === activeIndex ? 'is-active' : ''}`} onMouseMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => selectReport(report)}>
          <span className="report-composer-option-copy"><span title={report.title}>{report.title}</span><span title={report.description}>{report.description}</span></span>
          <span className="report-composer-option-meta"><span>{reportOptionMeta(report)}</span></span>
        </button>)}</div> : <div className="report-composer-empty" role="status">No {typeFilter === 'all' ? 'catalog items' : typeFilter} match “{query}”.</div>}
      </div>}
      {selectedReport && !paletteOpen && contentsOpen && <section className="report-contents-chooser" aria-label={`${selectedReport.title} contents`}>
        <header><div><Text component="h3">{selectedReport.title}</Text><Text component="p">{selectedReport.description}</Text></div><button type="button" className="report-contents-back" onClick={onRemoveReport} disabled={disabled}>Back</button></header>
        <div className="report-contents-list" role="group" aria-label="Available report contents">{selectedReport.contents.map(content => <label key={content.id} className="report-content-option"><input type="checkbox" checked={contentIds.includes(content.id)} disabled={disabled} onChange={() => setContentIds(ids => ids.includes(content.id) ? ids.filter(id => id !== content.id) : [...ids, content.id])}/><span><strong>{content.label}</strong><small>{content.description}</small></span></label>)}</div>
        <fieldset className="report-presentation"><legend>Presentation</legend>{(['auto', 'chart', 'table'] as const).map(option => <label key={option}><input type="radio" name={`${selectedReport.id}-presentation`} value={option} checked={presentation === option} disabled={disabled} onChange={() => setPresentation(option)}/>{option[0].toUpperCase() + option.slice(1)}</label>)}</fieldset>
        <footer><button type="button" className="report-contents-back" onClick={() => submitContents(true)} disabled={disabled}>Show overview</button><button type="button" className="report-contents-submit" onClick={() => submitContents()} disabled={disabled || !selectedContents.length}>Show selected</button></footer>
      </section>}
    </div>
  </div>
}
