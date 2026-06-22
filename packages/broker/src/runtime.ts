import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const BROKER_PORT = 9876

export type RuntimePaths = {
  supportDir: string
  tokenPath: string
  lockPath: string
}

export function createRuntimePaths(home = process.env.HOME ?? ''): RuntimePaths {
  const supportDir = path.join(home, 'Library', 'Application Support', 'tabbridge')
  return {
    supportDir,
    tokenPath: path.join(supportDir, 'broker-token'),
    lockPath: path.join(supportDir, 'broker.lock'),
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
