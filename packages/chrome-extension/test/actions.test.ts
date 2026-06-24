// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { RefStore } from '../src/content/ref-store'
import { executeRefAction } from '../src/content/actions'

describe('ref-based actions', () => {
  it('returns REF_STALE when snapshot id is missing or wrong', async () => {
    const store = new RefStore()
    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_missing', frameRef: 'f0', ref: '@e1' }, store, 1000)

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'REF_STALE',
        message: 'The element reference is stale. Take a new snapshot and retry with a ref from that snapshot.',
        recoverable: true,
        suggestedCommand: 'tabbridge snapshot --tab 1 --json',
      },
    })
  })

  it('clicks visible enabled elements resolved from the matching snapshot', async () => {
    document.body.innerHTML = '<button id="merge">Merge</button>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [{
      snapshotId: 'snap_1',
      tabId: 1,
      frameRef: 'f0',
      ref: '@e1',
      selectorCandidates: ['#merge'],
      xpathCandidates: ['//*[@id="merge"]'],
      role: 'button',
      name: 'Merge',
      textFingerprint: 'Merge',
      boundingBox: [0, 0, 100, 40],
      generatedAt: 1000,
    }], 1000)

    let clicked = false
    document.querySelector('#merge')?.addEventListener('click', () => {
      clicked = true
    })

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_1', frameRef: 'f0', ref: '@e1' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'click', ref: '@e1' } })
    expect(clicked).toBe(true)
  })
})
