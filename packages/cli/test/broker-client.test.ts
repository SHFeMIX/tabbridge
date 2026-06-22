import { describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { createJsonRpcRequest } from '@tabbridge/shared'
import { sendBrokerRequest } from '../src/broker-client.js'

describe('sendBrokerRequest', () => {
  it('sends auth and a JSON-RPC request, then returns the result', async () => {
    const server = new WebSocketServer({ port: 0 })
    const port = (server.address() as { port: number }).port

    server.once('connection', (ws) => {
      ws.once('message', (auth) => {
        const authMsg = JSON.parse(auth.toString('utf8'))
        expect(authMsg.type).toBe('auth')
        expect(authMsg.token).toBe('tok')
        ws.once('message', (req) => {
          const request = JSON.parse(req.toString('utf8'))
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ok: true } }))
        })
      })
    })

    const result = await sendBrokerRequest<{ ok: boolean }>(
      createJsonRpcRequest('r1', 'tabs.list', {}),
      { url: `ws://127.0.0.1:${port}`, token: 'tok', timeoutMs: 1000 },
    )

    expect(result).toEqual({ ok: true, data: { ok: true } })
    server.close()
  })
})
