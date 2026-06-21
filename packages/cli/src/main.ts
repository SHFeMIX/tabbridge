import { errorEnvelope } from '@tabbridge/shared'
import { parseCli } from './cli.js'
import { mapCliToBridgeRequest, type LocalCliCommand } from './commands.js'
import { sendBridgeRequest } from './ipc-client.js'
import { printCliError, printJsonEnvelope } from './json-output.js'

const DEFAULT_SOCKET_PATH = `${process.env.HOME ?? ''}/Library/Application Support/tabbridge/bridge.sock`

function localCommandError(command: LocalCliCommand) {
  return errorEnvelope({
    code: 'BRIDGE_SOCKET_UNAVAILABLE',
    message: `tabbridge ${command.command} is handled locally but is not implemented yet.`,
    recoverable: true,
  })
}

async function run(): Promise<number> {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')

  try {
    const parsed = parseCli(argv)
    const request = mapCliToBridgeRequest(parsed, Date.now(), `req_${process.pid}_${Date.now()}`)
    const envelope = 'kind' in request
      ? localCommandError(request)
      : await sendBridgeRequest(request, { socketPath: DEFAULT_SOCKET_PATH, timeoutMs: 30_000 })

    if (parsed.json) {
      printJsonEnvelope(envelope, process.stdout)
    } else if (envelope.ok) {
      process.stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`)
    } else {
      process.stderr.write(`${envelope.error.message}\n`)
    }

    return envelope.ok ? 0 : 1
  } catch (error) {
    printCliError(error, json, process.stdout, process.stderr)
    return 1
  }
}

run().then((code) => {
  process.exitCode = code
})
