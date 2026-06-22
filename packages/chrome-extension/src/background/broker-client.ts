import { BROKER_PORT } from '@tabbridge/broker'
import {
  PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  createJsonRpcRequest,
} from '@tabbridge/shared'

const EXTENSION_VERSION = '0.1.0'
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

  const sendJson = (message: unknown) => {
    ws?.send(JSON.stringify(message))
  }

  const connect = () => {
    clearReconnect()
    ws = new WS(url)

    ws.onopen = () => {
      reconnectAttempt = 0
      sendJson({ type: 'auth', role: 'extension' })
      sendJson(createJsonRpcRequest(`hello_${++messageId}`, 'broker.hello', {
        protocolVersion: PROTOCOL_VERSION,
        version: EXTENSION_VERSION,
        extensionId,
        capabilities: {
          commands: ['status', 'tabs.list', 'tabs.current', 'tabs.requestAccess', 'snapshot'],
          snapshot: ['semantic', 'text', 'html', 'screenshot'],
          permissions: ['tabs', 'host-permission', 'activeTab', 'scripting', 'storage'],
        },
      }))
    }

    ws.onmessage = (event) => {
      void handleMessage(event)
    }

    ws.onclose = () => {
      if (stopped) return
      options.onDisconnect?.()
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  async function handleMessage(event: MessageEvent): Promise<void> {
    const text = typeof event.data === 'string' ? event.data : await event.data.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }

    if (isAuthMessage(parsed) || !isJsonRpcRequest(parsed) || !options.onRequest) return

    const response = await options.onRequest(parsed)
    sendJson(response)
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
