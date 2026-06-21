import fs from 'node:fs/promises'
import net from 'node:net'
import { PROTOCOL_VERSION, type BridgeRequest, type BridgeResponse, type CliEnvelope } from '@tabbridge/shared'

export type IpcServerOptions = {
  socketPath: string
  maxRequestBytes?: number
  onRequest(request: BridgeRequest): Promise<CliEnvelope<unknown>>
}

export const DEFAULT_MAX_IPC_REQUEST_BYTES = 1024 * 1024

async function canConnect(socketPath: string): Promise<boolean> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy()
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') {
        resolve(false)
        return
      }
      if (error.code === 'ENOTSOCK') {
        resolve(false)
        return
      }
      reject(error)
    })
  })
}

export async function removeStaleSocket(socketPath: string): Promise<void> {
  if (await canConnect(socketPath)) throw new Error('IPC_SOCKET_ACTIVE')

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

function requestTooLargeError(): BridgeResponse {
  return {
    id: 'unknown',
    protocolVersion: PROTOCOL_VERSION,
    ok: false,
    error: {
      code: 'MESSAGE_TOO_LARGE',
      message: 'IPC request exceeded the native host maximum request line size.',
      recoverable: false,
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
  const maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_IPC_REQUEST_BYTES

  const server = net.createServer((socket) => {
    let buffer = ''
    let bufferedBytes = 0

    socket.on('data', (chunk) => {
      bufferedBytes += chunk.byteLength
      if (bufferedBytes > maxRequestBytes) {
        socket.write(`${JSON.stringify(requestTooLargeError())}\n`)
        socket.end()
        return
      }

      buffer += chunk.toString('utf8')

      void (async () => {
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          bufferedBytes = Buffer.byteLength(buffer, 'utf8')
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
