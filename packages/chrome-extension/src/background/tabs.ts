import { redactChromeTab, type ChromeTabLike, type RedactedTab, type SiteGrant } from '@tabbridge/shared'
import { grantStatusForTab } from './grants'

export function listRedactedTabs(chromeTabs: ChromeTabLike[], grants: SiteGrant[], now: number): RedactedTab[] {
  return chromeTabs
    .filter((tab) => typeof tab.id === 'number')
    .map((tab) => {
      const tabId = tab.id as number
      const url = tab.url
      const status = grantStatusForTab(grants, url === undefined ? { tabId } : { tabId, url }, now)
      return redactChromeTab(tab, status)
    })
}
