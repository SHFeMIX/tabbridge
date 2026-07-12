import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { runBroker } from '../src/run-broker.js'
import { createRuntimePaths, readToken, writeToken } from '../src/runtime.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WebSocket } from 'ws'

import packageJson from '../package.json' with { type: 'json' }
import fsSync from 'node:fs'

async function createTempPaths() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-broker-test-'))
  return createRuntimePaths(tmpDir)
}

describe.sequential('runBroker', () => {
  let tempPaths: Awaited<ReturnType<typeof createTempPaths>>
  let broker: Awaited<ReturnType<typeof runBroker>> | undefined

  beforeEach(async () => {
    tempPaths = await createTempPaths()
    broker = undefined
  })

  afterEach(async () => {
    await broker?.close()
    broker = undefined
    await fs.rm(tempPaths.supportDir, { recursive: true, force: true })
  })

  it('starts a server on an ephemeral port and can be closed', async () => {
    broker = await runBroker(tempPaths, 0)
    expect(broker.port).toBeGreaterThan(0)
  })

  it('accepts a WebSocket connection', async () => {
    broker = await runBroker(tempPaths, 0)
    const token = await readToken(tempPaths)
    expect(token).toBeDefined()

    const ws = new WebSocket(`ws://localhost:${broker.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', (err) => reject(err))
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 3000)
    })

    ws.close()
  })

  it('rotates an existing token file on startup', async () => {
    const existingToken = 'existing-test-token-12345'
    await fs.mkdir(tempPaths.supportDir, { recursive: true })
    await writeToken(tempPaths, existingToken)

    broker = await runBroker(tempPaths, 0)
    const token = await readToken(tempPaths)
    expect(token).toBeDefined()
    expect(token).not.toBe(existingToken)
  })

  it('can be restarted after close', async () => {
    const broker1 = await runBroker(tempPaths, 0)
    const token1 = await readToken(tempPaths)
    const port1 = broker1.port
    await broker1.close()

    broker = await runBroker(tempPaths, 0)
    expect(broker.port).toBeGreaterThan(0)

    const token = await readToken(tempPaths)
    expect(token).toBeDefined()
    expect(token).not.toBe(token1)

    const ws = new WebSocket(`ws://localhost:${broker.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', (err) => reject(err))
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 3000)
    })

    ws.close()
  })
})

describe('broker package executable entry', () => {
  it('declares a tabbridge-broker bin and builds from src/index.ts and src/main.ts', () => {
    expect(packageJson.bin).toEqual({ 'tabbridge-broker': 'dist/main.js' })

    const tsupConfigPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'tsup.config.ts')
    const tsupConfig = fsSync.readFileSync(tsupConfigPath, 'utf8')
    expect(tsupConfig).toContain("entry: ['src/index.ts', 'src/main.ts']")
  })

  it('guards the auto-start side effect with isExecutedEntrypoint in src/main.ts', () => {
    const mainSourcePath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'main.ts')
    const mainSource = fsSync.readFileSync(mainSourcePath, 'utf8')
    expect(mainSource).toContain('function isExecutedEntrypoint()')
    expect(mainSource).toContain('if (isExecutedEntrypoint())')
    expect(mainSource).toContain('runBroker()')
  })
})
