import { describe, expect, it } from 'vitest'
import { shouldSubmitAdvisorQuestion } from './AskAdvisor'

describe('Ask Advisor question input', () => {
  it('submits a normal Enter key', () => {
    expect(shouldSubmitAdvisorQuestion({ key: 'Enter' })).toBe(true)
  })

  it('does not submit while an IME composition is active', () => {
    expect(shouldSubmitAdvisorQuestion({ key: 'Enter', isComposing: true })).toBe(false)
    expect(shouldSubmitAdvisorQuestion({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false)
    expect(shouldSubmitAdvisorQuestion({ key: 'Enter', keyCode: 229 })).toBe(false)
  })

  it('leaves other keys alone', () => {
    expect(shouldSubmitAdvisorQuestion({ key: 'Escape' })).toBe(false)
  })
})