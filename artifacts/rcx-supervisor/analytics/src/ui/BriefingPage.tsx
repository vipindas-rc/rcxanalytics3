import type { ReactNode } from 'react'
import { Button, Tag, Text } from '@ringcentral/spring-ui'
import type { BriefingScenario, BriefingSnapshot } from '../lib/model'

const sectionDescriptions = {
  'Needs attention': 'Signals that call for a supervisor response today.',
  'Team & capacity': 'Workload, availability, and campaign health across the team.',
  'AI & customer outcomes': 'Customer friction and synthetic AI quality indicators.',
  'Chart examples': 'Examples of the chart forms available for synthetic analysis.',
}

const severityLabel = (severity: 'critical' | 'warning' | 'watch' | 'healthy') => severity === 'critical' ? 'Needs attention' : severity === 'healthy' ? 'On track' : 'Watch'
const severityColor = (severity: 'critical' | 'warning' | 'watch' | 'healthy') => severity === 'healthy' ? 'success' : 'warning'

export function BriefingPage({ snapshot, scenario, onScenario, renderChart, renderAdvisor }: {
  snapshot?: BriefingSnapshot
  scenario: BriefingScenario
  onScenario: (scenario: BriefingScenario) => void
  renderChart: (artifactId: string) => ReactNode
  renderAdvisor: (artifactId: string) => ReactNode
}) {
  if (!snapshot) return <div className="briefing-empty"><Text>Preparing the local supervisor briefing…</Text></div>
  return <div className="briefing-scroll bg-[#ffffff80]"><div className="briefing-content bg-[#ffffff]">
    <header className="briefing-header">
      <div><Text className="eyebrow">AI suggestions</Text><Text component="h2">{snapshot.title}</Text><Text component="p">{snapshot.reportingWindow}. {snapshot.comparisonWindow}.</Text></div>
      <div className="scenario-control" role="group" aria-label="Briefing scenario">
        <Button color="neutral" size="small" variant={scenario === 'morning' ? 'outlined' : 'text'} className="bg-[#c9c9c92b] font-semibold" aria-pressed={scenario === 'morning'} onClick={() => onScenario('morning')}>Morning</Button>
        <Button color="neutral" size="small" variant={scenario === 'midday' ? 'outlined' : 'text'} aria-pressed={scenario === 'midday'} onClick={() => onScenario('midday')}>Midday</Button>
      </div>
    </header>
    <section className="briefing-summary" aria-label="Top findings"><Text className="section-label">Top findings</Text>{snapshot.widgets.filter(widget => widget.severity === 'critical').slice(0, 3).map(widget => <article className={`briefing-kpi severity-${widget.severity}`} key={widget.id}>
      <div className="briefing-kpi-header"><Text className="briefing-kpi-entity">{widget.entity ?? widget.finding}</Text><Tag color={severityColor(widget.severity)} variant="inverted">{severityLabel(widget.severity)}</Tag></div>
      <Text className="briefing-kpi-title">{widget.metricTitle ?? 'Metric'}</Text>
      <Text className="briefing-kpi-value">{widget.value}</Text>
      <Text className="briefing-kpi-change">{widget.comparison}</Text>
    </article>)}</section>
    {(['Needs attention', 'Team & capacity', 'AI & customer outcomes', 'Chart examples'] as const).map(section => <section className="briefing-section" key={section}>
      <header><Text component="h3">{section}</Text><Text component="p">{sectionDescriptions[section]}</Text></header>
      <div className="briefing-grid">{snapshot.widgets.filter(widget => widget.section === section).map(widget => <article id={`briefing-widget-${widget.id}`} tabIndex={-1} className={`briefing-widget severity-${widget.severity} rounded-tl-[12px] rounded-tr-[12px] rounded-br-[12px] rounded-bl-[12px] ${widget.priority ? 'briefing-widget-priority' : ''}`} key={widget.id}>
        <div className="briefing-widget-advisor">{renderAdvisor(widget.artifactId)}</div><div className="briefing-widget-copy"><div className="briefing-metric-heading"><div><Text className={`severity-pill ${widget.severity}`}>{widget.severity}</Text><Text component="h4">{widget.metricTitle ?? 'Metric'}</Text><Text className="briefing-entity">{widget.entity ?? widget.finding}</Text></div><div><Text className="briefing-value">{widget.value}</Text><Text className="briefing-comparison">{widget.comparison}</Text></div></div><Text component="p">{widget.finding}. {widget.explanation}</Text></div>
        {renderChart(widget.artifactId)}
      </article>)}</div>
    </section>)}
  </div></div>
}
