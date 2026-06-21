import { describe, expect, it } from 'vitest'
import { createSiteGrant, hostPermissionPatternFromOrigin, redactChromeTab } from '../src/index.js'

describe('tab metadata and grants', () => {
  it('redacts full URL and favicon from discovery output', () => {
    const tab = redactChromeTab({
      id: 7,
      windowId: 3,
      active: true,
      title: 'Private Inbox - Example Mail',
      url: 'https://mail.example.com/inbox?token=secret',
      favIconUrl: 'https://mail.example.com/favicon.ico',
    })

    expect(tab).toEqual({
      tabId: 7,
      windowId: 3,
      title: 'Private Inbox - Example Mail',
      domain: 'mail.example.com',
      active: true,
      accessStatus: 'none',
    })
    expect(JSON.stringify(tab)).not.toContain('token=secret')
    expect(JSON.stringify(tab)).not.toContain('favicon')
  })

  it('creates tab-origin grants with 30 minute lifetime', () => {
    expect(createSiteGrant({
      tabId: 7,
      origin: 'https://github.com',
      grantedByUserAt: 1782010000000,
    })).toEqual({
      tabId: 7,
      origin: 'https://github.com',
      grantedByUserAt: 1782010000000,
      expiresAt: 1782011800000,
      source: 'user-click',
    })
  })

  it('normalizes host permission patterns by removing origin ports', () => {
    expect(hostPermissionPatternFromOrigin('https://localhost:5173')).toBe('https://localhost/*')
    expect(hostPermissionPatternFromOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1/*')
  })
})
