import { Readable, Writable } from 'node:stream'
import { errorEnvelope, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'
import { parseCli, type ParsedCli } from './cli.js'
import { mapCliToBridgeRequest, type LocalCliCommand } from './commands.js'
import { sendBridgeRequest as defaultSendBridgeRequest } from './ipc-client.js'
import { printCliError, printJsonEnvelope } from './json-output.js'

const DEFAULT_SOCKET_PATH = `${process.env.HOME ?? ''}/Library/Application Support/tabbridge/bridge.sock`

type SendBridgeRequest = (request: BridgeRequest, options: { socketPath: string; timeoutMs: number }) => Promise<CliEnvelope<unknown>>

export type RunOptions = {
  argv?: string[]
  stdin?: Readable
  stdout?: Writable
  stderr?: Writable
  now?: () => number
  requestId?: () => string
  socketPath?: string
  timeoutMs?: number
  sendBridgeRequest?: SendBridgeRequest
}

function localCommandError(command: LocalCliCommand) {
  return errorEnvelope({
    code: 'BRIDGE_SOCKET_UNAVAILABLE',
    message: `tabbridge ${command.command} is handled locally but is not implemented yet.`,
    recoverable: true,
  })
}

async function readStdin(stdin: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function hydrateStdinPayload(parsed: ParsedCli, stdin: Readable): Promise<ParsedCli> {
  if (parsed.command !== 'action.type' || parsed.payload.textFromStdin !== true) return parsed

  const { textFromStdin: _textFromStdin, ...payloadWithoutMarker } = parsed.payload
  return {
    ...parsed,
    payload: {
      ...payloadWithoutMarker,
      text: await readStdin(stdin),
    },
  }
}

export async function run(options: RunOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2)
  const json = argv.includes('--json')
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const stdin = options.stdin ?? process.stdin
  const now = options.now ?? Date.now
  const requestId = options.requestId ?? (() => `req_${process.pid}_${Date.now()}`)
  const sendBridgeRequest = options.sendBridgeRequest ?? defaultSendBridgeRequest
  const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH
  const timeoutMs = options.timeoutMs ?? 30_000

  try {
    const parsed = await hydrateStdinPayload(parseCli(argv), stdin)
    const request = mapCliToBridgeRequest(parsed, now(), requestId())
    const envelope = 'kind' in request
      ? localCommandError(request)
      : await sendBridgeRequest(request, { socketPath, timeoutMs })

    if (parsed.json) {
      printJsonEnvelope(envelope, stdout)
    } else if (envelope.ok) {
      stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`)
    } else {
      stderr.write(`${envelope.error.message}\n`)
    }

    return envelope.ok ? 0 : 1
  } catch (error) {
    printCliError(error, json, stdout, stderr)
    return 1
  }
}

if (process.env.VITEST !== 'true') {
  run().then((code) => {
    process.exitCode = code
  })
}
