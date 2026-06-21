import { CHROME_TO_NATIVE_HOST_MAX_BYTES, NATIVE_HOST_TO_CHROME_MAX_BYTES } from '@tabbridge/shared'

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

      const body = this.buffer.subarray(4, 4 + length).toString('utf8')
      messages.push(JSON.parse(body))
      this.buffer = this.buffer.subarray(4 + length)
    }

    return messages
  }
}
