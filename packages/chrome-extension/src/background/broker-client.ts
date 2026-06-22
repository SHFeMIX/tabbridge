import {
  BROKER_PORT,
  PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  createJsonRpcError,
  createJsonRpcRequest,
} from '@tabbridge/shared'

const EXTENSION_VERSION = '0.1.0'
const OPEN_READY_STATE = 1
const DEFAULT_RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000] as const

export const DEFAULT_BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`

export type BrokerClientOptions = {
  WebSocket?: typeof globalThis.WebSocket
  reconnectDelaysMs?: readonly number[]
  timer?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>
  onRequest?: (request: JsonRpcRequest) => Promise<JsonRpcResponse> | JsonRpcResponse
  onDisconnect?: () => void
}

export type BrokerClient = {
  send(response: JsonRpcResponse): void
  close(): void
}

export function createBrokerClient(
  url: string,
  extensionId: string,
  options: BrokerClientOptions = {},
): BrokerClient {
  const WS = options.WebSocket ?? globalThis.WebSocket
  const timer = options.timer ?? globalThis
  const reconnectDelaysMs = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS
  let ws: WebSocket | undefined
  let messageId = 0
  let reconnectTimer: ReturnType<typeof timer.setTimeout> | undefined
  let stopped = false
  let reconnectAttempt = 0

  const clearReconnect = () => {
    if (reconnectTimer === undefined) return
    timer.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return
    const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)] ?? 5_000
    reconnectAttempt += 1
    reconnectTimer = timer.setTimeout(() => {
      reconnectTimer = undefined
      connect()
    }, delay)
  }

  const sendJson = (message: unknown, socket = ws) => {
    if (socket?.readyState !== OPEN_READY_STATE) return
    socket.send(JSON.stringify(message))
  }

  const connect = () => {
    clearReconnect()
    const socket = new WS(url)
    ws = socket

    socket.onopen = () => {
      reconnectAttempt = 0
      sendJson({ type: 'auth', role: 'extension' }, socket)
      sendJson(createJsonRpcRequest(`hello_${++messageId}`, 'broker.hello', {
        protocolVersion: PROTOCOL_VERSION,
        version: EXTENSION_VERSION,
        extensionId,
        capabilities: {
          commands: ['status', 'tabs.list', 'tabs.current'],
          permissions: ['tabs', 'activeTab'],
        },
      }), socket)
    }

    socket.onmessage = (event) => {
      void handleMessage(event, socket)
    }

    socket.onclose = () => {
      if (ws !== socket) return
      ws = undefined
      if (stopped) return
      options.onDisconnect?.()
      scheduleReconnect()
    }

    socket.onerror = () => {
      socket.close()
    }
  }

  async function handleMessage(event: MessageEvent, socket: WebSocket): Promise<void> {
    let parsed: unknown
    try {
      const text = typeof event.data === 'string' ? event.data : await event.data.text()
      parsed = JSON.parse(text)
    } catch {
      return
    }

    if (isAuthMessage(parsed) || !isJsonRpcRequest(parsed) || !options.onRequest) return

    try {
      const response = await options.onRequest(parsed)
      sendJson(response, socket)
    } catch (error) {
      sendJson(createJsonRpcError(parsed.id, {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      }), socket)
    }
  }

  connect()

  return {
    send: sendJson,
    close: () => {
      stopped = true
      clearReconnect()
      ws?.close()
      ws = undefined
    },
  }
}

function isAuthMessage(value: unknown): value is { type: 'auth' } {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'auth'
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<JsonRpcRequest>
  return candidate.jsonrpc === '2.0' && typeof candidate.id === 'string' && typeof candidate.method === 'string'
}
