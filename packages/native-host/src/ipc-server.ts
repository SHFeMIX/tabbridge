import fs from 'node:fs/promises'
import net from 'node:net'
import { PROTOCOL_VERSION, type BridgeRequest, type BridgeResponse, type CliEnvelope } from '@tabbridge/shared'

export type IpcServerOptions = {
  socketPath: string
  onRequest(request: BridgeRequest): Promise<CliEnvelope<unknown>>
}

export async function removeStaleSocket(socketPath: string): Promise<void> {
  try {
    await fs.unlink(socketPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function protocolError(id: string): BridgeResponse {
  return {
    id,
    protocolVersion: PROTOCOL_VERSION,
    ok: false,
    error: {
      code: 'PROTOCOL_VERSION_MISMATCH',
      message: 'CLI request did not match the native host IPC protocol.',
      recoverable: true,
      suggestedCommand: 'tabbridge status --json',
    },
  }
}

function toBridgeResponse(request: BridgeRequest, envelope: CliEnvelope<unknown>): BridgeResponse {
  if (envelope.ok) return { id: request.id, protocolVersion: PROTOCOL_VERSION, ok: true, payload: envelope.data }
  return { id: request.id, protocolVersion: PROTOCOL_VERSION, ok: false, error: envelope.error }
}

function isRequest(value: unknown): value is BridgeRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Partial<BridgeRequest>
  return typeof request.id === 'string'
    && request.protocolVersion === PROTOCOL_VERSION
    && request.source === 'cli'
    && request.target === 'extension'
    && typeof request.command === 'string'
    && typeof request.createdAt === 'number'
}

export async function startIpcServer(options: IpcServerOptions): Promise<net.Server> {
  await removeStaleSocket(options.socketPath)

  const server = net.createServer((socket) => {
    let buffer = ''

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')

      void (async () => {
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')

          let parsed: unknown
          try {
            parsed = JSON.parse(line) as unknown
          } catch {
            socket.write(`${JSON.stringify(protocolError('unknown'))}\n`)
            socket.end()
            return
          }

          if (!isRequest(parsed)) {
            const id = typeof (parsed as Partial<BridgeRequest> | undefined)?.id === 'string' ? (parsed as BridgeRequest).id : 'unknown'
            socket.write(`${JSON.stringify(protocolError(id))}\n`)
            socket.end()
            return
          }

          const response = toBridgeResponse(parsed, await options.onRequest(parsed))
          socket.write(`${JSON.stringify(response)}\n`)
          socket.end()
        }
      })().catch(() => {
        socket.write(`${JSON.stringify(protocolError('unknown'))}\n`)
        socket.end()
      })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.socketPath, () => resolve())
  })

  return server
}
