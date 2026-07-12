import fs from 'node:fs/promises'
import { createRuntimePaths } from '@tabbridge/broker'
import { BROKER_PORT, type BridgeDisconnectedState, type TabBridgeErrorCode } from '@tabbridge/shared'
import { isBrokerListening } from './ensure-broker.js'

export type DoctorCheck = {
  name: string
  ok: boolean
  detail?: string
}

export type DoctorReport = {
  ok: boolean
  bridgeState: BridgeDisconnectedState | 'connected'
  errorCode?: TabBridgeErrorCode
  checks: DoctorCheck[]
}

export type DoctorRunInput = {
  home?: string
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function fileMode(filePath: string): Promise<number | undefined> {
  try {
    return (await fs.stat(filePath)).mode
  } catch {
    return undefined
  }
}

export async function runDoctor(input: DoctorRunInput = {}): Promise<DoctorReport> {
  const paths = createRuntimePaths(input.home)
  const listening = await isBrokerListening(`ws://127.0.0.1:${BROKER_PORT}`)
  const tokenExists = await exists(paths.tokenPath)
  const tokenMode = await fileMode(paths.tokenPath)
  const lockExists = await exists(paths.lockPath)

  const checks: DoctorCheck[] = [
    { name: 'broker is listening on port 9876', ok: listening },
    { name: 'broker token file exists', ok: tokenExists },
    {
      name: 'broker token file mode is 0600',
      ok:
        process.platform === 'win32' ||
        (tokenMode !== undefined && (tokenMode & 0o777) === 0o600),
    },
    { name: 'broker lock file exists', ok: lockExists },
  ]

  if (!listening) {
    return { ok: false, bridgeState: 'extension_asleep', errorCode: 'EXTENSION_NOT_CONNECTED', checks }
  }

  const ok = checks.every((check) => check.ok)
  return { ok, bridgeState: 'connected', checks }
}
