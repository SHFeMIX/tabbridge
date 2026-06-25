// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractSnapshotFromDocument } from '../src/content/snapshot-extractor'

describe('semantic snapshot extractor', () => {
  it('extracts semantic interactables with stable identity fields and no input value leakage', () => {
    document.body.innerHTML = '<main><button id="merge">Merge pull request</button><input type="checkbox" aria-label="Confirm" checked><input aria-label="Comment" value="secret typed value"><a href="/settings">Settings</a><span>Plain text</span></main>'

    const result = extractSnapshotFromDocument({
      tabId: 123,
      snapshotId: 'snap_1',
      title: 'GitHub Pull Request',
      url: 'https://github.com/acme/repo/pull/1',
      includeUrl: false,
      now: 1782010000000,
    })

    expect(result.snapshot).toMatchObject({ tabId: 123, snapshotId: 'snap_1', title: 'GitHub Pull Request', domain: 'github.com', urlVisible: false })
    expect(result.snapshot.frames[0]?.tree).toEqual([
      expect.objectContaining({ role: 'button', name: 'Merge pull request', accessibleName: 'Merge pull request', risk: 'high' }),
      expect.objectContaining({ role: 'checkbox', name: 'Confirm', states: expect.arrayContaining(['checked']) }),
      expect.objectContaining({ role: 'textbox', name: 'Comment', risk: 'low' }),
      expect.objectContaining({ role: 'link', name: 'Settings', risk: 'low' }),
    ])
    for (const element of result.snapshot.frames[0]?.tree ?? []) {
      expect(element.ref).toMatch(/^@r_[a-f0-9]{12}$/)
      expect(element.identityHash).toMatch(/^[a-f0-9]{12}$/)
    }
    expect(JSON.stringify(result.snapshot)).not.toContain('secret typed value')
    expect(result.records[0]?.selectorCandidates).toEqual([])
    expect(result.records[0]?.xpathCandidates).toEqual([])
  })

  it('keeps refs stable across DOM insertion and reorder when previous records are supplied', () => {
    document.body.innerHTML = '<main><button>Save</button><button>Delete</button></main>'
    const first = extractSnapshotFromDocument({ tabId: 1, snapshotId: 'snap_1', title: 'App', url: 'https://example.com', includeUrl: false, now: 1000 })
    const saveRef = first.snapshot.frames[0]?.tree?.find((element) => element.name === 'Save')?.ref
    const deleteRef = first.snapshot.frames[0]?.tree?.find((element) => element.name === 'Delete')?.ref

    document.body.innerHTML = '<main><button>New banner</button><button>Delete</button><button>Save</button></main>'
    const second = extractSnapshotFromDocument({ tabId: 1, snapshotId: 'snap_2', title: 'App', url: 'https://example.com', includeUrl: false, now: 2000, previousRecords: first.records })

    expect(second.snapshot.frames[0]?.tree?.find((element) => element.name === 'Save')?.ref).toBe(saveRef)
    expect(second.snapshot.frames[0]?.tree?.find((element) => element.name === 'Delete')?.ref).toBe(deleteRef)
    expect(second.snapshot.frames[0]?.tree?.find((element) => element.name === 'New banner')?.ref).toMatch(/^@r_[a-f0-9]{12}$/)
  })

  it('assigns distinct refs to same-semantic duplicate elements in one snapshot and reuses them once allocated', () => {
    document.body.innerHTML = '<main><button>Save</button><button>Save</button></main>'

    const first = extractSnapshotFromDocument({ tabId: 1, snapshotId: 'snap_1', title: 'App', url: 'https://example.com', includeUrl: false, now: 1000 })
    const firstRefs = first.snapshot.frames[0]?.tree?.map((element) => element.ref) ?? []

    document.body.innerHTML = '<main><button>Save</button><button>Save</button></main>'
    const second = extractSnapshotFromDocument({ tabId: 1, snapshotId: 'snap_2', title: 'App', url: 'https://example.com', includeUrl: false, now: 2000, previousRecords: first.records })
    const secondRefs = second.snapshot.frames[0]?.tree?.map((element) => element.ref) ?? []

    expect(firstRefs).toHaveLength(2)
    expect(new Set(firstRefs).size).toBe(2)
    expect(secondRefs).toEqual(firstRefs)
  })
})
