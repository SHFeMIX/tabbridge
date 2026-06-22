import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { runBroker } from '../src/main.js'
import { createRuntimePaths, readToken, writeToken } from '../src/runtime.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WebSocket } from 'ws'

import packageJson from '../package.json' with { type: 'json' }

async function createTempPaths() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-broker-test-'))
  return createRuntimePaths(tmpDir)
}

describe('runBroker', () => {
  let tempPaths: Awaited<ReturnType<typeof createTempPaths>>

  beforeEach(async () => {
    tempPaths = await createTempPaths()
  })

  afterEach(async () => {
    await fs.rm(tempPaths.supportDir, { recursive: true, force: true })
  })

  it('starts a server on the configured port and can be closed', async () => {
    const broker = await runBroker(tempPaths)
    expect(broker.port).toBe(9876)
    await broker.close()
  })

  it('accepts a WebSocket connection', async () => {
    const broker = await runBroker(tempPaths)
    const token = await readToken(tempPaths)
    expect(token).toBeDefined()

    const ws = new WebSocket(`ws://localhost:${broker.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', (err) => reject(err))
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 3000)
    })

    ws.close()
    await broker.close()
  })

  it('reuses an existing token file', async () => {
    const existingToken = 'existing-test-token-12345'
    await fs.mkdir(tempPaths.supportDir, { recursive: true })
    await writeToken(tempPaths, existingToken)

    const broker = await runBroker(tempPaths)
    const token = await readToken(tempPaths)
    expect(token).toBe(existingToken)

    await broker.close()
  })

  it('can be restarted after close', async () => {
    const broker1 = await runBroker(tempPaths)
    await broker1.close()

    const broker2 = await runBroker(tempPaths)
    expect(broker2.port).toBe(9876)

    const token = await readToken(tempPaths)
    expect(token).toBeDefined()

    const ws = new WebSocket(`ws://localhost:${broker2.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', (err) => reject(err))
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 3000)
    })

    ws.close()
    await broker2.close()
  })
})

describe('broker package executable entry', () => {
  it('declares a tabbridge-broker bin that is built from src/main.ts', () => {
    expect(packageJson.bin).toEqual({ 'tabbridge-broker': 'dist/main.js' })
    expect(packageJson.scripts.build).toContain('src/index.ts')
    expect(packageJson.scripts.build).toContain('src/main.ts')
  })
})
