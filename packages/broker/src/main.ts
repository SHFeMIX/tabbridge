#!/usr/bin/env node
import { createRuntimePaths, ensureSupportDir, generateToken, readToken, writeToken, BROKER_PORT, type RuntimePaths } from './runtime.js'
import { acquireBrokerLock } from './lock.js'
import { BrokerServer } from './server.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type Broker = {
  port: number
  close: () => Promise<void>
}

export async function runBroker(pathsArg?: RuntimePaths): Promise<Broker> {
  const paths = pathsArg ?? createRuntimePaths()
  await ensureSupportDir(paths)
  await fs.writeFile(paths.lockPath, '', { mode: 0o600 })
  const release = await acquireBrokerLock(paths.lockPath)
  let token = await readToken(paths)
  if (!token) {
    token = generateToken()
    await writeToken(paths, token)
  }
  const server = new BrokerServer({ port: BROKER_PORT, token })
  return {
    port: server.port,
    close: async () => {
      await server.close()
      await release()
    },
  }
}

function isExecutedEntrypoint(): boolean {
  if (!process.argv[1]) return false
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}

if (isExecutedEntrypoint()) {
  runBroker().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
