import net from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBridgeRequest, okEnvelope, type BridgeRequest } from '@tabbridge/shared'
import { startIpcServer } from '../src/ipc-server.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function socketPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tabbridge-native-ipc-'))
  tempDirs.push(dir)
  return join(dir, 'bridge.sock')
}

function request(): BridgeRequest {
  return createBridgeRequest({
    id: 'req_ipc',
    source: 'cli',
    target: 'extension',
    command: 'tabs.list',
    payload: {},
    createdAt: 1782012345000,
  })
}

async function sendLine(path: string, line: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(path)
    let buffer = ''
    socket.once('error', reject)
    socket.once('connect', () => socket.write(`${line}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline >= 0) {
        resolve(buffer.slice(0, newline))
        socket.destroy()
      }
    })
  })
}

describe('IPC server', () => {
  it('uses the existing CLI socket contract: request line in, BridgeResponse line out', async () => {
    const path = await socketPath()
    const seen: BridgeRequest[] = []
    const server = await startIpcServer({
      socketPath: path,
      onRequest: async (incoming) => {
        seen.push(incoming)
        return okEnvelope({ tabs: [] })
      },
    })

    try {
      await expect(sendLine(path, JSON.stringify(request()))).resolves.toBe('{"id":"req_ipc","protocolVersion":1,"ok":true,"payload":{"tabs":[]}}')
      expect(seen).toEqual([request()])
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
