import { Readable, Writable } from 'node:stream'
import { errorEnvelope, okEnvelope, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'
import { parseCli, type ParsedCli } from './cli.js'
import { mapCliToBridgeRequest, type LocalCliCommand } from './commands.js'
import { runDoctor as defaultRunDoctor, type DoctorReport } from './doctor.js'
import { sendBridgeRequest as defaultSendBridgeRequest } from './ipc-client.js'
import { printCliError, printJsonEnvelope } from './json-output.js'
import { removeNativeManifest as defaultRemoveNativeManifest, writeNativeManifest as defaultWriteNativeManifest, type BrowserChannel, type NativeManifestInstallResult, type NativeManifestUninstallResult } from './native-manifest.js'

const DEFAULT_SOCKET_PATH = `${process.env.HOME ?? ''}/Library/Application Support/tabbridge/bridge.sock`

type SendBridgeRequest = (request: BridgeRequest, options: { socketPath: string; timeoutMs: number }) => Promise<CliEnvelope<unknown>>
type WriteNativeManifest = (input: { browser: BrowserChannel; extensionId: string; wrapperPath: string }) => Promise<NativeManifestInstallResult>
type RemoveNativeManifest = (input: { browser: BrowserChannel }) => Promise<NativeManifestUninstallResult>
type RunDoctor = (input: { browser: BrowserChannel; extensionId?: string }) => Promise<DoctorReport>

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
  writeNativeManifest?: WriteNativeManifest
  removeNativeManifest?: RemoveNativeManifest
  runDoctor?: RunDoctor
}

function localCommandError(command: LocalCliCommand) {
  return errorEnvelope({
    code: 'BRIDGE_SOCKET_UNAVAILABLE',
    message: `tabbridge ${command.command} is handled locally but is not implemented yet.`,
    recoverable: true,
  })
}

function browserFromPayload(payload: Record<string, unknown>, fallback?: BrowserChannel): BrowserChannel {
  if (payload.browser === 'chrome' || payload.browser === 'chromium') return payload.browser
  if (fallback) return fallback
  throw new Error('native host commands support --browser chrome or --browser chromium')
}

function optionalExtensionId(payload: Record<string, unknown>): string | undefined {
  return typeof payload.extensionId === 'string' ? payload.extensionId : undefined
}

function isDoctorReport(value: unknown): value is DoctorReport {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && typeof value.ok === 'boolean'
    && 'checks' in value
    && Array.isArray(value.checks)
}

async function handleLocalCommand(command: LocalCliCommand, handlers: { writeNativeManifest: WriteNativeManifest; removeNativeManifest: RemoveNativeManifest; runDoctor: RunDoctor }): Promise<CliEnvelope<unknown>> {
  if (command.command === 'installNativeHost') {
    const browser = browserFromPayload(command.payload)
    const extensionId = optionalExtensionId(command.payload)
    if (!extensionId) throw new Error('install-native-host requires --extension-id')
    return okEnvelope(await handlers.writeNativeManifest({ browser, extensionId, wrapperPath: process.execPath }))
  }

  if (command.command === 'uninstallNativeHost') {
    return okEnvelope(await handlers.removeNativeManifest({ browser: browserFromPayload(command.payload) }))
  }

  if (command.command === 'doctor' || command.command === 'status') {
    const extensionId = optionalExtensionId(command.payload)
    const input = extensionId === undefined
      ? { browser: browserFromPayload(command.payload, 'chrome') }
      : { browser: browserFromPayload(command.payload, 'chrome'), extensionId }
    return okEnvelope(await handlers.runDoctor(input))
  }

  return localCommandError(command)
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
  const writeNativeManifest = options.writeNativeManifest ?? defaultWriteNativeManifest
  const removeNativeManifest = options.removeNativeManifest ?? defaultRemoveNativeManifest
  const runDoctor = options.runDoctor ?? defaultRunDoctor

  try {
    const parsed = await hydrateStdinPayload(parseCli(argv), stdin)
    const request = mapCliToBridgeRequest(parsed, now(), requestId())
    const envelope = 'kind' in request
      ? await handleLocalCommand(request, { writeNativeManifest, removeNativeManifest, runDoctor })
      : await sendBridgeRequest(request, { socketPath, timeoutMs })

    if (parsed.json) {
      printJsonEnvelope(envelope, stdout)
    } else if (envelope.ok) {
      stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`)
    } else {
      stderr.write(`${envelope.error.message}\n`)
    }

    if (parsed.command === 'doctor' && envelope.ok && isDoctorReport(envelope.data)) {
      return envelope.data.ok ? 0 : 1
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
