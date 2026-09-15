export const DEMO_PERIOD = { start: '2026-08-31T00:00:00Z', end: '2026-09-14T00:00:00Z' }

type OperationalCoverage = { ensureCoverage(input: typeof DEMO_PERIOD): Promise<unknown> }
type ExampleCoverage = {
  prepareWorkflowVolume(input: typeof DEMO_PERIOD): Promise<unknown>
  prepareQueueAbandonment(input: typeof DEMO_PERIOD): Promise<unknown>
}

export async function bootstrapDemoData(enabled: boolean, operational: OperationalCoverage, examples: ExampleCoverage): Promise<boolean> {
  if (!enabled) return false
  await Promise.all([
    operational.ensureCoverage(DEMO_PERIOD),
    examples.prepareWorkflowVolume(DEMO_PERIOD),
    examples.prepareQueueAbandonment(DEMO_PERIOD),
  ])
  return true
}
