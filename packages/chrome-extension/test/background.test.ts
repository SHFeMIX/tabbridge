import { describe, expect, it, vi } from 'vitest'

describe('background service worker', () => {
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
})
