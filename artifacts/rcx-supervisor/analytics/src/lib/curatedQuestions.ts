export type CuratedQuestion = {
  title: string
  prompt: string
  topic: 'Queues' | 'Agents' | 'Interactions' | 'Outbound' | 'Workflows'
  sourceUrl: string
}

export const catalogSourceUrl = 'https://app.notion.com/p/3d934de61dc6819888eef1cf2b4ccc49'

export const curatedQuestions: CuratedQuestion[] = [
  { title: 'Queue abandonment', prompt: 'Compare abandonment rates across five fictional queues as a bar chart.', topic: 'Queues', sourceUrl: catalogSourceUrl },
  { title: 'Agent states', prompt: 'Show fictional agent time spent in each state as a stacked bar chart.', topic: 'Agents', sourceUrl: catalogSourceUrl },
  { title: 'Channel trend', prompt: 'Show daily fictional interactions by channel over the last fourteen days as a line chart.', topic: 'Interactions', sourceUrl: catalogSourceUrl },
  { title: 'Disposition mix', prompt: 'Compare fictional dispositions across five queues as a grouped bar chart.', topic: 'Queues', sourceUrl: catalogSourceUrl },
  { title: 'Campaign success', prompt: 'Show fictional outbound success rates by campaign as a bar chart.', topic: 'Outbound', sourceUrl: catalogSourceUrl },
  { title: 'Workflow volume', prompt: 'Compare fictional workflow interaction volumes by workflow as a donut chart.', topic: 'Workflows', sourceUrl: catalogSourceUrl },
]

// Catalog prompts intentionally describe a new fictional scenario. They must not
// inherit an unrelated chart dataset when selected from an earlier answer.
export const isCatalogQuestion = (prompt: string) => curatedQuestions.some(question => question.prompt === prompt)

export const catalogPromptContext = curatedQuestions.map(({ title, prompt, topic }) => `${topic}: ${title} — ${prompt}`).join('\n')
