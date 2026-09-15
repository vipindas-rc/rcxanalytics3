import { createHash } from 'node:crypto'

export const QUEUE_ABANDONMENT_GENERATOR_VERSION = 'queue-abandonment-v1'

export type QueueAbandonmentRow = {
  id: string
  queueId: string
  queueName: string
  ownerDay: string
  offered: number
  abandoned: number
}

export type QueueAbandonmentBatch = {
  ownerDay: string
  generatorVersion: string
  rows: QueueAbandonmentRow[]
}

const queues = [
  ['sales', 'Sales'],
  ['billing', 'Billing'],
  ['account-services', 'Account Services'],
  ['returns', 'Returns'],
  ['technical-support', 'Technical Support'],
] as const

export function generateQueueAbandonmentDay(ownerDay: string, seed: number): QueueAbandonmentBatch {
  const origin = Date.parse(`${ownerDay}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ownerDay) || !Number.isSafeInteger(seed) || !Number.isFinite(origin) || new Date(origin).toISOString().slice(0, 10) !== ownerDay) {
    throw new Error('Invalid queue-abandonment generation day or seed.')
  }
  const digest = createHash('sha256').update(`${QUEUE_ABANDONMENT_GENERATOR_VERSION}:${seed}:${ownerDay}`).digest()
  const batch: QueueAbandonmentBatch = {
    ownerDay,
    generatorVersion: QUEUE_ABANDONMENT_GENERATOR_VERSION,
    rows: queues.map(([queueId, queueName], index) => {
      const offered = 120 + (digest[index] % 100)
      const abandoned = 3 + (digest[index + queues.length] % Math.max(4, Math.floor(offered * 0.22)))
      return { id: `${ownerDay}:${queueId}`, queueId, queueName, ownerDay, offered, abandoned }
    }),
  }
  validateQueueAbandonmentBatch(batch)
  return batch
}

export function validateQueueAbandonmentBatch(batch: QueueAbandonmentBatch) {
  if (batch.generatorVersion !== QUEUE_ABANDONMENT_GENERATOR_VERSION || !/^\d{4}-\d{2}-\d{2}$/.test(batch.ownerDay) || batch.rows.length !== queues.length) {
    throw new Error('Invalid queue-abandonment batch.')
  }
  const ids = new Set<string>()
  const queueIds = new Set<string>()
  for (const row of batch.rows) {
    if (row.ownerDay !== batch.ownerDay || !row.id || !row.queueId || !row.queueName || !Number.isSafeInteger(row.offered) || !Number.isSafeInteger(row.abandoned) || row.offered <= row.abandoned || row.abandoned < 0) {
      throw new Error('Invalid queue offered or abandoned volume.')
    }
    if (ids.has(row.id) || queueIds.has(row.queueId)) throw new Error('Duplicate queue-abandonment row.')
    ids.add(row.id)
    queueIds.add(row.queueId)
  }
}
