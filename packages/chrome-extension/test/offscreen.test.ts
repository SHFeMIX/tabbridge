// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createBrokerClient } from '../src/offscreen/broker-client'

describe('offscreen broker client', () => {
  it('does not import the Node-only broker package into offscreen code', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/offscreen/broker-client.ts', import.meta.url)), 'utf8')
    expect(source).not.toContain("from '@tabbridge/broker'")
  })

  it('sends extension auth and hello after connecting', async () => {
    const WebSocket = vi.fn()
    let onopen: (() => void) | undefined
    const send = vi.fn()
    WebSocket.mockImplementation(() => ({
      send,
      close: vi.fn(),
      readyState: 1,
      set onopen(fn: () => void) { onopen = fn },
      set onmessage(_fn: () => void) {},
      set onclose(_fn: () => void) {},
      set onerror(_fn: () => void) {},
    }))

    createBrokerClient('ws://127.0.0.1:9876', 'extid', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    })

    onopen?.()

    const messages = send.mock.calls.map((c) => JSON.parse(c[0] as string))
    expect(messages[0]).toEqual({ type: 'auth', role: 'extension' })
    expect(messages[1].method).toBe('broker.hello')
    expect(messages[1].params.extensionId).toBe('extid')
  })

  it('forwards broker requests via onRequest callback', async () => {
    type FakeSocket = {
      send: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      readyState: number
      onmessage?: (event: MessageEvent) => void
    }
    const sockets: FakeSocket[] = []
    const WebSocket = vi.fn().mockImplementation(() => {
      const socket: FakeSocket = { send: vi.fn(), close: vi.fn(), readyState: 1 }
      let messageHandler: ((event: MessageEvent) => void) | undefined
      Object.defineProperty(socket, 'onmessage', {
        get() { return messageHandler },
        set(fn: (event: MessageEvent) => void) { messageHandler = fn },
      })
      sockets.push(socket)
      return socket
    })
    const onRequest = vi.fn()

    createBrokerClient('ws://127.0.0.1:9876', 'extid', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      onRequest,
    })

    const request = {
      jsonrpc: '2.0' as const,
      id: 'r1',
      method: 'tabs.list',
      params: {},
    }
    sockets[0]!.onmessage?.({ data: JSON.stringify(request) } as MessageEvent)

    expect(onRequest).toHaveBeenCalledWith(request)
  })

  it('sends broker.disconnected via onDisconnect callback when WebSocket closes', async () => {
    type FakeSocket = {
      send: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      readyState: number
      onclose?: () => void
    }
    const sockets: FakeSocket[] = []
    const WebSocket = vi.fn().mockImplementation(() => {
      const socket: FakeSocket = { send: vi.fn(), close: vi.fn(), readyState: 1 }
      let closeHandler: (() => void) | undefined
      Object.defineProperty(socket, 'onclose', {
        get() { return closeHandler },
        set(fn: () => void) { closeHandler = fn },
      })
      sockets.push(socket)
      return socket
    })
    const onDisconnect = vi.fn()

    createBrokerClient('ws://127.0.0.1:9876', 'extid', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      onDisconnect,
    })

    // Trigger the WebSocket close event
    sockets[0]!.onclose?.()

    expect(onDisconnect).toHaveBeenCalled()
  })
})
