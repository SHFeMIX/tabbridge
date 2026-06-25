import { originFromUrl, type AccessStatus, type SiteGrant } from '@tabbridge/shared'

const GRANTS_STORAGE_KEY = 'tabbridge.grants'

type StorageLocal = Pick<chrome.storage.LocalStorageArea, 'get' | 'set'>

let grants: SiteGrant[] = []

function storageLocal(): StorageLocal | undefined {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined
  if (typeof chrome.storage.local.get !== 'function' || typeof chrome.storage.local.set !== 'function') return undefined
  return chrome.storage.local
}

export function getGrants(): SiteGrant[] {
  return grants
}

export function setGrants(newGrants: SiteGrant[]): void {
  grants = newGrants
  void persistGrants()
}

export function addGrant(grant: SiteGrant): void {
  grants = [...grants, grant]
  void persistGrants()
}

export async function hydrateGrants(): Promise<void> {
  const storage = storageLocal()
  if (!storage) return
  const stored = await storage.get(GRANTS_STORAGE_KEY)
  const value = stored[GRANTS_STORAGE_KEY]
  if (Array.isArray(value)) {
    grants = value.filter(isSiteGrant)
  }
}

async function persistGrants(): Promise<void> {
  const storage = storageLocal()
  if (!storage) return
  await storage.set({ [GRANTS_STORAGE_KEY]: grants })
}

function isSiteGrant(value: unknown): value is SiteGrant {
  const candidate = value as Partial<SiteGrant>
  return typeof candidate.tabId === 'number'
    && typeof candidate.origin === 'string'
    && typeof candidate.grantedByUserAt === 'number'
    && typeof candidate.expiresAt === 'number'
    && candidate.source === 'user-click'
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
