// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'
import { executeRefAction } from '../src/content/actions'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'snap_1',
    tabId: 1,
    frameRef: 'f0',
    ref: '@r_save',
    identityHash: 'stored-save',
    role: 'button',
    accessibleName: 'Save',
    name: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/button',
    keyAttributes: {},
    states,
    boundingBox: [0, 0, 100, 40],
    generatedAt: 1000,
    selectorCandidates: [],
    xpathCandidates: [],
    ...overrides,
  }
}

describe('ref-based actions', () => {
  it('returns REF_STALE when no latest or snapshot record exists', async () => {
    const store = new RefStore()
    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_missing', frameRef: 'f0', ref: '@r_missing' }, store, 1000)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('REF_STALE')
  })

  it('clicks using latest ref identity after DOM reorder without selectors', async () => {
    document.body.innerHTML = '<main><button>Delete</button><button>Save</button></main>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    let clicked = false
    Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save')?.addEventListener('click', () => {
      clicked = true
    })

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_old', frameRef: 'f0', ref: '@r_save' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'click', ref: '@r_save' } })
    expect(clicked).toBe(true)
  })

  it('returns REF_STALE instead of clicking when live candidates are semantically ambiguous', async () => {
    document.body.innerHTML = '<main><button>Save</button><button>Save</button></main>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_1', frameRef: 'f0', ref: '@r_save' }, store, 1001)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('REF_STALE')
  })

  it('returns ELEMENT_DISABLED for disabled resolved targets', async () => {
    document.body.innerHTML = '<main><button disabled>Save</button></main>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({ states: { ...states, disabled: true } })], 1000)

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_1', frameRef: 'f0', ref: '@r_save' }, store, 1001)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ELEMENT_DISABLED')
  })
})
