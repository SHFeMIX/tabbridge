import { fileURLToPath } from 'node:url'
import { PROTOCOL_VERSION, type BridgeHello, type BridgeResponse } from '@tabbridge/shared'
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

export async function runNativeHost(): Promise<void> {
  const paths = createRuntimePaths()
  await ensureRuntimeSecurity(paths)
  const bridge = new BridgeController({ requestTimeoutMs: 30_000 })
  const decoder = new NativeMessageDecoder()

  process.stdout.write(encodeNativeMessage(nativeHostHello()))

  process.stdin.on('data', (chunk: Buffer) => {
    try {
      for (const message of decoder.push(chunk)) {
        if (!isRecord(message)) continue
        if (message.type === 'hello') {
          bridge.acceptHello(message as BridgeHello)
          continue
        }
        if (typeof message.id === 'string' && typeof message.ok === 'boolean') {
          bridge.acceptResponse(message as BridgeResponse)
        }
      }
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
  })

  process.stdin.once('end', () => bridge.disconnect())

  await startIpcServer({
    socketPath: paths.socketPath,
    onRequest: async (request) => bridge.forward(request, (bridgeRequest) => {
      process.stdout.write(encodeNativeMessage(bridgeRequest))
    }),
  })
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
