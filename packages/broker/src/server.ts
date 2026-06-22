import type { IncomingMessage } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import {
  type JsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type TabBridgeError,
  createJsonRpcError,
  createJsonRpcSuccess,
  tabBridgeErrorToJsonRpc,
} from '@tabbridge/shared'

export type BrokerClient = {
  socket: WebSocket
  role?: 'cli' | 'extension'
  authenticated: boolean
}

export type BrokerServerOptions = {
  port: number
  token: string
}

export type BrokerStatus = {
  cliConnected: boolean
  extensionConnected: boolean
  extensionHello?: unknown
}

const STANDARD_ERRORS = {
  parseError: { code: -32700, message: 'Parse error' },
  invalidRequest: { code: -32600, message: 'Invalid Request' },
  methodNotFound: { code: -32601, message: 'Method not found' },
  internalError: { code: -32603, message: 'Internal error' },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAuthMessage(value: unknown): value is { token?: string; role?: string } {
  return isRecord(value) && (('token' in value) || ('role' in value))
}

function looksLikeResponse(value: Record<string, unknown>): value is { id: string; result?: unknown; error?: unknown } {
  return typeof value.id === 'string' && (('result' in value) || ('error' in value))
}

export class BrokerServer {
  private readonly wss: WebSocketServer
  private readonly clients = new Set<BrokerClient>()
  private extensionClient: BrokerClient | undefined
  private readonly pending = new Map<string, BrokerClient>()
  private hello: unknown | undefined
  readonly port: number

  constructor(private readonly options: BrokerServerOptions) {
    this.wss = new WebSocketServer({ port: options.port })
    this.port = (this.wss.address() as { port: number }).port
    this.wss.on('connection', (socket, req) => this.handleConnection(socket, req))
  }

  status(): BrokerStatus {
    return {
      cliConnected: [...this.clients].some((c) => c.role === 'cli'),
      extensionConnected: this.extensionClient !== undefined && this.extensionClient.socket.readyState === WebSocket.OPEN,
      extensionHello: this.hello,
    }
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const client: BrokerClient = { socket, authenticated: false }
    this.clients.add(client)

    const authTimeout = setTimeout(() => {
      if (!client.authenticated) socket.close()
    }, 5000)

    socket.on('message', async (data) => {
      try {
        await this.handleMessage(client, data, req.headers.origin)
      } catch {
        socket.send(JSON.stringify(createJsonRpcError('unknown', STANDARD_ERRORS.internalError)))
      }
    })

    socket.on('close', () => {
      clearTimeout(authTimeout)
      this.clients.delete(client)
      if (this.extensionClient === client) {
        this.extensionClient = undefined
        this.hello = undefined
      }
      for (const [id, pendingClient] of this.pending) {
        if (pendingClient === client) this.pending.delete(id)
      }
    })
  }

  private async handleMessage(client: BrokerClient, data: RawData, origin: string | undefined): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(data.toString('utf8'))
    } catch {
      client.socket.send(JSON.stringify(createJsonRpcError('unknown', STANDARD_ERRORS.parseError)))
      return
    }

    if (!client.authenticated) {
      if (!isAuthMessage(parsed)) {
        client.socket.close()
        return
      }
      if (parsed.token === this.options.token) {
        client.authenticated = true
        client.role = 'cli'
      } else if (parsed.role === 'extension' && typeof origin === 'string' && origin.startsWith('chrome-extension://')) {
        client.authenticated = true
        client.role = 'extension'
        this.extensionClient = client
      } else {
        client.socket.close()
      }
      return
    }

    if (!isRecord(parsed)) return

    if (client.role === 'extension') {
      if (looksLikeResponse(parsed)) {
        const pendingCli = this.pending.get(parsed.id)
        if (pendingCli) {
          pendingCli.socket.send(JSON.stringify(parsed))
          this.pending.delete(parsed.id)
        }
        return
      }
      if (parsed.method === 'broker.hello') {
        this.hello = parsed.params
        client.socket.send(JSON.stringify(createJsonRpcSuccess(String(parsed.id), { ok: true })))
      }
      return
    }

    const request = parsed as Partial<JsonRpcRequest>
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || typeof request.id !== 'string') {
      client.socket.send(JSON.stringify(createJsonRpcError(String(request.id ?? 'unknown'), STANDARD_ERRORS.invalidRequest)))
      return
    }

    if (!this.extensionClient || this.extensionClient.socket.readyState !== WebSocket.OPEN) {
      const error: TabBridgeError = {
        code: 'EXTENSION_NOT_CONNECTED',
        message: 'The TabBridge extension is not connected.',
        recoverable: true,
        suggestedCommand: 'Open Chrome and click the TabBridge extension icon, then run tabbridge status --json.',
      }
      client.socket.send(JSON.stringify(createJsonRpcError(request.id, tabBridgeErrorToJsonRpc(error))))
      return
    }

    this.pending.set(request.id, client)
    this.extensionClient.socket.send(JSON.stringify(request))
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => resolve())
      for (const client of this.clients) {
        client.socket.terminate()
      }
    })
  }
}
