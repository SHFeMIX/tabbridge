export const JSON_RPC_VERSION = '2.0' as const

export type JsonRpcRequest<TParams = unknown> = {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: TParams
}

export type JsonRpcSuccessResponse<TResult = unknown> = {
  jsonrpc: '2.0'
  id: string
  result: TResult
}

export type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0'
  id: string
  error: JsonRpcError
}

export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccessResponse<TResult> | JsonRpcErrorResponse

export function createJsonRpcRequest<TParams>(id: string, method: string, params?: TParams): JsonRpcRequest<TParams> {
  const req: JsonRpcRequest<TParams> = { jsonrpc: JSON_RPC_VERSION, id, method }
  if (params !== undefined) {
    req.params = params
  }
  return req
}

export function createJsonRpcSuccess<TResult>(id: string, result: TResult): JsonRpcSuccessResponse<TResult> {
  return { jsonrpc: JSON_RPC_VERSION, id, result }
}

export function createJsonRpcError(id: string, error: JsonRpcError): JsonRpcErrorResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, error }
}
