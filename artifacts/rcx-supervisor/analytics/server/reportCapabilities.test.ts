import { describe, expect, it } from 'vitest'
import { REPORT_CATALOG, findReport } from '../src/lib/reportCatalog.ts'
import { definitionForCatalogContent, resolveReportCapability } from './reportCapabilities.ts'

describe('report capability contracts', () => {
  it('gives every catalog content a valid typed synthetic definition', () => {
    for (const report of REPORT_CATALOG) {
      const capability = resolveReportCapability(report)
      expect(capability.contentIds, report.title).toEqual(report.contents.map(content => content.id))
      for (const content of report.contents) {
        const selected = definitionForCatalogContent(`Show ${content.label}.`, report, [content.id], 'chart')
        const ids = [...selected.definition.dimensions, ...selected.definition.measures].map(field => field.id)
        expect(new Set(ids).size, `${report.title} / ${content.label}`).toBe(ids.length)
        expect(selected.definition.dimensions.map(field => field.id)).toContain(selected.plan.grouping.id)
        expect(selected.definition.measures.map(field => field.id)).toContain(selected.plan.metric.id)
        expect(selected.plan.metric.id).not.toBe(selected.plan.grouping.id)
      }
    }
  })

  it('keeps acceptance rate content aligned with the report title', () => {
    const report = findReport('report-acceptance-rate-per-agent')
    expect(report).toBeDefined()
    const content = report!.contents[0]
    expect(content).toMatchObject({
      metric: { id: 'acceptanceRate', unit: 'percent', aggregation: 'mean' },
      grouping: { id: 'agent', name: 'Agent' },
    })
    expect(content.label.toLowerCase()).toContain('acceptance rate')
  })
})