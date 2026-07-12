import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const mocks = vi.hoisted(() => {
  const eventListeners = new Map<string, Listener[]>()
  const spawnedChild = {
    unref: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => {
      eventListeners.set(event, [...(eventListeners.get(event) ?? []), listener])
      return spawnedChild
    }),
    _emit(event: string, ...args: unknown[]) {
      for (const listener of eventListeners.get(event) ?? []) {
        listener(...args)
      }
    },
  }
  return {
    listeningResults: [] as boolean[],
    spawn: vi.fn(() => spawnedChild),
    spawnedChild,
    readToken: vi.fn(),
  }
})

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}))

vi.mock('@tabbridge/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tabbridge/shared')>()),
  BROKER_PORT: 9876,
}))

vi.mock('@tabbridge/broker', () => ({
  createRuntimePaths: () => ({
    supportDir: '/tmp/tabbridge-test',
    tokenPath: '/tmp/tabbridge-test/broker-token',
    lockPath: '/tmp/tabbridge-test/broker.lock',
  }),
  readToken: mocks.readToken,
}))

vi.mock('ws', () => ({
  WebSocket: class FakeWebSocket {
    private listeners = new Map<string, Listener[]>()

    constructor() {
      setImmediate(() => {
        if (mocks.listeningResults.shift() ?? false) {
          this.emit('open')
        } else {
          this.emit('error', new Error('not listening'))
        }
      })
    }

    once(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    }

    terminate() {}

    private emit(event: string, ...args: unknown[]) {
      const listeners = this.listeners.get(event) ?? []
      this.listeners.delete(event)
      for (const listener of listeners) listener(...args)
    }
  },
}))

const { ensureBroker, isBrokerListening } = await import('../src/ensure-broker.js')

describe.sequential('ensure-broker helpers', () => {
  beforeEach(() => {
    mocks.listeningResults = []
    mocks.spawn.mockClear()
    mocks.spawnedChild.unref.mockClear()
    mocks.spawnedChild.on.mockClear()
    mocks.readToken.mockReset()
  })

  it('returns false when nothing is listening on the port', async () => {
    expect(await isBrokerListening('ws://127.0.0.1:1')).toBe(false)
  })

  it('starts the broker entry bundled inside the CLI package', async () => {
    mocks.listeningResults = [false, true]
    mocks.readToken.mockResolvedValue('existing-token')

    const result = await ensureBroker({
      brokerEntryExists: async () => true,
      waitTimeoutMs: 50,
      waitIntervalMs: 1,
    })

    expect(result.token).toBe('existing-token')
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/tabbridge.*broker\.js$/)],
      { detached: true, stdio: 'ignore', windowsHide: true },
    )
    expect(mocks.spawn).not.toHaveBeenCalledWith(
      process.execPath,
      [expect.any(String), 'broker'],
      expect.anything(),
    )
  })

  it('reports a clear error when the built broker entry is missing', async () => {
    mocks.listeningResults = [false]

    await expect(
      ensureBroker({
        brokerEntryExists: async () => false,
        waitTimeoutMs: 1,
        waitIntervalMs: 1,
      }),
    ).rejects.toThrow('BROKER_ENTRY_MISSING')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('reports a clear error when a broker is listening but the token file is missing', async () => {
    mocks.listeningResults = [true]
    mocks.readToken.mockResolvedValue(undefined)

    await expect(ensureBroker()).rejects.toThrow('BROKER_TOKEN_MISSING')
  })

  it('reports a clear error when the spawned broker fails to start', async () => {
    mocks.listeningResults = [false]
    mocks.readToken.mockResolvedValue(undefined)

    const promise = ensureBroker({
      brokerEntryExists: async () => true,
      waitTimeoutMs: 50,
      waitIntervalMs: 1,
    })

    // Give the mock WebSocket a chance to report not-listening so the wait loop begins.
    await new Promise((resolve) => setTimeout(resolve, 5))
    mocks.spawnedChild._emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow('BROKER_START_FAILED: ENOENT')
  })

  it('reports a clear error when the broker starts but the token file is missing', async () => {
    mocks.listeningResults = [false, true]
    mocks.readToken.mockResolvedValue(undefined)

    await expect(
      ensureBroker({
        brokerEntryExists: async () => true,
        waitTimeoutMs: 50,
        waitIntervalMs: 1,
      }),
    ).rejects.toThrow('BROKER_TOKEN_MISSING')
  })
})
