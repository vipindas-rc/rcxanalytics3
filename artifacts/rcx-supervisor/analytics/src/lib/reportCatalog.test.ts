import { describe, expect, it } from 'vitest'
import { REPORT_CATALOG, catalogCoverageManifest, findReport, searchReports } from './reportCatalog'

describe('report catalog', () => {
  it('includes every verified dashboard and preserves the separately selectable agent disposition report', () => {
    expect(REPORT_CATALOG.filter(report => report.type === 'dashboard')).toHaveLength(23)
    expect(REPORT_CATALOG.find(report => report.id === 'agent-activity-overview')).toMatchObject({ title: 'Agent Activity Overview', type: 'dashboard', availability: 'supported', version: 1 })
    expect(REPORT_CATALOG.find(report => report.id === 'agent-disposition-report')).toMatchObject({ title: 'Agent Disposition Overview', type: 'report', availability: 'supported' })
  })

  it('returns an alphabetical catalog for an empty query', () => {
    const names = searchReports('').map(report => report.title)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('ranks exact titles before prefixes, ordered title-word matches, then aliases', () => {
    expect(searchReports('agent activity').slice(0, 3).map(report => report.id)).toEqual(['agent-activity-report', 'agent-activity', 'agent-activity-overview'])
    expect(searchReports('inbound overview')[0]).toMatchObject({ id: 'inbound-interactions-overview', title: 'Inbound Interactions Overview' })
    expect(searchReports('unified analytics')[0]).toMatchObject({ id: 'customer-journey-analytics' })
  })

  it('keeps matching deterministic across casing and extra whitespace', () => {
    expect(searchReports('  AGENT   STATE ').map(report => report.id)).toEqual(searchReports('agent state').map(report => report.id))
    expect(searchReports('made up report')).toEqual([])
  })

  it('searches catalog categories and content labels, and tolerates a repeated controlled-input phrase', () => {
    expect(searchReports('outbound')[0]).toMatchObject({ category: 'Outbound' })
    expect(searchReports('queue abandonment rate')[0]).toMatchObject({ id: 'contact-center-activity-overview' })
    expect(searchReports('contact center /contact center')[0]).toMatchObject({ id: 'contact-center-activity-overview' })
  })

  it('discovers supplied API, disposition, and inbound reports as preview-only catalog entries', () => {
    expect(searchReports('wfm aggregated queue stats')[0]).toMatchObject({ title: 'WFM Aggregated Queue Stats (API Validation)', category: 'API', type: 'report', availability: 'preview' })
    expect(searchReports('pending disposition time per agent')[0]).toMatchObject({ title: 'Pending Disposition Time per Agent', category: 'Dispositions', availability: 'preview' })
    expect(searchReports('queue abandon rate day trend')[0]).toMatchObject({ title: 'Queue Abandon Rate % Day Trend', category: 'Inbound', availability: 'preview' })
  })

  it('makes documented interactions, outbound, and workflow reports discoverable', () => {
    expect(searchReports('interaction lifecycle')[0]).toMatchObject({ category: 'Interactions', type: 'report' })
    expect(searchReports('outbound success rate by campaign')[0]).toMatchObject({ category: 'Outbound', type: 'report' })
    expect(searchReports('workflow overview')[0]).toMatchObject({ category: 'Workflow', type: 'report' })
  })

  it('exposes source-backed selectable contents for dashboards and reports', () => {
    expect(findReport('contact-center-activity-overview')?.contents.map(content => content.id)).toContain('queue-abandonment-rate')
    expect(findReport('contact-center-activity-overview')?.contents.find(content => content.id === 'queue-abandonment-rate')).toMatchObject({ defaultSelected: true, presentation: ['auto', 'chart', 'table'] })
    expect(findReport('report-interaction-lifecycle')?.contents.length).toBeGreaterThan(0)
  })

  it('reports imported coverage without pretending that every documented report is named', () => {
    const coverage = catalogCoverageManifest()
    expect(coverage.documentedReports).toBe(199)
    expect(coverage.importedReports).toBeLessThanOrEqual(coverage.documentedReports)
    expect(coverage.unresolvedReportCount).toBe(coverage.documentedReports - coverage.importedReports)
  })
})
