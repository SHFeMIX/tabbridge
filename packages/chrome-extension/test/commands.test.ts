import { createSiteGrant, type BridgeRequest } from '@tabbridge/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeBridgeCommand, routeBridgeMethod } from '../src/background/commands'
import { setGrants } from '../src/background/grants'

function request(command: string, payload: Record<string, unknown> = {}): BridgeRequest {
  return {
    id: 'test',
    protocolVersion: 1,
    source: 'cli',
    target: 'extension',
    command,
    payload,
    createdAt: Date.now(),
  }
}

function authorizedTab() {
  return {
    id: 42,
    tabId: 42,
    windowId: 7,
    active: true,
    title: 'Docs',
    url: 'https://docs.example.com/page',
  }
}

describe('extension command router', () => {
  beforeEach(async () => {
    vi.unstubAllGlobals()
    setGrants([])
    await routeBridgeCommand(request('session.disconnect'))
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

  it('connects a default session to the current tab and reports status', async () => {
    const context = { currentTab: vi.fn().mockResolvedValue(authorizedTab()), listTabs: vi.fn() }

    await expect(routeBridgeCommand(request('session.connect', { current: true }), context)).resolves.toEqual({
      ok: true,
      data: { connected: true, tabId: 42, title: 'Docs', url: 'https://docs.example.com/page' },
    })
    await expect(routeBridgeCommand(request('session.status'), context)).resolves.toEqual({
      ok: true,
      data: { connected: true, tabId: 42, title: 'Docs', url: 'https://docs.example.com/page', latestSnapshotAvailable: false },
    })
    await expect(routeBridgeCommand(request('session.disconnect'), context)).resolves.toEqual({ ok: true, data: { disconnected: true } })
  })

  it('connects a default session to an explicit tab id instead of the active tab', async () => {
    const requestedTab = { ...authorizedTab(), id: 123, tabId: 123, title: 'Requested', url: 'https://requested.example.com/page' }
    const context = {
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(requestedTab),
      listTabs: vi.fn(),
    }

    await expect(routeBridgeCommand(request('session.connect', { tabId: 123 }), context)).resolves.toEqual({
      ok: true,
      data: { connected: true, tabId: 123, title: 'Requested', url: 'https://requested.example.com/page' },
    })
    await expect(routeBridgeCommand(request('session.status'), context)).resolves.toEqual({
      ok: true,
      data: { connected: true, tabId: 123, title: 'Requested', url: 'https://requested.example.com/page', latestSnapshotAvailable: false },
    })
  })

  it('routes authorized snapshot requests to the current session tab without snapshot ids', async () => {
    setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
    const sendMessageToTab = vi.fn().mockResolvedValue({ ok: true, data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [], text: 'Page: Docs' } })
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
    }

    await expect(routeBridgeCommand(request('snapshot', { interactive: true }), context)).resolves.toEqual({
      ok: true,
      data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [], text: 'Page: Docs' },
    })
    expect(sendMessageToTab).toHaveBeenCalledWith(42, { type: 'tabbridge.snapshot', tabId: 42, interactive: true, includeUrl: true })
    await expect(routeBridgeCommand(request('session.status'), context)).resolves.toEqual({
      ok: true,
      data: { connected: true, tabId: 42, title: 'Docs', url: 'https://docs.example.com/page', latestSnapshotAvailable: true },
    })
  })

  it('rejects snapshot requests for unauthorized current session tabs before messaging content', async () => {
    const sendMessageToTab = vi.fn()
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
    }

    const result = await routeBridgeCommand(request('snapshot', { interactive: true }), context)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TAB_NOT_AUTHORIZED')
    expect(sendMessageToTab).not.toHaveBeenCalled()
  })

  it('injects the content script and retries authorized legacy adapter snapshots when the tab has no receiver yet', async () => {
    setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
    const get = vi.fn().mockResolvedValue(authorizedTab())
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({ ok: true, data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [], text: 'Page: Docs' } })
    const executeScript = vi.fn().mockResolvedValue([{}])
    const getRegisteredContentScripts = vi.fn().mockResolvedValue([])
    vi.stubGlobal('chrome', { tabs: { get, sendMessage, query: vi.fn().mockResolvedValue([authorizedTab()]) }, scripting: { executeScript, getRegisteredContentScripts } })

    await expect(routeBridgeMethod('snapshot', { tabId: 42, interactive: true })).resolves.toEqual({
      page: { title: 'Docs', url: 'https://docs.example.com/page' },
      refs: [],
      text: 'Page: Docs',
    })
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 42 }, files: ['content-scripts/content.js'] })
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('routes latest-ref actions without snapshot ids after a snapshot', async () => {
    setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
    const sendMessageToTab = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [{ ref: '@e1' }], text: 'Page: Docs' } })
      .mockResolvedValueOnce({ ok: true, data: { action: 'click', ref: '@e1' } })
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
    }

    await routeBridgeCommand(request('snapshot', { interactive: true }), context)
    await expect(routeBridgeCommand(request('action.click', { ref: '@e1' }), context)).resolves.toEqual({ ok: true, data: { action: 'click', ref: '@e1' } })

    expect(sendMessageToTab).toHaveBeenLastCalledWith(42, { type: 'tabbridge.action', command: 'click', tabId: 42, frameRef: 'f0', ref: '@e1' })
  })

  it('requires a latest interactive snapshot before ref actions', async () => {
    setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
    const sendMessageToTab = vi.fn()
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
    }
    await routeBridgeCommand(request('session.connect', { current: true }), context)

    const result = await routeBridgeCommand(request('action.click', { ref: '@e1' }), context)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SNAPSHOT_REQUIRED')
    expect(sendMessageToTab).not.toHaveBeenCalled()
  })

  it('keeps authorization ahead of snapshot-required action checks', async () => {
    const sendMessageToTab = vi.fn()
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
    }
    await routeBridgeCommand(request('session.connect', { current: true }), context)

    const result = await routeBridgeCommand(request('action.click', { ref: '@e1' }), context)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TAB_NOT_AUTHORIZED')
    expect(sendMessageToTab).not.toHaveBeenCalled()
  })

  it('requires authorization before wait-for-text reads page content', async () => {
    const sendMessageToTab = vi.fn()
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
    }

    const result = await routeBridgeCommand(request('waitForText', { text: 'secret' }), context)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TAB_NOT_AUTHORIZED')
    expect(sendMessageToTab).not.toHaveBeenCalled()
  })

  it('clears latest refs after navigation', async () => {
    setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
    const sendMessageToTab = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [{ ref: '@e1' }], text: 'Page: Docs' } })
      .mockResolvedValueOnce({ ok: true, data: { cleared: true } })
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
      reloadTab: vi.fn().mockResolvedValue(undefined),
    }

    await routeBridgeCommand(request('snapshot', { interactive: true }), context)
    await expect(routeBridgeCommand(request('navigation.reload'), context)).resolves.toEqual({ ok: true, data: { navigated: true, refsCleared: true } })
    const action = await routeBridgeCommand(request('action.click', { ref: '@e1' }), context)

    expect(action.ok).toBe(false)
    if (!action.ok) expect(action.error.code).toBe('SNAPSHOT_REQUIRED')
    expect(sendMessageToTab).toHaveBeenLastCalledWith(42, { type: 'tabbridge.clearRefs', tabId: 42 })
  })

  it('clears background latest refs after navigation even when content ref clearing fails', async () => {
    setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
    const sendMessageToTab = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [{ ref: '@e1' }], text: 'Page: Docs' } })
      .mockRejectedValueOnce(new Error('content unavailable after reload'))
    const context = {
      listTabs: vi.fn(),
      currentTab: vi.fn().mockResolvedValue(authorizedTab()),
      getTab: vi.fn().mockResolvedValue(authorizedTab()),
      sendMessageToTab,
      reloadTab: vi.fn().mockResolvedValue(undefined),
    }

    await routeBridgeCommand(request('snapshot', { interactive: true }), context)
    const navigation = await routeBridgeCommand(request('navigation.reload'), context)
    expect(navigation.ok).toBe(false)

    await expect(routeBridgeCommand(request('session.status'), context)).resolves.toEqual({
      ok: true,
      data: { connected: true, tabId: 42, title: 'Docs', url: 'https://docs.example.com/page', latestSnapshotAvailable: false },
    })
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
