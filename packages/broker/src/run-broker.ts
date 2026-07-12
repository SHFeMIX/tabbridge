import { createRuntimePaths, ensureSupportDir, generateToken, writeToken, type RuntimePaths } from './runtime.js'
import { acquireBrokerLock } from './lock.js'
import { BrokerServer } from './server.js'
import fs from 'node:fs/promises'
import { BROKER_PORT } from './runtime.js'

export type Broker = {
  port: number
  close: () => Promise<void>
}

export async function runBroker(pathsArg?: RuntimePaths, port: number = BROKER_PORT): Promise<Broker> {
  const paths = pathsArg ?? createRuntimePaths()
  await ensureSupportDir(paths)
  await fs.writeFile(paths.lockPath, '', { mode: 0o600 })
  const release = await acquireBrokerLock(paths.lockPath)
  const token = generateToken()
  await writeToken(paths, token)
  const server = new BrokerServer({ port, token })
  return {
    port: server.port,
    close: async () => {
      await server.close()
      await release()
    },
  }
}
