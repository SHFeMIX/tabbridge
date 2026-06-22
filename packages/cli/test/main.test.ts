import { Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { JsonRpcRequest } from '@tabbridge/shared'
import type { BrokerClientOptions } from '../src/broker-client.js'
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
  it('ensures the broker then sends stdin-hydrated JSON-RPC requests', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()
    const sentRequests: unknown[] = []
    const sentOptions: unknown[] = []
    const options: RunOptions = {
      argv: ['type', '--tab', '123', '--snapshot-id', 'snap_1', '--ref', '@e1', '--text-stdin', '--json'],
      stdin: stringReadable('hello from stdin'),
      stdout: stdout.writable,
      stderr: stderr.writable,
      requestId: () => 'req_stdin',
      ensureBroker: async () => ({ url: 'ws://127.0.0.1:9876', token: 'tok' }),
      sendBrokerRequest: async <TData>(request: JsonRpcRequest, brokerOptions: BrokerClientOptions) => {
        sentRequests.push(request)
        sentOptions.push(brokerOptions)
        return { ok: true, data: { typed: true } as TData }
      },
    }

    const exitCode = await run(options)

    expect(exitCode).toBe(0)
    expect(sentRequests).toEqual([{
      jsonrpc: '2.0',
      id: 'req_stdin',
      method: 'action.type',
      params: { tabId: 123, snapshotId: 'snap_1', ref: '@e1', text: 'hello from stdin' },
    }])
    expect(sentOptions).toEqual([{ url: 'ws://127.0.0.1:9876', token: 'tok', timeoutMs: 30000 }])
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"typed":true}}\n'])
    expect(stderr.chunks).toEqual([])
  })

  it('routes status through the broker instead of local native-host diagnostics', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()
    const sentRequests: unknown[] = []

    const exitCode = await run({
      argv: ['status', '--json'],
      stdout: stdout.writable,
      stderr: stderr.writable,
      requestId: () => 'req_status',
      ensureBroker: async () => ({ url: 'ws://127.0.0.1:9876', token: 'tok' }),
      sendBrokerRequest: async <TData>(request: JsonRpcRequest) => {
        sentRequests.push(request)
        return { ok: true, data: { bridgeState: 'connected' } as TData }
      },
      runDoctor: async () => { throw new Error('status should not run local doctor') },
    })

    expect(exitCode).toBe(0)
    expect(sentRequests).toEqual([{ jsonrpc: '2.0', id: 'req_status', method: 'status', params: {} }])
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"bridgeState":"connected"}}\n'])
    expect(stderr.chunks).toEqual([])
  })

  it('handles doctor locally and returns a failing exit code for unhealthy reports', async () => {
    const stdout = captureWritable()
    const stderr = captureWritable()

    const exitCode = await run({
      argv: ['doctor', '--json'],
      stdout: stdout.writable,
      stderr: stderr.writable,
      ensureBroker: async () => { throw new Error('doctor should not ensure broker') },
      runDoctor: async () => ({ ok: false, bridgeState: 'extension_asleep', errorCode: 'EXTENSION_NOT_CONNECTED', checks: [] }),
    })

    expect(exitCode).toBe(1)
    expect(stdout.chunks).toEqual(['{"ok":true,"data":{"ok":false,"bridgeState":"extension_asleep","errorCode":"EXTENSION_NOT_CONNECTED","checks":[]}}\n'])
    expect(stderr.chunks).toEqual([])
  })
})
