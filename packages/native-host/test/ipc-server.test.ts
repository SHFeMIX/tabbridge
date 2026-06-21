import net from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

async function sendRaw(path: string, value: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(path)
    let buffer = ''
    socket.once('error', reject)
    socket.once('connect', () => socket.write(value))
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline >= 0) {
        resolve(buffer.slice(0, newline))
        socket.destroy()
      }
    })
    socket.once('end', () => resolve(buffer))
  })
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
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
      await closeServer(server)
    }
  })

  it('refuses to unlink an active socket when starting', async () => {
    const path = await socketPath()
    const activeServer = net.createServer()
    await new Promise<void>((resolve, reject) => {
      activeServer.once('error', reject)
      activeServer.listen(path, () => resolve())
    })

    try {
      await expect(startIpcServer({
        socketPath: path,
        onRequest: async () => okEnvelope({}),
      })).rejects.toThrow('IPC_SOCKET_ACTIVE')
    } finally {
      await closeServer(activeServer)
    }
  })

  it('removes stale socket files when no server is listening', async () => {
    const path = await socketPath()
    await writeFile(path, '')

    const server = await startIpcServer({
      socketPath: path,
      onRequest: async () => okEnvelope({ tabs: [] }),
    })

    try {
      await expect(sendLine(path, JSON.stringify(request()))).resolves.toContain('"ok":true')
    } finally {
      await closeServer(server)
    }
  })

  it('returns a structured error and closes when a request line exceeds the byte limit', async () => {
    const path = await socketPath()
    const server = await startIpcServer({
      socketPath: path,
      maxRequestBytes: 16,
      onRequest: async () => okEnvelope({ tabs: [] }),
    })

    try {
      const response = JSON.parse(await sendRaw(path, '{"id":"too-large"'))

      expect(response).toMatchObject({
        id: 'unknown',
        protocolVersion: 1,
        ok: false,
        error: { code: 'IPC_REQUEST_TOO_LARGE', recoverable: false },
      })
    } finally {
      await closeServer(server)
    }
  })
})
