import { createSiteGrant, originFromUrl, type AccessStatus, type SiteGrant } from '@tabbridge/shared'

let grants: SiteGrant[] = []

export function getGrants(): SiteGrant[] {
  return grants
}

export function setGrants(newGrants: SiteGrant[]): void {
  grants = newGrants
}

export function addGrant(grant: SiteGrant): void {
  grants = [...grants, grant]
}

export function grantStatusForTab(grants: SiteGrant[], tab: { tabId: number; url?: string }, now: number): AccessStatus {
  if (!tab.url) return 'none'

  let origin: string
  try {
    origin = originFromUrl(tab.url)
  } catch {
    return 'none'
  }

  const sameTabGrant = grants
    .filter((grant) => grant.tabId === tab.tabId)
    .sort((a, b) => b.grantedByUserAt - a.grantedByUserAt)[0]
  if (!sameTabGrant) return 'none'
  if (sameTabGrant.origin === origin && sameTabGrant.expiresAt > now) return 'authorized'
  return 'expired-or-cross-origin'
}

export function releaseGrant(grants: SiteGrant[], tabId: number): SiteGrant[] {
  return grants.filter((grant) => grant.tabId !== tabId)
}
