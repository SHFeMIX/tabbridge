import { WebSocket } from 'ws'
import {
  type CliEnvelope,
  type JsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type TabBridgeError,
  bridgeNotConnectedError,
  errorEnvelope,
  jsonRpcErrorToTabBridgeError,
  okEnvelope,
} from '@tabbridge/shared'

export type BrokerClientOptions = {
  url: string
  token: string
  timeoutMs: number
}

function closedBeforeResponseError(): CliEnvelope<never> {
  return errorEnvelope({
    code: 'BRIDGE_SOCKET_UNAVAILABLE',
    message: 'Broker closed the connection before sending a complete response.',
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function timeoutError(): CliEnvelope<never> {
  return errorEnvelope({
    code: 'BRIDGE_REQUEST_TIMEOUT',
    message: 'Timed out waiting for the broker response.',
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function protocolError(message: string): CliEnvelope<never> {
  return errorEnvelope({
    code: 'PROTOCOL_VERSION_MISMATCH',
    message,
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function parseResponse<TData>(request: JsonRpcRequest, raw: string): CliEnvelope<TData> {
  let parsed: JsonRpcResponse
  try {
    parsed = JSON.parse(raw) as JsonRpcResponse
  } catch {
    return protocolError('Broker returned malformed JSON.')
  }

  if (parsed.id !== request.id) {
    return protocolError(`Broker response id ${String(parsed.id)} did not match request id ${request.id}.`)
  }

  if ('result' in parsed && parsed.result !== undefined) {
    return okEnvelope(parsed.result as TData)
  }

  if ('error' in parsed && parsed.error !== undefined) {
    const businessError = jsonRpcErrorToTabBridgeError(parsed.error as JsonRpcError)
    if (businessError) return errorEnvelope(businessError)
    const synthetic: TabBridgeError = {
      code: 'PROTOCOL_VERSION_MISMATCH',
      message: parsed.error.message,
      recoverable: true,
    }
    return errorEnvelope(synthetic)
  }

  return protocolError('Broker returned an invalid JSON-RPC response.')
}

export async function sendBrokerRequest<TData>(request: JsonRpcRequest, options: BrokerClientOptions): Promise<CliEnvelope<TData>> {
  return await new Promise((resolve) => {
    const ws = new WebSocket(options.url)
    let settled = false

    const finish = (envelope: CliEnvelope<TData>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ws.terminate()
      resolve(envelope)
    }

    const timer = setTimeout(() => finish(timeoutError()), options.timeoutMs)

    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: options.token }))
      ws.send(JSON.stringify(request))
    })

    ws.once('error', () => finish(errorEnvelope(bridgeNotConnectedError('extension_asleep'))))
    ws.once('close', () => { if (!settled) finish(closedBeforeResponseError()) })

    ws.on('message', (data) => {
      const text = data.toString('utf8')
      try {
        const probe = JSON.parse(text) as Record<string, unknown>
        if (probe.type === 'auth') return
      } catch {
        // fall through to parse as JSON-RPC
      }
      finish(parseResponse<TData>(request, text))
    })
  })
}
