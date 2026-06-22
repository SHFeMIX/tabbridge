import { describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { BrokerServer } from '../src/server.js'

describe('BrokerServer', () => {
  it('rejects a CLI request when no extension is connected', async () => {
    const server = new BrokerServer({ port: 0, token: 'secret' })
    const url = `ws://127.0.0.1:${(server as unknown as { port: number }).port}`
    const ws = new WebSocket(url)

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    ws.send(JSON.stringify({ type: 'auth', token: 'secret' }))
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 'r1', method: 'tabs.list', params: {} }))

    const response = await new Promise<string>((resolve) => {
      ws.on('message', (data) => resolve(data.toString('utf8')))
    })

    const parsed = JSON.parse(response)
    expect(parsed.error.data.code).toBe('EXTENSION_NOT_CONNECTED')
    await server.close()
  })
})
