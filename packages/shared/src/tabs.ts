import { GRANT_TTL_MS } from './limits.js'

export type AccessStatus = 'none' | 'pending' | 'authorized' | 'expired-or-cross-origin'

export type ChromeTabLike = {
  id?: number
  windowId: number
  active: boolean
  title?: string
  url?: string
  favIconUrl?: string
}

export type RedactedTab = {
  tabId: number
  windowId: number
  title: string
  domain: string
  active: boolean
  accessStatus: AccessStatus
}

export type SiteGrant = {
  tabId: number
  origin: string
  grantedByUserAt: number
  expiresAt: number
  source: 'user-click'
}

export function redactChromeTab(tab: ChromeTabLike, accessStatus: AccessStatus = 'none'): RedactedTab {
  if (typeof tab.id !== 'number') {
    throw new Error('Chrome tab id is required for TabBridge discovery output.')
  }

  return {
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title ?? 'Untitled tab',
    domain: domainFromUrl(tab.url),
    active: tab.active,
    accessStatus,
  }
}

export function domainFromUrl(url: string | undefined): string {
  if (!url) return 'unknown'

  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

export function originFromUrl(url: string): string {
  const parsed = new URL(url)
  return parsed.origin
}

export function hostPermissionPatternFromOrigin(origin: string): string {
  return `${origin}/*`
}

export function createSiteGrant(input: { tabId: number; origin: string; grantedByUserAt: number }): SiteGrant {
  return {
    tabId: input.tabId,
    origin: input.origin,
    grantedByUserAt: input.grantedByUserAt,
    expiresAt: input.grantedByUserAt + GRANT_TTL_MS,
    source: 'user-click',
  }
}
