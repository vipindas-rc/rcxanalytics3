import { describe, expect, it } from 'vitest'
import { WORKFLOW_GENERATOR_VERSION, generateWorkflowVolumeDay, validateWorkflowVolumeBatch } from './workflowGenerator.ts'

describe('workflow-volume synthetic generator', () => {
  it('creates deterministic, non-overlapping workflow volumes with valid totals', () => {
    const first = generateWorkflowVolumeDay('2026-09-01', 20260914)
    expect(first).toEqual(generateWorkflowVolumeDay('2026-09-01', 20260914))
    expect(first.generatorVersion).toBe(WORKFLOW_GENERATOR_VERSION)
    expect(first.rows).toHaveLength(4)
    expect(new Set(first.rows.map((row) => row.workflowId)).size).toBe(first.rows.length)
    expect(first.rows.every((row) => row.interactionVolume > 0)).toBe(true)
    expect(() => validateWorkflowVolumeBatch(first)).not.toThrow()
  })

  it('uses stable identities across coverage growth without reusing a day row', () => {
    const first = generateWorkflowVolumeDay('2026-09-01', 7)
    const next = generateWorkflowVolumeDay('2026-09-02', 7)
    expect(next.rows.every((row) => !first.rows.some((previous) => previous.id === row.id))).toBe(true)
  })

  it('rejects invalid owner days and malformed rows', () => {
    expect(() => generateWorkflowVolumeDay('not-a-day', 1)).toThrow(/Invalid/)
    const batch = generateWorkflowVolumeDay('2026-09-01', 1)
    batch.rows[0].interactionVolume = 0
    expect(() => validateWorkflowVolumeBatch(batch)).toThrow(/volume/)
  })
})
