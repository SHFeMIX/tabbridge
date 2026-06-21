import { errorEnvelope, type CliEnvelope } from '@tabbridge/shared'

export type WritableLike = {
  write(chunk: string): unknown
}

export function printJsonEnvelope<TData>(envelope: CliEnvelope<TData>, stdout: WritableLike): void {
  stdout.write(`${JSON.stringify(envelope)}\n`)
}

export function printCliError(error: unknown, json: boolean, stdout: WritableLike, stderr: WritableLike): void {
  const message = error instanceof Error ? error.message : 'Unknown CLI error'

  if (json) {
    printJsonEnvelope(errorEnvelope({ code: 'BRIDGE_SOCKET_UNAVAILABLE', message, recoverable: true }), stdout)
    return
  }

  stderr.write(`${message}\n`)
}
