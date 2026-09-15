import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { paceRequest, requestStatus, STATUS_DISPLAY_MS } from './requestStatus'
import type { TurnRequest } from '../lib/model'
import { RequestProgress } from './RequestProgress'

const request = { phase: 'Analyzing your question', status: 'pending' as const }

describe('requestStatus', () => {
  it('uses a factual existing server phase without inventing elapsed-time stages', () => {
    expect(requestStatus(request)).toEqual({ kind: 'working', label: 'Analyzing your question' })
  })

  it.each([
    ['initializing', 'Initializing your analysis'],
    ['planning', 'Understanding your question'],
    ['resolving-data', 'Preparing report data'],
    ['computing', 'Calculating results'],
    ['preparing-output', 'Building your response'],
    ['reviewing', 'Checking the result'],
  ])('maps %s to one human-readable operation', (phase, label) => {
    expect(requestStatus({ ...request, phase })).toEqual({ kind: 'working', label })
  })

  it('keeps chart preparation active until every returned chart is ready', () => {
    expect(requestStatus({ status: 'completed', phase: 'Complete' }, ['chart-1'])).toEqual({ kind: 'working', label: 'Preparing your chart' })
  })

  it('removes completed progress instead of showing a Complete badge', () => {
    expect(requestStatus({ status: 'completed', phase: 'Complete' })).toBeNull()
    expect(renderToStaticMarkup(createElement(RequestProgress, { request: { status: 'completed', phase: 'Complete' } }))).toBe('')
  })

  it('prefers failures over completion', () => {
    expect(requestStatus({ status: 'failed', phase: 'reviewing', error: 'Authentication unavailable' })).toEqual({ kind: 'failed', label: 'Authentication unavailable' })
    expect(requestStatus({ status: 'completed', phase: 'Complete' }, [], 'The chart did not finish rendering.')).toEqual({ kind: 'failed', label: 'The chart did not finish rendering.' })
  })

  it('renders one changing status label and hides decorative animation from assistive technology', () => {
    const html = renderToStaticMarkup(createElement(RequestProgress, { request: { ...request, phase: 'computing' } }))
    expect(html).toContain('Calculating results')
    expect(html).not.toContain('Understanding your question')
    expect(html).not.toContain('upcoming')
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('Step ')
  })
})

describe('status pacing', () => {
  const initial = { id: 'test', status: 'pending', phase: 'initializing' } as TurnRequest
  const completed = { ...initial, status: 'completed', phase: 'Complete', phaseHistory: ['initializing', 'planning', 'computing', 'preparing-output', 'reviewing'].map(phase => ({ phase, at: new Date(0).toISOString() })) } as TurnRequest
  it('shows every recorded phase for a readable interval before completion', () => {
    let displayed = initial
    for (const phase of ['planning', 'computing', 'preparing-output', 'reviewing', 'Complete']) {
      expect(paceRequest(displayed, completed, 0, STATUS_DISPLAY_MS - 1)).toBe(displayed)
      displayed = paceRequest(displayed, completed, 0, STATUS_DISPLAY_MS)
      expect(displayed.phase).toBe(phase)
      expect(displayed.status).toBe(phase === 'Complete' ? 'completed' : 'pending')
    }
  })
  it('surfaces failures immediately instead of replaying progress', () => {
    const failed = { ...completed, status: 'failed' as const, error: 'Connection lost' }
    expect(paceRequest(initial, failed, 0, 1)).toBe(failed)
  })
})
