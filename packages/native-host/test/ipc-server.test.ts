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

function request(id = 'req_ipc'): BridgeRequest {
  return createBridgeRequest({
    id,
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

async function sendChunks(path: string, chunks: Buffer[]): Promise<string> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(path)
    let buffer = ''
    socket.once('error', reject)
    socket.once('connect', () => {
      const writeNext = (index: number): void => {
        const chunk = chunks[index]
        if (!chunk) return
        socket.write(chunk)
        setTimeout(() => writeNext(index + 1), 10)
      }
      writeNext(0)
    })
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

async function readLine(socket: net.Socket): Promise<string> {
  return await new Promise((resolve, reject) => {
    let buffer = ''
    socket.once('error', reject)
    socket.on('data', function onData(chunk) {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline >= 0) {
        socket.off('data', onData)
        resolve(buffer.slice(0, newline))
      }
    })
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
        error: { code: 'MESSAGE_TOO_LARGE', recoverable: false },
      })
    } finally {
      await closeServer(server)
    }
  })

  it('does not process another request on the same socket while one is pending', async () => {
    const path = await socketPath()
    let resolveFirst: ((value: ReturnType<typeof okEnvelope>) => void) | undefined
    const seen: string[] = []
    const server = await startIpcServer({
      socketPath: path,
      onRequest: async (incoming) => {
        seen.push(incoming.id)
        return await new Promise((resolve) => {
          resolveFirst = resolve
        })
      },
    })
    const socket = net.createConnection(path)

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('error', reject)
      })
      socket.write(`${JSON.stringify(request('req_pending_first'))}\n`)
      socket.write(`${JSON.stringify(request('req_pending_second'))}\n`)
      await new Promise((resolve) => setTimeout(resolve, 25))
      expect(seen).toEqual(['req_pending_first'])

      resolveFirst?.(okEnvelope({ done: true }))
      const response = JSON.parse(await readLine(socket))
      expect(response).toMatchObject({ id: 'req_pending_first', ok: true })
      expect(seen).toEqual(['req_pending_first'])
    } finally {
      socket.destroy()
      await closeServer(server)
    }
  })

  it('decodes newline-delimited request bytes after split multibyte UTF-8 characters are complete', async () => {
    const path = await socketPath()
    const seen: BridgeRequest[] = []
    const server = await startIpcServer({
      socketPath: path,
      onRequest: async (incoming) => {
        seen.push(incoming)
        return okEnvelope({ text: (incoming.payload as { text: string }).text })
      },
    })
    const line = `${JSON.stringify(createBridgeRequest({
      id: 'req_multibyte',
      source: 'cli',
      target: 'extension',
      command: 'snapshot.text',
      payload: { text: 'hello 🌉' },
      createdAt: 1782012345000,
    }))}\n`
    const bytes = Buffer.from(line, 'utf8')
    const splitAt = bytes.indexOf(Buffer.from('🌉', 'utf8')) + 2
    const firstChunk = bytes.subarray(0, splitAt)
    const secondChunk = bytes.subarray(splitAt)
    const firstReplacement = firstChunk.toString('utf8').includes('�')
    const secondReplacement = secondChunk.toString('utf8').includes('�')
    expect(firstReplacement || secondReplacement).toBe(true)

    try {
      const response = JSON.parse(await sendChunks(path, [firstChunk, secondChunk]))

      expect(response).toMatchObject({
        id: 'req_multibyte',
        protocolVersion: 1,
        ok: true,
        payload: { text: 'hello 🌉' },
      })
      expect(seen).toHaveLength(1)
      expect(seen[0]?.payload).toEqual({ text: 'hello 🌉' })
    } finally {
      await closeServer(server)
    }
  })

  it('handles accepted socket errors without throwing from the server', async () => {
    const path = await socketPath()
    const server = await startIpcServer({
      socketPath: path,
      onRequest: async () => okEnvelope({ tabs: [] }),
    })
    const socket = net.createConnection(path)

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('error', reject)
      })
      socket.emit('error', Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }))

      await expect(sendLine(path, JSON.stringify(request('req_after_socket_error')))).resolves.toContain('"ok":true')
    } finally {
      socket.destroy()
      await closeServer(server)
    }
  })
})
