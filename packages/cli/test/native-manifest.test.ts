import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNativeManifest, nativeManifestPath, writeNativeManifest } from '../src/native-manifest.js'

describe('Native Messaging manifest', () => {
  it('uses the user-level Google Chrome manifest path on macOS', () => {
    expect(nativeManifestPath('chrome', '/Users/alice')).toBe('/Users/alice/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tabbridge.host.json')
  })

  it('uses the user-level Chromium manifest path on macOS', () => {
    expect(nativeManifestPath('chromium', '/Users/alice')).toBe('/Users/alice/Library/Application Support/Chromium/NativeMessagingHosts/com.tabbridge.host.json')
  })

  it('creates an exact allowed origin for the extension id', () => {
    expect(createNativeManifest({
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      wrapperPath: '/Users/alice/bin/tabbridge-native-host-wrapper',
    })).toEqual({
      name: 'com.tabbridge.host',
      description: 'TabBridge native host',
      path: '/Users/alice/bin/tabbridge-native-host-wrapper',
      type: 'stdio',
      allowed_origins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/'],
    })
  })

  it('writes an executable wrapper script and points the manifest at it', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-native-manifest-'))

    const result = await writeNativeManifest({
      browser: 'chrome',
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      home,
      nativeHostBinPath: '/Users/alice/.local/bin/tabbridge-native-host',
    })

    expect(result.manifest.path).toBe(path.join(home, 'Library', 'Application Support', 'tabbridge', 'tabbridge-native-host-wrapper'))
    expect(result.manifest.path).not.toBe(process.execPath)
    await expect(fs.access(result.manifest.path, fs.constants.X_OK)).resolves.toBeUndefined()
    await expect(fs.readFile(result.manifest.path, 'utf8')).resolves.toContain('exec "/Users/alice/.local/bin/tabbridge-native-host"')
  })
})
