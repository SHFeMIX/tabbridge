import { Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { run, type RunOptions } from '../src/main.js'

function stringReadable(text: string): Readable {
  return Readable.from([text])
}

function captureWritable(): { writable: Writable; chunks: string[] } {
  const chunks: string[] = []
  return {
    chunks,
    writable: new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    }),
  }
}

describe('CLI main runner', () => {
  it('reads --text-stdin before sending and replaces the marker with stdin text', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()
    const sentPayloads: unknown[] = []
    const options: RunOptions = {
      argv: ['type', '--tab', '123', '--snapshot-id', 'snap_1', '--ref', '@e1', '--text-stdin', '--json'],
      stdin: stringReadable('hello from stdin'),
      stdout: stdout.writable,
      stderr: stderr.writable,
      now: () => 1782012345000,
      requestId: () => 'req_stdin',
      sendBridgeRequest: async (request) => {
        sentPayloads.push(request.payload)
        return { ok: true, data: { typed: true } }
      },
    }

    const exitCode = await run(options)

    expect(exitCode).toBe(0)
    expect(sentPayloads).toEqual([{ tabId: 123, snapshotId: 'snap_1', ref: '@e1', text: 'hello from stdin' }])
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"typed":true}}\n'])
    expect(stderr.chunks).toEqual([])
  })
})
