import { describe, expect, it } from 'vitest'
import { ERROR_CODES, bridgeNotConnectedError, refStaleError, tabNotAuthorizedError, tabBridgeErrorToJsonRpc, jsonRpcErrorToTabBridgeError } from '../src/index.js'

describe('TabBridge errors', () => {
  it('exports the exact MVP error code set', () => {
    expect(ERROR_CODES).toEqual([
      'EXTENSION_NOT_CONNECTED',
      'NATIVE_HOST_NOT_CONNECTED',
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

  it('suggests a new snapshot for stale refs', () => {
    expect(refStaleError(123)).toEqual({
      code: 'REF_STALE',
      message: 'The element reference is stale. Take a new snapshot and retry with a ref from that snapshot.',
      recoverable: true,
      suggestedCommand: 'tabbridge snapshot --tab 123 --json',
    })
  })

  it('distinguishes extension sleep from missing native host in recovery copy', () => {
    expect(bridgeNotConnectedError('extension_asleep')).toMatchObject({
      code: 'EXTENSION_NOT_CONNECTED',
      recoverable: true,
      suggestedCommand: 'Open Chrome and click the TabBridge extension icon to start the bridge, then run tabbridge status --json.',
    })

    expect(bridgeNotConnectedError('native_host_missing')).toMatchObject({
      code: 'NATIVE_HOST_NOT_CONNECTED',
      recoverable: true,
      suggestedCommand: 'Run tabbridge install-native-host --browser chrome --extension-id <id>, then run tabbridge doctor.',
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
