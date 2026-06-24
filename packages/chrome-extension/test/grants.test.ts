import { describe, expect, it } from 'vitest'
import { grantStatusForTab } from '../src/background/grants'

describe('grant status', () => {
  it('authorizes only matching tab and origin before expiry', () => {
    const grants = [{ tabId: 1, origin: 'https://github.com', grantedByUserAt: 1000, expiresAt: 2000, source: 'user-click' as const }]

    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://github.com/acme/repo' }, 1500)).toBe('authorized')
    expect(grantStatusForTab(grants, { tabId: 2, url: 'https://github.com/acme/repo' }, 1500)).toBe('none')
    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://example.com' }, 1500)).toBe('expired-or-cross-origin')
    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://github.com/acme/repo' }, 2500)).toBe('expired-or-cross-origin')
  })
})
