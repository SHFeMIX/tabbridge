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

  it('handles install-native-host locally as one JSON envelope', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()
    const writes: unknown[] = []

    const exitCode = await run({
      argv: ['install-native-host', '--browser', 'chrome', '--extension-id', 'abcdefghijklmnopabcdefghijklmnop', '--json'],
      stdout: stdout.writable,
      stderr: stderr.writable,
      writeNativeManifest: async (input) => {
        writes.push(input)
        return {
          path: '/Users/alice/manifest.json',
          manifest: {
            name: 'com.tabbridge.host',
            description: 'TabBridge native host',
            path: '/Users/alice/bin/tabbridge-native-host-wrapper',
            type: 'stdio',
            allowed_origins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/'],
          },
        }
      },
    })

    expect(exitCode).toBe(0)
    expect(writes).toEqual([{ browser: 'chrome', extensionId: 'abcdefghijklmnopabcdefghijklmnop', wrapperPath: process.execPath }])
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"path":"/Users/alice/manifest.json","manifest":{"name":"com.tabbridge.host","description":"TabBridge native host","path":"/Users/alice/bin/tabbridge-native-host-wrapper","type":"stdio","allowed_origins":["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]}}}\n'])
    expect(stderr.chunks).toEqual([])
  })

  it('handles doctor locally with the default Chrome manifest target', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()
    const doctorInputs: unknown[] = []

    const exitCode = await run({
      argv: ['doctor', '--json'],
      stdout: stdout.writable,
      stderr: stderr.writable,
      runDoctor: async (input) => {
        doctorInputs.push(input)
        return { ok: true, bridgeState: 'connected', checks: [] }
      },
    })

    expect(exitCode).toBe(0)
    expect(doctorInputs).toEqual([{ browser: 'chrome' }])
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"ok":true,"bridgeState":"connected","checks":[]}}\n'])
    expect(stderr.chunks).toEqual([])
  })

  it('handles status locally with the default Chrome manifest target', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()
    const doctorInputs: unknown[] = []

    const exitCode = await run({
      argv: ['status', '--json'],
      stdout: stdout.writable,
      stderr: stderr.writable,
      runDoctor: async (input) => {
        doctorInputs.push(input)
        return { ok: false, bridgeState: 'extension_asleep', errorCode: 'EXTENSION_NOT_CONNECTED', checks: [] }
      },
    })

    expect(exitCode).toBe(0)
    expect(doctorInputs).toEqual([{ browser: 'chrome' }])
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"ok":false,"bridgeState":"extension_asleep","errorCode":"EXTENSION_NOT_CONNECTED","checks":[]}}\n'])
    expect(stderr.chunks).toEqual([])
  })

  it('returns a failing exit code for unhealthy doctor reports', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()

    const exitCode = await run({
      argv: ['doctor', '--json'],
      stdout: stdout.writable,
      stderr: stderr.writable,
      runDoctor: async () => ({ ok: false, bridgeState: 'native_host_missing', errorCode: 'NATIVE_HOST_NOT_CONNECTED', checks: [] }),
    })

    expect(exitCode).toBe(1)
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"ok":false,"bridgeState":"native_host_missing","errorCode":"NATIVE_HOST_NOT_CONNECTED","checks":[]}}\n'])
    expect(stderr.chunks).toEqual([])
  })
})
