import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type BrowserChannel = 'chrome' | 'chromium'

export type NativeManifest = {
  name: 'com.tabbridge.host'
  description: 'TabBridge native host'
  path: string
  type: 'stdio'
  allowed_origins: string[]
}

export type NativeManifestInput = {
  extensionId: string
  wrapperPath: string
}

export type NativeManifestWriteInput = {
  browser: BrowserChannel
  extensionId: string
  home?: string
  nativeHostBinPath?: string
}

export type NativeManifestInstallResult = {
  path: string
  manifest: NativeManifest
}

export type NativeManifestUninstallResult = {
  path: string
  removed: boolean
}

export function nativeManifestPath(browser: BrowserChannel, home = process.env.HOME ?? ''): string {
  const browserDir = browser === 'chrome' ? 'Google/Chrome' : 'Chromium'
  return path.join(home, 'Library', 'Application Support', browserDir, 'NativeMessagingHosts', 'com.tabbridge.host.json')
}

export function nativeHostWrapperPath(home = process.env.HOME ?? ''): string {
  return path.join(home, 'Library', 'Application Support', 'tabbridge', 'tabbridge-native-host-wrapper')
}

function shellQuote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}"`
}

function defaultNativeHostBinPath(): string {
  return fileURLToPath(new URL('../../native-host/dist/main.js', import.meta.url))
}

async function writeNativeHostWrapper(input: { home?: string; nativeHostBinPath?: string }): Promise<string> {
  const wrapperPath = nativeHostWrapperPath(input.home)
  const nativeHostBinPath = input.nativeHostBinPath ?? defaultNativeHostBinPath()
  const script = `#!/bin/sh\nexec ${shellQuote(nativeHostBinPath)} "$@"\n`
  await fs.mkdir(path.dirname(wrapperPath), { recursive: true })
  await fs.writeFile(wrapperPath, script, { mode: 0o755 })
  await fs.chmod(wrapperPath, 0o755)
  return wrapperPath
}

export function createNativeManifest(input: NativeManifestInput): NativeManifest {
  return {
    name: 'com.tabbridge.host',
    description: 'TabBridge native host',
    path: input.wrapperPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${input.extensionId}/`],
  }
}

export async function writeNativeManifest(input: NativeManifestWriteInput): Promise<NativeManifestInstallResult> {
  const manifestPath = nativeManifestPath(input.browser, input.home)
  const wrapperPath = await writeNativeHostWrapper(input)
  const manifest = createNativeManifest({ extensionId: input.extensionId, wrapperPath })
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 })
  return { path: manifestPath, manifest }
}

export async function removeNativeManifest(input: { browser: BrowserChannel; home?: string }): Promise<NativeManifestUninstallResult> {
  const manifestPath = nativeManifestPath(input.browser, input.home)
  try {
    await fs.unlink(manifestPath)
    return { path: manifestPath, removed: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: manifestPath, removed: false }
    throw error
  }
}
