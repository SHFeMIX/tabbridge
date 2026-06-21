import { describe, expect, it } from 'vitest'
import { printCliError, printJsonEnvelope } from '../src/json-output.js'

describe('JSON output', () => {
  it('prints exactly one JSON envelope plus newline', () => {
    const writes: string[] = []
    printJsonEnvelope({ ok: true, data: { tabId: 1 } }, { write: (chunk: string) => writes.push(chunk) })

    expect(writes).toEqual(['{"ok":true,"data":{"tabId":1}}\n'])
  })

  it('prints non-json errors to stderr without writing stdout', () => {
    const stdoutWrites: string[] = []
    const stderrWrites: string[] = []

    printCliError(new Error('tabs request-access requires --reason'), false, { write: (chunk: string) => stdoutWrites.push(chunk) }, { write: (chunk: string) => stderrWrites.push(chunk) })

    expect(stdoutWrites).toEqual([])
    expect(stderrWrites).toEqual(['tabs request-access requires --reason\n'])
  })

  it('prints json mode errors as one stdout envelope without writing stderr', () => {
    const stdoutWrites: string[] = []
    const stderrWrites: string[] = []

    printCliError(new Error('tabs request-access requires --reason'), true, { write: (chunk: string) => stdoutWrites.push(chunk) }, { write: (chunk: string) => stderrWrites.push(chunk) })

    expect(stdoutWrites).toEqual(['{"ok":false,"error":{"code":"BRIDGE_SOCKET_UNAVAILABLE","message":"tabs request-access requires --reason","recoverable":true}}\n'])
    expect(stderrWrites).toEqual([])
  })
})
