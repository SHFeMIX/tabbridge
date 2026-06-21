export const ERROR_CODES = [
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

export type BridgeDisconnectedState =
  | 'chrome_closed'
  | 'extension_asleep'
  | 'native_host_missing'
  | 'native_host_running_no_extension'

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
  if (state === 'native_host_missing') {
    return {
      code: 'NATIVE_HOST_NOT_CONNECTED',
      message: 'The TabBridge native host is not installed or its manifest path is invalid.',
      recoverable: true,
      suggestedCommand: 'Run tabbridge install-native-host --browser chrome --extension-id <id>, then run tabbridge doctor.',
    }
  }

  if (state === 'native_host_running_no_extension') {
    return {
      code: 'NATIVE_HOST_NOT_CONNECTED',
      message: 'The native host is running but the TabBridge extension is not connected.',
      recoverable: true,
      suggestedCommand: 'Open the TabBridge extension popup to reconnect the bridge, then run tabbridge status --json.',
    }
  }

  if (state === 'chrome_closed') {
    return {
      code: 'EXTENSION_NOT_CONNECTED',
      message: 'Chrome is not connected to the TabBridge native host.',
      recoverable: true,
      suggestedCommand: 'Open Chrome, confirm the TabBridge extension is enabled, then run tabbridge status --json.',
    }
  }

  return {
    code: 'EXTENSION_NOT_CONNECTED',
    message: 'The TabBridge extension service worker is not connected to the native host.',
    recoverable: true,
    suggestedCommand: 'Open Chrome and click the TabBridge extension icon to start the bridge, then run tabbridge status --json.',
  }
}
