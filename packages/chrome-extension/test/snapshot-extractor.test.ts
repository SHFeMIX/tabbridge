// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractSnapshotFromDocument } from '../src/content/snapshot-extractor'

describe('agent interactive snapshot extractor', () => {
  it('extracts volatile @e refs with compact text and no input value leakage', () => {
    document.body.innerHTML = '<main><button id="merge">Merge pull request</button><input type="checkbox" aria-label="Confirm" checked><input aria-label="Comment" placeholder="Leave a comment" value="secret typed value"><a href="/settings">Settings</a><span>Plain text</span></main>'

    const result = extractSnapshotFromDocument({
      tabId: 123,
      title: 'GitHub Pull Request',
      url: 'https://github.com/acme/repo/pull/1',
      now: 1782010000000,
    })

    expect(result.snapshot.page).toEqual({ title: 'GitHub Pull Request', url: 'https://github.com/acme/repo/pull/1' })
    expect(result.snapshot.refs).toEqual([
      expect.objectContaining({ ref: '@e1', role: 'button', name: 'Merge pull request', text: 'Merge pull request' }),
      expect.objectContaining({ ref: '@e2', role: 'checkbox', name: 'Confirm', text: '', attributes: expect.objectContaining({ type: 'checkbox' }) }),
      expect.objectContaining({ ref: '@e3', role: 'textbox', name: 'Comment', text: '', attributes: expect.objectContaining({ placeholder: 'Leave a comment' }) }),
      expect.objectContaining({ ref: '@e4', role: 'link', name: 'Settings', text: 'Settings', attributes: expect.objectContaining({ href: '/settings' }) }),
    ])
    expect(result.snapshot.text).toContain('@e1 [button] "Merge pull request"')
    expect(result.snapshot.text).toContain('@e3 [textbox] placeholder="Leave a comment"')
    expect(JSON.stringify(result.snapshot)).not.toContain('secret typed value')
    expect(result.records.map((record) => record.ref)).toEqual(['@e1', '@e2', '@e3', '@e4'])
  })

  it('assigns refs fresh by document order on every snapshot', () => {
    document.body.innerHTML = '<main><button>Save</button><button>Delete</button></main>'
    const first = extractSnapshotFromDocument({ tabId: 1, title: 'App', url: 'https://example.com', now: 1000 })

    document.body.innerHTML = '<main><button>New banner</button><button>Delete</button><button>Save</button></main>'
    const second = extractSnapshotFromDocument({ tabId: 1, title: 'App', url: 'https://example.com', now: 2000 })

    expect(first.snapshot.refs.map((element) => [element.ref, element.name])).toEqual([['@e1', 'Save'], ['@e2', 'Delete']])
    expect(second.snapshot.refs.map((element) => [element.ref, element.name])).toEqual([['@e1', 'New banner'], ['@e2', 'Delete'], ['@e3', 'Save']])
  })
})
