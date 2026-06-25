import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'snap_1',
    tabId: 1,
    frameRef: 'f0',
    ref: '@r_save',
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
  it('supports snapshot lookup and latest ref lookup', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    expect(store.getRecord('snap_1', 'f0', '@r_save', 2000)?.accessibleName).toBe('Save')
    expect(store.getLatestRecord(1, 'f0', '@r_save', 2000)?.accessibleName).toBe('Save')
    expect(store.getPreviousCandidates(1, 'f0', 2000)).toHaveLength(1)
  })

  it('expires snapshot records latest records and previous candidates after TTL', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    expect(store.getRecord('snap_1', 'f0', '@r_save', 62001)).toBeUndefined()
    expect(store.getLatestRecord(1, 'f0', '@r_save', 62001)).toBeUndefined()
    expect(store.getPreviousCandidates(1, 'f0', 62001)).toEqual([])
  })

  it('keeps only the latest three snapshots per tab without deleting latest identity for reused refs', () => {
    const store = new RefStore()
    for (let index = 1; index <= 4; index += 1) {
      store.saveSnapshot(`snap_${index}`, [record({ snapshotId: `snap_${index}`, generatedAt: index, accessibleName: `Save ${index}`, name: `Save ${index}` })], index)
    }

    expect(store.getRecord('snap_1', 'f0', '@r_save', 10)).toBeUndefined()
    expect(store.getRecord('snap_4', 'f0', '@r_save', 10)?.accessibleName).toBe('Save 4')
    expect(store.getLatestRecord(1, 'f0', '@r_save', 10)?.accessibleName).toBe('Save 4')
  })

  it('clears latest records when a tab saves an empty snapshot', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)
    store.saveSnapshot('snap_2', [], 2000, 1)

    expect(store.getLatestRecord(1, 'f0', '@r_save', 2001)).toBeUndefined()
    expect(store.getPreviousCandidates(1, 'f0', 2001)).toEqual([])
  })

  it('clears snapshot and latest indexes for a tab', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)
    store.clearForTab(1)

    expect(store.getRecord('snap_1', 'f0', '@r_save', 1001)).toBeUndefined()
    expect(store.getLatestRecord(1, 'f0', '@r_save', 1001)).toBeUndefined()
    expect(store.getPreviousCandidates(1, 'f0', 1001)).toEqual([])
  })
})
