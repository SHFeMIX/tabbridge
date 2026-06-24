import { describe, expect, it } from 'vitest'
import { listRedactedTabs } from '../src/background/tabs'

describe('extension tab discovery', () => {
  it('returns redacted metadata and access status only', () => {
    const tabs = listRedactedTabs([
      { id: 1, windowId: 2, active: true, title: 'GitHub PR', url: 'https://github.com/acme/repo/pull/1?secret=1', favIconUrl: 'https://github.com/favicon.ico' },
    ], [], 1782010000000)

    expect(tabs).toEqual([{ tabId: 1, windowId: 2, title: 'GitHub PR', domain: 'github.com', active: true, accessStatus: 'none' }])
    expect(JSON.stringify(tabs)).not.toContain('secret=1')
    expect(JSON.stringify(tabs)).not.toContain('favicon')
  })
})
