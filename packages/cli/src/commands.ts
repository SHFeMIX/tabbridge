import { APPROVAL_WAIT_DEFAULT_TIMEOUT_MS, createBridgeRequest, type BridgeRequest } from '@tabbridge/shared'
import type { ParsedCli } from './cli.js'

export type LocalCliCommand = never

export function mapCliToBridgeRequest(parsed: ParsedCli, now: number, id: string): BridgeRequest | LocalCliCommand {
  const payload = { ...parsed.payload }
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
