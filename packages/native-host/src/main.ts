import type { Server } from 'node:net'
import { fileURLToPath } from 'node:url'
import { PROTOCOL_VERSION, type BridgeHello } from '@tabbridge/shared'
import { BridgeController } from './bridge.js'
import { startIpcServer } from './ipc-server.js'
import { encodeNativeMessage, NativeMessageDecoder } from './native-framing.js'
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
      for (const message of decoder.push(chunk)) {
        routeNativeMessage(bridge, message)
      }
    } catch (error) {
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

function isExecutedEntrypoint(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
}

if (isExecutedEntrypoint()) {
  runNativeHost().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}
