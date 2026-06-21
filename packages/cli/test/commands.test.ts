import { describe, expect, it } from 'vitest'
import { mapCliToBridgeRequest } from '../src/commands.js'

describe('CLI command mapping', () => {
  it('maps bridge-backed commands to protocol versioned requests', () => {
    const request = mapCliToBridgeRequest(
      { command: 'tabs.list', json: true, payload: {} },
      1782012345000,
      'req_tabs',
    )

    expect(request).toEqual({
      id: 'req_tabs',
      protocolVersion: 1,
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })
  })

  it('maps approvals wait timeout to payload with default timeout when omitted', () => {
    const request = mapCliToBridgeRequest(
      { command: 'approvals.wait', json: true, payload: { approvalId: 'appr_123' } },
      1782012345000,
      'req_wait',
    )

    expect(request.payload).toEqual({ approvalId: 'appr_123', timeoutMs: 30000 })
  })
})
