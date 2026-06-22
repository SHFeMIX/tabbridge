import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeBridgeMethod } from '../src/background/commands'

describe('extension command router', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns bridge connected status', async () => {
    await expect(routeBridgeMethod('status', {})).resolves.toEqual({ bridge: 'connected' })
  })

  it('lists redacted Chrome tabs', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 42,
        windowId: 7,
        active: false,
        title: 'Inbox',
        url: 'https://mail.example.com/inbox?token=secret',
      },
    ])
    vi.stubGlobal('chrome', { tabs: { query } })

    await expect(routeBridgeMethod('tabs.list', {})).resolves.toEqual([
      {
        tabId: 42,
        windowId: 7,
        title: 'Inbox',
        domain: 'mail.example.com',
        active: false,
        accessStatus: 'none',
      },
    ])
    expect(query).toHaveBeenCalledWith({})
  })

  it('returns the active current-window tab as redacted output', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 9,
        windowId: 3,
        active: true,
        title: 'Docs',
        url: 'https://docs.example.com/page?token=secret',
      },
    ])
    vi.stubGlobal('chrome', { tabs: { query } })

    await expect(routeBridgeMethod('tabs.current', {})).resolves.toEqual({
      tabId: 9,
      windowId: 3,
      title: 'Docs',
      domain: 'docs.example.com',
      active: true,
      accessStatus: 'none',
    })
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true })
  })

  it('throws TAB_NOT_FOUND when there is no current tab', async () => {
    const query = vi.fn().mockResolvedValue([])
    vi.stubGlobal('chrome', { tabs: { query } })

    await expect(routeBridgeMethod('tabs.current', {})).rejects.toMatchObject({
      code: 'TAB_NOT_FOUND',
      recoverable: true,
    })
  })
})
