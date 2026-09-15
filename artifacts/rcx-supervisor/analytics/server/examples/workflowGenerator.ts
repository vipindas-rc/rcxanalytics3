import { createHash } from 'node:crypto'

export const WORKFLOW_GENERATOR_VERSION = 'workflow-volume-v1'

export type WorkflowVolumeRow = {
  id: string
  workflowId: string
  workflowName: string
  ownerDay: string
  interactionVolume: number
}

export type WorkflowVolumeBatch = {
  ownerDay: string
  generatorVersion: string
  rows: WorkflowVolumeRow[]
}

const workflows = [
  ['lead-follow-up', 'Lead Follow-up'],
  ['billing-inquiry', 'Billing Inquiry'],
  ['renewal-outreach', 'Renewal Outreach'],
  ['customer-onboarding', 'Customer Onboarding'],
] as const

export function generateWorkflowVolumeDay(ownerDay: string, seed: number): WorkflowVolumeBatch {
  const origin = Date.parse(`${ownerDay}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ownerDay) || !Number.isSafeInteger(seed) || !Number.isFinite(origin) || new Date(origin).toISOString().slice(0, 10) !== ownerDay) {
    throw new Error('Invalid workflow-volume generation day or seed.')
  }
  const digest = createHash('sha256').update(`${WORKFLOW_GENERATOR_VERSION}:${seed}:${ownerDay}`).digest()
  const batch: WorkflowVolumeBatch = {
    ownerDay,
    generatorVersion: WORKFLOW_GENERATOR_VERSION,
    rows: workflows.map(([workflowId, workflowName], index) => ({
      id: `${ownerDay}:${workflowId}`,
      workflowId,
      workflowName,
      ownerDay,
      interactionVolume: 40 + (digest[index] % 90),
    })),
  }
  validateWorkflowVolumeBatch(batch)
  return batch
}

export function validateWorkflowVolumeBatch(batch: WorkflowVolumeBatch) {
  if (batch.generatorVersion !== WORKFLOW_GENERATOR_VERSION || !/^\d{4}-\d{2}-\d{2}$/.test(batch.ownerDay) || batch.rows.length !== workflows.length) {
    throw new Error('Invalid workflow-volume batch.')
  }
  const ids = new Set<string>()
  const workflowIds = new Set<string>()
  for (const row of batch.rows) {
    if (row.ownerDay !== batch.ownerDay || !row.id || !row.workflowId || !row.workflowName || !Number.isSafeInteger(row.interactionVolume) || row.interactionVolume <= 0) {
      throw new Error('Invalid workflow interaction volume.')
    }
    if (ids.has(row.id) || workflowIds.has(row.workflowId)) throw new Error('Duplicate workflow-volume row.')
    ids.add(row.id)
    workflowIds.add(row.workflowId)
  }
}
