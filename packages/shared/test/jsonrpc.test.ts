import { describe, expect, it } from 'vitest'
import { createJsonRpcRequest, createJsonRpcSuccess, createJsonRpcError } from '../src/jsonrpc.js'

describe('jsonrpc', () => {
  it('creates a request', () => {
    expect(createJsonRpcRequest('r1', 'tabs.list', { tabId: 1 })).toEqual({
      jsonrpc: '2.0',
      id: 'r1',
      method: 'tabs.list',
      params: { tabId: 1 },
    })
  })

  it('creates a success response', () => {
    expect(createJsonRpcSuccess('r1', { ok: true })).toEqual({
      jsonrpc: '2.0',
      id: 'r1',
      result: { ok: true },
    })
  })

  it('creates an error response', () => {
    expect(createJsonRpcError('r1', { code: -32001, message: 'TAB_NOT_AUTHORIZED' })).toEqual({
      jsonrpc: '2.0',
      id: 'r1',
      error: { code: -32001, message: 'TAB_NOT_AUTHORIZED' },
    })
  })
})
