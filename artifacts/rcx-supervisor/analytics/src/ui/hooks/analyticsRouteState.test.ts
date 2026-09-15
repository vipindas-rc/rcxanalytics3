import { describe, expect, it } from 'vitest'
import {
  analyticsComposerContextKey,
  analyticsHref,
  analyticsPathFor,
  applyComposerParams,
  composerParamsFromSearch,
  normalizeAnalyticsSearch,
  parseAnalyticsRoute,
  restoreComposerDraft,
  saveComposerDraft,
} from './analyticsRouteState'

describe('Analytics route compatibility', () => {
  it('accepts standalone home without changing the native canonical home', () => {
    expect(parseAnalyticsRoute('/')).toEqual(parseAnalyticsRoute('/analytics'))
    expect(parseAnalyticsRoute('/').invalidPath).toBe(false)
    expect(analyticsPathFor(parseAnalyticsRoute('/'))).toBe('/analytics')
  })
  it('normalizes legacy iframe query links without dropping unrelated host state', () => {
    const route = parseAnalyticsRoute('/analytics', '?tab=queue&analyticsView=dashboards&analyticsDashboard=db-7')
    expect(route).toMatchObject({ view: 'dashboards', dashboardId: 'db-7', invalidPath: false })
    expect(analyticsHref(route, '?tab=queue&analyticsView=dashboards&analyticsDashboard=db-7')).toBe('/analytics/dashboards/db-7?tab=queue')
  })

  it('maps every native view to a stable deep link', () => {
    expect(analyticsPathFor({ view: 'chats', sessionId: 's 1', projectId: null, dashboardId: null })).toBe('/analytics/conversations/s%201')
    expect(parseAnalyticsRoute('/analytics/projects/project-1')).toMatchObject({ view: 'projects', projectId: 'project-1' })
    expect(parseAnalyticsRoute('/analytics/saved')).toMatchObject({ view: 'saved' })
    expect(parseAnalyticsRoute('/analytics/briefing')).toMatchObject({ view: 'briefing' })
  })

  it('removes only the obsolete Analytics keys and marks invalid descendants recoverable', () => {
    expect(normalizeAnalyticsSearch('?analyticsSession=s&modal=agent-state&agentId=a')).toBe('?modal=agent-state&agentId=a')
    expect(parseAnalyticsRoute('/analytics/not-a-real-view')).toMatchObject({ view: 'chats', invalidPath: true })
    expect(parseAnalyticsRoute('/analytics/conversations/%E0%A4%A')).toMatchObject({ view: 'chats', sessionId: null, invalidPath: true })
  })

  it('isolates only composer selections by conversation and preserves other URL state', () => {
    const one = parseAnalyticsRoute('/analytics/conversations/one')
    const two = parseAnalyticsRoute('/analytics/conversations/two')
    let drafts = saveComposerDraft({}, analyticsComposerContextKey(one), '?tab=queue&analytics.composer.report=report-one&analytics.composer.contents=a,b&analytics.composer.presentation=table')
    drafts = saveComposerDraft(drafts, analyticsComposerContextKey(two), '?analytics.composer.report=report-two')

    const restoredOne = restoreComposerDraft('?tab=queue&analyticsArtifact=chart-1', drafts, analyticsComposerContextKey(one))
    expect(restoredOne.toString()).toBe('tab=queue&analyticsArtifact=chart-1&analytics.composer.report=report-one&analytics.composer.contents=a%2Cb&analytics.composer.presentation=table')
    expect(restoreComposerDraft('?analytics.composer.report=deep-link', drafts, analyticsComposerContextKey(two)).toString()).toBe('analytics.composer.report=deep-link')
    expect(composerParamsFromSearch(restoredOne).toString()).toContain('analytics.composer.report=report-one')
    expect(applyComposerParams('?analytics.composer.report=old&modal=keep', new URLSearchParams()).toString()).toBe('modal=keep')
  })
})