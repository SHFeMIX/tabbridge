import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import envPaths from 'env-paths'
import { BROKER_PORT } from '@tabbridge/shared'

export { BROKER_PORT }


export type RuntimePaths = {
  supportDir: string
  tokenPath: string
  lockPath: string
}

function defaultSupportDir(): string {
  return envPaths('tabbridge', { suffix: '' }).data
}

export function createRuntimePaths(supportDir?: string): RuntimePaths {
  const dir = supportDir ?? defaultSupportDir()
  return {
    supportDir: dir,
    tokenPath: path.join(dir, 'broker-token'),
    lockPath: path.join(dir, 'broker.lock'),
  }
}

export async function ensureSupportDir(paths: RuntimePaths): Promise<void> {
  await fs.mkdir(paths.supportDir, { recursive: true, mode: 0o700 })
  await fs.chmod(paths.supportDir, 0o700)
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function writeToken(paths: RuntimePaths, token: string): Promise<void> {
  await fs.writeFile(paths.tokenPath, `${token}\n`, { mode: 0o600 })
  await fs.chmod(paths.tokenPath, 0o600)
}

export async function readToken(paths: RuntimePaths): Promise<string | undefined> {
  try {
    return (await fs.readFile(paths.tokenPath, 'utf8')).trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
