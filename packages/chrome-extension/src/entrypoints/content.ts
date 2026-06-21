import { defineContentScript } from 'wxt/utils/define-content-script'

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  main() {
    // Task 5 scaffold only. Snapshot extraction and page actions are added in later SDD tasks.
  },
})
