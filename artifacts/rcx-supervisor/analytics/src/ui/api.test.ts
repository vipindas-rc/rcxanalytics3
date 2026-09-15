import { describe, expect, it } from 'vitest'
import { analyticsApiBase, analyticsApiPath, STANDALONE_ANALYTICS_API_BASE } from './api.ts'

describe('analytics API addressing', () => {
  it('uses the standalone proxy prefix by default and accepts the native gateway prefix', () => {
    expect(analyticsApiBase(undefined)).toBe(STANDALONE_ANALYTICS_API_BASE)
    expect(analyticsApiPath('/workspace', '/analytics-api')).toBe('/analytics-api/workspace')
    expect(analyticsApiPath('/workspace')).toBe('/api/analytics/workspace')
  })

  it('only accepts application-relative prefixes and endpoint paths', () => {
    expect(() => analyticsApiBase('https://api.example.test')).toThrow('absolute application path')
    expect(() => analyticsApiBase('//api.example.test')).toThrow('absolute application path')
    expect(() => analyticsApiPath('workspace')).toThrow('must start')
  })
})