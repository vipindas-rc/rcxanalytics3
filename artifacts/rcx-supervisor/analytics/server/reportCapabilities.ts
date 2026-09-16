import type { ReportContext } from '../src/lib/model.ts'
import { definitionForPlan, generalAnalysisPlanSchema, type GeneralAnalysisPlan, type GenericDefinition } from './generalPlan.ts'
import { findReportContent, type PresentationPreference, type ReportContentDefinition, type ReportDefinition } from '../src/lib/reportCatalog.ts'

export const OPERATIONAL_REPORT_IDS = new Set(['agent-activity-overview', 'agent-activity', 'agent-activity-report'])
export const FIXTURE_REPORT_IDS = new Set(['agent-activity-overview', 'agent-activity', 'agent-activity-report', 'agent-conduct', 'agent-dispositions', 'agent-scorecard', 'agent-state', 'agent-disposition-report'])

export type ReportExecutionMode = 'operational' | 'fixture' | 'synthetic'
export type ReportCapability = {
  mode: ReportExecutionMode
  reportId: string
  reportVersion: number
  contentIds: string[]
}

export function resolveReportCapability(report: ReportDefinition): ReportCapability {
  const mode: ReportExecutionMode = OPERATIONAL_REPORT_IDS.has(report.id)
    ? 'operational'
    : FIXTURE_REPORT_IDS.has(report.id)
      ? 'fixture'
      : 'synthetic'
  return {
    mode,
    reportId: report.id,
    reportVersion: report.version,
    contentIds: report.contents.map(content => content.id),
  }
}

function presentationForContent(content: ReportContentDefinition, preference: PresentationPreference) {
  if (preference === 'table') return 'table' as const
  if (preference === 'chart') return content.grouping.id === 'period' ? 'line' as const : 'bar' as const
  return content.grouping.id === 'period' ? 'line' as const : 'bar' as const
}

export function planForCatalogContent(question: string, report: ReportDefinition, selectedContentIds: readonly string[] = [], preference: PresentationPreference = 'auto'): { content: ReportContentDefinition; plan: GeneralAnalysisPlan } {
  const [content] = findReportContent(report, selectedContentIds)
  if (!content) throw new Error('The selected report content is unavailable.')
  const plan = generalAnalysisPlanSchema.parse({
    originalQuestion: question,
    entity: { id: content.grouping.id, name: content.grouping.name, grain: 'daily synthetic record' },
    metric: content.metric,
    grouping: { ...content.grouping, values: [...content.grouping.values] },
    cohorts: content.grouping.id === 'agentType' ? [...content.grouping.values] : [],
    time: { kind: 'period', requestedNow: false },
    presentation: presentationForContent(content, preference),
    assumptions: [`${content.label} is a documented ${report.title} content represented by persisted synthetic records.`],
  })
  return { content, plan }
}

export function definitionForCatalogContent(question: string, report: ReportDefinition, selectedContentIds: readonly string[] = [], preference: PresentationPreference = 'auto'): { content: ReportContentDefinition; plan: GeneralAnalysisPlan; definition: GenericDefinition } {
  const selection = planForCatalogContent(question, report, selectedContentIds, preference)
  return {
    ...selection,
    definition: { ...definitionForPlan(selection.plan, report.title), version: 'catalog-v2' },
  }
}

export function reportContextCapability(report: ReportContext): ReportExecutionMode {
  if (OPERATIONAL_REPORT_IDS.has(report.reportId)) return 'operational'
  if (FIXTURE_REPORT_IDS.has(report.reportId)) return 'fixture'
  return 'synthetic'
}