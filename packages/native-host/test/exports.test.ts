import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('native-host package exports', () => {
  it('points package library entrypoints at dist/index and keeps the executable on dist/main', async () => {
    const packageJson = (await import('../package.json', { with: { type: 'json' } })).default

    expect(packageJson.main).toBe('dist/index.js')
    expect(packageJson.types).toBe('dist/index.d.ts')
    expect(packageJson.exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
    })
    expect(packageJson.bin['tabbridge-native-host']).toBe('dist/main.js')
  })

  it('exposes the native-host library APIs from src/index without starting the host', async () => {
    const api = await import('../src/index.js')

    expect(api).toMatchObject({
      encodeNativeMessage: expect.any(Function),
      NativeMessageDecoder: expect.any(Function),
      createRuntimePaths: expect.any(Function),
      BridgeController: expect.any(Function),
      TabActionQueue: expect.any(Function),
      startIpcServer: expect.any(Function),
    })
  })
})

vi.mock('../src/ipc-server.js', () => ({
  startIpcServer: vi.fn(async () => ({ close: vi.fn() })),
}))

vi.mock('../src/runtime-paths.js', () => ({
  createRuntimePaths: vi.fn(() => ({
    supportDir: '/tmp/tabbridge-test',
    socketPath: '/tmp/tabbridge-test/bridge.sock',
    tokenPath: '/tmp/tabbridge-test/session-token',
  })),
  ensureRuntimeSecurity: vi.fn(async () => 'token'),
}))

describe('native-host executable entrypoint', () => {
  it('does not start the native host when main.ts is imported as a library module', async () => {
    const { startIpcServer } = await import('../src/ipc-server.js')

    await import('../src/main.js')
    await Promise.resolve()

    expect(startIpcServer).not.toHaveBeenCalled()
  })

  it('closes the IPC server when native stdin ends', async () => {
    const { startIpcServer } = await import('../src/ipc-server.js')
    const close = vi.fn((callback?: (error?: Error) => void) => {
      callback?.()
      return undefined
    })
    vi.mocked(startIpcServer).mockResolvedValueOnce({ close } as never)
    const originalDataListeners = process.stdin.listeners('data')
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      const { runNativeHost } = await import('../src/main.js')
      await runNativeHost()
      process.stdin.emit('end')

      expect(close).toHaveBeenCalledTimes(1)
    } finally {
      stdoutWrite.mockRestore()
      for (const listener of process.stdin.listeners('data')) {
        if (!originalDataListeners.includes(listener)) {
          process.stdin.off('data', listener as (...args: unknown[]) => void)
        }
      }
    }
  })

  it('detects execution through a package bin symlink', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'tabbridge-native-bin-'))

    try {
      const { isExecutedEntrypoint } = await import('../src/main.js') as typeof import('../src/main.js') & {
        isExecutedEntrypoint?: (moduleUrl: string, argvPath: string | undefined) => boolean | Promise<boolean>
      }
      expect(isExecutedEntrypoint).toBeTypeOf('function')
      const realMainPath = fileURLToPath(new URL('../src/main.ts', import.meta.url))
      const symlinkPath = join(tempDir, 'tabbridge-native-host')
      await symlink(realMainPath, symlinkPath)

      expect(isExecutedEntrypoint?.(new URL('../src/main.ts', import.meta.url).href, symlinkPath)).toBe(true)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
