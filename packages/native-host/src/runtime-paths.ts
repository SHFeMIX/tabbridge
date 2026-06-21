import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export type RuntimePaths = {
  supportDir: string
  socketPath: string
  tokenPath: string
}

export function createRuntimePaths(home = process.env.HOME ?? ''): RuntimePaths {
  const supportDir = path.join(home, 'Library', 'Application Support', 'tabbridge')
  return {
    supportDir,
    socketPath: path.join(supportDir, 'bridge.sock'),
    tokenPath: path.join(supportDir, 'session-token'),
  }
}

export async function ensureRuntimeSecurity(paths: RuntimePaths, token = crypto.randomBytes(32).toString('hex')): Promise<string> {
  await fs.mkdir(paths.supportDir, { recursive: true, mode: 0o700 })
  await fs.chmod(paths.supportDir, 0o700)
  await fs.writeFile(paths.tokenPath, `${token}\n`, { mode: 0o600 })
  await fs.chmod(paths.tokenPath, 0o600)
  return token
}
