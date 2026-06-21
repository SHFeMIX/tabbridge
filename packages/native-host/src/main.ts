import { realpathSync } from 'node:fs'
import type { Server } from 'node:net'
import { fileURLToPath } from 'node:url'
import { PROTOCOL_VERSION, type BridgeHello } from '@tabbridge/shared'
import { BridgeController } from './bridge.js'
import { startIpcServer } from './ipc-server.js'
import { encodeNativeMessage, NativeMessageDecoder, NativeMessageDecodingError } from './native-framing.js'
import { createRuntimePaths, ensureRuntimeSecurity } from './runtime-paths.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nativeHostHello(): BridgeHello {
  return {
    type: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    role: 'native-host',
    version: '0.1.0',
    capabilities: {
      commands: [],
      snapshot: [],
      permissions: ['nativeMessaging'],
    },
  }
}

export function routeNativeMessage(bridge: BridgeController, message: unknown): void {
  if (!isRecord(message)) return
  if (message.type === 'hello') {
    bridge.acceptHello(message)
    return
  }
  if (typeof message.id === 'string') bridge.acceptResponse(message)
}

export function routeNativeMessages(bridge: BridgeController, messages: unknown[], onError: (error: unknown) => void): void {
  for (const message of messages) {
    try {
      routeNativeMessage(bridge, message)
    } catch (error) {
      onError(error)
    }
  }
}

function closeIpcServer(server: Server | undefined): void {
  server?.close((error) => {
    if (error) process.stderr.write(`${error.stack ?? error.message}\n`)
  })
}

export async function runNativeHost(): Promise<void> {
  const paths = createRuntimePaths()
  await ensureRuntimeSecurity(paths)
  const bridge = new BridgeController({ requestTimeoutMs: 30_000 })
  const decoder = new NativeMessageDecoder()
  let ipcServer: Server | undefined
  let shuttingDown = false

  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    bridge.disconnect()
    closeIpcServer(ipcServer)
  }

  process.stdout.write(encodeNativeMessage(nativeHostHello()))

  process.stdin.on('data', (chunk: Buffer) => {
    try {
      routeNativeMessages(bridge, decoder.push(chunk), (error) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
      })
    } catch (error) {
      if (error instanceof NativeMessageDecodingError) {
        routeNativeMessages(bridge, error.messages, (routingError) => {
          process.stderr.write(`${routingError instanceof Error ? routingError.stack : String(routingError)}\n`)
        })
      }
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
  })

  process.stdin.once('end', shutdown)
  process.stdin.once('close', shutdown)

  ipcServer = await startIpcServer({
    socketPath: paths.socketPath,
    onRequest: async (request) => bridge.forward(request, (bridgeRequest) => {
      process.stdout.write(encodeNativeMessage(bridgeRequest))
    }),
  })
  if (shuttingDown) closeIpcServer(ipcServer)
}

export function isExecutedEntrypoint(moduleUrl = import.meta.url, argvPath = process.argv[1]): boolean {
  if (argvPath === undefined) return false
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath)
  } catch {
    return fileURLToPath(moduleUrl) === argvPath
  }
}

if (isExecutedEntrypoint()) {
  runNativeHost().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}
