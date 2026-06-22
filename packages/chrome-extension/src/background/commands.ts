import { redactChromeTab, type ChromeTabLike, type TabBridgeError } from '@tabbridge/shared'

export async function routeBridgeMethod(method: string, _params: unknown): Promise<unknown> {
  if (method === 'status') {
    return { bridge: 'connected' }
  }

  if (method === 'tabs.list') {
    const tabs = await chrome.tabs.query({})
    return tabs.map((tab) => redactChromeTab(toChromeTabLike(tab)))
  }

  if (method === 'tabs.current') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) {
      const error: TabBridgeError = {
        code: 'TAB_NOT_FOUND',
        message: 'No active tab was found in the current Chrome window.',
        recoverable: true,
        suggestedCommand: 'Focus a Chrome window with an active tab, then run tabbridge tabs current --json.',
      }
      throw error
    }
    return redactChromeTab(toChromeTabLike(tab))
  }

  const error: TabBridgeError = {
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Method ${method} is not implemented by the extension command router yet.`,
    recoverable: false,
  }
  throw error
}


function toChromeTabLike(tab: chrome.tabs.Tab): ChromeTabLike {
  const tabLike: ChromeTabLike = {
    windowId: tab.windowId,
    active: tab.active,
  }
  if (tab.id !== undefined) tabLike.id = tab.id
  if (tab.title !== undefined) tabLike.title = tab.title
  if (tab.url !== undefined) tabLike.url = tab.url
  if (tab.favIconUrl !== undefined) tabLike.favIconUrl = tab.favIconUrl
  return tabLike
}
