import { SNAPSHOT_TTL_MS, normalizeRef, type ElementRefRecord } from '@tabbridge/shared'

type LatestSnapshot = {
  generatedAt: number
  records: ElementRefRecord[]
}

function keyFor(frameRef: string, ref: string): string {
  return `${frameRef}:${normalizeRef(ref)}`
}

function isFresh(generatedAt: number, now: number): boolean {
  return now - generatedAt <= SNAPSHOT_TTL_MS
}

export class RefStore {
  private latestByTab = new Map<number, LatestSnapshot>()

  saveLatest(tabId: number, records: ElementRefRecord[], now: number): void {
    const stamped = records.map((record) => ({ ...record, tabId, generatedAt: record.generatedAt || now }))
    this.latestByTab.set(tabId, { generatedAt: now, records: stamped })
  }

  hasLatestSnapshot(tabId: number, now: number): boolean {
    const snapshot = this.latestByTab.get(tabId)
    if (!snapshot) return false
    if (!isFresh(snapshot.generatedAt, now)) {
      this.latestByTab.delete(tabId)
      return false
    }
    return true
  }

  getLatestRecord(tabId: number, frameRef: string, ref: string, now: number): ElementRefRecord | undefined {
    const snapshot = this.latestByTab.get(tabId)
    if (!snapshot) return undefined
    if (!isFresh(snapshot.generatedAt, now)) {
      this.latestByTab.delete(tabId)
      return undefined
    }

    const wanted = keyFor(frameRef, ref)
    return snapshot.records.find((record) => keyFor(record.frameRef, record.ref) === wanted)
  }

  clearForTab(tabId: number): void {
    this.latestByTab.delete(tabId)
  }
}
