import { createRuntimePaths, ensureSupportDir, generateToken, readToken, writeToken, BROKER_PORT } from './runtime.js'
import { acquireBrokerLock } from './lock.js'
import { BrokerServer } from './server.js'
import fs from 'node:fs/promises'

export type Broker = {
  port: number
  close: () => Promise<void>
}

export async function runBroker(): Promise<Broker> {
  const paths = createRuntimePaths()
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
