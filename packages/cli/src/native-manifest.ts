import fs from 'node:fs/promises'
import path from 'node:path'

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

export function createNativeManifest(input: NativeManifestInput): NativeManifest {
  return {
    name: 'com.tabbridge.host',
    description: 'TabBridge native host',
    path: input.wrapperPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${input.extensionId}/`],
  }
}

export async function writeNativeManifest(input: NativeManifestInput & { browser: BrowserChannel; home?: string }): Promise<NativeManifestInstallResult> {
  const manifestPath = nativeManifestPath(input.browser, input.home)
  const manifest = createNativeManifest(input)
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
