import { describe, expect, it } from 'vitest'
import { createRuntimePaths } from '../src/runtime-paths.js'

describe('runtime paths', () => {
  it('uses user private Application Support paths', () => {
    expect(createRuntimePaths('/Users/alice')).toEqual({
      supportDir: '/Users/alice/Library/Application Support/tabbridge',
      socketPath: '/Users/alice/Library/Application Support/tabbridge/bridge.sock',
      tokenPath: '/Users/alice/Library/Application Support/tabbridge/session-token',
    })
  })
})

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { ensureRuntimeSecurity } from '../src/runtime-paths.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('runtime path security', () => {
  it('creates the socket directory with 0700 permissions and the session token with 0600 permissions', async () => {
    const home = await mkdtemp(join(tmpdir(), 'tabbridge-native-host-'))
    tempDirs.push(home)
    const paths = createRuntimePaths(home)

    await expect(ensureRuntimeSecurity(paths, 'fixed-token')).resolves.toBe('fixed-token')

    expect((await stat(paths.supportDir)).mode & 0o777).toBe(0o700)
    expect((await stat(paths.tokenPath)).mode & 0o777).toBe(0o600)
    await expect(readFile(paths.tokenPath, 'utf8')).resolves.toBe('fixed-token\n')
  })
})
