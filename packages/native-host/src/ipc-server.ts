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
    let buffer = Buffer.alloc(0)
    let bufferedBytes = 0
    let draining = false
    let closed = false

    socket.on('error', () => {
      closed = true
    })

    const endWithResponse = (response: BridgeResponse): void => {
      if (closed) return
      closed = true
      try {
        socket.end(`${JSON.stringify(response)}\n`)
      } catch {
        socket.destroy()
      }
    }

    const drain = async (): Promise<void> => {
      if (draining || closed) return
      draining = true
      try {
        let newline = buffer.indexOf(0x0a)
        while (newline >= 0) {
          const lineBytes = buffer.subarray(0, newline)
          buffer = buffer.subarray(newline + 1)
          bufferedBytes = buffer.byteLength
          newline = buffer.indexOf(0x0a)

          let parsed: unknown
          try {
            parsed = JSON.parse(lineBytes.toString('utf8')) as unknown
          } catch {
            endWithResponse(protocolError('unknown'))
            return
          }

          if (!isRequest(parsed)) {
            const id = typeof (parsed as Partial<BridgeRequest> | undefined)?.id === 'string' ? (parsed as BridgeRequest).id : 'unknown'
            endWithResponse(protocolError(id))
            return
          }

          const response = toBridgeResponse(parsed, await options.onRequest(parsed))
          endWithResponse(response)
          return
        }
      } finally {
        draining = false
      }
    }

    socket.on('data', (chunk) => {
      if (closed) return
      bufferedBytes += chunk.byteLength
      if (bufferedBytes > maxRequestBytes) {
        endWithResponse(requestTooLargeError())
        return
      }

      buffer = Buffer.concat([buffer, chunk])

      void drain().catch(() => {
        endWithResponse(protocolError('unknown'))
      })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.socketPath, () => resolve())
  })

  return server
}
