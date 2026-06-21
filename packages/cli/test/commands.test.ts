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

  it('routes local runtime commands without creating bridge requests', () => {
    const localCommands = [
      { command: 'nativeHost', payload: {} },
      { command: 'status', payload: {} },
      { command: 'doctor', payload: {} },
      { command: 'installNativeHost', payload: { browser: 'chrome', extensionId: 'ext_123' } },
      { command: 'uninstallNativeHost', payload: { browser: 'chrome' } },
    ]

    for (const { command, payload } of localCommands) {
      expect(mapCliToBridgeRequest({ command, json: true, payload }, 1782012345000, `req_${command}`)).toEqual({
        kind: 'local',
        command,
        json: true,
        payload,
      })
    }
  })
})
