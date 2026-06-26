import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'latest',
    tabId: 1,
    frameRef: 'f0',
    ref: '@e1',
    identityHash: 'hash-save',
    role: 'button',
    accessibleName: 'Save',
    name: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/button',
    keyAttributes: {},
    states,
    boundingBox: [0, 0, 100, 40],
    generatedAt: 1000,
    ...overrides,
  }
}

describe('RefStore', () => {
  it('stores only the latest ref map for a tab', () => {
    const store = new RefStore()
    store.saveLatest(1, [record({ ref: '@e1', accessibleName: 'Save' })], 1000)
    store.saveLatest(1, [record({ ref: '@e1', accessibleName: 'Delete', name: 'Delete' })], 2000)

    expect(store.hasLatestSnapshot(1, 2001)).toBe(true)
    expect(store.getLatestRecord(1, 'f0', '@e1', 2001)?.accessibleName).toBe('Delete')
    expect(store.getLatestRecord(1, 'f0', '@e2', 2001)).toBeUndefined()
  })

  it('expires the latest ref map after TTL', () => {
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)

    expect(store.hasLatestSnapshot(1, 62001)).toBe(false)
    expect(store.getLatestRecord(1, 'f0', '@e1', 62001)).toBeUndefined()
  })

  it('clears latest records when a tab saves an empty snapshot', () => {
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)
    store.saveLatest(1, [], 2000)

    expect(store.hasLatestSnapshot(1, 2001)).toBe(true)
    expect(store.getLatestRecord(1, 'f0', '@e1', 2001)).toBeUndefined()
  })

  it('clears latest indexes for a tab', () => {
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)
    store.clearForTab(1)

    expect(store.hasLatestSnapshot(1, 1001)).toBe(false)
    expect(store.getLatestRecord(1, 'f0', '@e1', 1001)).toBeUndefined()
  })
})
