import { CHROME_TO_NATIVE_HOST_MAX_BYTES, NATIVE_HOST_TO_CHROME_MAX_BYTES } from '@tabbridge/shared'

export class NativeMessageDecodingError extends Error {
  constructor(message: string, readonly messages: unknown[], options?: ErrorOptions) {
    super(message, options)
    this.name = 'NativeMessageDecodingError'
  }
}

export function encodeNativeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  if (body.byteLength > NATIVE_HOST_TO_CHROME_MAX_BYTES) {
    throw new Error('MESSAGE_TOO_LARGE')
  }

  const header = Buffer.alloc(4)
  header.writeUInt32LE(body.byteLength, 0)
  return Buffer.concat([header, body])
}

export class NativeMessageDecoder {
  private buffer = Buffer.alloc(0)

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: unknown[] = []

    while (this.buffer.byteLength >= 4) {
      const length = this.buffer.readUInt32LE(0)
      if (length > CHROME_TO_NATIVE_HOST_MAX_BYTES) throw new Error('MESSAGE_TOO_LARGE')
      if (this.buffer.byteLength < 4 + length) break

      const frame = this.buffer.subarray(4, 4 + length)
      this.buffer = this.buffer.subarray(4 + length)
      try {
        messages.push(JSON.parse(frame.toString('utf8')))
      } catch (error) {
        throw new NativeMessageDecodingError('MALFORMED_NATIVE_MESSAGE', messages, { cause: error })
      }
    }

    return messages
  }
}
