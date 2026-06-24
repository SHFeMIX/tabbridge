import { extractSnapshotFromDocument } from '../content/snapshot-extractor'
import { RefStore } from '../content/ref-store'
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

      return false
    })
  },
})
