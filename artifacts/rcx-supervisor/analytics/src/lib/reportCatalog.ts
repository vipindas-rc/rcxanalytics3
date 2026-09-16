import { catalogSourceUrl } from './curatedQuestions.js'

export type ReportDefinition = {
  id: string
  version: number
  title: string
  type: 'dashboard' | 'report'
  category: string
  description: string
  sourceUrl: string
  availability: 'supported' | 'preview'
  aliases?: string[]
  fixtureId?: string
  /** Local, versioned report contents. These are deliberately independent of
   * the live catalog page so choosing a report never needs a network call. */
  contents: readonly ReportContentDefinition[]
  sourceStatus: 'source-confirmed' | 'synthetic-approximation'
}

export type PresentationPreference = 'auto' | 'chart' | 'table'
export type ReportContentDefinition = {
  id: string
  label: string
  description: string
  metric: { id: string; name: string; unit: 'items' | 'percent' | 'minutes' | 'hours' | 'score' | 'currency'; aggregation: 'sum' | 'mean' | 'count' | 'ratio' }
  grouping: { id: string; name: string; values: readonly string[] }
  defaultSelected?: boolean
  presentation: readonly PresentationPreference[]
}

export type CatalogCoverageManifest = { documentedReports: number; importedReports: number; unresolvedReportCount: number; dashboards: number; categories: Record<string, number> }

export const REPORT_CATALOG_SOURCE_URL = catalogSourceUrl

const valuesFor = (grouping: string): readonly string[] => grouping === 'queue'
  ? ['Sales', 'Billing', 'Account Services', 'Returns', 'Technical Support']
  : grouping === 'channel' ? ['Voice', 'Digital', 'Chat', 'Email']
  : grouping === 'campaign' ? ['Renewal Outreach', 'Lead Follow-up', 'Billing Education', 'Customer Onboarding']
  : grouping === 'workflow' ? ['Lead Follow-up', 'Billing Inquiry', 'Account Verification', 'Returns Intake']
  : grouping === 'agentType' ? ['AI', 'Human']
  : ['Week 1', 'Week 2', 'Week 3', 'Week 4']

const content = (id: string, label: string, metric: ReportContentDefinition['metric'], grouping: string, groupingName: string, defaultSelected = false): ReportContentDefinition => ({
  id, label, description: `${label} grouped by ${groupingName.toLowerCase()}.`, metric,
  grouping: { id: grouping, name: groupingName, values: valuesFor(grouping) }, defaultSelected,
  presentation: ['auto', 'chart', 'table'],
})

const commonContents = (category: string, title: string, type: ReportDefinition['type']): readonly ReportContentDefinition[] => {
  if (title === 'Contact Center Activity Overview') return [
    content('queue-abandonment-rate', 'Queue abandonment rate', { id: 'abandonmentRate', name: 'Abandonment rate', unit: 'percent', aggregation: 'ratio' }, 'queue', 'Queue', true),
    content('handled-vs-abandoned', 'Handled versus abandoned interactions', { id: 'count', name: 'Interactions', unit: 'items', aggregation: 'sum' }, 'queue', 'Queue'),
    content('handling-minutes', 'Handling minutes by queue', { id: 'handlingMinutes', name: 'Handling minutes', unit: 'minutes', aggregation: 'sum' }, 'queue', 'Queue'),
    content('speed-of-answer', 'Speed of answer by queue', { id: 'waitMinutes', name: 'Speed of answer', unit: 'minutes', aggregation: 'mean' }, 'queue', 'Queue'),
    content('service-level', 'Service level by queue', { id: 'serviceLevel', name: 'Service level', unit: 'percent', aggregation: 'mean' }, 'queue', 'Queue'),
  ]
  if (/workflow|ivr/i.test(`${category} ${title}`)) return [content('workflow-volume', 'Workflow interaction volume', { id: 'count', name: 'Interaction volume', unit: 'items', aggregation: 'sum' }, 'workflow', 'Workflow', true), content('workflow-trend', 'Workflow volume trend', { id: 'count', name: 'Interaction volume', unit: 'items', aggregation: 'sum' }, 'period', 'Period')]
  if (/outbound|dialer|campaign/i.test(`${category} ${title}`)) return [content('campaign-volume', 'Campaign interaction volume', { id: 'count', name: 'Interactions', unit: 'items', aggregation: 'sum' }, 'campaign', 'Campaign', true), content('campaign-rate', 'Campaign success rate', { id: 'rate', name: 'Success rate', unit: 'percent', aggregation: 'mean' }, 'campaign', 'Campaign')]
  if (/agent/i.test(`${category} ${title}`)) return [content('agent-type-count', 'Active agents by type', { id: 'count', name: 'Active agents', unit: 'items', aggregation: 'count' }, 'agentType', 'Agent type', true), content('agent-handling-minutes', 'Handling minutes by agent type', { id: 'handlingMinutes', name: 'Handling minutes', unit: 'minutes', aggregation: 'sum' }, 'agentType', 'Agent type')]
  if (/inbound|interactions|queue|omnichannel/i.test(`${category} ${title}`)) return [content('channel-volume', 'Interaction volume by channel', { id: 'count', name: 'Interactions', unit: 'items', aggregation: 'sum' }, 'channel', 'Channel', true), content('queue-rate', 'Rate by queue', { id: 'rate', name: 'Rate', unit: 'percent', aggregation: 'mean' }, 'queue', 'Queue'), content('period-trend', 'Interaction trend', { id: 'count', name: 'Interactions', unit: 'items', aggregation: 'sum' }, 'period', 'Period')]
  return [content('overview-count', type === 'dashboard' ? 'Overview volume' : `${title} volume`, { id: 'count', name: 'Count', unit: 'items', aggregation: 'sum' }, 'period', 'Period', true)]
}

const definition = (id: string, title: string, type: ReportDefinition['type'], category: string, aliases?: string[]): ReportDefinition => ({
  id,
  version: 1,
  title,
  type,
  category,
  description: `Catalog preview for ${title}.`,
  sourceUrl: REPORT_CATALOG_SOURCE_URL,
  availability: 'preview',
  contents: commonContents(category, title, type),
  sourceStatus: 'source-confirmed',
  ...(aliases?.length ? { aliases } : {}),
})

const supported = (id: string, title: string, type: ReportDefinition['type'], category: string): ReportDefinition => ({
  ...definition(id, title, type, category),
  availability: 'supported',
  fixtureId: 'agent-reports-v1',
  description: `${title} uses a clearly labeled fourteen-day synthetic agent fixture.`,
})

const dashboards: ReportDefinition[] = [
  definition('contact-center-activity-overview', 'Contact Center Activity Overview', 'dashboard', 'Contact Center'),
  supported('agent-activity-overview', 'Agent Activity Overview', 'dashboard', 'Agents'),
  supported('agent-activity', 'Agent Activity', 'dashboard', 'Agents'),
  supported('agent-conduct', 'Agent Conduct', 'dashboard', 'Agents'),
  supported('agent-dispositions', 'Agent Dispositions', 'dashboard', 'Agents'),
  supported('agent-scorecard', 'Agent Scorecard', 'dashboard', 'Agents'),
  supported('agent-state', 'Agent State', 'dashboard', 'Agents'),
  definition('interactions-overview', 'Interactions Overview', 'dashboard', 'Interactions'),
  definition('omnichannel-overview', 'Omnichannel Overview', 'dashboard', 'Interactions'),
  definition('dialer-performance-and-penetration', 'Dialer Performance and Penetration', 'dashboard', 'Outbound'),
  definition('outbound-performance', 'Outbound Performance', 'dashboard', 'Outbound'),
  definition('outbound-ftc-compliance', 'Outbound FTC Compliance', 'dashboard', 'Outbound'),
  definition('inbound-interactions-overview', 'Inbound Interactions Overview', 'dashboard', 'Inbound', ['Inbound Overview']),
  definition('inbound-ivr-overview', 'Inbound IVR Overview', 'dashboard', 'Inbound'),
  definition('inbound-voice-service-level-summary', 'Inbound Voice Service Level Summary', 'dashboard', 'Inbound'),
  definition('hourly-inbound-statistics', 'Hourly Inbound Statistics', 'dashboard', 'Inbound'),
  definition('overflow-queue-overview', 'Overflow Queue Overview', 'dashboard', 'Inbound'),
  definition('inbound-workflow-overview', 'Inbound Workflow Overview', 'dashboard', 'Workflow'),
  definition('account-overview', 'Account Overview', 'dashboard', 'Account'),
  definition('customer-journey-analytics', 'Customer Journey Analytics', 'dashboard', 'Account', ['Unified Analytics']),
  definition('billing-period-overview', 'Billing Period Overview', 'dashboard', 'Billing'),
  definition('billing-period-account-usage', 'Billing Period Account Usage', 'dashboard', 'Billing'),
  definition('transport-usage', 'Transport Usage', 'dashboard', 'Billing'),
]

const agentReportNames = [
  'Acceptance Rate per Agent', 'Acceptance Rate Trend', 'Agent Account', 'Agent Activity', 'Agent Avg Handle Time Distribution', 'Agent Conduct', 'Agent Digital State', 'Agent Handle Time Analysis', 'Agent Handle Time in Groups', 'Agent Login Time', 'Agent Login Time Utilization Voice/Digital', 'Agent Occupancy Trend by Day/Hour', 'Agent Pending Disposition Time', 'Agent Performance in Outbound Campaign', 'Agent Speed of Answer', 'Agent State Change Raw', 'Agent States Analysis', 'Agent States Transition', 'Agent-to-Agent Transfer', 'Agent-to-Product Transfer', 'Agent Transfers to Queue/Workflow/Both', 'Agent Voice State', 'Agent Wait Time Distribution by Rank', 'Agents by Channel Type', 'Agents Handling Interactions by Channel Type Trend by Hour', 'Agents Monthly Trend', 'Agents without Agent Disposition', 'Answered Interactions per Agent', 'Calls/Ring/Queue/RNA Time', 'First Contact Resolution Rate Trend by Agent', 'Handle Time & Escalation Rate', 'Handle Time & Successful Calls', 'Interactions Distribution for Agents in Queue', 'Ring No Answer Call Details', 'RNA by Agent', 'Top 10 Agent Handle Time vs All Agents', 'Voice Agent Utilization & Occupancy Trend', 'User List',
] as const

const nonAgentReportNames: Readonly<Record<string, readonly string[]>> = {
  API: [
    'WFM Aggregated Agent Stats (API Validation)',
    'WFM Aggregated Extended Agent Stats (API Validation)',
    'WFM Aggregated Queue Stats (API Validation)',
  ],
  Dispositions: [
    'Agent Disposition',
    'Agent Disposition Chart',
    'Pending Disposition Time per Agent',
  ],
  Inbound: [
    'Abandon in Queue % by Queue',
    'Acceptance Rate by Queue',
    'Agent Rejected by Channel Type',
    'Answered Wait Time',
    'Average Queue Time by Channel Type',
    'Avg Speed of Answer by Queue',
    'Delay to Abandon',
    'DNIS Inbound Overview',
    'Hourly Inbound Call/Time Trends',
    'Hourly Inbound Interaction Statistics',
    'Inbound Abandoned',
    'Inbound Accepted by Channel Type',
    'Inbound Call Detail',
    'Inbound Callback Interaction by Channel Type',
    'Inbound Deflected by Channel Type',
    'Inbound Interactions Ended in Queue by Day',
    'Inbound Interactions Overview',
    'Inbound Overflow Queue Interactions',
    'Inbound Queue Overview',
    'Interactions Answered within SLA',
    'Manual Dials No Connect by Channel Type',
    'Overflow Queue Interactions and Rate',
    'Queue Abandon Rate % Day Trend',
    'Queue Callbacks',
    'Queue Performance',
    'Queue Segments',
    'Queue Time by Channel Type',
    'Queue Voice Callback Overview',
    'Repeated Contacts Distribution',
    'RNA by Channel Type',
    'Service Level by Queue',
    'SLA Trend',
    'Weekly Inbound Overflow Queue Interactions',
    'Weekly Transfer',
  ],
}

const additionalReportNames: Readonly<Record<string, readonly string[]>> = {
  Interactions: ['Abandon Rate by Channel Type', 'Account Taxonomy', 'Account Usage', 'Account Usage Trend', 'Agent Interaction Time by Channel Type', 'Agent Ring Talk Wrap Time by Day', 'Agent Script Detail', 'Agents and Handled Interactions by Day', 'Average Handle Time by Channel Type', 'Average Handle Time by Hour', 'Average Interaction per Day', 'Average Queue Time by Channel Type', 'Daily Interactions Trend', 'First Contact Resolution Details', 'First Contact Resolution Rate Trend by Agent', 'Handle Time and Repeated Customers', 'Inbound Interactions Geo Distribution', 'Interaction Category Heatmap', 'Interaction Details', 'Interaction Handle Time Distribution', 'Interaction Lifecycle', 'Interaction Lifecycle Summary Transcript and Recording', 'Interaction Summary Transcript and Recording', 'Interaction Transfers per Product Type', 'Interactions and Talk Time', 'Interactions by Call Type', 'Interactions by Channel Type', 'Interactions by Interaction Type', 'Interactions by Product Type', 'Interactions Handled by Channel Type', 'Monthly Interactions Trend', 'Queue Voice Callback Frequency', 'Ring Talk Wrap Time by Channel Type', 'RNA Rate by Channel Type', 'Segments by Channel Type', 'Service Level Rate by Channel Type', 'Talk Time by Call Type', 'Transfer Mode Distribution', 'Unique Contact Details', 'Unique Contact Distribution by Channel Type', 'Voice Callback Analysis', 'Voice Callback Trend', 'Weekday Interactions Overview', 'Weekly Interactions Trend', 'Volume by Product Type'],
  Outbound: ['Average Agent Wrap Up Time by Campaign', 'Daily Outbound Performance', 'Dialer Penetration', 'Dialer Penetration Chart', 'Dialer Penetration Passes Trend', 'Dialer Performance Analysis', 'Dialer Result Download', 'FTC Compliance', 'Hourly Dialer Disposition', 'Hourly Dialer Disposition Trend', 'Leads Analysis', 'Leads Analysis Heatmap', 'Leads Analysis Table', 'Outbound Agent Activity', 'Outbound Agent Dispositions', 'Outbound Call Results', 'Outbound Complete and Success Rate by Dial Group', 'Outbound Hit Rate Trend', 'Outbound Interactions Geo Distribution', 'Outbound Lead List Overview', 'Outbound Leads Complete Trend', 'Outbound Overview', 'Outbound Performance', 'Outbound Performance Trend', 'Outbound Success Rate by Campaign'],
  Workflow: ['External Workflow Transfer Tracking', 'Interactions by Workflows and Workflow Nodes Chart', 'Workflow Activity Bar Chart', 'Workflow Custom Field Numerical Value', 'Workflow Custom Field Value Distribution', 'Workflow Detail', 'Workflow Detail with Custom Fields', 'Workflow Detail with Talk Time', 'Workflow External Transfer Talk Duration by DNIS', 'Workflow Overview', 'Workflow Survey Result', 'Workflow Survey Result Details'],
}

const slug = (value: string): string => value.toLowerCase().replace(/&/g, 'and').replace(/\//g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const reports: ReportDefinition[] = [
  supported('agent-disposition-report', 'Agent Disposition Overview', 'report', 'Dispositions'),
  ...agentReportNames.map(title => title === 'Agent Activity' ? supported('agent-activity-report', title, 'report', 'Agents') : definition(`report-${slug(title)}`, title, 'report', 'Agents')),
  ...Object.entries(nonAgentReportNames).flatMap(([category, titles]) => titles.map(title => definition(`report-${slug(title)}`, title, 'report', category))),
  ...Object.entries(additionalReportNames).flatMap(([category, titles]) => titles.map(title => definition(`report-${slug(title)}`, title, 'report', category))),
]

function withUniqueReportIds(entries: readonly ReportDefinition[]): ReportDefinition[] {
  const usedIds = new Set<string>()

  return entries.map(entry => {
    if (!usedIds.has(entry.id)) {
      usedIds.add(entry.id)
      return entry
    }

    const categorySuffix = slug(entry.category)
    let candidate = `${entry.id}-${categorySuffix}`
    let ordinal = 2
    while (usedIds.has(candidate)) candidate = `${entry.id}-${categorySuffix}-${ordinal++}`
    usedIds.add(candidate)
    return { ...entry, id: candidate }
  })
}

export const REPORT_CATALOG: readonly ReportDefinition[] = withUniqueReportIds([...dashboards, ...reports])

const normalized = (value: string): string => value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
const deduplicateRepeatedPhrase = (value: string): string => {
  const tokens = value.split(' ').filter(Boolean)
  if (tokens.length > 1 && tokens.length % 2 === 0) {
    const half = tokens.length / 2
    if (tokens.slice(0, half).join(' ') === tokens.slice(half).join(' ')) return tokens.slice(0, half).join(' ')
  }
  return tokens.join(' ')
}
const orderedWordsMatch = (title: string, words: string[]): boolean => {
  let index = 0
  for (const word of words) {
    const found = title.indexOf(word, index)
    if (found < 0) return false
    index = found + word.length
  }
  return true
}

/** Search only metadata imported from the catalog; this never performs a network request. */
export function searchReports(query: string): ReportDefinition[] {
  const q = deduplicateRepeatedPhrase(normalized(query))
  if (!q) return [...REPORT_CATALOG].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  const words = q.split(' ')
  const matches = REPORT_CATALOG.flatMap(report => {
    const title = normalized(report.title)
    const aliases = report.aliases?.map(normalized) ?? []
    const metadata = [normalized(report.category), ...report.contents.flatMap(content => [normalized(content.label), normalized(content.description), normalized(content.metric.name), normalized(content.grouping.name)])]
    const rank = title === q ? 0 : title.startsWith(q) ? 1 : orderedWordsMatch(title, words) ? 2 : aliases.some(alias => alias === q || alias.startsWith(q) || orderedWordsMatch(alias, words)) ? 3 : metadata.some(value => value === q || value.startsWith(q) || orderedWordsMatch(value, words)) ? 4 : undefined
    return rank === undefined ? [] : [{ report, rank }]
  })
  return matches.sort((a, b) => a.rank - b.rank || Number(!normalized(a.report.title).startsWith(words[0])) - Number(!normalized(b.report.title).startsWith(words[0])) || a.report.title.localeCompare(b.report.title) || (a.rank === 0 ? (a.report.type === 'report' ? -1 : 1) - (b.report.type === 'report' ? -1 : 1) : 0) || a.report.id.localeCompare(b.report.id)).map(match => match.report)
}

export const findReport = (id: string): ReportDefinition | undefined => REPORT_CATALOG.find(report => report.id === id)

export function catalogCoverageManifest(): CatalogCoverageManifest {
  const reports = REPORT_CATALOG.filter(report => report.type === 'report')
  return { documentedReports: 199, importedReports: reports.length, unresolvedReportCount: Math.max(0, 199 - reports.length), dashboards: REPORT_CATALOG.filter(report => report.type === 'dashboard').length, categories: Object.fromEntries([...new Set(reports.map(report => report.category))].sort().map(category => [category, reports.filter(report => report.category === category).length])) }
}

export function findReportContent(report: ReportDefinition, contentIds: readonly string[]): readonly ReportContentDefinition[] {
  const selected = report.contents.filter(content => contentIds.includes(content.id))
  return selected.length ? selected : report.contents.filter(content => content.defaultSelected)
}
