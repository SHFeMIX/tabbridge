import { spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import { createRuntimePaths, readToken, type RuntimePaths } from '@tabbridge/broker'
import { BROKER_PORT } from '@tabbridge/shared'

export const DEFAULT_BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`

type SpawnBroker = (command: string, args: string[], options: { detached: true; stdio: 'ignore'; windowsHide: true }) => Pick<ChildProcess, 'unref' | 'on'>

type EnsureBrokerOptions = {
  brokerEntryExists?: (path: string) => Promise<boolean>
  isListening?: (url: string) => Promise<boolean>
  paths?: RuntimePaths
  readToken?: (paths: RuntimePaths) => Promise<string | undefined>
  spawn?: SpawnBroker
  waitIntervalMs?: number
  waitTimeoutMs?: number
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

async function defaultBrokerEntryExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function brokerEntryPath(): string {
  return fileURLToPath(new URL('./broker.js', import.meta.url))
}

async function brokerStartArgs(brokerEntryExists: (path: string) => Promise<boolean>): Promise<string[]> {
  const entryPath = brokerEntryPath()
  if (!(await brokerEntryExists(entryPath))) {
    throw new Error(`BROKER_ENTRY_MISSING: expected built broker entry at ${entryPath}; please reinstall the tabbridge package`)
  }

  return [entryPath]
}

function waitForBroker(child: Pick<ChildProcess, 'on'>, url: string, isListening: (url: string) => Promise<boolean>, options: { timeoutMs: number; intervalMs: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(async () => {
      try {
        if (await isListening(url)) {
          clearInterval(timer)
          resolve()
        } else if (Date.now() - start >= options.timeoutMs) {
          clearInterval(timer)
          reject(new Error('BROKER_START_FAILED: broker did not start in time'))
        }
      } catch {
        if (Date.now() - start >= options.timeoutMs) {
          clearInterval(timer)
          reject(new Error('BROKER_START_FAILED: broker did not start in time'))
        }
      }
    }, options.intervalMs)

    child.on('error', (error: Error) => {
      clearInterval(timer)
      reject(new Error(`BROKER_START_FAILED: ${error.message}`))
    })
  })
}

export async function ensureBroker(options: EnsureBrokerOptions = {}): Promise<{ url: string; token: string }> {
  const paths = options.paths ?? createRuntimePaths()
  const url = DEFAULT_BROKER_URL
  const listening = options.isListening ?? isBrokerListening
  const readBrokerToken = options.readToken ?? readToken
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
    windowsHide: true,
  })
  child.unref()

  await waitForBroker(
    child,
    url,
    listening,
    { timeoutMs: options.waitTimeoutMs ?? 5000, intervalMs: options.waitIntervalMs ?? 100 },
  )

  const token = await readBrokerToken(paths)
  if (!token) {
    throw new Error('BROKER_TOKEN_MISSING: broker started but the token file is missing; restart the broker')
  }
  return { url, token }
}
