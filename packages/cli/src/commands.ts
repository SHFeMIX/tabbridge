import { APPROVAL_WAIT_DEFAULT_TIMEOUT_MS, createBridgeRequest, type BridgeRequest } from '@tabbridge/shared'
import type { ParsedCli } from './cli.js'

export type LocalCliCommandName = 'nativeHost' | 'status' | 'doctor' | 'installNativeHost' | 'uninstallNativeHost'

export type LocalCliCommand = {
  kind: 'local'
  command: LocalCliCommandName
  json: boolean
  payload: Record<string, unknown>
}

const LOCAL_CLI_COMMANDS = new Set<string>(['nativeHost', 'status', 'doctor', 'installNativeHost', 'uninstallNativeHost'])

function isLocalCliCommand(command: string): command is LocalCliCommandName {
  return LOCAL_CLI_COMMANDS.has(command)
}

export function mapCliToBridgeRequest(parsed: ParsedCli, now: number, id: string): BridgeRequest | LocalCliCommand {
  const payload = { ...parsed.payload }

  if (isLocalCliCommand(parsed.command)) {
    return { kind: 'local', command: parsed.command, json: parsed.json, payload }
  }

  if (parsed.command === 'approvals.wait' && typeof payload.timeoutMs !== 'number') {
    payload.timeoutMs = APPROVAL_WAIT_DEFAULT_TIMEOUT_MS
  }

  return createBridgeRequest({
    id,
    source: 'cli',
    target: 'extension',
    command: parsed.command,
    payload,
    createdAt: now,
  })
}
