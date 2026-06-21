import {
  PROTOCOL_VERSION,
  type BridgeHello,
  type BridgeRequest,
  type BridgeResponse,
} from '@tabbridge/shared'

const HOST_NAME = 'com.tabbridge.host'
const EXTENSION_VERSION = '0.1.0'
const DEFAULT_RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000] as const

export type RuntimeLike = {
  connectNative(name: string): NativePortLike
}

export type NativePortLike = {
  postMessage(message: unknown): void
  onMessage: { addListener(listener: (message: unknown) => void): void }
  onDisconnect: { addListener(listener: () => void): void }
}

type TimerLike = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>

export type NativePortManagerOptions = {
  extensionId: string
  reconnectDelaysMs?: readonly number[]
  timer?: TimerLike
  onMessage?: (message: BridgeRequest) => Promise<BridgeResponse> | BridgeResponse
}

export type NativePortManager = {
  connect(): NativePortLike
  disconnect(): void
  currentPort(): NativePortLike | undefined
}

export function createHelloMessage(extensionId: string): BridgeHello {
  return {
    type: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    role: 'extension',
    version: EXTENSION_VERSION,
    extensionId,
    capabilities: {
      commands: ['status', 'tabs.list', 'tabs.current', 'tabs.requestAccess', 'snapshot', 'text', 'html', 'screenshot'],
      snapshot: ['semantic', 'text', 'html', 'screenshot'],
      permissions: ['tabs', 'host-permission', 'nativeMessaging', 'scripting', 'storage'],
    },
  }
}

export function createNativePortManager(
  runtime: RuntimeLike,
  options: NativePortManagerOptions,
): NativePortManager {
  const reconnectDelaysMs = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS
  const timer = options.timer ?? globalThis
  let port: NativePortLike | undefined
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<TimerLike['setTimeout']> | undefined
  let stopped = false

  const clearReconnectTimer = () => {
    if (reconnectTimer === undefined) return
    timer.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const connectPort = (): NativePortLike => {
    clearReconnectTimer()
    const connectedPort = runtime.connectNative(HOST_NAME)
    port = connectedPort

    connectedPort.postMessage(createHelloMessage(options.extensionId))
    connectedPort.onMessage.addListener((message) => {
      void handleMessage(connectedPort, message)
    })
    connectedPort.onDisconnect.addListener(() => {
      if (port === connectedPort) {
        port = undefined
      }
      scheduleReconnect()
    })

    return connectedPort
  }

  const manager: NativePortManager = {
    connect(): NativePortLike {
      stopped = false
      reconnectAttempt = 0
      return connectPort()
    },

    disconnect(): void {
      stopped = true
      port = undefined
      clearReconnectTimer()
    },

    currentPort(): NativePortLike | undefined {
      return port
    },
  }

  async function handleMessage(connectedPort: NativePortLike, message: unknown): Promise<void> {
    if (!options.onMessage) return

    const response = await options.onMessage(message as BridgeRequest)
    connectedPort.postMessage(response)
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== undefined) return

    const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)] ?? 0
    reconnectAttempt += 1
    reconnectTimer = timer.setTimeout(() => {
      reconnectTimer = undefined
      connectPort()
    }, delay)
  }

  return manager
}
