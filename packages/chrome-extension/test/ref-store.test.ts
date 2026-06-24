import { describe, expect, it } from 'vitest'
import { RefStore } from '../src/content/ref-store'

describe('RefStore', () => {
  it('requires snapshot id and expires records after TTL', () => {
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

    expect(store.getRecord('snap_1', 'f0', '@e1', 2000)?.name).toBe('Merge')
    expect(store.getRecord('snap_2', 'f0', '@e1', 2000)).toBeUndefined()
    expect(store.getRecord('snap_1', 'f0', '@e1', 62001)).toBeUndefined()
  })

  it('keeps only the latest three snapshots per tab', () => {
    const store = new RefStore()
    for (let index = 1; index <= 4; index += 1) {
      store.saveSnapshot(`snap_${index}`, [{
        snapshotId: `snap_${index}`,
        tabId: 1,
        frameRef: 'f0',
        ref: '@e1',
        selectorCandidates: [`#item${index}`],
        xpathCandidates: [`//*[@id="item${index}"]`],
        generatedAt: index,
      }], index)
    }

    expect(store.getRecord('snap_1', 'f0', '@e1', 10)).toBeUndefined()
    expect(store.getRecord('snap_4', 'f0', '@e1', 10)).toBeDefined()
  })
})
