import { describe, expect, it } from 'vitest'
import { BROKER_PORT, okEnvelope, errorEnvelope } from '../src/index.js'

const protocolError = {
  code: 'TAB_NOT_FOUND',
  message: 'The bridge failed.',
  recoverable: false,
} as const

describe('shared protocol envelopes', () => {
  it('exports the browser-safe broker port constant', () => {
    expect(BROKER_PORT).toBe(9876)
  })

  it('creates CLI success envelopes with a stable ok/data shape', () => {
    expect(okEnvelope({ tabId: 123, snapshotId: 'snap_abc' })).toEqual({
      ok: true,
      data: { tabId: 123, snapshotId: 'snap_abc' },
    })
  })

  it('creates CLI error envelopes with recoverability metadata', () => {
    expect(errorEnvelope({
      code: 'TAB_NOT_AUTHORIZED',
      message: 'Request access before reading this tab.',
      recoverable: true,
      suggestedCommand: 'tabbridge tabs request-access --tab 123 --reason <reason> --json',
    })).toEqual({
      ok: false,
      error: {
        code: 'TAB_NOT_AUTHORIZED',
        message: 'Request access before reading this tab.',
        recoverable: true,
        suggestedCommand: 'tabbridge tabs request-access --tab 123 --reason <reason> --json',
      },
    })
  })
})
