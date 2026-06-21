import { describe, expect, it } from 'vitest'
import { printJsonEnvelope } from '../src/json-output.js'

describe('JSON output', () => {
  it('prints exactly one JSON envelope plus newline', () => {
    const writes: string[] = []
    printJsonEnvelope({ ok: true, data: { tabId: 1 } }, { write: (chunk: string) => writes.push(chunk) })

    expect(writes).toEqual(['{"ok":true,"data":{"tabId":1}}\n'])
  })
})
