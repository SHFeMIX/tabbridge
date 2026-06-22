import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createJsonRpcSuccess, type JsonRpcResponse } from '@tabbridge/shared'
import { createBrokerClient } from '../src/background/broker-client'

describe('broker client', () => {
  it('does not import the Node-only broker package into extension background code', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/background/broker-client.ts', import.meta.url)), 'utf8')
    expect(source).not.toContain("from '@tabbridge/broker'")
  })

  it('returns a JSON-RPC error when request handling fails', async () => {
    let onmessage: ((event: MessageEvent) => void) | undefined
    const send = vi.fn()
    const WebSocket = vi.fn().mockImplementation(() => ({
      send,
      close: vi.fn(),
      readyState: 1,
      set onopen(_fn: () => void) {},
      set onmessage(fn: (event: MessageEvent) => void) {
        onmessage = fn
      },
      set onclose(_fn: () => void) {},
      set onerror(_fn: () => void) {},
    }))

    createBrokerClient('ws://127.0.0.1:9876', 'extid', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      onRequest: async () => {
        throw new Error('tabs unavailable')
      },
    })

    onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: 'req_1', method: 'tabs.list' }) } as MessageEvent)
    await Promise.resolve()

    const response = JSON.parse(send.mock.calls.at(-1)?.[0] as string)
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'req_1',
      error: {
        code: -32603,
        message: 'tabs unavailable',
      },
    })
  })

  it('sends a request response on the socket that delivered the request', async () => {
    type FakeSocket = {
      send: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      readyState: number
      onmessage?: (event: MessageEvent) => void
      onclose?: () => void
    }

    const sockets: FakeSocket[] = []
    const WebSocket = vi.fn().mockImplementation(() => {
      const socket: FakeSocket = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
      }
      let messageHandler: ((event: MessageEvent) => void) | undefined
      let closeHandler: (() => void) | undefined
      Object.defineProperties(socket, {
        onopen: { set(_fn: () => void) {} },
        onmessage: {
          get() {
            return messageHandler
          },
          set(fn: (event: MessageEvent) => void) {
            messageHandler = fn
          },
        },
        onclose: {
          get() {
            return closeHandler
          },
          set(fn: () => void) {
            closeHandler = fn
          },
        },
        onerror: { set(_fn: () => void) {} },
      })
      sockets.push(socket)
      return socket
    })

    let resolveHandler: ((value: JsonRpcResponse) => void) | undefined
    createBrokerClient('ws://127.0.0.1:9876', 'extid', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      reconnectDelaysMs: [0],
      timer: {
        setTimeout: ((fn: () => void) => {
          fn()
          return 1
        }) as typeof globalThis.setTimeout,
        clearTimeout: vi.fn() as typeof globalThis.clearTimeout,
      },
      onRequest: () => new Promise((resolve) => {
        resolveHandler = resolve
      }),
    })

    sockets[0]!.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: 'req_2', method: 'tabs.current' }) } as MessageEvent)
    sockets[0]!.onclose?.()
    expect(sockets).toHaveLength(2)

    resolveHandler?.(createJsonRpcSuccess('req_2', { tabId: 7 }))
    await Promise.resolve()
    await Promise.resolve()

    expect(sockets[0]!.send).toHaveBeenCalledWith(JSON.stringify({ jsonrpc: '2.0', id: 'req_2', result: { tabId: 7 } }))
    expect(sockets[1]!.send).not.toHaveBeenCalled()
  })


  it('sends extension auth and hello after connecting', async () => {
    const WebSocket = vi.fn()
    let onopen: (() => void) | undefined
    const send = vi.fn()
    WebSocket.mockImplementation(() => ({
      send,
      close: vi.fn(),
      readyState: 1,
      set onopen(fn: () => void) {
        onopen = fn
      },
      set onmessage(_fn: () => void) {},
      set onclose(_fn: () => void) {},
      set onerror(_fn: () => void) {},
    }))

    createBrokerClient('ws://127.0.0.1:9876', 'extid', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      onRequest: vi.fn(),
    })

    onopen?.()

    const messages = send.mock.calls.map((c) => JSON.parse(c[0] as string))
    expect(messages[0]).toEqual({ type: 'auth', role: 'extension' })
    expect(messages[1].method).toBe('broker.hello')
    expect(messages[1].params.extensionId).toBe('extid')
  })
})
