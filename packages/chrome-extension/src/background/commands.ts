import { errorEnvelope, okEnvelope, tabNotAuthorizedError, type BridgeRequest, type CliEnvelope, type TabBridgeErrorCode } from '@tabbridge/shared'
import { listRedactedTabs } from './tabs'
import { createScreenshotController } from './screenshot'
import type { SiteGrant } from '@tabbridge/shared'

const screenshotController = createScreenshotController(() => Date.now())

export type CommandContext = {
  listTabs(): Promise<unknown[]>
  currentTab(): Promise<unknown | undefined>
  sendMessageToTab?(tabId: number, message: unknown): Promise<unknown>
}

let grants: SiteGrant[] = []

export function getGrants(): SiteGrant[] {
  return grants
}

export function setGrants(newGrants: SiteGrant[]): void {
  grants = newGrants
}

export async function routeBridgeCommand(request: BridgeRequest, context?: CommandContext): Promise<CliEnvelope<unknown>> {
  if (request.command === 'status') {
    return okEnvelope({ bridge: 'connected' })
  }

  if (request.command === 'tabs.list' && context) {
    return okEnvelope(await context.listTabs())
  }

  if (request.command === 'tabs.current' && context) {
    const tab = await context.currentTab()
    if (!tab) {
      return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
    }
    return okEnvelope(tab)
  }

  if (request.command === 'snapshot') {
    const payload = request.payload as { tabId: number; snapshotId?: string; includeUrl?: boolean }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Snapshot messaging is not available.', recoverable: false })
    }
    try {
      const result = await context.sendMessageToTab(payload.tabId, {
        type: 'tabbridge.snapshot',
        tabId: payload.tabId,
        snapshotId: payload.snapshotId ?? `snap_${Date.now()}`,
        includeUrl: payload.includeUrl,
      })
      if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
        return okEnvelope(result.data)
      }
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
        const errorData = result.error as { code: string; message: string; recoverable: boolean; suggestedCommand?: string }
        const error = {
          code: errorData.code as TabBridgeErrorCode,
          message: errorData.message,
          recoverable: errorData.recoverable,
        }
        if (errorData.suggestedCommand) {
          Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
        }
        return errorEnvelope(error)
      }
      return errorEnvelope({
        code: 'BROWSER_COMMAND_TIMEOUT',
        message: 'Unexpected response from content script.',
        recoverable: true,
      })
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  if (request.command === 'text') {
    const payload = request.payload as { tabId: number; maxBytes?: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Text read messaging is not available.', recoverable: false })
    }
    try {
      const result = await context.sendMessageToTab(payload.tabId, {
        type: 'tabbridge.text',
        tabId: payload.tabId,
        maxBytes: payload.maxBytes,
      })
      if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
        return okEnvelope(result.data)
      }
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
        const errorData = result.error as { code: string; message: string; recoverable: boolean; suggestedCommand?: string }
        const error = {
          code: errorData.code as TabBridgeErrorCode,
          message: errorData.message,
          recoverable: errorData.recoverable,
        }
        if (errorData.suggestedCommand) {
          Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
        }
        return errorEnvelope(error)
      }
      return errorEnvelope({
        code: 'BROWSER_COMMAND_TIMEOUT',
        message: 'Unexpected response from content script.',
        recoverable: true,
      })
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  if (request.command === 'html') {
    const payload = request.payload as { tabId: number; snapshotId: string; ref: string; frameRef?: string; maxBytes?: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'HTML read messaging is not available.', recoverable: false })
    }
    try {
      const result = await context.sendMessageToTab(payload.tabId, {
        type: 'tabbridge.html',
        tabId: payload.tabId,
        snapshotId: payload.snapshotId,
        ref: payload.ref,
        frameRef: payload.frameRef,
        maxBytes: payload.maxBytes,
      })
      if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
        return okEnvelope(result.data)
      }
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
        const errorData = result.error as { code: string; message: string; recoverable: boolean; suggestedCommand?: string }
        const error = {
          code: errorData.code as TabBridgeErrorCode,
          message: errorData.message,
          recoverable: errorData.recoverable,
        }
        if (errorData.suggestedCommand) {
          Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
        }
        return errorEnvelope(error)
      }
      return errorEnvelope({
        code: 'BROWSER_COMMAND_TIMEOUT',
        message: 'Unexpected response from content script.',
        recoverable: true,
      })
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  if (request.command === 'screenshot') {
    const payload = request.payload as { tabId: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Screenshot messaging is not available.', recoverable: false })
    }
    try {
      const tab = await context.currentTab()
      if (!tab || typeof tab !== 'object' || !('id' in tab)) {
        return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
      }
      const chromeTab = tab as { id?: number; windowId?: number; active?: boolean }
      if (chromeTab.id !== payload.tabId) {
        return errorEnvelope({
          code: 'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
          message: 'Screenshot is only supported for the current active tab in the selected window.',
          recoverable: true,
          suggestedCommand: `Activate the target tab in Chrome, then retry tabbridge screenshot --tab ${payload.tabId} --json.`,
        })
      }
      const result = await screenshotController.capture(
        { tabId: payload.tabId, windowId: chromeTab.windowId ?? 0, active: Boolean(chromeTab.active) },
        async (windowId) => {
          const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
          return dataUrl
        },
      )
      return result
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  return errorEnvelope({
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not implemented by the extension command router yet.`,
    recoverable: false,
  })
}

// Backward-compatible wrapper for existing JSON-RPC router and tests
export async function routeBridgeMethod(method: string, _params: unknown): Promise<unknown> {
  const request: BridgeRequest = {
    id: 'legacy',
    protocolVersion: 1 as const,
    source: 'cli',
    target: 'extension',
    command: method,
    payload: typeof _params === 'object' && _params !== null ? _params as Record<string, unknown> : {},
    createdAt: Date.now(),
  }

  const context: CommandContext = {
    async listTabs() {
      const chromeTabs = await chrome.tabs.query({})
      return listRedactedTabs(chromeTabs.map(toChromeTabLike), grants, Date.now())
    },
    async currentTab() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab) return undefined
      return listRedactedTabs([toChromeTabLike(tab)], grants, Date.now())[0]
    },
  }

  const envelope = await routeBridgeCommand(request, context)
  if (envelope.ok) return envelope.data
  throw envelope.error
}

function toChromeTabLike(tab: chrome.tabs.Tab): import('@tabbridge/shared').ChromeTabLike {
  const tabLike: import('@tabbridge/shared').ChromeTabLike = {
    windowId: tab.windowId,
    active: tab.active,
  }
  if (tab.id !== undefined) tabLike.id = tab.id
  if (tab.title !== undefined) tabLike.title = tab.title
  if (tab.url !== undefined) tabLike.url = tab.url
  if (tab.favIconUrl !== undefined) tabLike.favIconUrl = tab.favIconUrl
  return tabLike
}
