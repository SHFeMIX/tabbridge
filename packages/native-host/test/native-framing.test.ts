import { describe, expect, it } from 'vitest'
import { NativeMessageDecoder, NativeMessageDecodingError, encodeNativeMessage } from '../src/native-framing.js'

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

  it('returns valid messages decoded before a malformed JSON frame in the same chunk', () => {
    const decoder = new NativeMessageDecoder()
    const malformedBody = Buffer.from('{not json', 'utf8')
    const malformedHeader = Buffer.alloc(4)
    malformedHeader.writeUInt32LE(malformedBody.byteLength, 0)

    try {
      decoder.push(Buffer.concat([
        encodeNativeMessage({ id: 'req_before_malformed', ok: true }),
        malformedHeader,
        malformedBody,
      ]))
      throw new Error('expected decoder to report malformed frame')
    } catch (error) {
      expect(error).toBeInstanceOf(NativeMessageDecodingError)
      expect((error as NativeMessageDecodingError).messages).toEqual([{ id: 'req_before_malformed', ok: true }])
    }
  })
})
