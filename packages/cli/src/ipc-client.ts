import net from 'node:net'
import { bridgeNotConnectedError, errorEnvelope, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'

export type IpcClientOptions = {
  socketPath: string
  timeoutMs: number
}

export async function sendBridgeRequest<TData>(request: BridgeRequest, options: IpcClientOptions): Promise<CliEnvelope<TData>> {
  return await new Promise((resolve) => {
    const socket = net.createConnection(options.socketPath)
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(errorEnvelope({
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
      clearTimeout(timer)
      resolve(errorEnvelope(bridgeNotConnectedError('extension_asleep')))
    })

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline >= 0) {
        clearTimeout(timer)
        const line = buffer.slice(0, newline)
        socket.end()
        resolve(JSON.parse(line) as CliEnvelope<TData>)
      }
    })
  })
}
