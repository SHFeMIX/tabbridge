import { describe, expect, it } from 'vitest'
import { createNativeManifest, nativeManifestPath } from '../src/native-manifest.js'

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
})
