import type { CliEnvelope } from '@tabbridge/shared'

export type WritableLike = {
  write(chunk: string): unknown
}

export function printJsonEnvelope<TData>(envelope: CliEnvelope<TData>, stdout: WritableLike): void {
  stdout.write(`${JSON.stringify(envelope)}\n`)
}
