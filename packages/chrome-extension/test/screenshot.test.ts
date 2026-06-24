import { describe, expect, it } from 'vitest'
import { createScreenshotController } from '../src/background/screenshot'

describe('screenshot controller', () => {
  it('rejects inactive tabs', async () => {
    const controller = createScreenshotController(() => 1000)
    const result = await controller.capture({ tabId: 1, windowId: 2, active: false }, async () => 'data:image/png;base64,abc')

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
        message: 'Screenshot is only supported for the current active tab in the selected window.',
        recoverable: true,
        suggestedCommand: 'Activate the target tab in Chrome, then retry tabbridge screenshot --tab 1 --json.',
      },
    })
  })

  it('throttles screenshot calls to about two per second', async () => {
    const controller = createScreenshotController(() => 1000)
    await controller.capture({ tabId: 1, windowId: 2, active: true }, async () => 'data:image/png;base64,abc')
    const second = await controller.capture({ tabId: 1, windowId: 2, active: true }, async () => 'data:image/png;base64,def')

    expect(second).toMatchObject({ ok: false, error: { code: 'BROWSER_COMMAND_TIMEOUT', recoverable: true } })
  })
})
