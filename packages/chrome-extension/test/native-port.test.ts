import { describe, expect, it, vi } from 'vitest'
import { createHelloMessage, createNativePortManager, type NativePortLike } from '../src/background/native-port'

function createMockPort(): NativePortLike & { disconnect(): void } {
  let disconnectListener: (() => void) | undefined

  return {
    postMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListener = listener
      }),
    },
    disconnect() {
      disconnectListener?.()
    },
  }
}

describe('native port manager', () => {
  it('creates a protocol version 1 extension hello', () => {
    expect(createHelloMessage('abcdefghijklmnopabcdefghijklmnop')).toEqual({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      capabilities: {
        commands: ['status', 'tabs.list', 'tabs.current', 'tabs.requestAccess', 'snapshot', 'text', 'html', 'screenshot'],
        snapshot: ['semantic', 'text', 'html', 'screenshot'],
        permissions: ['tabs', 'host-permission', 'nativeMessaging', 'scripting', 'storage'],
      },
    })
  })

  it('uses connectNative and posts hello immediately', () => {
    const postMessage = vi.fn()
    const connectNative = vi.fn(() => ({
      postMessage,
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
    }))

    const manager = createNativePortManager({ connectNative }, { extensionId: 'abcdefghijklmnopabcdefghijklmnop' })
    manager.connect()

    expect(connectNative).toHaveBeenCalledWith('com.tabbridge.host')
    expect(postMessage).toHaveBeenCalledWith(createHelloMessage('abcdefghijklmnopabcdefghijklmnop'))
  })

  it('reconnects with increasing backoff when the native port disconnects', () => {
    vi.useFakeTimers()
    const ports = [createMockPort(), createMockPort(), createMockPort()]
    const connectNative = vi.fn(() => {
      const port = ports.shift()
      if (!port) throw new Error('Unexpected native port connection')
      return port
    })

    const manager = createNativePortManager(
      { connectNative },
      {
        extensionId: 'abcdefghijklmnopabcdefghijklmnop',
        reconnectDelaysMs: [100, 200],
      },
    )

    const firstPort = manager.connect() as NativePortLike & { disconnect(): void }
    firstPort.disconnect()

    expect(manager.currentPort()).toBeUndefined()
    expect(connectNative).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(99)
    expect(connectNative).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(connectNative).toHaveBeenCalledTimes(2)

    const secondPort = manager.currentPort() as (NativePortLike & { disconnect(): void }) | undefined
    secondPort?.disconnect()
    vi.advanceTimersByTime(199)
    expect(connectNative).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(1)
    expect(connectNative).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })
})
