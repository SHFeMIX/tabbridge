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
})
