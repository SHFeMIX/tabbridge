// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'
import { executeRefAction } from '../src/content/actions'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'latest',
    tabId: 1,
    frameRef: 'f0',
    ref: '@e1',
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
  it('returns SNAPSHOT_REQUIRED when no latest snapshot exists', async () => {
    const store = new RefStore()
    const result = await executeRefAction({ command: 'click', tabId: 1, frameRef: 'f0', ref: '@e1' }, store, 1000)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SNAPSHOT_REQUIRED')
  })

  it('returns REF_STALE when the latest snapshot does not include the ref', async () => {
    const store = new RefStore()
    store.saveLatest(1, [record({ ref: '@e1' })], 1000)
    const result = await executeRefAction({ command: 'click', tabId: 1, frameRef: 'f0', ref: '@e2' }, store, 1001)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('REF_STALE')
  })

  it('clicks using latest ref identity after DOM reorder without selectors', async () => {
    document.body.innerHTML = '<main><button>Delete</button><button>Save</button></main>'
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)

    let clicked = false
    Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save')?.addEventListener('click', () => {
      clicked = true
    })

    const result = await executeRefAction({ command: 'click', tabId: 1, frameRef: 'f0', ref: '@e1' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'click', ref: '@e1' } })
    expect(clicked).toBe(true)
  })

  it('fills by replacing the target value and types by appending', async () => {
    document.body.innerHTML = '<main><input aria-label="Comment" value="old"></main>'
    const store = new RefStore()
    store.saveLatest(1, [record({ role: 'textbox', accessibleName: 'Comment', name: 'Comment', textFingerprint: '', domSignature: 'main/input', ref: '@e1' })], 1000)
    const input = document.querySelector('input') as HTMLInputElement

    await expect(executeRefAction({ command: 'fill', tabId: 1, frameRef: 'f0', ref: '@e1', text: 'new' }, store, 1001)).resolves.toEqual({ ok: true, data: { action: 'fill', ref: '@e1' } })
    expect(input.value).toBe('new')

    await expect(executeRefAction({ command: 'type', tabId: 1, frameRef: 'f0', ref: '@e1', text: ' text' }, store, 1002)).resolves.toEqual({ ok: true, data: { action: 'type', ref: '@e1' } })
    expect(input.value).toBe('new text')
  })

  it('returns REF_STALE instead of clicking when live candidates are semantically ambiguous', async () => {
    document.body.innerHTML = '<main><button>Save</button><button>Save</button></main>'
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)

    const result = await executeRefAction({ command: 'click', tabId: 1, frameRef: 'f0', ref: '@e1' }, store, 1001)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('REF_STALE')
  })

  it('returns ELEMENT_DISABLED for disabled resolved targets', async () => {
    document.body.innerHTML = '<main><button disabled>Save</button></main>'
    const store = new RefStore()
    store.saveLatest(1, [record({ states: { ...states, disabled: true } })], 1000)

    const result = await executeRefAction({ command: 'click', tabId: 1, frameRef: 'f0', ref: '@e1' }, store, 1001)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ELEMENT_DISABLED')
  })
})
