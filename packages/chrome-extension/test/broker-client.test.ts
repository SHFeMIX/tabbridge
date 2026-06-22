import { describe, expect, it, vi } from 'vitest'
import { createBrokerClient } from '../src/background/broker-client'

describe('broker client', () => {
  it('sends extension auth and hello after connecting', async () => {
    const WebSocket = vi.fn()
    let onopen: (() => void) | undefined
    const send = vi.fn()
    WebSocket.mockImplementation(() => ({
      send,
      close: vi.fn(),
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
