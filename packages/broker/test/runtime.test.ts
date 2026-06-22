import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRuntimePaths, generateToken, ensureSupportDir, writeToken, readToken } from '../src/runtime.js'

describe('broker runtime', () => {
  it('uses macOS Application Support path', () => {
    expect(createRuntimePaths('/Users/alice')).toEqual({
      supportDir: '/Users/alice/Library/Application Support/tabbridge',
      tokenPath: '/Users/alice/Library/Application Support/tabbridge/broker-token',
      lockPath: '/Users/alice/Library/Application Support/tabbridge/broker.lock',
    })
  })

  it('generates a 64-char hex token', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  describe('runtime helpers', () => {
    let paths: ReturnType<typeof createRuntimePaths>

    beforeEach(async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-runtime-'))
      paths = createRuntimePaths(tmpDir)
    })

    afterEach(async () => {
      await fs.rm(paths.supportDir, { recursive: true, force: true })
    })

    it('ensureSupportDir creates the support dir with mode 0o700', async () => {
      await ensureSupportDir(paths)
      const stat = await fs.stat(paths.supportDir)
      expect(stat.isDirectory()).toBe(true)
      // On macOS, umask may affect the exact mode, so check the owner bits
      expect(stat.mode & 0o700).toBe(0o700)
    })

    it('writeToken writes the token file with mode 0o600', async () => {
      await ensureSupportDir(paths)
      await writeToken(paths, 'my-secret-token')
      const stat = await fs.stat(paths.tokenPath)
      expect(stat.isFile()).toBe(true)
      expect(stat.mode & 0o600).toBe(0o600)
    })

    it('readToken returns the token after write', async () => {
      await ensureSupportDir(paths)
      await writeToken(paths, 'my-secret-token')
      const token = await readToken(paths)
      expect(token).toBe('my-secret-token')
    })

    it('readToken returns undefined when the file does not exist', async () => {
      const token = await readToken(paths)
      expect(token).toBeUndefined()
    })

    it('readToken re-throws non-ENOENT errors', async () => {
      await ensureSupportDir(paths)
      // Pass a directory path as the token path to trigger EISDIR
      const dirAsToken = createRuntimePaths(paths.supportDir)
      // Override tokenPath to point at the support directory itself
      const badPaths = { ...paths, tokenPath: paths.supportDir }
      await expect(readToken(badPaths)).rejects.toThrow()
    })
  })
})
