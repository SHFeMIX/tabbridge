import net from 'node:net'
import { bridgeNotConnectedError, errorEnvelope, okEnvelope, type BridgeRequest, type BridgeResponse, type CliEnvelope } from '@tabbridge/shared'

export const MAX_RESPONSE_LINE_BYTES = 1024 * 1024

export type IpcClientOptions = {
  socketPath: string
  timeoutMs: number
}

function protocolError(message: string): CliEnvelope<never> {
  return errorEnvelope({
    code: 'PROTOCOL_VERSION_MISMATCH',
    message,
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function responseTooLargeError(): CliEnvelope<never> {
  return errorEnvelope({
    code: 'MESSAGE_TOO_LARGE',
    message: `Native host response exceeded ${MAX_RESPONSE_LINE_BYTES} bytes.`,
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function closedBeforeResponseError(): CliEnvelope<never> {
  return errorEnvelope({
    code: 'BRIDGE_SOCKET_UNAVAILABLE',
    message: 'Native host closed the socket before sending a complete response.',
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function parseBridgeResponse<TData>(line: string): CliEnvelope<TData> {
  let parsed: BridgeResponse

  try {
    parsed = JSON.parse(line) as BridgeResponse
  } catch {
    return protocolError('Native host returned malformed JSON.')
  }

  if (parsed.ok === true) return okEnvelope(parsed.payload as TData)
  if (parsed.ok === false) return errorEnvelope(parsed.error)
  return protocolError('Native host returned an invalid response envelope.')
}

export async function sendBridgeRequest<TData>(request: BridgeRequest, options: IpcClientOptions): Promise<CliEnvelope<TData>> {
  return await new Promise((resolve) => {
    const socket = net.createConnection(options.socketPath)
    let buffer = ''
    let settled = false

    const finish = (envelope: CliEnvelope<TData>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(envelope)
    }

    const timer = setTimeout(() => {
      finish(errorEnvelope({
        code: 'BRIDGE_REQUEST_TIMEOUT',
        message: 'Timed out waiting for the TabBridge native host.',
        recoverable: true,
        suggestedCommand: 'tabbridge status --json',
      }))
    }, options.timeoutMs)

    socket.once('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`)
    })

    socket.once('error', () => {
      finish(errorEnvelope(bridgeNotConnectedError('extension_asleep')))
    })

    socket.once('close', () => {
      if (!settled && buffer.length > 0) finish(closedBeforeResponseError())
    })

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      if (Buffer.byteLength(buffer, 'utf8') > MAX_RESPONSE_LINE_BYTES) {
        finish(responseTooLargeError())
        return
      }

      const newline = buffer.indexOf('\n')
      if (newline >= 0) {
        const line = buffer.slice(0, newline)
        finish(parseBridgeResponse<TData>(line))
      }
    })
  })
}
