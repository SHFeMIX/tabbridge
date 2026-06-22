import { describe, expect, it } from 'vitest'
import { mapCliToJsonRpcRequest } from '../src/commands.js'

describe('CLI command mapping', () => {
  it('maps tabs list to a JSON-RPC request', () => {
    const request = mapCliToJsonRpcRequest(
      { command: 'tabs.list', json: true, payload: {} },
      'req_1',
    )

    expect(request).toEqual({
      jsonrpc: '2.0',
      id: 'req_1',
      method: 'tabs.list',
      params: {},
    })
  })

  it('maps approvals wait timeout to JSON-RPC params with default timeout when omitted', () => {
    const request = mapCliToJsonRpcRequest(
      { command: 'approvals.wait', json: true, payload: { approvalId: 'appr_123' } },
      'req_wait',
    )

    expect(request.params).toEqual({ approvalId: 'appr_123', timeoutMs: 30000 })
  })
})
