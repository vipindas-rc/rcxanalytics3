import { describe, expect, it, vi } from 'vitest'
import { bootstrapDemoData, DEMO_PERIOD } from './replitDataBootstrap.ts'

describe('Replit demo data bootstrap', () => {
  it('does nothing outside explicit Replit/demo bootstrap mode', async () => {
    const operational = { ensureCoverage: vi.fn() }
    const examples = { prepareWorkflowVolume: vi.fn(), prepareQueueAbandonment: vi.fn() }
    expect(await bootstrapDemoData(false, operational, examples)).toBe(false)
    expect(operational.ensureCoverage).not.toHaveBeenCalled()
  })

  it('idempotently prepares operational, workflow, and queue coverage', async () => {
    const operational = { ensureCoverage: vi.fn().mockResolvedValue({}) }
    const examples = { prepareWorkflowVolume: vi.fn().mockResolvedValue({}), prepareQueueAbandonment: vi.fn().mockResolvedValue({}) }
    expect(await bootstrapDemoData(true, operational, examples)).toBe(true)
    expect(operational.ensureCoverage).toHaveBeenCalledWith(DEMO_PERIOD)
    expect(examples.prepareWorkflowVolume).toHaveBeenCalledWith(DEMO_PERIOD)
    expect(examples.prepareQueueAbandonment).toHaveBeenCalledWith(DEMO_PERIOD)
  })
})
