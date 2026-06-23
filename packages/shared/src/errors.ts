export const ERROR_CODES = [
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
] as const

export type TabBridgeErrorCode = (typeof ERROR_CODES)[number]

export type TabBridgeError = {
  code: TabBridgeErrorCode
  message: string
  recoverable: boolean
  suggestedCommand?: string
  approvalId?: string
  pollCommand?: string
  expiresAt?: number
}

export type BridgeDisconnectedState = 'chrome_closed' | 'extension_asleep'

export function tabNotAuthorizedError(tabId: number): TabBridgeError {
  return {
    code: 'TAB_NOT_AUTHORIZED',
    message: 'Request access before reading this tab.',
    recoverable: true,
    suggestedCommand: `tabbridge tabs request-access --tab ${tabId} --reason <reason> --json`,
  }
}

export function refStaleError(tabId: number): TabBridgeError {
  return {
    code: 'REF_STALE',
    message: 'The element reference is stale. Take a new snapshot and retry with a ref from that snapshot.',
    recoverable: true,
    suggestedCommand: `tabbridge snapshot --tab ${tabId} --json`,
  }
}

export function bridgeNotConnectedError(state: BridgeDisconnectedState): TabBridgeError {
  if (state === 'chrome_closed') {
    return {
      code: 'EXTENSION_NOT_CONNECTED',
      message: 'Chrome is not connected to the TabBridge broker.',
      recoverable: true,
      suggestedCommand: 'Open Chrome, confirm the TabBridge extension is enabled, then run tabbridge status --json.',
    }
  }

  return {
    code: 'EXTENSION_NOT_CONNECTED',
    message: 'The TabBridge extension service worker is not connected to the broker.',
    recoverable: true,
    suggestedCommand: 'Open Chrome and click the TabBridge extension icon to start the broker, then run tabbridge status --json.',
  }
}

import type { JsonRpcError } from './jsonrpc.js'

const JSON_RPC_TABBRIDGE_ERROR_BASE = -32000

export const TAB_BRIDGE_ERROR_CODE_INDEX: Record<TabBridgeErrorCode, number> = Object.fromEntries(
  ERROR_CODES.map((code, index) => [code, index]),
) as Record<TabBridgeErrorCode, number>

export function tabBridgeErrorToJsonRpc(error: TabBridgeError): JsonRpcError {
  return {
    code: JSON_RPC_TABBRIDGE_ERROR_BASE - TAB_BRIDGE_ERROR_CODE_INDEX[error.code],
    message: error.code,
    data: error,
  }
}

export function jsonRpcErrorToTabBridgeError(error: JsonRpcError): TabBridgeError | undefined {
  const data = error.data
  if (typeof data !== 'object' || data === null) return undefined
  const candidate = data as Partial<TabBridgeError>
  if (
    typeof candidate.code === 'string'
    && ERROR_CODES.includes(candidate.code as never)
    && typeof candidate.message === 'string'
    && typeof candidate.recoverable === 'boolean'
  ) {
    return candidate as TabBridgeError
  }
  return undefined
}
