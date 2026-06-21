import { describe, expect, it } from 'vitest'
import { BridgeController } from '../src/bridge.js'

describe('BridgeController', () => {
  it('starts disconnected and reports extension asleep', () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    expect(bridge.status()).toEqual({ connected: false, state: 'extension_asleep' })
  })

  it('accepts compatible extension hello', () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      capabilities: {
        commands: ['tabs.list', 'snapshot'],
        snapshot: ['semantic', 'text', 'html', 'screenshot'],
        permissions: ['tabs', 'host-permission', 'nativeMessaging', 'scripting', 'storage'],
      },
    })

    expect(bridge.status()).toMatchObject({ connected: true, state: 'connected', extensionId: 'abcdefghijklmnopabcdefghijklmnop' })
  })

  it('rejects malformed extension hello values without connecting', () => {
    const malformedHellos: Array<[string, unknown]> = [
      ['type', {
        type: 'request',
        protocolVersion: 1,
        role: 'extension',
        version: '0.1.0',
        capabilities: { commands: [], snapshot: [], permissions: [] },
      }],
      ['version', {
        type: 'hello',
        protocolVersion: 1,
        role: 'extension',
        version: '',
        capabilities: { commands: [], snapshot: [], permissions: [] },
      }],
      ['capabilities.commands', {
        type: 'hello',
        protocolVersion: 1,
        role: 'extension',
        version: '0.1.0',
        capabilities: { commands: 'tabs.list', snapshot: [], permissions: [] },
      }],
    ]

    for (const [field, hello] of malformedHellos) {
      const bridge = new BridgeController({ requestTimeoutMs: 1000 })

      expect(() => bridge.acceptHello(hello as Parameters<BridgeController['acceptHello']>[0])).toThrow(new RegExp(`MALFORMED_EXTENSION_HELLO.*${field}`))
      expect(bridge.status()).toEqual({ connected: false, state: 'extension_asleep' })
    }
  })

  it('rejects protocol version mismatch', () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    expect(() => bridge.acceptHello({
      type: 'hello',
      protocolVersion: 2 as 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })).toThrow('PROTOCOL_VERSION_MISMATCH')
  })
})

import { createBridgeRequest } from '@tabbridge/shared'

describe('BridgeController request forwarding', () => {
  it('returns a structured error when forwarding while the extension is asleep', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    const request = createBridgeRequest({
      id: 'req_asleep',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    await expect(bridge.forward(request, () => undefined)).resolves.toMatchObject({
      ok: false,
      error: { code: 'EXTENSION_NOT_CONNECTED', recoverable: true },
    })
  })

  it('correlates extension responses by request id', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const request = createBridgeRequest({
      id: 'req_forward',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })
    const sent: string[] = []

    const result = bridge.forward(request, (outgoing) => {
      sent.push(outgoing.id)
    })
    expect(sent).toEqual(['req_forward'])
    expect(bridge.acceptResponse({ id: 'req_forward', protocolVersion: 1, ok: true, payload: { tabs: [] } })).toBe(true)

    await expect(result).resolves.toEqual({ ok: true, data: { tabs: [] } })
  })

  it('serializes action forwarding per tab', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const first = createBridgeRequest({
      id: 'req_first',
      source: 'cli',
      target: 'extension',
      command: 'action.click',
      payload: { tabId: 7 },
      createdAt: 1782012345000,
    })
    const second = createBridgeRequest({
      id: 'req_second',
      source: 'cli',
      target: 'extension',
      command: 'action.type',
      payload: { tabId: 7 },
      createdAt: 1782012345001,
    })
    const sent: string[] = []

    const firstResult = bridge.forward(first, (request) => {
      sent.push(request.id)
    })
    const secondResult = bridge.forward(second, (request) => {
      sent.push(request.id)
    })

    expect(sent).toEqual(['req_first'])
    bridge.acceptResponse({ id: 'req_first', protocolVersion: 1, ok: true, payload: { done: 'first' } })
    await expect(firstResult).resolves.toEqual({ ok: true, data: { done: 'first' } })
    expect(sent).toEqual(['req_first', 'req_second'])
    bridge.acceptResponse({ id: 'req_second', protocolVersion: 1, ok: true, payload: { done: 'second' } })
    await expect(secondResult).resolves.toEqual({ ok: true, data: { done: 'second' } })
  })

  it('rejects duplicate in-flight request ids without overwriting pending requests', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const first = createBridgeRequest({
      id: 'req_duplicate',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })
    const second = createBridgeRequest({
      id: 'req_duplicate',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345001,
    })
    const sent: string[] = []

    const firstResult = bridge.forward(first, (outgoing) => {
      sent.push(outgoing.id)
    })
    const secondResult = bridge.forward(second, (outgoing) => {
      sent.push(outgoing.id)
    })

    await expect(secondResult).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_VERSION_MISMATCH', recoverable: false },
    })
    expect(sent).toEqual(['req_duplicate'])
    expect(bridge.acceptResponse({ id: 'req_duplicate', protocolVersion: 1, ok: true, payload: { tabs: [] } })).toBe(true)
    await expect(firstResult).resolves.toEqual({ ok: true, data: { tabs: [] } })
  })

  it('returns a protocol error when a success response is missing its payload', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const request = createBridgeRequest({
      id: 'req_missing_payload',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    const result = bridge.forward(request, () => undefined)
    expect(bridge.acceptResponse({ id: 'req_missing_payload', protocolVersion: 1, ok: true } as never)).toBe(true)

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_VERSION_MISMATCH', recoverable: true },
    })
  })

  it('returns a protocol error when a failure response has an invalid error object', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const request = createBridgeRequest({
      id: 'req_invalid_error',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    const result = bridge.forward(request, () => undefined)
    expect(bridge.acceptResponse({
      id: 'req_invalid_error',
      protocolVersion: 1,
      ok: false,
      error: { code: 'NOT_A_SHARED_CODE', message: 'bad', recoverable: true },
    } as never)).toBe(true)

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_VERSION_MISMATCH', recoverable: true },
    })
  })

  it('returns a structured error and cleans pending state when send throws synchronously', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const request = createBridgeRequest({
      id: 'req_sync_throw',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    const result = await bridge.forward(request, () => {
      throw new Error('stdout closed')
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'EXTENSION_NOT_CONNECTED', recoverable: true },
    })
    expect(bridge.acceptResponse({ id: 'req_sync_throw', protocolVersion: 1, ok: true, payload: { late: true } })).toBe(false)
  })

  it('rejects duplicate same-tab action request ids before queued forwarding begins', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const first = createBridgeRequest({
      id: 'req_queued_duplicate',
      source: 'cli',
      target: 'extension',
      command: 'action.click',
      payload: { tabId: 7 },
      createdAt: 1782012345000,
    })
    const second = createBridgeRequest({
      id: 'req_queued_duplicate',
      source: 'cli',
      target: 'extension',
      command: 'action.type',
      payload: { tabId: 7 },
      createdAt: 1782012345001,
    })
    const sent: string[] = []

    const firstResult = bridge.forward(first, (outgoing) => {
      sent.push(outgoing.command)
    })
    const secondResult = bridge.forward(second, (outgoing) => {
      sent.push(outgoing.command)
    })

    await expect(secondResult).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_VERSION_MISMATCH', recoverable: false },
    })
    bridge.acceptResponse({ id: 'req_queued_duplicate', protocolVersion: 1, ok: true, payload: { done: true } })
    await expect(firstResult).resolves.toEqual({ ok: true, data: { done: true } })
    expect(sent).toEqual(['action.click'])
  })

  it('returns a protocol error when a success response also contains an error', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const request = createBridgeRequest({
      id: 'req_success_with_error',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    const result = bridge.forward(request, () => undefined)
    expect(bridge.acceptResponse({
      id: 'req_success_with_error',
      protocolVersion: 1,
      ok: true,
      payload: { tabs: [] },
      error: { code: 'EXTENSION_NOT_CONNECTED', message: 'bad', recoverable: true },
    } as never)).toBe(true)

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_VERSION_MISMATCH', recoverable: true },
    })
  })

  it('returns a protocol error when a failure response also contains payload', async () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })
    const request = createBridgeRequest({
      id: 'req_failure_with_payload',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    const result = bridge.forward(request, () => undefined)
    expect(bridge.acceptResponse({
      id: 'req_failure_with_payload',
      protocolVersion: 1,
      ok: false,
      payload: { tabs: [] },
      error: { code: 'EXTENSION_NOT_CONNECTED', message: 'bad', recoverable: true },
    } as never)).toBe(true)

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_VERSION_MISMATCH', recoverable: true },
    })
  })

  it('routes each decoded native message independently when one message is malformed', async () => {
    const { routeNativeMessages } = await import('../src/main.js') as typeof import('../src/main.js') & {
      routeNativeMessages?: (bridge: BridgeController, messages: unknown[], onError: (error: unknown) => void) => void
    }
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    const errors: unknown[] = []

    routeNativeMessages?.(bridge, [
      { type: 'hello', protocolVersion: 1, role: 'extension', version: '', capabilities: { commands: [], snapshot: [], permissions: [] } },
      { type: 'hello', protocolVersion: 1, role: 'extension', version: '0.1.0', capabilities: { commands: [], snapshot: [], permissions: [] } },
    ], (error) => errors.push(error))

    expect(errors).toHaveLength(1)
    expect(bridge.status()).toMatchObject({ connected: true, state: 'connected' })
  })
})
