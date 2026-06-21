import { describe, expect, it } from 'vitest'
import { NativeMessageDecoder, encodeNativeMessage } from '../src/native-framing.js'

describe('Chrome Native Messaging framing', () => {
  it('encodes JSON with little-endian 32-bit length prefix', () => {
    const encoded = encodeNativeMessage({ type: 'hello', protocolVersion: 1 })
    const length = encoded.readUInt32LE(0)
    const body = encoded.subarray(4).toString('utf8')

    expect(length).toBe(Buffer.byteLength(body))
    expect(JSON.parse(body)).toEqual({ type: 'hello', protocolVersion: 1 })
  })

  it('decodes messages split across chunks', () => {
    const decoder = new NativeMessageDecoder()
    const encoded = encodeNativeMessage({ id: 'req_1', ok: true })

    expect(decoder.push(encoded.subarray(0, 3))).toEqual([])
    expect(decoder.push(encoded.subarray(3))).toEqual([{ id: 'req_1', ok: true }])
  })
})
