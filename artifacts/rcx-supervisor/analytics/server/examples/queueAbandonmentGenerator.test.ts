import { describe, expect, it } from 'vitest'
import { QUEUE_ABANDONMENT_GENERATOR_VERSION, generateQueueAbandonmentDay, validateQueueAbandonmentBatch } from './queueAbandonmentGenerator.ts'

describe('queue-abandonment synthetic generator', () => {
  it('is deterministic and yields valid offered and abandoned counts for each queue', () => {
    const batch = generateQueueAbandonmentDay('2026-09-01', 20260914)
    expect(batch).toEqual(generateQueueAbandonmentDay('2026-09-01', 20260914))
    expect(batch.generatorVersion).toBe(QUEUE_ABANDONMENT_GENERATOR_VERSION)
    expect(batch.rows).toHaveLength(5)
    expect(batch.rows.every((row) => row.offered > row.abandoned && row.abandoned >= 0)).toBe(true)
    expect(() => validateQueueAbandonmentBatch(batch)).not.toThrow()
  })

  it('does not reuse queue-row identities when coverage extends', () => {
    const first = generateQueueAbandonmentDay('2026-09-01', 9)
    const next = generateQueueAbandonmentDay('2026-09-02', 9)
    expect(next.rows.every((row) => !first.rows.some((previous) => previous.id === row.id))).toBe(true)
  })
})
