import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ConfigEnv } from 'wxt'
import config from '../wxt.config'

const packageRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const chromeBuildEnv = {
  mode: 'production',
  command: 'build',
  browser: 'chrome',
  manifestVersion: 3,
} satisfies ConfigEnv

describe('WXT manifest config', () => {
  it('declares MVP permissions without nativeMessaging', () => {
    expect(config.manifest).toMatchObject({
      name: 'TabBridge',
      permissions: ['tabs', 'scripting', 'storage', 'activeTab'],
      optional_host_permissions: ['http://*/*', 'https://*/*'],
    })
  })

  it('includes a popup HTML entrypoint for the Vue scaffold', () => {
    expect(existsSync(join(packageRoot, 'src/entrypoints/popup/index.html'))).toBe(true)
  })

  it('configures Vue support for popup single-file components', () => {
    expect(config.vite).toEqual(expect.any(Function))

    if (typeof config.vite !== 'function') {
      throw new TypeError('Expected WXT vite config to be a function')
    }

    const viteConfig = config.vite(chromeBuildEnv)
    expect(viteConfig).toMatchObject({
      plugins: [expect.objectContaining({ name: 'vite:vue' })],
    })
  })
})
