import { errorEnvelope, okEnvelope, SCREENSHOT_MIN_INTERVAL_MS, type CliEnvelope } from '@tabbridge/shared'

export type ScreenshotTab = {
  tabId: number
  windowId: number
  active: boolean
}

export function createScreenshotController(now: () => number) {
  let lastCaptureAt = 0

  return {
    async capture(tab: ScreenshotTab, captureVisibleTab: (windowId: number) => Promise<string>): Promise<CliEnvelope<{ dataUrl: string }>> {
      if (!tab.active) {
        return errorEnvelope({
          code: 'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
          message: 'Screenshot is only supported for the current active tab in the selected window.',
          recoverable: true,
          suggestedCommand: `Activate the target tab in Chrome, then retry tabbridge screenshot --tab ${tab.tabId} --json.`,
        })
      }

      const current = now()
      if (current - lastCaptureAt < SCREENSHOT_MIN_INTERVAL_MS) {
        return errorEnvelope({
          code: 'BROWSER_COMMAND_TIMEOUT',
          message: 'Screenshot capture is throttled to protect Chrome and user privacy.',
          recoverable: true,
          suggestedCommand: `Wait briefly, then retry tabbridge screenshot --tab ${tab.tabId} --json.`,
        })
      }

      lastCaptureAt = current
      return okEnvelope({ dataUrl: await captureVisibleTab(tab.windowId) })
    },
  }
}
