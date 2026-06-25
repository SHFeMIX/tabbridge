import { createSiteGrant } from '@tabbridge/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeBridgeMethod } from '../src/background/commands'
import { setGrants } from '../src/background/grants'

describe('extension command router', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    setGrants([])
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

  it('routes authorized snapshot requests to the tab content script', async () => {
    setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
    const get = vi.fn().mockResolvedValue({
      id: 42,
      windowId: 7,
      active: false,
      title: 'Docs',
      url: 'https://docs.example.com/page',
    })
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      data: { snapshotId: 'snap_fixed', tabId: 42, frames: [] },
    })
    vi.stubGlobal('chrome', { tabs: { get, sendMessage } })

    await expect(routeBridgeMethod('snapshot', { tabId: 42, snapshotId: 'snap_fixed', includeUrl: true })).resolves.toEqual({
      snapshotId: 'snap_fixed',
      tabId: 42,
      frames: [],
    })
    expect(get).toHaveBeenCalledWith(42)
    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: 'tabbridge.snapshot',
      tabId: 42,
      snapshotId: 'snap_fixed',
      includeUrl: true,
    })
  })

  it('rejects snapshot requests for unauthorized tabs before messaging the content script', async () => {
    const get = vi.fn().mockResolvedValue({
      id: 42,
      windowId: 7,
      active: false,
      title: 'Docs',
      url: 'https://docs.example.com/page',
    })
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: { snapshotId: 'snap_fixed', tabId: 42, frames: [] } })
    vi.stubGlobal('chrome', { tabs: { get, sendMessage } })

    await expect(routeBridgeMethod('snapshot', { tabId: 42, snapshotId: 'snap_fixed' })).rejects.toMatchObject({
      code: 'TAB_NOT_AUTHORIZED',
    })
    expect(get).toHaveBeenCalledWith(42)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('keeps text reads unsupported in the legacy JSON-RPC adapter', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: { text: 'secret page text' } })
    vi.stubGlobal('chrome', { tabs: { sendMessage } })

    await expect(routeBridgeMethod('text', { tabId: 42 })).rejects.toMatchObject({
      code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('keeps navigation unsupported in the legacy JSON-RPC adapter', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: {} })
    vi.stubGlobal('chrome', { tabs: { sendMessage } })

    await expect(routeBridgeMethod('navigation.reload', { tabId: 42 })).rejects.toMatchObject({
      code: 'BROWSER_COMMAND_TIMEOUT',
    })
    expect(sendMessage).not.toHaveBeenCalled()
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
