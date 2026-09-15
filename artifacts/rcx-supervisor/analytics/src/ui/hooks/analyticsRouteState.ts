import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'

/**
 * Analytics URL contract.  Keep these names out of the Supervisor URL
 * namespace: the host owns `modal`, `tab`, and its unprefixed filter keys.
 *
 * Composer: analytics.composer.report, analytics.composer.chooser,
 *           analytics.composer.contents, analytics.composer.filter,
 *           analytics.composer.presentation
 * Advisor composer: analytics.advisor.composer.* (same leaf names, isolated
 *                   from the main composer so both can retain a selection)
 * Chart cards: analyticsArtifact, analyticsInspector, analyticsExpanded,
 *              analyticsRenderer, analyticsFilters, analyticsPage
 * App overlays: analyticsDialog, analyticsTarget, analyticsAdvisorArtifact,
 *               analyticsAdvisorReport
 */
export const ANALYTICS_ROUTE_VIEWS = ['chats', 'briefing', 'projects', 'saved', 'dashboards'] as const
export type AnalyticsRouteView = (typeof ANALYTICS_ROUTE_VIEWS)[number]
export type AnalyticsRoute = {
  view: AnalyticsRouteView
  sessionId: string | null
  projectId: string | null
  dashboardId: string | null
  /** A malformed Analytics descendant is recoverable rather than a host 404. */
  invalidPath: boolean
}
export type AnalyticsRoutePatch = Partial<Pick<AnalyticsRoute, 'view' | 'sessionId' | 'projectId' | 'dashboardId'>>
export type AnalyticsNavigateOptions = { replace?: boolean }
export type AnalyticsRouteAdapter = {
  pathname: string
  search: string
  /** Supplied by the host's React Router v6 useNavigate boundary. */
  navigate: (href: string, options?: AnalyticsNavigateOptions) => void
}

export const AnalyticsRouteContext = createContext<AnalyticsRouteAdapter | null>(null)
export function AnalyticsRouteProvider({ value, children }: PropsWithChildren<{ value: AnalyticsRouteAdapter }>) {
  return createElement(AnalyticsRouteContext.Provider, { value }, children)
}

const LEGACY_KEYS = ['analyticsView', 'analyticsSession', 'analyticsProject', 'analyticsDashboard'] as const
const COMPOSER_PARAM_PREFIX = 'analytics.composer.'
const COMPOSER_DRAFT_STORAGE_KEY = 'rcx.analytics.composer-drafts.v1'
const validId = (value: string | null): string | null => value && value.length <= 256 && !/[\u0000-\u001f]/.test(value) ? value : null
const decodeId = (value: string): string | null => {
  try { return validId(decodeURIComponent(value)) } catch { return null }
}
const viewFromLegacy = (value: string | null): AnalyticsRouteView => (
  ANALYTICS_ROUTE_VIEWS.includes(value as AnalyticsRouteView) ? value as AnalyticsRouteView : 'chats'
)

export function parseAnalyticsRoute(pathname: string, search = ''): AnalyticsRoute {
  const path = pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(search)
  const legacy = LEGACY_KEYS.some(key => params.has(key))
  const fromLegacy = {
    view: viewFromLegacy(params.get('analyticsView')),
    sessionId: validId(params.get('analyticsSession')),
    projectId: validId(params.get('analyticsProject')),
    dashboardId: validId(params.get('analyticsDashboard')),
  }
  if (legacy) return { ...fromLegacy, invalidPath: false }
  if (path === '/' || path === '/analytics' || path === '/analytics/index.html') return { view: 'chats', sessionId: null, projectId: null, dashboardId: null, invalidPath: false }
  const conversation = /^\/analytics\/conversations\/([^/]+)$/.exec(path)
  if (conversation) { const sessionId = decodeId(conversation[1]); return { view: 'chats', sessionId, projectId: null, dashboardId: null, invalidPath: !sessionId } }
  if (path === '/analytics/briefing') return { view: 'briefing', sessionId: null, projectId: null, dashboardId: null, invalidPath: false }
  if (path === '/analytics/projects') return { view: 'projects', sessionId: null, projectId: null, dashboardId: null, invalidPath: false }
  const project = /^\/analytics\/projects\/([^/]+)$/.exec(path)
  if (project) { const projectId = decodeId(project[1]); return { view: 'projects', sessionId: null, projectId, dashboardId: null, invalidPath: !projectId } }
  if (path === '/analytics/saved') return { view: 'saved', sessionId: null, projectId: null, dashboardId: null, invalidPath: false }
  if (path === '/analytics/dashboards') return { view: 'dashboards', sessionId: null, projectId: null, dashboardId: null, invalidPath: false }
  const dashboard = /^\/analytics\/dashboards\/([^/]+)$/.exec(path)
  if (dashboard) { const dashboardId = decodeId(dashboard[1]); return { view: 'dashboards', sessionId: null, projectId: null, dashboardId, invalidPath: !dashboardId } }
  return { view: 'chats', sessionId: null, projectId: null, dashboardId: null, invalidPath: true }
}

export function analyticsPathFor(route: Omit<AnalyticsRoute, 'invalidPath'>): string {
  if (route.view === 'briefing') return '/analytics/briefing'
  if (route.view === 'projects') return route.projectId ? `/analytics/projects/${encodeURIComponent(route.projectId)}` : '/analytics/projects'
  if (route.view === 'saved') return '/analytics/saved'
  if (route.view === 'dashboards') return route.dashboardId ? `/analytics/dashboards/${encodeURIComponent(route.dashboardId)}` : '/analytics/dashboards'
  return route.sessionId ? `/analytics/conversations/${encodeURIComponent(route.sessionId)}` : '/analytics'
}

/** Removes only legacy Analytics compatibility keys, preserving host and feature state. */
export function normalizeAnalyticsSearch(search: string): string {
  const params = new URLSearchParams(search)
  LEGACY_KEYS.forEach(key => params.delete(key))
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function analyticsHref(route: Omit<AnalyticsRoute, 'invalidPath'>, search = ''): string {
  return `${analyticsPathFor(route)}${normalizeAnalyticsSearch(search)}`
}

/** A composer draft belongs to a conversation, the fresh-chat surface, or a dashboard. */
export function analyticsComposerContextKey(route: Omit<AnalyticsRoute, 'invalidPath'>): string | null {
  if (route.view === 'chats') return `conversation:${route.sessionId ?? 'new'}`
  if (route.view === 'dashboards') return `dashboard:${route.dashboardId ?? 'new'}`
  return null
}

/** Copies only Composer-owned state; question text is intentionally never URL state. */
export function composerParamsFromSearch(search: string | URLSearchParams): URLSearchParams {
  const source = typeof search === 'string' ? new URLSearchParams(search) : search
  const composer = new URLSearchParams()
  source.forEach((value, key) => {
    if (key.startsWith(COMPOSER_PARAM_PREFIX)) composer.set(key, value)
  })
  return composer
}

/** Replaces only Composer-owned params while preserving host and feature namespaces. */
export function applyComposerParams(search: string | URLSearchParams, composer: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search)
  for (const key of Array.from(next.keys())) {
    if (key.startsWith(COMPOSER_PARAM_PREFIX)) next.delete(key)
  }
  composer.forEach((value, key) => next.set(key, value))
  return next
}

export type AnalyticsComposerDrafts = Record<string, string>

export function saveComposerDraft(drafts: AnalyticsComposerDrafts, context: string | null, search: string | URLSearchParams): AnalyticsComposerDrafts {
  if (!context) return drafts
  const composer = composerParamsFromSearch(search).toString()
  const next = { ...drafts }
  if (composer) next[context] = composer
  else delete next[context]
  return next
}

export function restoreComposerDraft(search: string | URLSearchParams, drafts: AnalyticsComposerDrafts, context: string | null): URLSearchParams {
  // An explicit current URL is a deep link and always wins over a remembered
  // local selection. Callers clearing a departing context do so first.
  if (composerParamsFromSearch(search).size) return new URLSearchParams(search)
  return context && drafts[context] ? applyComposerParams(search, new URLSearchParams(drafts[context])) : new URLSearchParams(search)
}

const ROUTE_CHANGE_EVENT = 'analytics-route-change'
const browserHref = () => `${window.location.pathname}${window.location.search}`
const subscribeToBrowserLocation = (onChange: () => void) => {
  window.addEventListener('popstate', onChange)
  window.addEventListener(ROUTE_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(ROUTE_CHANGE_EVENT, onChange)
  }
}

/**
 * The native host supplies a React Router v6 adapter through
 * AnalyticsRouteProvider. The browser fallback keeps the standalone source
 * screen usable during migration, but dispatches its own event and never
 * installs a second router.
 */
export function useAnalyticsRouteState(adapter?: AnalyticsRouteAdapter) {
  const contextAdapter = useContext(AnalyticsRouteContext)
  const hostAdapter = adapter ?? contextAdapter
  const [fallbackHref, setFallbackHref] = useState(() => typeof window === 'undefined' ? '/analytics' : browserHref())
  useEffect(() => {
    if (hostAdapter) return
    return subscribeToBrowserLocation(() => setFallbackHref(browserHref()))
  }, [hostAdapter])
  const fallbackLocation = useMemo(() => {
    const queryAt = fallbackHref.indexOf('?')
    return queryAt < 0 ? { pathname: fallbackHref, search: '' } : { pathname: fallbackHref.slice(0, queryAt), search: fallbackHref.slice(queryAt) }
  }, [fallbackHref])
  const location = hostAdapter ?? fallbackLocation
  const navigate = useCallback((href: string, options: AnalyticsNavigateOptions = {}) => {
    if (href === `${window.location.pathname}${window.location.search}`) return
    if (hostAdapter) {
      hostAdapter.navigate(href, options)
      return
    }
    window.history[options.replace ? 'replaceState' : 'pushState'](window.history.state, '', href)
    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT))
  }, [hostAdapter])
  const route = useMemo(() => parseAnalyticsRoute(location.pathname, location.search), [location.pathname, location.search])
  const canonical = useMemo(() => analyticsHref(route, location.search), [route, location.search])
  const composerDrafts = useRef<AnalyticsComposerDrafts>(typeof window === 'undefined' ? {} : (() => {
    try {
      const stored = window.sessionStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY)
      const parsed: unknown = stored ? JSON.parse(stored) : {}
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as AnalyticsComposerDrafts : {}
    } catch {
      return {}
    }
  })())
  const persistComposerDrafts = useCallback((next: AnalyticsComposerDrafts) => {
    composerDrafts.current = next
    try { window.sessionStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, JSON.stringify(next)) } catch { /* storage is optional */ }
  }, [])

  // Existing iframe links are normalized once, with replacement history.  A
  // bad Analytics descendant also lands on the recoverable Analytics root.
  useEffect(() => {
    if (route.invalidPath) return
    const current = `${location.pathname}${location.search}`
    if (current !== canonical) navigate(canonical, { replace: true })
  }, [canonical, location.pathname, location.search, navigate, route.invalidPath])

  const setRoute = useCallback((patch: AnalyticsRoutePatch, options: AnalyticsNavigateOptions = {}) => {
    // Read the browser location at write time. This keeps adjacent App state
    // updates from clobbering a namespaced composer/chart param written in the
    // same interaction.
    const current = parseAnalyticsRoute(window.location.pathname, window.location.search)
    const next: Omit<AnalyticsRoute, 'invalidPath'> = {
      view: patch.view ?? current.view,
      sessionId: patch.sessionId === undefined ? current.sessionId : validId(patch.sessionId),
      projectId: patch.projectId === undefined ? current.projectId : validId(patch.projectId),
      dashboardId: patch.dashboardId === undefined ? current.dashboardId : validId(patch.dashboardId),
    }
    let nextSearch = new URLSearchParams(window.location.search)
    if (current.view !== next.view || current.sessionId !== next.sessionId || current.projectId !== next.projectId || current.dashboardId !== next.dashboardId) {
      persistComposerDrafts(saveComposerDraft(composerDrafts.current, analyticsComposerContextKey(current), nextSearch))
      nextSearch = restoreComposerDraft(
        applyComposerParams(nextSearch, new URLSearchParams()),
        composerDrafts.current,
        analyticsComposerContextKey(next),
      )
    }
    navigate(analyticsHref(next, nextSearch.toString()), { replace: options.replace })
  }, [navigate, persistComposerDrafts])

  const updateSearch = useCallback((update: (params: URLSearchParams) => void, options: AnalyticsNavigateOptions = {}) => {
    const current = parseAnalyticsRoute(window.location.pathname, window.location.search)
    const params = new URLSearchParams(normalizeAnalyticsSearch(window.location.search))
    update(params)
    persistComposerDrafts(saveComposerDraft(composerDrafts.current, analyticsComposerContextKey(current), params))
    const search = params.toString()
    navigate(`${analyticsPathFor(current)}${search ? `?${search}` : ''}`, { replace: options.replace })
  }, [navigate, persistComposerDrafts])

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const setSearchParams = useCallback((params: URLSearchParams, options: AnalyticsNavigateOptions = {}) => {
    const current = parseAnalyticsRoute(window.location.pathname, window.location.search)
    persistComposerDrafts(saveComposerDraft(composerDrafts.current, analyticsComposerContextKey(current), params))
    const search = params.toString()
    navigate(`${analyticsPathFor(current)}${search ? `?${search}` : ''}`, { replace: options.replace })
  }, [navigate, persistComposerDrafts])
  const navigateSearch = useCallback((search: string, options: AnalyticsNavigateOptions = {}) => {
    const current = parseAnalyticsRoute(window.location.pathname, window.location.search)
    navigate(`${analyticsPathFor(current)}${search}`, { replace: options.replace })
  }, [navigate])

  return { route, setRoute, updateSearch, search: location.search, searchParams, setSearchParams, navigateSearch }
}