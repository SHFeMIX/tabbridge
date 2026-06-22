import { spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import { BROKER_PORT, createRuntimePaths, generateToken, readToken, writeToken, type RuntimePaths } from '@tabbridge/broker'

export const DEFAULT_BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`

type SpawnBroker = (command: string, args: string[], options: { detached: true; stdio: 'ignore' }) => Pick<ChildProcess, 'unref'>

type EnsureBrokerOptions = {
  brokerEntryExists?: (path: string) => Promise<boolean>
  isListening?: (url: string) => Promise<boolean>
  paths?: RuntimePaths
  readToken?: (paths: RuntimePaths) => Promise<string | undefined>
  spawn?: SpawnBroker
  waitIntervalMs?: number
  waitTimeoutMs?: number
  writeToken?: (paths: RuntimePaths, token: string) => Promise<void>
}

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

async function defaultBrokerEntryExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function brokerEntryPath(): string {
  return fileURLToPath(new URL('../../broker/dist/main.js', import.meta.url))
}

async function brokerStartArgs(brokerEntryExists: (path: string) => Promise<boolean>): Promise<string[]> {
  const entryPath = brokerEntryPath()
  if (await brokerEntryExists(entryPath)) {
    return [entryPath]
  }

  return [
    '--input-type=module',
    '--eval',
    "import('@tabbridge/broker').then(async ({ runBroker }) => { await runBroker(); }).catch((error) => { console.error(error); process.exit(1); });",
  ]
}

export async function ensureBroker(options: EnsureBrokerOptions = {}): Promise<{ url: string; token: string }> {
  const paths = options.paths ?? createRuntimePaths()
  const url = DEFAULT_BROKER_URL
  const listening = options.isListening ?? isBrokerListening
  const readBrokerToken = options.readToken ?? readToken
  const writeBrokerToken = options.writeToken ?? writeToken
  if (await listening(url)) {
    const token = await readBrokerToken(paths)
    if (!token) {
      throw new Error('BROKER_TOKEN_MISSING: broker is listening but the token file is missing; restart the broker')
    }
    return { url, token }
  }

  const child = (options.spawn ?? spawn)(process.execPath, await brokerStartArgs(options.brokerEntryExists ?? defaultBrokerEntryExists), {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const ready = await waitFor(() => listening(url), { timeoutMs: options.waitTimeoutMs ?? 5000, intervalMs: options.waitIntervalMs ?? 100 })
  if (!ready) {
    throw new Error('BROKER_START_FAILED: broker did not start in time')
  }

  let token = await readBrokerToken(paths)
  if (!token) {
    token = generateToken()
    await writeBrokerToken(paths, token)
  }
  return { url, token }
}
