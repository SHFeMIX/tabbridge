import { describe, expect, it } from 'vitest'
import type { BridgeResponse } from '../src/index.js'
import { PROTOCOL_VERSION, createBridgeRequest, okEnvelope, errorEnvelope } from '../src/index.js'

const protocolError = {
  code: 'TAB_NOT_FOUND',
  message: 'The bridge failed.',
  recoverable: false,
} as const

const validBridgeSuccess: BridgeResponse = {
  id: 'res_1',
  protocolVersion: PROTOCOL_VERSION,
  ok: true,
  payload: { tabId: 123 },
}

const validBridgeError: BridgeResponse = {
  id: 'res_2',
  protocolVersion: PROTOCOL_VERSION,
  ok: false,
  error: protocolError,
}

// @ts-expect-error success responses must include payload
const bridgeSuccessWithoutPayload: BridgeResponse = {
  id: 'res_3',
  protocolVersion: PROTOCOL_VERSION,
  ok: true,
}

// @ts-expect-error success responses must not include errors
const bridgeSuccessWithError: BridgeResponse = {
  id: 'res_4',
  protocolVersion: PROTOCOL_VERSION,
  ok: true,
  payload: {},
  error: protocolError,
}

// @ts-expect-error error responses must include an error
const bridgeErrorWithoutError: BridgeResponse = {
  id: 'res_5',
  protocolVersion: PROTOCOL_VERSION,
  ok: false,
}

// @ts-expect-error error responses must not include payloads
const bridgeErrorWithPayload: BridgeResponse = {
  id: 'res_6',
  protocolVersion: PROTOCOL_VERSION,
  ok: false,
  payload: {},
  error: protocolError,
}

void validBridgeSuccess
void validBridgeError
void bridgeSuccessWithoutPayload
void bridgeSuccessWithError
void bridgeErrorWithoutError
void bridgeErrorWithPayload

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
