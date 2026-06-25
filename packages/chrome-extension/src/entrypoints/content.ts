import { HTML_DEFAULT_MAX_BYTES, TEXT_DEFAULT_MAX_BYTES, errorEnvelope, refStaleError } from '@tabbridge/shared'
import { executeRefAction } from '../content/actions'
import { readVisibleText, sanitizeElementHtml } from '../content/bounded-read'
import { RefStore } from '../content/ref-store'
import { extractSnapshotFromDocument } from '../content/snapshot-extractor'
import { unsupportedPageReason } from '../content/unsupported-pages'

const refStore = new RefStore()

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  main() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === 'tabbridge.snapshot') {
        const unsupported = unsupportedPageReason(window.location.href)
        if (unsupported) {
          sendResponse({ ok: false, error: { code: unsupported, message: 'This page cannot be inspected by TabBridge.', recoverable: false } })
          return true
        }

        const result = extractSnapshotFromDocument({
          tabId: message.tabId,
          snapshotId: message.snapshotId,
          title: document.title,
          url: window.location.href,
          includeUrl: Boolean(message.includeUrl),
          now: Date.now(),
        })
        refStore.saveSnapshot(message.snapshotId, result.records, Date.now())
        sendResponse({ ok: true, data: result.snapshot })
        return true
      }

      if (message?.type === 'tabbridge.text') {
        sendResponse({ ok: true, data: readVisibleText(document, message.maxBytes ?? TEXT_DEFAULT_MAX_BYTES) })
        return true
      }

      if (message?.type === 'tabbridge.html') {
        const record = refStore.getRecord(message.snapshotId, message.frameRef ?? 'f0', message.ref, Date.now())
        if (!record) {
          sendResponse(errorEnvelope(refStaleError(message.tabId)))
          return true
        }
        const element = record.selectorCandidates.map((selector) => document.querySelector(selector)).find(Boolean)
        if (!element) {
          sendResponse(errorEnvelope(refStaleError(message.tabId)))
          return true
        }
        sendResponse({ ok: true, data: sanitizeElementHtml(element, message.maxBytes ?? HTML_DEFAULT_MAX_BYTES) })
        return true
      }

      if (message?.type === 'tabbridge.action') {
        executeRefAction({
          command: message.command,
          tabId: message.tabId,
          snapshotId: message.snapshotId,
          frameRef: message.frameRef ?? 'f0',
          ref: message.ref,
          text: message.text,
          value: message.value,
        }, refStore, Date.now()).then(sendResponse)
        return true
      }

      if (message?.type === 'tabbridge.press') {
        const eventInit = { key: message.key, bubbles: true } as KeyboardEventInit
        document.dispatchEvent(new KeyboardEvent('keydown', eventInit))
        document.dispatchEvent(new KeyboardEvent('keyup', eventInit))
        sendResponse({ ok: true, data: { pressed: message.key } })
        return true
      }

      if (message?.type === 'tabbridge.scroll') {
        window.scrollBy(message.dx ?? 0, message.dy ?? 0)
        sendResponse({ ok: true, data: { scrollX: window.scrollX, scrollY: window.scrollY } })
        return true
      }

      if (message?.type === 'tabbridge.clickCoordinates') {
        const element = document.elementFromPoint(message.x, message.y)
        if (element) {
          ;(element as HTMLElement).click()
          sendResponse({ ok: true, data: { clicked: true } })
        } else {
          sendResponse(errorEnvelope({ code: 'ELEMENT_NOT_VISIBLE', message: 'No element at the given coordinates.', recoverable: true }))
        }
        return true
      }

      if (message?.type === 'tabbridge.dragCoordinates') {
        const from = document.elementFromPoint(message.fromX, message.fromY)
        const to = document.elementFromPoint(message.toX, message.toY)
        if (!from || !to) {
          sendResponse(errorEnvelope({ code: 'ELEMENT_NOT_VISIBLE', message: 'No element at the given coordinates.', recoverable: true }))
          return true
        }
        const dataTransfer = new DataTransfer()
        from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }))
        to.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }))
        from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }))
        sendResponse({ ok: true, data: { dragged: true } })
        return true
      }

      if (message?.type === 'tabbridge.clearRefs') {
        refStore.clearForTab(message.tabId)
        sendResponse({ ok: true, data: { cleared: true } })
        return true
      }

      if (message?.type === 'tabbridge.waitForText') {
        const timeoutMs = message.timeoutMs ?? 30_000
        let done = false
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        let observer: MutationObserver | undefined
        const finish = (found: boolean) => {
          if (done) return
          done = true
          if (timeoutId) clearTimeout(timeoutId)
          observer?.disconnect()
          sendResponse({ ok: true, data: { found, text: message.text } })
        }
        const check = () => {
          if ((document.body.textContent ?? '').includes(message.text)) {
            finish(true)
          }
        }
        observer = new MutationObserver(check)
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        timeoutId = setTimeout(() => finish(false), timeoutMs)
        check()
        return true
      }

      return false
    })
  },
})
