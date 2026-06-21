import { errorEnvelope } from '@tabbridge/shared'
import { parseCli } from './cli.js'
import { mapCliToBridgeRequest } from './commands.js'
import { sendBridgeRequest } from './ipc-client.js'
import { printJsonEnvelope } from './json-output.js'

const DEFAULT_SOCKET_PATH = `${process.env.HOME ?? ''}/Library/Application Support/tabbridge/bridge.sock`

async function run(): Promise<number> {
  try {
    const parsed = parseCli(process.argv.slice(2))
    const request = mapCliToBridgeRequest(parsed, Date.now(), `req_${process.pid}_${Date.now()}`)
    const envelope = await sendBridgeRequest(request, { socketPath: DEFAULT_SOCKET_PATH, timeoutMs: 30_000 })

    if (parsed.json) {
      printJsonEnvelope(envelope, process.stdout)
    } else if (envelope.ok) {
      process.stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`)
    } else {
      process.stderr.write(`${envelope.error.message}\n`)
    }

    return envelope.ok ? 0 : 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error'
    printJsonEnvelope(errorEnvelope({ code: 'BRIDGE_SOCKET_UNAVAILABLE', message, recoverable: true }), process.stdout)
    return 1
  }
}

run().then((code) => {
  process.exitCode = code
})
