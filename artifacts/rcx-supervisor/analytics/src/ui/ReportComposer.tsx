import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Button, Checkbox, IconButton, Radio, Text, Textarea } from '@ringcentral/spring-ui'
import { Xsm } from '@ringcentral/spring-icon'
import type { PresentationPreference, ReportDefinition } from '../lib/reportCatalog'
import { findReport, findReportContent, searchReports } from '../lib/reportCatalog'
import { useReportComposerUrlState, type ReportComposerNamespace, type ReportComposerUrlAdapter, type ReportComposerTypeFilter } from './useReportComposerUrlState'
import './ReportComposer.css'

export type SlashReportInput = { isSlashCommand: boolean; query: string }
export type ResolvedPastedReport<T extends Pick<ReportDefinition, 'id' | 'title'> = ReportDefinition> = { report: T; question: string }
export type ReportContentsSelection = { contentIds: string[]; presentation: PresentationPreference; question: string }
export type CatalogTypeFilter = ReportComposerTypeFilter

export function filterReportsByType<T extends Pick<ReportDefinition, 'type'>>(reports: readonly T[], filter: CatalogTypeFilter): T[] {
  return filter === 'all' ? [...reports] : reports.filter(report => report.type === (filter === 'reports' ? 'report' : 'dashboard'))
}

export function selectedContentsQuestion(report: Pick<ReportDefinition, 'title' | 'contents'>, contentIds: readonly string[], presentation: PresentationPreference): string {
  const labels = findReportContent(report as ReportDefinition, contentIds).map(content => content.label)
  const suffix = presentation === 'auto' ? '' : ` as a ${presentation}`
  return `Show ${labels.join(' and ')}${suffix}.`
}

function defaultReportContentIds(report: ReportDefinition): string[] {
  const defaults = report.contents.filter(content => content.defaultSelected).map(content => content.id)
  return defaults.length ? defaults : report.contents.slice(0, 1).map(content => content.id)
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
  onSubmit: (selection?: ReportContentsSelection, report?: ReportDefinition) => void
  selectedReport: ReportDefinition | null
  onSelectReport: (report: ReportDefinition) => void
  onRemoveReport: () => void
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  /** Optional host Router v6 adapter. Standalone use falls back to history. */
  urlState?: ReportComposerUrlAdapter
  /** Use a distinct URL namespace when multiple composers share a route. */
  namespace?: ReportComposerNamespace
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
  urlState,
  namespace,
}: Props) {
  const shell = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [activeIndex, setActiveIndex] = useState(0)
  const [composing, setComposing] = useState(false)
  const composerUrl = useReportComposerUrlState(urlState, namespace)
  const typeFilter = composerUrl.filter
  const presentation = composerUrl.presentation
  const command = parseSlashReportInput(value)
  const paletteOpen = command.isSlashCommand && composerUrl.chooser !== 'closed' && composerUrl.chooser !== 'contents'
  const query = command.query
  const matches = useMemo(() => searchReports(query), [query])
  const filteredMatches = useMemo(() => filterReportsByType(matches, typeFilter), [matches, typeFilter])
  const activeReport = filteredMatches[activeIndex] ?? null
  const urlReport = composerUrl.reportId ? findReport(composerUrl.reportId) ?? null : null
  const selectedContentIds = selectedReport
    ? (composerUrl.hasContentSelection ? composerUrl.contentIds : selectedReport.contents.filter(content => content.defaultSelected).map(content => content.id))
    : []
  const selectedContents = selectedReport?.contents.filter(content => selectedContentIds.includes(content.id)) ?? []
  const contentsOpen = !!selectedReport && composerUrl.chooser === 'contents'

  useEffect(() => setActiveIndex(index => Math.min(index, Math.max(filteredMatches.length - 1, 0))), [filteredMatches.length, query, typeFilter])

  useEffect(() => {
    if (urlReport && selectedReport?.id !== urlReport.id) {
      onSelectReport(urlReport)
      return
    }
    if (composerUrl.reportId && !urlReport) {
      composerUrl.setState({ reportId: null, chooser: null, contentIds: null, presentation: 'auto' }, { replace: true })
    }
  }, [composerUrl.reportId, composerUrl.setState, onSelectReport, selectedReport?.id, urlReport])

  useEffect(() => {
    if (!selectedReport || !composerUrl.hasContentSelection) return
    const validIds = composerUrl.contentIds.filter(id => selectedReport.contents.some(content => content.id === id))
    if (validIds.length !== composerUrl.contentIds.length) composerUrl.setState({ contentIds: validIds }, { replace: true })
  }, [composerUrl.contentIds, composerUrl.hasContentSelection, composerUrl.setState, selectedReport])

  useEffect(() => {
    if (!selectedReport || !contentsOpen || selectedReport.contents.length !== 1) return
    const contentIds = defaultReportContentIds(selectedReport)
    if (!contentIds.length) return
    composerUrl.setState({ chooser: null, contentIds, presentation: 'auto' }, { replace: true })
  }, [composerUrl.setState, contentsOpen, selectedReport])

  const focusInput = () => requestAnimationFrame(() => shell.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus())
  const updateUrl = (patch: Parameters<typeof composerUrl.setState>[0]) => composerUrl.setState(patch)
  const selectReport = (report: ReportDefinition, question?: string) => {
    onSelectReport(report)
    const contentIds = defaultReportContentIds(report)
    const nextQuestion = question ?? (command.isSlashCommand ? '' : value)
    if (report.contents.length === 1 && contentIds.length) {
      const directQuestion = selectedContentsQuestion(report, contentIds, 'auto')
      onChange(directQuestion)
      updateUrl({
        reportId: report.id,
        chooser: null,
        contentIds,
        presentation: 'auto',
      })
      onSubmit({ contentIds, presentation: 'auto', question: directQuestion }, report)
      return
    }
    onChange(nextQuestion)
    updateUrl({
      reportId: report.id,
      chooser: 'contents',
      contentIds,
      presentation: 'auto',
    })
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
    updateUrl({ chooser: parseSlashReportInput(next).isSlashCommand ? 'palette' : null })
    onChange(next)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing || event.nativeEvent.isComposing) return
    if (paletteOpen) {
      if (event.key === 'ArrowDown' && filteredMatches.length) { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, filteredMatches.length - 1)); return }
      if (event.key === 'ArrowUp' && filteredMatches.length) { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); return }
      if (event.key === 'Enter') { event.preventDefault(); if (activeReport) selectReport(activeReport); return }
      if (event.key === 'Escape') { event.preventDefault(); updateUrl({ chooser: 'closed' }); return }
    }
    if (event.key === 'Enter' && !event.shiftKey && (value.trim() || selectedReport)) { event.preventDefault(); onSubmit() }
  }
  const removeReport = () => {
    onRemoveReport()
    updateUrl({ reportId: null, chooser: null, contentIds: null, presentation: 'auto' })
  }
  const submitContents = (overview = false) => {
    if (!selectedReport) return
    const ids = overview ? defaultReportContentIds(selectedReport) : selectedContentIds
    if (!ids.length) return
    const question = selectedContentsQuestion(selectedReport, ids, presentation)
    onChange(question)
    onSubmit({ contentIds: ids, presentation, question }, selectedReport)
    updateUrl({ chooser: null, contentIds: ids })
  }
  return <div className="report-composer" ref={shell}>
    <div className={`report-composer-field ${selectedReport ? 'has-report' : ''}`}>
      {selectedReport && <div className="report-composer-chip" aria-label={`Selected report: ${selectedReport.title}`}>
        <span className="report-composer-chip-copy"><span>{selectedReport.title}</span><span>{selectedReport.type}</span></span>
        <IconButton
          className="report-composer-chip-remove"
          symbol={Xsm}
          size="xsmall"
          variant="icon"
          color="neutral"
          disabled={disabled}
          onClick={removeReport}
          aria-label={`Remove ${selectedReport.title}`}
          title={`Remove ${selectedReport.title}`}
        />
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
         <div className="report-composer-filters" role="group" aria-label="Catalog type">
           <Button type="button" size="small" variant={typeFilter === 'all' ? 'contained' : 'outlined'} color={typeFilter === 'all' ? 'primary' : 'neutral'} aria-pressed={typeFilter === 'all'} onClick={() => updateUrl({ filter: 'all' })}>All ({matches.length})</Button>
           <Button type="button" size="small" variant={typeFilter === 'reports' ? 'contained' : 'outlined'} color={typeFilter === 'reports' ? 'primary' : 'neutral'} aria-pressed={typeFilter === 'reports'} onClick={() => updateUrl({ filter: 'reports' })}>Reports ({matches.filter(report => report.type === 'report').length})</Button>
           <Button type="button" size="small" variant={typeFilter === 'dashboards' ? 'contained' : 'outlined'} color={typeFilter === 'dashboards' ? 'primary' : 'neutral'} aria-pressed={typeFilter === 'dashboards'} onClick={() => updateUrl({ filter: 'dashboards' })}>Dashboards ({matches.filter(report => report.type === 'dashboard').length})</Button>
         </div>
         {filteredMatches.length ? <div className="report-composer-options">{filteredMatches.map((report, index) => <Button key={report.id} id={`${listId}-${report.id}`} type="button" role="option" aria-selected={index === activeIndex} variant="text" color="neutral" fullWidth className={`report-composer-option ${index === activeIndex ? 'is-active' : ''}`} onMouseMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => selectReport(report)}>
          <span className="report-composer-option-copy"><span title={report.title}>{report.title}</span><span title={report.description}>{report.description}</span></span>
          <span className="report-composer-option-meta"><span>{reportOptionMeta(report)}</span></span>
         </Button>)}</div> : <div className="report-composer-empty" role="status">No {typeFilter === 'all' ? 'catalog items' : typeFilter} match “{query}”.</div>}
      </div>}
      {selectedReport && !paletteOpen && contentsOpen && <section className="report-contents-chooser" aria-label={`${selectedReport.title} contents`}>
         <header><div><Text component="h3">{selectedReport.title}</Text><Text component="p">{selectedReport.description}</Text></div><Button type="button" className="report-contents-back" variant="text" color="neutral" onClick={removeReport} disabled={disabled}>Close</Button></header>
         <div className="report-contents-list" role="group" aria-label="Available report contents">{selectedReport.contents.map(content => <label key={content.id} className="report-content-option"><Checkbox checked={selectedContentIds.includes(content.id)} disabled={disabled} inputProps={{ 'aria-label': content.label }} onChange={() => updateUrl({ contentIds: selectedContentIds.includes(content.id) ? selectedContentIds.filter(id => id !== content.id) : [...selectedContentIds, content.id] })}/><span><strong>{content.label}</strong><small>{content.description}</small></span></label>)}</div>
         <fieldset className="report-presentation"><legend>Presentation</legend>{(['auto', 'chart', 'table'] as const).map(option => <label key={option}><Radio name={`${selectedReport.id}-presentation`} value={option} checked={presentation === option} disabled={disabled} inputProps={{ 'aria-label': option }} onChange={() => updateUrl({ presentation: option })}/>{option[0].toUpperCase() + option.slice(1)}</label>)}</fieldset>
         <footer><Button type="button" className="report-contents-back" variant="text" color="neutral" onClick={() => submitContents(true)} disabled={disabled}>Show overview</Button><Button type="button" className="report-contents-submit" variant="contained" color="primary" onClick={() => submitContents()} disabled={disabled || !selectedContents.length}>Show selected</Button></footer>
      </section>}
    </div>
  </div>
}
