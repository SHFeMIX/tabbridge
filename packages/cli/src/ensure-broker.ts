import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { BROKER_PORT, createRuntimePaths, generateToken, readToken, writeToken } from '@tabbridge/broker'

export const DEFAULT_BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`

export async function isBrokerListening(url: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => {
      ws.terminate()
      resolve(false)
    }, 500)
    ws.once('open', () => {
      clearTimeout(timer)
      ws.terminate()
      resolve(true)
    })
    ws.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

async function waitFor(condition: () => Promise<boolean>, options: { timeoutMs: number; intervalMs: number }): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < options.timeoutMs) {
    if (await condition()) return true
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs))
  }
  return false
}

export async function ensureBroker(): Promise<{ url: string; token: string }> {
  const paths = createRuntimePaths()
  const url = DEFAULT_BROKER_URL
  if (await isBrokerListening(url)) {
    const token = (await readToken(paths)) ?? ''
    return { url, token }
  }

  const child = spawn(process.execPath, [process.argv[1] ?? '', 'broker'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const ready = await waitFor(() => isBrokerListening(url), { timeoutMs: 5000, intervalMs: 100 })
  if (!ready) {
    throw new Error('BROKER_START_FAILED: broker did not start in time')
  }

  let token = await readToken(paths)
  if (!token) {
    token = generateToken()
    await writeToken(paths, token)
  }
  return { url, token }
}
