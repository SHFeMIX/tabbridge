import { APPROVAL_WAIT_DEFAULT_TIMEOUT_MS, createJsonRpcRequest, type JsonRpcRequest } from '@tabbridge/shared'
import type { ParsedCli } from './cli.js'

export function mapCliToJsonRpcRequest(parsed: ParsedCli, id: string): JsonRpcRequest {
  const payload = { ...parsed.payload }

  if (parsed.command === 'approvals.wait' && typeof payload.timeoutMs !== 'number') {
    payload.timeoutMs = APPROVAL_WAIT_DEFAULT_TIMEOUT_MS
  }

  return createJsonRpcRequest(id, parsed.command, payload)
}
