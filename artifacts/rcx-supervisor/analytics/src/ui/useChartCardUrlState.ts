import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { Filter, Renderer } from '../lib/model'

export type ChartInspection = 'definitions' | 'provenance'

/**
 * Chart state deliberately has its own Analytics namespace. The Analytics
 * workspace already has legacy `analyticsView`, `analyticsSession`, ...
 * parameters, and chart state must not collide with either those parameters
 * or Supervisor parameters when the two applications share a browser location.
 */
export const CHART_CARD_URL_KEYS = {
  artifact: 'analyticsArtifact',
  inspector: 'analyticsInspector',
  expanded: 'analyticsExpanded',
  renderer: 'analyticsRenderer',
  filters: 'analyticsFilters',
  page: 'analyticsPage',
} as const

export type ChartCardUrlWriteOptions = { replace?: boolean }
export type ChartCardUrlAdapter = {
  /**
   * A Router v6 boundary can provide its location search params here without
   * ChartCard importing react-router-dom.
   */
  searchParams: URLSearchParams
  /**
   * Receives only the updated search params. The boundary can pass these to
   * Router v6's setSearchParams/navigation adapter.
   */
  setSearchParams: (searchParams: URLSearchParams, options?: ChartCardUrlWriteOptions) => void
}

/**
 * Optional bridge for a native route boundary.  Standalone Analytics and
 * unit tests do not need a Router provider: the hook uses browser history
 * directly in that case.
 */
export const ChartCardUrlContext = createContext<ChartCardUrlAdapter | null>(null)

type ChartCardUrlProviderProps = PropsWithChildren<{
  value?: ChartCardUrlAdapter
  /** Compatibility form for the Analytics route boundary's navigateSearch helper. */
  search?: string
  navigate?: (search: string, options?: ChartCardUrlWriteOptions) => void
}>

export function ChartCardUrlProvider({ children, value, search = '', navigate }: ChartCardUrlProviderProps) {
  const adapter = useMemo<ChartCardUrlAdapter>(() => value ?? {
    searchParams: new URLSearchParams(search),
    setSearchParams: (next, options) => {
      const serialized = next.toString()
      navigate?.(serialized ? `?${serialized}` : '', options)
    },
  }, [navigate, search, value])
  return createElement(ChartCardUrlContext.Provider, { value: adapter }, children)
}

const RENDERERS: readonly Renderer[] = ['echarts', 'chartjs', 'plotly']
const INSPECTIONS: readonly ChartInspection[] = ['definitions', 'provenance']
function valueIsRenderer(value: unknown): value is Renderer {
  return typeof value === 'string' && RENDERERS.includes(value as Renderer)
}

function valueIsInspection(value: unknown): value is ChartInspection {
  return typeof value === 'string' && INSPECTIONS.includes(value as ChartInspection)
}

function valueIsFilter(value: unknown): value is Filter {
  if (!value || typeof value !== 'object') return false
  const filter = value as Partial<Filter>
  if (typeof filter.field !== 'string' || !['eq', 'in', 'gte', 'lte'].includes(filter.operator ?? '')) return false
  if (Array.isArray(filter.value)) return filter.value.every(item => typeof item === 'string' || typeof item === 'number')
  return typeof filter.value === 'string' || typeof filter.value === 'number'
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try { return JSON.parse(value) as unknown } catch { return null }
}

function parseTargetedPair(raw: string | null, artifactId: string): string | null {
  if (!raw) return null
  const separator = raw.indexOf(':')
  if (separator < 1 || raw.slice(0, separator) !== artifactId) return null
  return raw.slice(separator + 1)
}

function parseTargetedFilters(raw: string | null, artifactId: string): { filters: Filter[] | null; invalid: boolean } {
  if (!raw) return { filters: null, invalid: false }
  const parsed = parseJson(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const candidate = (parsed as Record<string, unknown>)[artifactId]
    if (candidate === undefined) return { filters: null, invalid: false }
    if (!Array.isArray(candidate) || !candidate.every(valueIsFilter)) return { filters: null, invalid: true }
    return { filters: candidate as Filter[], invalid: false }
  }

  // Accept the compact form used by early native links:
  // analyticsFilters=<artifact id>:<encoded JSON array>.
  const separator = raw.indexOf(':')
  if (separator > 0 && raw.slice(0, separator) === artifactId) {
    try {
      const candidate = JSON.parse(decodeURIComponent(raw.slice(separator + 1))) as unknown
      if (!Array.isArray(candidate) || !candidate.every(valueIsFilter)) return { filters: null, invalid: true }
      return { filters: candidate as Filter[], invalid: false }
    } catch {
      return { filters: null, invalid: true }
    }
  }

  // A single-card link may use a plain filter array and identify its artifact
  // through analyticsArtifact.
  if (Array.isArray(parsed)) {
    if (!parsed.every(valueIsFilter)) return { filters: null, invalid: true }
    return { filters: parsed as Filter[], invalid: false }
  }
  return { filters: null, invalid: false }
}

export type ParsedChartCardUrlState = {
  inspector: ChartInspection | null
  expanded: boolean
  renderer: Renderer | null
  filters: Filter[] | null
  page: number
  invalid: {
    inspector: boolean
    expanded: boolean
    renderer: boolean
    filters: boolean
    page: boolean
  }
}

/**
 * Parse only state addressed to one artifact.  State for another card is
 * intentionally ignored so a dashboard can render multiple cards without
 * clearing a link intended for a different card.
 */
export function parseChartCardUrlState(search: string, artifactId: string): ParsedChartCardUrlState {
  const params = new URLSearchParams(search)
  const artifact = params.get(CHART_CARD_URL_KEYS.artifact)
  const rawInspector = params.get(CHART_CARD_URL_KEYS.inspector)
  const inspectorPair = parseTargetedPair(rawInspector, artifactId)
  const inspectorRaw = inspectorPair ?? (artifact === artifactId && valueIsInspection(rawInspector) ? rawInspector : null)
  const inspector = valueIsInspection(inspectorRaw) ? inspectorRaw : null
  const inspectorInvalid = rawInspector !== null &&
    ((inspectorPair !== null && !valueIsInspection(inspectorPair)) || (artifact === artifactId && inspectorPair === null && !valueIsInspection(rawInspector)))

  const rawExpanded = params.get(CHART_CARD_URL_KEYS.expanded)
  const expandedForCard = rawExpanded === artifactId || (artifact === artifactId && (rawExpanded === '1' || rawExpanded === 'true'))
  const expandedInvalid = rawExpanded !== null && artifact === artifactId && !expandedForCard

  const rawRenderer = params.get(CHART_CARD_URL_KEYS.renderer)
  const rendererPair = parseTargetedPair(rawRenderer, artifactId)
  const rendererRaw = rendererPair ?? (artifact === artifactId && valueIsRenderer(rawRenderer) ? rawRenderer : null)
  const renderer = valueIsRenderer(rendererRaw) ? rendererRaw : null
  const rendererInvalid = rawRenderer !== null &&
    ((rendererPair !== null && !valueIsRenderer(rendererPair)) || (artifact === artifactId && rendererPair === null && !valueIsRenderer(rawRenderer)))

  const targetedFilters = parseTargetedFilters(params.get(CHART_CARD_URL_KEYS.filters), artifactId)
  const rawPage = params.get(CHART_CARD_URL_KEYS.page)
  const pagePair = parseTargetedPair(rawPage, artifactId)
  const pageRaw = pagePair ?? (artifact === artifactId ? rawPage : null)
  const parsedPage = pageRaw === null ? 0 : Number(pageRaw)
  const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0
  const pageInvalid = pageRaw !== null && (!Number.isInteger(parsedPage) || parsedPage < 0)

  return {
    inspector,
    expanded: expandedForCard,
    renderer,
    filters: targetedFilters.filters,
    page,
    invalid: {
      inspector: inspectorInvalid,
      expanded: expandedInvalid,
      renderer: rendererInvalid,
      filters: targetedFilters.invalid,
      page: pageInvalid,
    },
  }
}

function readFilterMap(params: URLSearchParams): Record<string, Filter[]> {
  const parsed = parseJson(params.get(CHART_CARD_URL_KEYS.filters))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => Array.isArray(value) && value.every(valueIsFilter))) as Record<string, Filter[]>
}

function removeArtifactSelection(params: URLSearchParams, artifactId: string) {
  if (params.get(CHART_CARD_URL_KEYS.artifact) !== artifactId) return
  const hasInspector = params.get(CHART_CARD_URL_KEYS.inspector)?.startsWith(`${artifactId}:`) || params.get(CHART_CARD_URL_KEYS.inspector) === 'definitions' || params.get(CHART_CARD_URL_KEYS.inspector) === 'provenance'
  const expanded = params.get(CHART_CARD_URL_KEYS.expanded)
  const hasExpanded = expanded === artifactId || (expanded !== null && (expanded === '1' || expanded === 'true'))
  const renderer = params.get(CHART_CARD_URL_KEYS.renderer)
  const hasRenderer = renderer?.startsWith(`${artifactId}:`) || valueIsRenderer(renderer)
  const page = params.get(CHART_CARD_URL_KEYS.page)
  const hasPage = page?.startsWith(`${artifactId}:`) || (page !== null && /^\d+$/.test(page))
  const hasFilters = readFilterMap(params)[artifactId] !== undefined
  if (!hasInspector && !hasExpanded && !hasRenderer && !hasPage && !hasFilters) params.delete(CHART_CARD_URL_KEYS.artifact)
}

function updateFilters(params: URLSearchParams, artifactId: string, filters: Filter[] | null) {
  const map = readFilterMap(params)
  if (filters === null || !filters.length) delete map[artifactId]
  else map[artifactId] = filters
  if (Object.keys(map).length) params.set(CHART_CARD_URL_KEYS.filters, JSON.stringify(map))
  else params.delete(CHART_CARD_URL_KEYS.filters)
}

export function updateChartCardUrlSearch(
  search: string,
  update: (params: URLSearchParams) => void,
): string {
  const params = new URLSearchParams(search)
  update(params)
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

const currentSearchParams = (): URLSearchParams =>
  typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)

export function useChartCardUrlState(artifactId: string) {
  const adapter = useContext(ChartCardUrlContext)
  const [standaloneParams, setStandaloneParams] = useState(currentSearchParams)
  const searchParams = adapter?.searchParams ?? standaloneParams
  const search = searchParams.toString()
  const state = useMemo(() => parseChartCardUrlState(search, artifactId), [artifactId, search])

  useEffect(() => {
    if (adapter || typeof window === 'undefined') return
    const onPopState = () => setStandaloneParams(currentSearchParams())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [adapter])

  const write = useCallback((update: (params: URLSearchParams) => void, options?: ChartCardUrlWriteOptions) => {
    const current = new URLSearchParams(adapter?.searchParams ?? currentSearchParams())
    const before = current.toString()
    update(current)
    if (current.toString() === before) return
    if (adapter) {
      adapter.setSearchParams(current, options)
      return
    }
    if (typeof window === 'undefined') {
      setStandaloneParams(current)
      return
    }
    const serialized = current.toString()
    const next = serialized ? `?${serialized}` : ''
    const url = `${window.location.pathname}${next}${window.location.hash}`
    window.history[options?.replace ? 'replaceState' : 'pushState'](window.history.state, '', url)
    setStandaloneParams(current)
  }, [adapter])

  const setInspector = useCallback((value: ChartInspection | null, options?: ChartCardUrlWriteOptions) => {
    write(params => {
      if (value === null) {
        const raw = params.get(CHART_CARD_URL_KEYS.inspector)
        if (raw?.startsWith(`${artifactId}:`) || (params.get(CHART_CARD_URL_KEYS.artifact) === artifactId && valueIsInspection(raw))) params.delete(CHART_CARD_URL_KEYS.inspector)
        removeArtifactSelection(params, artifactId)
      } else {
        params.set(CHART_CARD_URL_KEYS.artifact, artifactId)
        params.set(CHART_CARD_URL_KEYS.inspector, value)
      }
    }, options)
  }, [artifactId, write])

  const setExpanded = useCallback((value: boolean, options?: ChartCardUrlWriteOptions) => {
    write(params => {
      if (value) {
        params.set(CHART_CARD_URL_KEYS.artifact, artifactId)
        params.set(CHART_CARD_URL_KEYS.expanded, artifactId)
      } else if (params.get(CHART_CARD_URL_KEYS.expanded) === artifactId || (params.get(CHART_CARD_URL_KEYS.artifact) === artifactId && ['1', 'true'].includes(params.get(CHART_CARD_URL_KEYS.expanded) ?? ''))) {
        params.delete(CHART_CARD_URL_KEYS.expanded)
        removeArtifactSelection(params, artifactId)
      }
    }, options)
  }, [artifactId, write])

  const setRenderer = useCallback((value: Renderer | null, options?: ChartCardUrlWriteOptions) => {
    write(params => {
      const raw = params.get(CHART_CARD_URL_KEYS.renderer)
      if (value === null) {
        if (raw?.startsWith(`${artifactId}:`) || (params.get(CHART_CARD_URL_KEYS.artifact) === artifactId && valueIsRenderer(raw))) params.delete(CHART_CARD_URL_KEYS.renderer)
      } else {
        params.set(CHART_CARD_URL_KEYS.artifact, artifactId)
        params.set(CHART_CARD_URL_KEYS.renderer, value)
      }
    }, options)
  }, [artifactId, write])

  const setFilters = useCallback((value: Filter[] | null, options?: ChartCardUrlWriteOptions) => {
    write(params => updateFilters(params, artifactId, value), options)
  }, [artifactId, write])

  const setPage = useCallback((value: number, options?: ChartCardUrlWriteOptions) => {
    write(params => {
      if (!Number.isInteger(value) || value < 0) {
        params.delete(CHART_CARD_URL_KEYS.page)
        return
      }
      if (value === 0) {
        const raw = params.get(CHART_CARD_URL_KEYS.page)
        if (raw?.startsWith(`${artifactId}:`) || (params.get(CHART_CARD_URL_KEYS.artifact) === artifactId && raw !== null)) params.delete(CHART_CARD_URL_KEYS.page)
      } else {
        params.set(CHART_CARD_URL_KEYS.artifact, artifactId)
        params.set(CHART_CARD_URL_KEYS.page, String(value))
      }
    }, options)
  }, [artifactId, write])

  useEffect(() => {
    const invalid = state.invalid
    if (!invalid.inspector && !invalid.expanded && !invalid.renderer && !invalid.filters && !invalid.page) return
    write(params => {
      if (invalid.inspector) {
        const raw = params.get(CHART_CARD_URL_KEYS.inspector)
        if (raw?.startsWith(`${artifactId}:`) || (params.get(CHART_CARD_URL_KEYS.artifact) === artifactId && raw !== null)) params.delete(CHART_CARD_URL_KEYS.inspector)
      }
      if (invalid.renderer) {
        const raw = params.get(CHART_CARD_URL_KEYS.renderer)
        if (raw?.startsWith(`${artifactId}:`) || (params.get(CHART_CARD_URL_KEYS.artifact) === artifactId && raw !== null)) params.delete(CHART_CARD_URL_KEYS.renderer)
      }
      if (invalid.expanded) params.delete(CHART_CARD_URL_KEYS.expanded)
      if (invalid.filters) updateFilters(params, artifactId, null)
      if (invalid.page) {
        const raw = params.get(CHART_CARD_URL_KEYS.page)
        if (raw?.startsWith(`${artifactId}:`) || (params.get(CHART_CARD_URL_KEYS.artifact) === artifactId && raw !== null)) params.delete(CHART_CARD_URL_KEYS.page)
      }
      removeArtifactSelection(params, artifactId)
    }, { replace: true })
  }, [artifactId, state.invalid, write])

  return {
    ...state,
    setInspector,
    setExpanded,
    setRenderer,
    setFilters,
    setPage,
  }
}