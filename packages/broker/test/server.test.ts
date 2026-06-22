import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { BrokerServer } from '../src/server.js'


type JsonObject = Record<string, unknown>

async function openSocket(url: string, origin?: string): Promise<WebSocket> {
  const ws = new WebSocket(url, origin === undefined ? undefined : { origin })
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  return ws
}

function nextJsonMessage(ws: WebSocket): Promise<JsonObject> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString('utf8')) as JsonObject))
  })
}

function jsonRpcErrorCode(message: JsonObject): string | undefined {
  const error = message.error as { data?: { code?: string } } | undefined
  return error?.data?.code
}

describe('BrokerServer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a CLI request when no extension is connected', async () => {
    const server = new BrokerServer({ port: 0, token: 'secret' })
    try {
      const url = `ws://127.0.0.1:${(server as unknown as { port: number }).port}`
      const ws = await openSocket(url)

      ws.send(JSON.stringify({ type: 'auth', token: 'secret' }))
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 'r1', method: 'tabs.list', params: {} }))

      const parsed = await nextJsonMessage(ws)
      expect(jsonRpcErrorCode(parsed)).toBe('EXTENSION_NOT_CONNECTED')
      ws.close()
    } finally {
      await server.close()
    }
  })

  it('fails pending CLI requests when the extension disconnects', async () => {
    const server = new BrokerServer({ port: 0, token: 'secret' })
    try {
      const url = `ws://127.0.0.1:${(server as unknown as { port: number }).port}`
      const extension = await openSocket(url, 'chrome-extension://test-extension')
      const cli = await openSocket(url)
      extension.send(JSON.stringify({ type: 'auth', role: 'extension' }))
      cli.send(JSON.stringify({ type: 'auth', token: 'secret' }))

      cli.send(JSON.stringify({ jsonrpc: '2.0', id: 'pending-1', method: 'tabs.list', params: {} }))
      await nextJsonMessage(extension)
      extension.close()

      const response = await nextJsonMessage(cli)
      expect(jsonRpcErrorCode(response)).toBe('EXTENSION_NOT_CONNECTED')
      cli.close()
    } finally {
      await server.close()
    }
  })

  it('returns a structured error when a CLI request id is already pending', async () => {
    const server = new BrokerServer({ port: 0, token: 'secret' })
    try {
      const url = `ws://127.0.0.1:${(server as unknown as { port: number }).port}`
      const extension = await openSocket(url, 'chrome-extension://test-extension')
      const cli = await openSocket(url)
      extension.send(JSON.stringify({ type: 'auth', role: 'extension' }))
      cli.send(JSON.stringify({ type: 'auth', token: 'secret' }))

      const request = { jsonrpc: '2.0', id: 'same-id', method: 'tabs.list', params: {} }
      cli.send(JSON.stringify(request))
      await nextJsonMessage(extension)
      cli.send(JSON.stringify(request))

      const response = await nextJsonMessage(cli)
      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 'same-id',
        error: {
          code: -32600,
          message: 'Duplicate pending request id',
        },
      })
      cli.close()
      extension.close()
    } finally {
      await server.close()
    }
  })

  it('times out pending CLI requests when the extension does not respond', async () => {
    vi.useFakeTimers()
    const server = new BrokerServer({ port: 0, token: 'secret', requestTimeoutMs: 25 })
    try {
      const url = `ws://127.0.0.1:${(server as unknown as { port: number }).port}`
      const extension = await openSocket(url, 'chrome-extension://test-extension')
      const cli = await openSocket(url)
      extension.send(JSON.stringify({ type: 'auth', role: 'extension' }))
      cli.send(JSON.stringify({ type: 'auth', token: 'secret' }))

      cli.send(JSON.stringify({ jsonrpc: '2.0', id: 'timeout-1', method: 'tabs.list', params: {} }))
      await nextJsonMessage(extension)
      const responsePromise = nextJsonMessage(cli)
      await vi.advanceTimersByTimeAsync(25)

      const response = await responsePromise
      expect(jsonRpcErrorCode(response)).toBe('BRIDGE_REQUEST_TIMEOUT')
      cli.close()
      extension.close()
    } finally {
      await server.close()
    }
  })

})
