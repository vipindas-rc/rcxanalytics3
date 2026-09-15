import { describe, expect, it } from 'vitest'
import { generateDay, normalizePeriod, validateBatch } from './generator.ts'

describe('coherent synthetic agent records', () => {
 it('is deterministic and keeps transfers as one interaction', () => {
  const batch = generateDay('2026-09-01', 20260914)
  expect(batch).toEqual(generateDay('2026-09-01', 20260914))
  expect(batch.agents.filter(agent => agent.agentType === 'ai')).toHaveLength(3)
  expect(batch.agents.filter(agent => agent.agentType === 'human')).toHaveLength(5)
  expect(batch.presence).toHaveLength(8)
  expect(batch.presence.every(interval => Date.parse(interval.startedAt) < Date.parse(interval.endedAt))).toBe(true)
  expect(batch.segments.length).toBeGreaterThan(batch.interactions.length)
  expect(new Set(batch.interactions.map(row => row.id)).size).toBe(batch.interactions.length)
  expect(() => validateBatch(batch)).not.toThrow()
 })
 it('keeps event identities disjoint when coverage grows', () => {
  const first = generateDay('2026-09-01', 1)
  const next = generateDay('2026-09-02', 1)
  expect(next.interactions.every(row => !first.interactions.some(old => old.id === row.id))).toBe(true)
  expect(first.interactions.at(-1)!.endedAt >= '2026-09-02T00:00:00.000Z').toBe(true)
 })
 it('rejects invalid relationships and periods', () => {
  const batch = generateDay('2026-09-01', 1)
  batch.segments[0].agentId = 'missing'
  expect(() => validateBatch(batch)).toThrow(/agent/)
  expect(() => normalizePeriod('bad', '2026-09-03')).toThrow()
  expect(() => normalizePeriod('2026-09-03', '2026-09-01')).toThrow()
 })
 it('normalizes half-open periods to owner days with one carry-in day', () => {
  expect(normalizePeriod('2026-09-01T12:00:00Z', '2026-09-03T00:00:00Z').days).toEqual(['2026-08-31', '2026-09-01', '2026-09-02'])
 })
})
