// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractSnapshotFromDocument } from '../src/content/snapshot-extractor'

describe('semantic snapshot extractor', () => {
  it('extracts visible interactables with compact refs', () => {
    document.body.innerHTML = '<main><button id="merge">Merge pull request</button><input aria-label="Comment" value="secret typed value"><a href="/settings">Settings</a><span>Plain text</span></main>'

    const result = extractSnapshotFromDocument({
      tabId: 123,
      snapshotId: 'snap_1',
      title: 'GitHub Pull Request',
      url: 'https://github.com/acme/repo/pull/1',
      includeUrl: false,
      now: 1782010000000,
    })

    expect(result.snapshot).toMatchObject({
      tabId: 123,
      snapshotId: 'snap_1',
      title: 'GitHub Pull Request',
      domain: 'github.com',
      urlVisible: false,
    })
    expect(result.snapshot.frames[0]?.tree).toEqual([
      expect.objectContaining({ ref: '@e1', role: 'button', name: 'Merge pull request', risk: 'high' }),
      expect.objectContaining({ ref: '@e2', role: 'textbox', name: 'Comment', risk: 'low' }),
      expect.objectContaining({ ref: '@e3', role: 'link', name: 'Settings', risk: 'low' }),
    ])
    expect(JSON.stringify(result.snapshot)).not.toContain('secret typed value')
  })
})
