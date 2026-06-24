import { HTML_DEFAULT_MAX_BYTES, TEXT_DEFAULT_MAX_BYTES, errorEnvelope, refStaleError } from '@tabbridge/shared'
import { executeRefAction } from '../content/actions'
import { readVisibleText, sanitizeElementHtml } from '../content/bounded-read'
import { RefStore } from '../content/ref-store'
import { extractSnapshotFromDocument } from '../content/snapshot-extractor'
import { unsupportedPageReason } from '../content/unsupported-pages'

const refStore = new RefStore()

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
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

      if (message?.type === 'tabbridge.clearRefs') {
        refStore.clearForTab(message.tabId)
        sendResponse({ ok: true, data: { cleared: true } })
        return true
      }

      if (message?.type === 'tabbridge.waitForText') {
        const started = Date.now()
        const timeoutMs = message.timeoutMs ?? 30_000
        const poll = () => {
          if ((document.body.textContent ?? '').includes(message.text)) {
            sendResponse({ ok: true, data: { found: true, text: message.text } })
            return
          }
          if (Date.now() - started >= timeoutMs) {
            sendResponse({ ok: true, data: { found: false, text: message.text } })
            return
          }
          setTimeout(poll, 50)
        }
        poll()
        return true
      }

      return false
    })
  },
})
