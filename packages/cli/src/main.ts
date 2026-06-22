import { Readable, Writable } from 'node:stream'
import { okEnvelope, type JsonRpcRequest } from '@tabbridge/shared'
import { sendBrokerRequest as defaultSendBrokerRequest } from './broker-client.js'
import { parseCli, type ParsedCli } from './cli.js'
import { mapCliToJsonRpcRequest } from './commands.js'
import { runDoctor as defaultRunDoctor } from './doctor.js'
import { ensureBroker as defaultEnsureBroker } from './ensure-broker.js'
import { printCliError, printJsonEnvelope } from './json-output.js'

type SendBrokerRequest = typeof defaultSendBrokerRequest
type EnsureBroker = typeof defaultEnsureBroker
type RunDoctor = typeof defaultRunDoctor

export type RunOptions = {
  argv?: string[]
  stdin?: Readable
  stdout?: Writable
  stderr?: Writable
  requestId?: () => string
  ensureBroker?: EnsureBroker
  sendBrokerRequest?: SendBrokerRequest
  runDoctor?: RunDoctor
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
  const requestId = options.requestId ?? (() => `req_${process.pid}_${Date.now()}`)
  const ensureBroker = options.ensureBroker ?? defaultEnsureBroker
  const sendBrokerRequest = options.sendBrokerRequest ?? defaultSendBrokerRequest
  const runDoctor = options.runDoctor ?? defaultRunDoctor

  try {
    const parsed = await hydrateStdinPayload(parseCli(argv), stdin)

    if (parsed.command === 'doctor') {
      const report = await runDoctor()
      printJsonEnvelope(okEnvelope(report), stdout)
      return report.ok ? 0 : 1
    }

    const broker = await ensureBroker()
    const request: JsonRpcRequest = mapCliToJsonRpcRequest(parsed, requestId())
    const envelope = await sendBrokerRequest(request, { url: broker.url, token: broker.token, timeoutMs: 30_000 })

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
