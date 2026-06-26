import { describe, expect, it } from 'vitest'
import { ERROR_CODES, bridgeNotConnectedError, refStaleError, snapshotRequiredError, tabNotAuthorizedError, tabBridgeErrorToJsonRpc, jsonRpcErrorToTabBridgeError } from '../src/index.js'

describe('TabBridge errors', () => {
  it('exports the exact MVP error code set', () => {
    expect(ERROR_CODES).toEqual([
      'EXTENSION_NOT_CONNECTED',
      'BRIDGE_SOCKET_UNAVAILABLE',
      'BRIDGE_REQUEST_TIMEOUT',
      'TAB_NOT_FOUND',
      'TAB_NOT_AUTHORIZED',
      'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
      'HOST_PERMISSION_DENIED',
      'USER_APPROVAL_REQUIRED',
      'APPROVAL_EXPIRED',
      'APPROVAL_TIMEOUT',
      'UNSUPPORTED_PAGE',
      'FRAME_NOT_ACCESSIBLE',
      'FRAME_ORIGIN_NOT_AUTHORIZED',
      'SNAPSHOT_REQUIRED',
      'REF_STALE',
      'ELEMENT_NOT_VISIBLE',
      'ELEMENT_DISABLED',
      'ELEMENT_SCOPE_TOO_LARGE',
      'ACTION_REQUIRES_CONFIRMATION',
      'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
      'USER_DENIED',
      'MESSAGE_TOO_LARGE',
      'PROTOCOL_VERSION_MISMATCH',
      'BROWSER_COMMAND_TIMEOUT',
      'EXTENSION_ID_MISMATCH',
    ])
  })

  it('suggests the access command for unauthorized tabs', () => {
    expect(tabNotAuthorizedError(123)).toEqual({
      code: 'TAB_NOT_AUTHORIZED',
      message: 'Request access before reading this tab.',
      recoverable: true,
      suggestedCommand: 'tabbridge tabs request-access --tab 123 --reason <reason> --json',
    })
  })

  it('includes SNAPSHOT_REQUIRED in the public error code list', () => {
    expect(ERROR_CODES).toContain('SNAPSHOT_REQUIRED')
  })

  it('suggests interactive snapshot when a snapshot is required', () => {
    expect(snapshotRequiredError()).toEqual({
      code: 'SNAPSHOT_REQUIRED',
      message: 'Run tabbridge snapshot -i before using @refs.',
      recoverable: true,
      suggestedCommand: 'tabbridge snapshot -i',
    })
  })

  it('suggests interactive snapshot for stale refs', () => {
    expect(refStaleError(undefined, '@e1')).toEqual({
      code: 'REF_STALE',
      message: 'Ref @e1 is not available in the latest snapshot. Run tabbridge snapshot -i again.',
      recoverable: true,
      suggestedCommand: 'tabbridge snapshot -i',
    })
  })

  it('describes extension disconnect recovery copy', () => {
    expect(bridgeNotConnectedError('extension_asleep')).toMatchObject({
      code: 'EXTENSION_NOT_CONNECTED',
      recoverable: true,
      suggestedCommand: 'Open Chrome and click the TabBridge extension icon to start the broker, then run tabbridge status --json.',
    })
  })
})

describe('JSON-RPC error mapping', () => {
  it('maps TAB_NOT_AUTHORIZED to a stable JSON-RPC error code', () => {
    const error = {
      code: 'TAB_NOT_AUTHORIZED' as const,
      message: 'Request access before reading this tab.',
      recoverable: true,
      suggestedCommand: 'tabbridge tabs request-access --tab 1 --reason x --json',
    }
    const rpc = tabBridgeErrorToJsonRpc(error)
    expect(rpc.code).toBeLessThan(-32000)
    expect(rpc.message).toBe('TAB_NOT_AUTHORIZED')
    expect(rpc.data).toEqual(error)
  })

  it('round-trips through JSON-RPC error data', () => {
    const original = {
      code: 'REF_STALE' as const,
      message: 'stale',
      recoverable: true,
    }
    const rpc = tabBridgeErrorToJsonRpc(original)
    expect(jsonRpcErrorToTabBridgeError(rpc)?.code).toBe('REF_STALE')
  })
})
