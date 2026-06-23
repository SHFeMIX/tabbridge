import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('background service worker', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('creates offscreen document on startup when none exists', async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-ext-id',
        getURL: vi.fn().mockReturnValue('chrome-extension://test-ext-id/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([]),
        onMessage: { addListener: vi.fn() },
      },
      offscreen: {
        createDocument,
      },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      storage: {
        local: { set: vi.fn() },
      },
    })

    const { ensureOffscreenDocument } = await import('../src/entrypoints/background')
    await ensureOffscreenDocument()

    expect(createDocument).toHaveBeenCalledWith({
      url: 'chrome-extension://test-ext-id/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Maintain persistent WebSocket connection to the TabBridge broker',
    })
  })

  it('does not create offscreen document when one already exists', async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-ext-id',
        getURL: vi.fn().mockReturnValue('chrome-extension://test-ext-id/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }]),
        onMessage: { addListener: vi.fn() },
      },
      offscreen: {
        createDocument,
      },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      storage: {
        local: { set: vi.fn() },
      },
    })

    const { ensureOffscreenDocument } = await import('../src/entrypoints/background')
    await ensureOffscreenDocument()

    expect(createDocument).not.toHaveBeenCalled()
  })

  it('alarm keepalive writes lastKeepAlive and ensures offscreen document', async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined)
    const storageSet = vi.fn().mockResolvedValue(undefined)
    let alarmListener: ((alarm: { name: string }) => void) | undefined

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-ext-id',
        getURL: vi.fn().mockReturnValue('chrome-extension://test-ext-id/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([]),
        onMessage: { addListener: vi.fn() },
      },
      offscreen: {
        createDocument,
      },
      alarms: {
        create: vi.fn(),
        onAlarm: {
          addListener: vi.fn((fn) => { alarmListener = fn }),
        },
      },
      storage: {
        local: { set: storageSet },
      },
    })

    const mod = await import('../src/entrypoints/background')
    mod.default.main()

    expect(alarmListener).toBeDefined()
    alarmListener!({ name: 'tabbridge-keepalive' })

    // Wait for async operations in the listener
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(storageSet).toHaveBeenCalledWith({ lastKeepAlive: expect.any(Number) })
    expect(createDocument).toHaveBeenCalled()
  })

  it('handles broker.disconnected by recreating offscreen document', async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined)
    let messageListener: ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined) | undefined

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-ext-id',
        getURL: vi.fn().mockReturnValue('chrome-extension://test-ext-id/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([]),
        onMessage: {
          addListener: vi.fn((fn) => { messageListener = fn }),
        },
      },
      offscreen: {
        createDocument,
      },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      storage: {
        local: { set: vi.fn() },
      },
    })

    const mod = await import('../src/entrypoints/background')
    mod.default.main()

    expect(messageListener).toBeDefined()
    const sendResponse = vi.fn()
    const result = messageListener!({ type: 'broker.disconnected' }, {}, sendResponse)

    expect(result).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
    // Wait for async ensureOffscreenDocument
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(createDocument).toHaveBeenCalled()
  })

  it('handles broker.request and sends broker.response back', async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined)
    let messageListener: ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined) | undefined
    let sendMessageTarget: unknown | undefined

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-ext-id',
        getURL: vi.fn().mockReturnValue('chrome-extension://test-ext-id/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([]),
        onMessage: {
          addListener: vi.fn((fn) => { messageListener = fn }),
        },
        sendMessage: vi.fn((message: unknown) => {
          sendMessageTarget = message
        }),
      },
      offscreen: {
        createDocument,
      },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      storage: {
        local: { set: vi.fn() },
      },
    })

    // Mock routeJsonRpcRequest before importing background
    const mockResponse = { jsonrpc: '2.0' as const, id: 'r1', result: { ok: true } }
    vi.doMock('../src/background/jsonrpc-router', () => ({
      routeJsonRpcRequest: vi.fn().mockResolvedValue(mockResponse),
    }))

    const mod = await import('../src/entrypoints/background')
    mod.default.main()

    expect(messageListener).toBeDefined()
    const sendResponse = vi.fn()
    const request = { jsonrpc: '2.0' as const, id: 'r1', method: 'tabs.list', params: {} }
    const result = messageListener!({ type: 'broker.request', request }, {}, sendResponse)

    expect(result).toBe(true)
    // Wait for async routeJsonRpcRequest and sendMessage
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(sendMessageTarget).toEqual({ type: 'broker.response', response: mockResponse })
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })
})
