import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, createBridgeRequest, okEnvelope, errorEnvelope } from '../src/index.js'

describe('shared protocol envelopes', () => {
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

  it('creates bridge requests with protocol version 1 and stable ids', () => {
    const request = createBridgeRequest({
      id: 'req_1',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    expect(request).toEqual({
      id: 'req_1',
      protocolVersion: PROTOCOL_VERSION,
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })
  })
})
