import {
  ERROR_CODES,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type TabBridgeError,
  createJsonRpcError,
  createJsonRpcSuccess,
  tabBridgeErrorToJsonRpc,
} from '@tabbridge/shared'
import { routeBridgeMethod } from './commands'

const INTERNAL_ERROR = { code: -32603, message: 'Internal error' } as const

export async function routeJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const result = await routeBridgeMethod(request.method, request.params)
    return createJsonRpcSuccess(request.id, result)
  } catch (error) {
    if (isTabBridgeError(error)) {
      return createJsonRpcError(request.id, tabBridgeErrorToJsonRpc(error))
    }
    return createJsonRpcError(request.id, INTERNAL_ERROR)
  }
}

function isTabBridgeError(error: unknown): error is TabBridgeError {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as Partial<TabBridgeError>
  return (
    typeof candidate.code === 'string'
    && ERROR_CODES.includes(candidate.code)
    && typeof candidate.message === 'string'
    && typeof candidate.recoverable === 'boolean'
  )
}
