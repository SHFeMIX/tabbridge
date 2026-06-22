import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const mocks = vi.hoisted(() => {
  const spawnedChild = { unref: vi.fn() }
  return {
    listeningResults: [] as boolean[],
    spawn: vi.fn(() => spawnedChild),
    spawnedChild,
    readToken: vi.fn(),
    writeToken: vi.fn(),
  }
})

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}))

vi.mock('@tabbridge/broker', () => ({
  BROKER_PORT: 9876,
  createRuntimePaths: () => ({
    supportDir: '/tmp/tabbridge-test',
    tokenPath: '/tmp/tabbridge-test/broker-token',
    lockPath: '/tmp/tabbridge-test/broker.lock',
  }),
  generateToken: () => 'generated-token',
  readToken: mocks.readToken,
  writeToken: mocks.writeToken,
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

describe('ensure-broker helpers', () => {
  beforeEach(() => {
    mocks.listeningResults = []
    mocks.spawn.mockClear()
    mocks.spawnedChild.unref.mockClear()
    mocks.readToken.mockReset()
    mocks.writeToken.mockReset()
  })

  it('returns false when nothing is listening on the port', async () => {
    expect(await isBrokerListening('ws://127.0.0.1:1')).toBe(false)
  })

  it('starts the built broker entry instead of requiring a future CLI broker command', async () => {
    mocks.listeningResults = [false, true]
    mocks.readToken.mockResolvedValue('existing-token')

    const result = await ensureBroker({
      brokerEntryExists: async () => true,
      waitTimeoutMs: 1,
      waitIntervalMs: 1,
    })

    expect(result.token).toBe('existing-token')
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('packages/broker/dist/main.js')],
      { detached: true, stdio: 'ignore' },
    )
    expect(mocks.spawn).not.toHaveBeenCalledWith(
      process.execPath,
      [expect.any(String), 'broker'],
      expect.anything(),
    )
  })

  it('uses an import eval fallback when the built broker entry is missing', async () => {
    const originalArgv = [...process.argv]
    const cliEntrypoint = '/repo/packages/cli/dist/index.js'
    process.argv[1] = cliEntrypoint
    mocks.listeningResults = [false, true]
    mocks.readToken.mockResolvedValue('existing-token')

    try {
      const result = await ensureBroker({
        brokerEntryExists: async () => false,
        waitTimeoutMs: 50,
        waitIntervalMs: 1,
      })

      expect(result.token).toBe('existing-token')
      expect(mocks.spawn).toHaveBeenCalledWith(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          expect.stringContaining("import('@tabbridge/broker')"),
        ],
        { detached: true, stdio: 'ignore' },
      )
      expect(mocks.spawn).not.toHaveBeenCalledWith(
        process.execPath,
        [cliEntrypoint, 'broker'],
        expect.anything(),
      )
    } finally {
      process.argv.splice(0, process.argv.length, ...originalArgv)
    }
  })

  it('reports a clear error when a broker is listening but the token file is missing', async () => {
    mocks.listeningResults = [true]
    mocks.readToken.mockResolvedValue(undefined)

    await expect(ensureBroker()).rejects.toThrow('BROKER_TOKEN_MISSING')
  })
})
