import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog, IconButton, Menu, MenuDivider, MenuItem, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, Text, Tooltip } from '@ringcentral/spring-ui'
import { OverflowVerticalMd } from '@ringcentral/spring-icon'
import type { Artifact, Dataset, Filter, Presentation, Renderer } from '../lib/model'
import { api } from './api'
import { SquareLoader } from './SquareLoader'
import { RendererCanvas } from './RendererCanvas'
import { AskAdvisor } from './AskAdvisor'
import { provenanceItems } from './provenance'

export const rendererNames: Record<Renderer, string> = { echarts: 'ECharts', chartjs: 'Chart.js', plotly: 'Plotly' }
export function formatValue(value: number, unit = '') {
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
  return unit === 'USD' ? `$${number}` : unit === '%' || unit === 'percent' ? `${number}%` : unit && !['count', 'number'].includes(unit) ? `${number} ${unit}` : number
}
export function ChartCard({ artifact, dataset, filters = [], preference, eager, onReady, onAsk: _onAsk, onAdvisor, onSave, onDashboard, onRemove, removeLabel = 'Remove from dashboard', showRendererControl = true, showAdvisor = true }: {
  artifact: Artifact; dataset: Dataset; filters?: Filter[]; preference?: Renderer; eager?: boolean; onReady?: (id: string, error?: string) => void;
  onAsk: (artifact: Artifact) => void; onAdvisor?: (artifact: Artifact, question: string, trigger: HTMLElement) => void; onSave: (artifact: Artifact) => void; onDashboard: (artifact: Artifact) => void; onRemove?: (artifact: Artifact) => void; removeLabel?: string; showRendererControl?: boolean; showAdvisor?: boolean;
}) {
  const card = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!!eager)
  const [layers, setLayers] = useState<Presentation[]>([])
  const [busy, setBusy] = useState<Renderer | null>(null)
  const [error, setError] = useState('')
  const [failedRenderers, setFailedRenderers] = useState<Partial<Record<Renderer, string>>>({})
  const [dataOpen, setDataOpen] = useState(artifact.view.chartType === 'table')
  const [page, setPage] = useState(0)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [expandedDataOpen, setExpandedDataOpen] = useState(false)
  const onReadyRef = useRef(onReady)
  useEffect(() => { onReadyRef.current = onReady }, [onReady])
  const attempt = useRef(0)
  const lastPreference = useRef(preference)
  const loadedView = useRef('')
  const failedAttempts = useRef(new Set<Renderer>())
  const [inspection, setInspection] = useState<'definitions' | 'provenance' | null>(null)
  const current = layers.at(-1)
  const currentRenderer = current?.renderer
  const preparingInitialChart = !!busy && !current
  const filtersKey = JSON.stringify(filters)
  const canonicalFilters = useMemo(() => JSON.parse(filtersKey) as Filter[], [filtersKey])
  useEffect(() => {
    if (eager) { const frame = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(frame) }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } }, { rootMargin: '240px' })
    if (card.current) observer.observe(card.current)
    return () => observer.disconnect()
  }, [eager])
  const requestPresentation = useCallback(async (renderer: Renderer) => {
    const ticket = ++attempt.current
    setBusy(renderer); setError(''); setPage(0)
    try {
      const next = await api<Presentation>(`/artifacts/${artifact.id}/render`, 'POST', { renderer, filters: canonicalFilters })
      if (attempt.current !== ticket) return
      setLayers(old => [...old.filter(item => item.renderer !== next.renderer), next])
      if (['kpi', 'table'].includes(artifact.view.chartType) || !next.rows.length) { setBusy(null); onReadyRef.current?.(artifact.id) }
    } catch (caught) { if (attempt.current === ticket) { const message = caught instanceof Error ? caught.message : 'Unable to prepare this chart.'; setError(message); setBusy(null); onReadyRef.current?.(artifact.id, message) } }
  }, [artifact.id, artifact.view.chartType, canonicalFilters])
  useEffect(() => {
    const desiredRenderer = preference ?? artifact.renderer
    const preferenceChanged = lastPreference.current !== preference
    lastPreference.current = preference
    // Render once when a card becomes visible. Later, preserve a renderer the
    // user selected locally; only a genuine preference change from storage may
    // replace the current renderer.
    const viewKey = `${artifact.id}:${filtersKey}`
    const viewChanged = loadedView.current !== viewKey
    if (!visible || (!viewChanged && currentRenderer && (!preferenceChanged || currentRenderer === desiredRenderer))) return
    loadedView.current = viewKey
    failedAttempts.current.clear()
    if (viewChanged) setLayers([])
    void requestPresentation(desiredRenderer)
    const activeAttempt = attempt
    return () => { activeAttempt.current++ }
  }, [visible, artifact.id, preference, artifact.renderer, currentRenderer, requestPresentation, filtersKey])
  const ready = (presentation: Presentation) => {
    if (layers.at(-1) !== presentation) return
    setLayers(old => old.length > 1 ? [presentation] : old); setBusy(null); onReadyRef.current?.(artifact.id)
  }
  const renderError = (presentation: Presentation, message: string) => {
    failedAttempts.current.add(presentation.renderer)
    setFailedRenderers(old => ({ ...old, [presentation.renderer]: message }))
    setLayers(old => old.filter(layer => layer !== presentation))
    const fallback = presentation.capabilities.find(capability => capability.supported && capability.renderer !== presentation.renderer && !failedAttempts.current.has(capability.renderer))?.renderer
    if (fallback) {
      setError(`Couldn't render with ${rendererNames[presentation.renderer]}; trying ${rendererNames[fallback]}.`)
      void requestPresentation(fallback)
      return
    }
    setBusy(null); setError(message); onReadyRef.current?.(artifact.id, message)
  }
  const rows = current?.rows ?? (filters.length ? [] : dataset.rows)
  const fields = dataset.fields.filter(field => rows[0] && field.id in rows[0])
  const table = <div className="data-inspection"><div className="table-scroll"><Table aria-label={`${artifact.title} source records`}><TableHead><TableRow>{fields.map(field => <TableCell component="th" scope="col" key={field.id}>{field.name}</TableCell>)}</TableRow></TableHead><TableBody>{rows.slice(page * 10, page * 10 + 10).map((row, i) => <TableRow key={i}>{fields.map(field => <TableCell key={field.id}>{typeof row[field.id] === 'number' ? formatValue(row[field.id] as number, field.unit) : row[field.id]}</TableCell>)}</TableRow>)}</TableBody></Table></div><div className="table-pagination"><Text>{rows.length ? `${page * 10 + 1}–${Math.min(page * 10 + 10, rows.length)} of ${rows.length} rows` : 'No rows match this view'}</Text><div><Button color="neutral" variant="text" size="small" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button color="neutral" variant="text" size="small" disabled={(page + 1) * 10 >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div></div></div>
  const native = !['kpi', 'table'].includes(artifact.view.chartType)
  return <div ref={card} className="report-card" data-testid="chart-card" data-artifact-id={artifact.id} data-chart-type={artifact.view.chartType}>
    {showAdvisor && onAdvisor && <div className="advisor-card-action"><AskAdvisor artifact={artifact} onAsk={(question, trigger) => onAdvisor(artifact, question, trigger)} /></div>}
    <div className="report-heading"><div><Text component="h3">{artifact.title}</Text></div><div className="report-heading-actions"><IconButton symbol={OverflowVerticalMd} title="More chart actions" aria-label="More chart actions" size="medium" color="neutral" onClick={event => setMenuAnchor(event.currentTarget)} /></div></div>
    {!filters.length && !!artifact.kpis?.length && <div className="kpi-row">{artifact.kpis.slice(0, 3).map((kpi, i) => <div className="kpi" key={i}><Text className="kpi-label">{kpi.label}</Text><Text className="kpi-value">{formatValue(kpi.value, kpi.unit)}</Text>{kpi.detail && <Text className="kpi-detail">{kpi.detail}</Text>}</div>)}</div>}
    {!!filters.length && <Text className="chart-notice">Dashboard filters are applied to this view. KPIs remain available on the unfiltered source chart.</Text>}
    {native && <div className="chart-frame">
      {(!current || !visible) && !error && <div className="chart-skeleton" aria-label="Preparing chart"><Skeleton variant="rectangular" /><Skeleton variant="rectangular" /><Skeleton variant="rectangular" /></div>}
      {layers.map((presentation, index) => <div className={`chart-layer ${index > 0 ? 'is-candidate' : ''}`} key={presentation.renderer} aria-hidden={index > 0}>{presentation.rows.length ? <RendererCanvas title={artifact.title} dataset={dataset} presentation={presentation} onReady={() => ready(presentation)} onError={message => renderError(presentation, message)} /> : <Text className="empty-chart">No rows match these filters.</Text>}</div>)}
      {error && !layers.length && <Text className="empty-chart">This chart couldn’t be displayed.</Text>}
    </div>}
    {error && <div role="alert" className="inline-error"><Text>{error}</Text><Button size="small" color="neutral" onClick={() => { failedAttempts.current.clear(); setFailedRenderers({}); void requestPresentation(preference ?? artifact.renderer) }}>Retry chart</Button></div>}
    {(current?.notice || artifact.notice) && <Text component="p" className="chart-notice">{current?.notice ?? artifact.notice}</Text>}
    <div className="report-footer">{native && showRendererControl && <div className="renderer-control"><Text className="renderer-label">Render with</Text><div className="renderer-options" role="radiogroup" aria-label="Chart renderer" onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)')); if (!buttons.length) return; event.preventDefault(); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; buttons[next].focus(); buttons[next].click() }}>{(['echarts', 'chartjs', 'plotly'] as Renderer[]).map(renderer => {
      const cap = current?.capabilities.find(item => item.renderer === renderer)
      const reason = failedRenderers[renderer] ?? (cap && !cap.supported ? cap.reason ?? `${rendererNames[renderer]} cannot represent this chart.` : '')
      const selected = current?.renderer === renderer || (preparingInitialChart && busy === renderer)
      return <Tooltip title={reason || rendererNames[renderer]} triggerWhenDisabled key={renderer}><span className={reason ? 'unavailable-renderer' : ''}><Button size="small" color="neutral" variant={selected ? 'outlined' : 'text'} className="renderer-button" role="radio" tabIndex={selected || !current ? 0 : -1} aria-checked={selected} aria-busy={busy === renderer || undefined} aria-label={busy === renderer ? rendererNames[renderer] + ' loading' : rendererNames[renderer]} disabled={!!reason || (!!busy && !selected)} onClick={() => { if (!selected) void requestPresentation(renderer) }}>{busy === renderer ? <span className="renderer-loading"><SquareLoader /></span> : rendererNames[renderer]}</Button></span></Tooltip>
    })}</div></div>}<Button variant="text" size="small" color="neutral" aria-expanded={dataOpen} onClick={() => { setDataOpen(!dataOpen); setPage(0) }}>{dataOpen ? 'Hide data' : 'View data'}</Button></div>
    {dataOpen && table}
    <Menu open={!!menuAnchor} anchorEl={menuAnchor} onClose={() => setMenuAnchor(null)} placement="bottom-end">
      <MenuItem onClick={() => { setMenuAnchor(null); onSave(artifact) }}>Add chart to project</MenuItem>
      <MenuItem onClick={() => { setMenuAnchor(null); onDashboard(artifact) }}>Add to dashboard</MenuItem>
      <MenuDivider />
      {!showRendererControl && native && (['echarts', 'chartjs', 'plotly'] as Renderer[]).map(renderer => <MenuItem key={renderer} onClick={() => { setMenuAnchor(null); void requestPresentation(renderer) }}>Render with {rendererNames[renderer]}</MenuItem>)}
      {!showRendererControl && native && <MenuDivider />}
      <MenuItem onClick={() => { setMenuAnchor(null); setInspection('definitions') }}>Metric definitions</MenuItem>
      <MenuItem onClick={() => { setMenuAnchor(null); setInspection('provenance') }}>Data source</MenuItem>
      <MenuItem onClick={() => { setMenuAnchor(null); setExpandedDataOpen(false); setExpanded(true) }}>Expand chart</MenuItem>
      {onRemove && <><MenuDivider /><MenuItem onClick={() => { setMenuAnchor(null); onRemove(artifact) }}>{removeLabel}</MenuItem></>}
    </Menu>
    <Dialog open={!!inspection} size="medium" onClose={() => setInspection(null)} closeButton aria-label={inspection === 'provenance' ? 'Data source' : 'Metric definitions'}><div className="chart-inspection-dialog">{inspection === 'provenance' ? <><Text component="h2">Data source</Text><dl>{provenanceItems(artifact, dataset).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></> : <><Text component="h2">Metric definitions</Text><dl>{dataset.fields.map(field => <div key={field.id}><dt>{field.name}</dt><dd>{field.type}{field.unit ? ` · ${field.unit}` : ''}{field.type === 'number' ? ` · ${artifact.view.aggregation} aggregation` : ''}{field.numerator && field.denominator ? ` · ${field.numerator} ÷ ${field.denominator}` : ''}</dd></div>)}</dl></>}</div></Dialog>
    <Dialog open={expanded} size="large" onClose={() => setExpanded(false)} closeButton aria-label={artifact.title}><div className="expanded-report"><div className="expanded-heading"><div><Text component="h2">{artifact.title}</Text></div><Button color="neutral" variant="outlined" size="small" aria-expanded={expandedDataOpen} onClick={() => { setExpandedDataOpen(value => !value); setPage(0) }}>{expandedDataOpen ? 'Hide data' : 'View data'}</Button></div>{current && native && <div className="expanded-chart"><RendererCanvas title={artifact.title} dataset={dataset} presentation={current} onReady={() => {}} onError={setError} /></div>}{expandedDataOpen && table}</div></Dialog>
  </div>
}
