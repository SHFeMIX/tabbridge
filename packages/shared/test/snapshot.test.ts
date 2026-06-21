import { describe, expect, it } from 'vitest'
import type { PageSnapshot } from '../src/index.js'

const visibleSnapshot: PageSnapshot = {
  tabId: 7,
  snapshotId: 'snap_visible',
  title: 'Example',
  domain: 'example.com',
  urlVisible: true,
  url: 'https://example.com/private',
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 },
  frames: [],
}

const hiddenSnapshot: PageSnapshot = {
  tabId: 7,
  snapshotId: 'snap_hidden',
  title: 'Example',
  domain: 'example.com',
  urlVisible: false,
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 },
  frames: [],
}

// @ts-expect-error hidden snapshots must not carry full URLs
const hiddenSnapshotWithUrl: PageSnapshot = {
  tabId: 7,
  snapshotId: 'snap_hidden_with_url',
  title: 'Example',
  domain: 'example.com',
  urlVisible: false,
  url: 'https://example.com/private',
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 },
  frames: [],
}

// @ts-expect-error visible snapshots must carry the full URL they expose
const visibleSnapshotWithoutUrl: PageSnapshot = {
  tabId: 7,
  snapshotId: 'snap_visible_without_url',
  title: 'Example',
  domain: 'example.com',
  urlVisible: true,
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 },
  frames: [],
}

void visibleSnapshot
void hiddenSnapshot
void hiddenSnapshotWithUrl
void visibleSnapshotWithoutUrl


describe('snapshot URL visibility type fixtures', () => {
  it('allows visible snapshots with URLs and hidden snapshots without URLs', () => {
    expect(visibleSnapshot.urlVisible).toBe(true)
    expect(hiddenSnapshot.urlVisible).toBe(false)
  })
})
