import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { PresentationPreference } from '../lib/reportCatalog'

/**
 * These keys intentionally live under one namespace. The question itself is
 * never written to the URL: links identify a catalog selection and its
 * presentation, not a potentially sensitive draft.
 */
export const DEFAULT_REPORT_COMPOSER_NAMESPACE = 'composer'
export type ReportComposerNamespace = string
export type ReportComposerUrlKeys = {
  report: string
  chooser: string
  contents: string
  filter: string
  presentation: string
}

const normalizeNamespace = (namespace?: ReportComposerNamespace): string => {
  const normalized = namespace?.trim().replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^\.+|\.+$/g, '')
  return normalized || DEFAULT_REPORT_COMPOSER_NAMESPACE
}

export function reportComposerUrlKeys(namespace = DEFAULT_REPORT_COMPOSER_NAMESPACE): ReportComposerUrlKeys {
  const normalized = normalizeNamespace(namespace)
  const scope = normalized === DEFAULT_REPORT_COMPOSER_NAMESPACE || normalized.endsWith('.composer')
    ? normalized
    : `${normalized}.composer`
  const prefix = `analytics.${scope}.`
  return {
    report: `${prefix}report`,
    chooser: `${prefix}chooser`,
    contents: `${prefix}contents`,
    filter: `${prefix}filter`,
    presentation: `${prefix}presentation`,
  }
}

/** Backward-compatible keys for the primary composer namespace. */
export const REPORT_COMPOSER_URL_KEYS = reportComposerUrlKeys()

export type ReportComposerChooser = 'palette' | 'contents' | 'closed'
export type ReportComposerTypeFilter = 'all' | 'reports' | 'dashboards'

export type ReportComposerUrlState = {
  reportId: string | null
  chooser: ReportComposerChooser | null
  contentIds: string[]
  /** Whether the URL explicitly supplied a content selection, including empty. */
  hasContentSelection: boolean
  filter: ReportComposerTypeFilter
  presentation: PresentationPreference
}

export type ReportComposerUrlPatch = Partial<{
  reportId: string | null
  chooser: ReportComposerChooser | null
  contentIds: readonly string[] | null
  filter: ReportComposerTypeFilter
  presentation: PresentationPreference
}>

export type ReportComposerUrlAdapter = {
  searchParams: URLSearchParams
  setSearchParams: (searchParams: URLSearchParams, options?: { replace?: boolean }) => void
}

type ReportComposerUrlContextValue = {
  adapter: ReportComposerUrlAdapter
  namespace: ReportComposerNamespace
}

const ReportComposerUrlContext = createContext<ReportComposerUrlContextValue | null>(null)

/**
 * The host can provide its React Router v6-compatible search-param adapter at
 * the Analytics route boundary. Keeping the adapter narrow means the
 * composer does not need a second router and standalone composer tests can
 * render without any routing provider.
 */
export function ReportComposerUrlProvider({ value, namespace, children }: PropsWithChildren<{ value: ReportComposerUrlAdapter; namespace?: ReportComposerNamespace }>) {
  return <ReportComposerUrlContext.Provider value={{ adapter: value, namespace: normalizeNamespace(namespace) }}>{children}</ReportComposerUrlContext.Provider>
}

const asCsv = (value: readonly string[]) => [...new Set(value.map(item => item.trim()).filter(Boolean))].join(',')

const parseFilter = (value: string | null): ReportComposerTypeFilter =>
  value === 'reports' || value === 'dashboards' ? value : 'all'

const parsePresentation = (value: string | null): PresentationPreference =>
  value === 'chart' || value === 'table' ? value : 'auto'

const parseChooser = (value: string | null): ReportComposerChooser | null =>
  value === 'palette' || value === 'contents' || value === 'closed' ? value : null

export function parseReportComposerUrlState(params: URLSearchParams, namespace = DEFAULT_REPORT_COMPOSER_NAMESPACE): ReportComposerUrlState {
  const keys = reportComposerUrlKeys(namespace)
  const contents = params.get(keys.contents)
  return {
    reportId: params.get(keys.report),
    chooser: parseChooser(params.get(keys.chooser)),
    contentIds: contents ? [...new Set(contents.split(',').map(item => item.trim()).filter(Boolean))] : [],
    hasContentSelection: contents !== null,
    filter: parseFilter(params.get(keys.filter)),
    presentation: parsePresentation(params.get(keys.presentation)),
  }
}

/**
 * Apply only composer-owned changes and preserve every unrelated host query
 * parameter. Defaults are omitted to keep links short and stable.
 */
export function applyReportComposerUrlPatch(params: URLSearchParams, patch: ReportComposerUrlPatch, namespace = DEFAULT_REPORT_COMPOSER_NAMESPACE): URLSearchParams {
  const next = new URLSearchParams(params)
  const keys = reportComposerUrlKeys(namespace)
  if ('reportId' in patch) {
    if (patch.reportId) next.set(keys.report, patch.reportId)
    else next.delete(keys.report)
  }
  if ('chooser' in patch) {
    if (patch.chooser) next.set(keys.chooser, patch.chooser)
    else next.delete(keys.chooser)
  }
  if ('contentIds' in patch) {
    const contentIds = patch.contentIds
    if (contentIds === null) next.delete(keys.contents)
    else {
      const csv = asCsv(contentIds)
      if (csv) next.set(keys.contents, csv)
      else next.set(keys.contents, '')
    }
  }
  if ('filter' in patch) {
    if (patch.filter && patch.filter !== 'all') next.set(keys.filter, patch.filter)
    else next.delete(keys.filter)
  }
  if ('presentation' in patch) {
    if (patch.presentation && patch.presentation !== 'auto') next.set(keys.presentation, patch.presentation)
    else next.delete(keys.presentation)
  }
  return next
}

const currentSearchParams = (): URLSearchParams =>
  typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)

/**
 * Use the supplied adapter when Analytics is mounted under the host router.
 * Without one, this hook provides a small history-backed adapter for isolated
 * composer tests and the standalone Analytics entry.
 */
export function useReportComposerUrlState(adapter?: ReportComposerUrlAdapter, namespace?: ReportComposerNamespace) {
  const context = useContext(ReportComposerUrlContext)
  const [standaloneParams, setStandaloneParams] = useState(currentSearchParams)
  const activeAdapter = adapter ?? context?.adapter
  const activeNamespace = normalizeNamespace(namespace ?? context?.namespace)

  useEffect(() => {
    if (activeAdapter || typeof window === 'undefined') return
    const onPopState = () => setStandaloneParams(currentSearchParams())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [activeAdapter])

  const searchParams = activeAdapter?.searchParams ?? standaloneParams
  const state = useMemo(() => parseReportComposerUrlState(searchParams, activeNamespace), [activeNamespace, searchParams.toString()])
  const setState = useCallback((patch: ReportComposerUrlPatch, options: { replace?: boolean } = {}) => {
    const next = applyReportComposerUrlPatch(activeAdapter?.searchParams ?? currentSearchParams(), patch, activeNamespace)
    if (activeAdapter) {
      activeAdapter.setSearchParams(next, options)
      return
    }
    if (typeof window !== 'undefined') {
      const search = next.toString()
      const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
      window.history[options.replace ? 'replaceState' : 'pushState']({}, '', url)
    }
    setStandaloneParams(next)
  }, [activeAdapter, activeNamespace])

  return { ...state, setState, isRouted: !!activeAdapter, namespace: activeNamespace }
}