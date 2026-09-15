import { describe, expect, it } from 'vitest'
import { definitionForPlan, planGeneralAnalysis } from './generalPlan.ts'

describe('general analytical planning', () => {
  it('keeps a requested queue service-level metric instead of substituting abandonment', () => {
    const plan = planGeneralAnalysis('Compare service level by queue as a bar chart')
    expect(plan.metric).toMatchObject({ id: 'serviceLevel', unit: 'percent', aggregation: 'mean' })
    expect(plan.grouping).toMatchObject({ id: 'queue', values: ['Sales', 'Billing', 'Account Services', 'Returns', 'Technical Support'] })
    expect(definitionForPlan(plan).measures[0]).toMatchObject({ id: 'serviceLevel', unit: '%' })
  })

  it('preserves named comparison cohorts as the requested grouping', () => {
    const plan = planGeneralAnalysis('How many AI agents versus human agents are live right now?')
    expect(plan.grouping).toMatchObject({ id: 'agentType', values: ['AI', 'Human'] })
    expect(plan.cohorts).toEqual(['AI', 'Human'])
    expect(plan.time).toEqual({ kind: 'instant', requestedNow: true })
  })

  it('selects a compatible presentation without changing metric or grouping', () => {
    const plan = planGeneralAnalysis('Show product adoption by plan as a donut chart')
    expect(plan.metric.id).toBe('rate')
    expect(plan.grouping.id).toBe('plan')
    expect(plan.presentation).toBe('donut')
  })
})
