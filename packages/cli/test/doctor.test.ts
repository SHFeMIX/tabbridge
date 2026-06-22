import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listening: vi.fn(),
}))

vi.mock('@tabbridge/broker', () => ({
  BROKER_PORT: 9876,
  createRuntimePaths: (home?: string) => {
    const supportDir = path.join(home ?? os.tmpdir(), 'tabbridge-runtime')
    return {
      supportDir,
      tokenPath: path.join(supportDir, 'broker-token'),
      lockPath: path.join(supportDir, 'broker.lock'),
    }
  },
}))

vi.mock('../src/ensure-broker.js', () => ({
  isBrokerListening: mocks.listening,
}))

const { runDoctor } = await import('../src/doctor.js')

describe('broker-backed doctor', () => {
  beforeEach(() => {
    mocks.listening.mockReset()
  })

  it('reports extension asleep when the broker is not listening', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-doctor-'))
    mocks.listening.mockResolvedValue(false)

    const report = await runDoctor({ home })

    expect(report).toMatchObject({
      ok: false,
      bridgeState: 'extension_asleep',
      errorCode: 'EXTENSION_NOT_CONNECTED',
      checks: expect.arrayContaining([{ name: 'broker is listening on port 9876', ok: false }]),
    })
  })

  it('checks broker token mode and lock file when broker is listening', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-doctor-'))
    const supportDir = path.join(home, 'tabbridge-runtime')
    await fs.mkdir(supportDir, { recursive: true })
    await fs.writeFile(path.join(supportDir, 'broker-token'), 'tok', { mode: 0o600 })
    await fs.writeFile(path.join(supportDir, 'broker.lock'), '{}')
    mocks.listening.mockResolvedValue(true)

    const report = await runDoctor({ home })

    expect(report).toMatchObject({
      ok: true,
      bridgeState: 'connected',
      checks: expect.arrayContaining([
        { name: 'broker is listening on port 9876', ok: true },
        { name: 'broker token file exists', ok: true },
        { name: 'broker token file mode is 0600', ok: true },
        { name: 'broker lock file exists', ok: true },
      ]),
    })
  })
})
