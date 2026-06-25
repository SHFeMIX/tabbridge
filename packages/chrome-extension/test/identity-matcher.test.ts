import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import type { ElementFingerprint } from '../src/content/element-fingerprint'
import { findBestLiveMatch, matchElementIdentity } from '../src/content/identity-matcher'

const state = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'snap_1',
    tabId: 1,
    frameRef: 'f0',
    ref: '@r_prev',
    identityHash: 'hash-save',
    role: 'button',
    accessibleName: 'Save',
    name: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/form/button',
    keyAttributes: { type: 'submit' },
    states: state,
    boundingBox: [10, 10, 100, 40],
    generatedAt: 1000,
    ...overrides,
  }
}

function fingerprint(overrides: Partial<ElementFingerprint>): ElementFingerprint {
  return {
    identityHash: 'hash-save',
    role: 'button',
    accessibleName: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/form/button',
    keyAttributes: { type: 'submit' },
    states: state,
    boundingBox: [12, 12, 100, 40],
    ...overrides,
  }
}

describe('identity matcher', () => {
  it('reuses refs for exact identity hash matches', () => {
    expect(matchElementIdentity([record({})], fingerprint({}))).toMatchObject({ kind: 'reuse', ref: '@r_prev' })
  })

  it('reuses refs for strong semantic matches when identity hash changes slightly', () => {
    expect(matchElementIdentity([record({ identityHash: 'old-hash' })], fingerprint({ identityHash: 'new-hash', boundingBox: [20, 10, 100, 40] }))).toMatchObject({ kind: 'reuse', ref: '@r_prev' })
  })

  it('creates a new identity for role or name mismatches', () => {
    expect(matchElementIdentity([record({ role: 'checkbox' })], fingerprint({ role: 'button' })).kind).toBe('create')
    expect(matchElementIdentity([record({ accessibleName: 'Delete', name: 'Delete' })], fingerprint({ accessibleName: 'Save' })).kind).toBe('create')
  })

  it('treats close high-scoring live matches as ambiguous', () => {
    const candidates = [
      { element: 'first', fingerprint: fingerprint({ identityHash: 'candidate-1', boundingBox: [10, 10, 100, 40] }) },
      { element: 'second', fingerprint: fingerprint({ identityHash: 'candidate-2', boundingBox: [11, 10, 100, 40] }) },
    ]

    expect(findBestLiveMatch(record({ identityHash: 'stored-hash' }), candidates)).toMatchObject({ kind: 'ambiguous' })
  })
})
