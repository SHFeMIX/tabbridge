import fs from 'node:fs/promises'
import { PROTOCOL_VERSION, type BridgeDisconnectedState, type TabBridgeErrorCode } from '@tabbridge/shared'
import { createRuntimePaths } from '@tabbridge/native-host'
import { nativeManifestPath, type BrowserChannel, type NativeManifest } from './native-manifest.js'

export type DoctorCheck = {
  name: string
  ok: boolean
  detail?: string
}

export type DoctorInputs = {
  manifestExists: boolean
  manifestValid: boolean
  manifestPathExecutable: boolean
  extensionIdExpected: boolean
  extensionIdMatches: boolean
  socketExists: boolean
  bridgeConnected: boolean
  protocolCompatible: boolean
  nodeMajor: number
}

export type DoctorReport = {
  ok: boolean
  bridgeState: BridgeDisconnectedState | 'connected'
  errorCode?: TabBridgeErrorCode
  checks: DoctorCheck[]
}

export type DoctorRunInput = {
  browser: BrowserChannel
  extensionId?: string
  home?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNativeManifest(value: unknown): value is NativeManifest {
  return isRecord(value)
    && value.name === 'com.tabbridge.host'
    && value.description === 'TabBridge native host'
    && typeof value.path === 'string'
    && value.type === 'stdio'
    && Array.isArray(value.allowed_origins)
    && value.allowed_origins.every((origin) => typeof origin === 'string')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function executable(filePath: string | undefined): Promise<boolean> {
  if (!filePath) return false
  try {
    await fs.access(filePath, fs.constants.X_OK)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'EACCES') return false
    throw error
  }
}

function expectedExtensionIdCheck(expected: boolean): DoctorCheck {
  return expected
    ? { name: 'expected extension id was provided', ok: true }
    : {
      name: 'expected extension id was provided',
      ok: false,
      detail: 'Pass --extension-id to validate native manifest allowed_origins.',
    }
}

export function evaluateDoctorReport(input: DoctorInputs): DoctorReport {
  const checks: DoctorCheck[] = [
    { name: 'native host manifest exists', ok: input.manifestExists },
    { name: 'native host manifest JSON is valid', ok: input.manifestValid },
    { name: 'native host wrapper path is executable', ok: input.manifestPathExecutable },
    expectedExtensionIdCheck(input.extensionIdExpected),
    { name: 'extension id matches allowed_origins', ok: input.extensionIdMatches },
    { name: 'Unix socket path is present', ok: input.socketExists },
    { name: 'native host and extension are connected', ok: input.bridgeConnected },
    { name: 'protocol version is compatible', ok: input.protocolCompatible },
    { name: 'Node.js major version is at least 20', ok: input.nodeMajor >= 20 },
  ]

  if (!input.manifestExists || !input.manifestValid || !input.manifestPathExecutable) {
    return { ok: false, bridgeState: 'native_host_missing', errorCode: 'NATIVE_HOST_NOT_CONNECTED', checks }
  }

  const bridgeState = input.bridgeConnected ? 'connected' : 'extension_asleep'
  if (!input.extensionIdExpected || !input.extensionIdMatches) {
    return { ok: false, bridgeState, errorCode: 'EXTENSION_ID_MISMATCH', checks }
  }

  if (!input.protocolCompatible) {
    return { ok: false, bridgeState, errorCode: 'PROTOCOL_VERSION_MISMATCH', checks }
  }

  if (!input.bridgeConnected) {
    return { ok: false, bridgeState, errorCode: 'EXTENSION_NOT_CONNECTED', checks }
  }

  const ok = checks.every((check) => check.ok)
  return { ok, bridgeState, checks }
}

export async function runDoctor(input: DoctorRunInput): Promise<DoctorReport> {
  const manifestPath = nativeManifestPath(input.browser, input.home)
  let manifest: NativeManifest | undefined
  let manifestValid = false
  const manifestExists = await exists(manifestPath)

  if (manifestExists) {
    try {
      const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as unknown
      if (isNativeManifest(parsed)) {
        manifest = parsed
        manifestValid = true
      }
    } catch {
      manifestValid = false
    }
  }

  const expectedOrigin = input.extensionId ? `chrome-extension://${input.extensionId}/` : undefined
  const extensionIdExpected = expectedOrigin !== undefined
  const extensionIdMatches = expectedOrigin !== undefined && manifest?.allowed_origins.length === 1 && manifest.allowed_origins[0] === expectedOrigin
  const runtimePaths = createRuntimePaths(input.home)

  return evaluateDoctorReport({
    manifestExists,
    manifestValid,
    manifestPathExecutable: await executable(manifest?.path),
    extensionIdExpected,
    extensionIdMatches,
    socketExists: await exists(runtimePaths.socketPath),
    bridgeConnected: false,
    protocolCompatible: PROTOCOL_VERSION === 1,
    nodeMajor: Number(process.versions.node.split('.')[0]),
  })
}
