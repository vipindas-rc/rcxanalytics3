import { describe, expect, it } from 'vitest'
import { filterReportsByType, parseSlashReportInput, reportOptionMeta, resolvePastedReportInput, selectedContentsQuestion } from './ReportComposer'

const reports = [
  { id: 'agent-activity', title: 'Agent Activity', type: 'report' as const },
  { id: 'agent-activity-overview', title: 'Agent Activity Overview', type: 'report' as const },
  { id: 'agent-disposition', title: 'Agent Disposition', type: 'report' as const },
]

describe('slash report input', () => {
  it('only opens the picker for a slash at the leading trimmed position', () => {
    expect(parseSlashReportInput(' /agent ')).toEqual({ isSlashCommand: true, query: 'agent' })
    expect(parseSlashReportInput('Compare /agent activity')).toEqual({ isSlashCommand: false, query: '' })
  })

  it('keeps a bare slash as an empty search query', () => {
    expect(parseSlashReportInput(' /  ')).toEqual({ isSlashCommand: true, query: '' })
  })

  it('resolves the longest exact pasted title and preserves its question suffix', () => {
    expect(resolvePastedReportInput('/agent activity overview how many agents are AI agents?', reports)).toEqual({
      report: reports[1],
      question: 'how many agents are AI agents?',
    })
  })

  it('does not resolve a partial or mid-sentence slash phrase', () => {
    expect(resolvePastedReportInput('/agent activity how many?', reports)).toEqual({ report: reports[0], question: 'how many?' })
    expect(resolvePastedReportInput('Compare /agent activity', reports)).toBeNull()
  })

  it('does not promise report availability in the slash picker', () => {
    expect(reportOptionMeta({ ...reports[0], type: 'report' } as never)).toBe('report')
  })

  it('uses stable selected content identifiers to create the execution request', () => {
    expect(selectedContentsQuestion({ title: 'Contact Center Activity Overview', contents: [{ id: 'queue-abandonment-rate', label: 'Queue abandonment rate' }] } as never, ['queue-abandonment-rate'], 'chart')).toBe('Show Queue abandonment rate as a chart.')
  })

  it('filters a catalog result set by reports and dashboards without changing its source order', () => {
    const catalog = [...reports, { id: 'overview', title: 'Overview', type: 'dashboard' as const }]
    expect(filterReportsByType(catalog, 'reports').map(report => report.id)).toEqual(['agent-activity', 'agent-activity-overview', 'agent-disposition'])
    expect(filterReportsByType(catalog, 'dashboards').map(report => report.id)).toEqual(['overview'])
  })
})
