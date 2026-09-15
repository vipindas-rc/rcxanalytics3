import { describe, expect, it } from 'vitest'
import {
  applyReportComposerUrlPatch,
  parseReportComposerUrlState,
  REPORT_COMPOSER_URL_KEYS,
} from './useReportComposerUrlState'

describe('ReportComposer URL state', () => {
  it('uses a namespaced contract and never stores the question draft', () => {
    const params = new URLSearchParams('analyticsView=chats')
    const next = applyReportComposerUrlPatch(params, {
      reportId: 'agent-activity-report',
      chooser: 'contents',
      contentIds: ['agent-type-count', 'agent-type-count'],
      presentation: 'chart',
      filter: 'reports',
    })

    expect(next.get(REPORT_COMPOSER_URL_KEYS.report)).toBe('agent-activity-report')
    expect(next.get(REPORT_COMPOSER_URL_KEYS.chooser)).toBe('contents')
    expect(next.get(REPORT_COMPOSER_URL_KEYS.contents)).toBe('agent-type-count')
    expect(next.get(REPORT_COMPOSER_URL_KEYS.presentation)).toBe('chart')
    expect(next.get(REPORT_COMPOSER_URL_KEYS.filter)).toBe('reports')
    expect(next.get('analyticsView')).toBe('chats')
    expect(next.get('analytics.composer.question')).toBeNull()
    expect([...next.keys()].filter(key => key.includes('composer')).every(key => key.startsWith('analytics.composer.'))).toBe(true)
  })

  it('omits default filter and presentation values while preserving unrelated search state', () => {
    const params = new URLSearchParams('tab=analytics')
    const next = applyReportComposerUrlPatch(params, {
      filter: 'all',
      presentation: 'auto',
    })

    expect(next.toString()).toBe('tab=analytics')
  })

  it('represents an explicitly empty multi-selection without falling back to defaults', () => {
    const params = new URLSearchParams('analytics.composer.contents=')
    const state = parseReportComposerUrlState(params)

    expect(state.hasContentSelection).toBe(true)
    expect(state.contentIds).toEqual([])
    expect(state.filter).toBe('all')
    expect(state.presentation).toBe('auto')
  })

  it('normalizes invalid structural values without touching unrelated params', () => {
    const state = parseReportComposerUrlState(new URLSearchParams([
      ['analytics.composer.chooser', 'prompt'],
      ['analytics.composer.filter', 'unknown'],
      ['analytics.composer.presentation', 'sparkline'],
      ['keep', 'this'],
    ]))

    expect(state.chooser).toBeNull()
    expect(state.filter).toBe('all')
    expect(state.presentation).toBe('auto')
  })

  it('isolates primary and Advisor composers under separate namespaces', () => {
    const primary = applyReportComposerUrlPatch(new URLSearchParams(), {
      reportId: 'agent-activity-report',
      chooser: 'contents',
      contentIds: ['agent-type-count'],
      presentation: 'chart',
    })
    const withAdvisor = applyReportComposerUrlPatch(primary, {
      reportId: 'agent-disposition-report',
      chooser: 'palette',
      filter: 'reports',
    }, 'advisor')

    expect(parseReportComposerUrlState(withAdvisor)).toMatchObject({
      reportId: 'agent-activity-report',
      chooser: 'contents',
      contentIds: ['agent-type-count'],
      presentation: 'chart',
    })
    expect(parseReportComposerUrlState(withAdvisor, 'advisor')).toMatchObject({
      reportId: 'agent-disposition-report',
      chooser: 'palette',
      filter: 'reports',
    })

    const clearedPrimary = applyReportComposerUrlPatch(withAdvisor, {
      reportId: null,
      chooser: null,
      contentIds: null,
      presentation: 'auto',
    })
    expect(parseReportComposerUrlState(clearedPrimary, 'advisor').reportId).toBe('agent-disposition-report')
    expect(clearedPrimary.get(REPORT_COMPOSER_URL_KEYS.report)).toBeNull()
    expect(clearedPrimary.get('analytics.advisor.composer.report')).toBe('agent-disposition-report')
  })
})