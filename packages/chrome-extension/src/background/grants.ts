import { originFromUrl, type AccessStatus, type SiteGrant } from '@tabbridge/shared'

export function grantStatusForTab(grants: SiteGrant[], tab: { tabId: number; url?: string }, now: number): AccessStatus {
  if (!tab.url) return 'none'

  let origin: string
  try {
    origin = originFromUrl(tab.url)
  } catch {
    return 'none'
  }

  const sameTabGrant = grants.find((grant) => grant.tabId === tab.tabId)
  if (!sameTabGrant) return 'none'
  if (sameTabGrant.origin === origin && sameTabGrant.expiresAt > now) return 'authorized'
  return 'expired-or-cross-origin'
}

export function releaseGrant(grants: SiteGrant[], tabId: number): SiteGrant[] {
  return grants.filter((grant) => grant.tabId !== tabId)
}
