import { describe, expect, it } from 'vitest'
import { formatTimeRemaining } from '../src/ui/formatTimeRemaining'

describe('formatTimeRemaining', () => {
  it('formats remaining time with minutes and seconds', () => {
    expect(formatTimeRemaining(1_000_000, 0)).toBe('16 分 40 秒')
  })

  it('formats remaining time with only seconds when under one minute', () => {
    expect(formatTimeRemaining(45_000, 0)).toBe('45 秒')
  })

  it('pads seconds with zero', () => {
    expect(formatTimeRemaining(305_000, 0)).toBe('5 分 05 秒')
  })

  it('clamps to zero for past times', () => {
    expect(formatTimeRemaining(0, 1000)).toBe('0 秒')
  })
})
