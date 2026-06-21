import net from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBridgeRequest, type BridgeRequest } from '@tabbridge/shared'
import { MAX_RESPONSE_LINE_BYTES, sendBridgeRequest } from '../src/ipc-client.js'

const tempDirs: string[] = []

async function createSocketPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tabbridge-cli-ipc-'))
  tempDirs.push(dir)
  return join(dir, 'bridge.sock')
}

function testRequest(): BridgeRequest {
  return createBridgeRequest({
    id: 'req_test',
    source: 'cli',
    target: 'extension',
    command: 'tabs.list',
    payload: {},
    createdAt: 1782012345000,
  })
}

async function listenOnce(handler: (socket: net.Socket) => void): Promise<{ socketPath: string; close: () => Promise<void> }> {
  const socketPath = await createSocketPath()
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    handler(socket)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, resolve)
  })

  return {
    socketPath,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('IPC client', () => {
  it('maps successful bridge responses to CLI data envelopes', async () => {
    const server = await listenOnce((socket) => {
      socket.write('{"id":"req_test","protocolVersion":1,"ok":true,"payload":{"tabId":1}}\n')
    })

    try {
      await expect(sendBridgeRequest(testRequest(), { socketPath: server.socketPath, timeoutMs: 1000 })).resolves.toEqual({
        ok: true,
        data: { tabId: 1 },
      })
    } finally {
      await server.close()
    }
  })

  it('maps failed bridge responses to CLI error envelopes', async () => {
    const server = await listenOnce((socket) => {
      socket.write('{"id":"req_test","protocolVersion":1,"ok":false,"error":{"code":"TAB_NOT_FOUND","message":"No tab","recoverable":false}}\n')
    })

    try {
      await expect(sendBridgeRequest(testRequest(), { socketPath: server.socketPath, timeoutMs: 1000 })).resolves.toEqual({
        ok: false,
        error: { code: 'TAB_NOT_FOUND', message: 'No tab', recoverable: false },
      })
    } finally {
      await server.close()
    }
  })

  it('returns a structured error envelope for malformed response JSON', async () => {
    const server = await listenOnce((socket) => {
      socket.write('{not json}\n')
    })

    try {
      const envelope = await sendBridgeRequest(testRequest(), { socketPath: server.socketPath, timeoutMs: 1000 })

      expect(envelope).toMatchObject({
        ok: false,
        error: {
          code: 'PROTOCOL_VERSION_MISMATCH',
          recoverable: true,
        },
      })
    } finally {
      await server.close()
    }
  })

  it('returns promptly when the socket closes before a response newline', async () => {
    const server = await listenOnce((socket) => {
      socket.write('{"id":"req_test"')
      socket.end()
    })
    const startedAt = Date.now()

    try {
      const envelope = await sendBridgeRequest(testRequest(), { socketPath: server.socketPath, timeoutMs: 5000 })

      expect(Date.now() - startedAt).toBeLessThan(1000)
      expect(envelope).toMatchObject({
        ok: false,
        error: {
          code: 'BRIDGE_SOCKET_UNAVAILABLE',
          recoverable: true,
        },
      })
    } finally {
      await server.close()
    }
  })

  it('rejects response lines larger than the bounded maximum', async () => {
    const server = await listenOnce((socket) => {
      socket.write('x'.repeat(MAX_RESPONSE_LINE_BYTES + 1))
    })

    try {
      const envelope = await sendBridgeRequest(testRequest(), { socketPath: server.socketPath, timeoutMs: 1000 })

      expect(envelope).toMatchObject({
        ok: false,
        error: {
          code: 'MESSAGE_TOO_LARGE',
          recoverable: true,
        },
      })
    } finally {
      await server.close()
    }
  })
})
