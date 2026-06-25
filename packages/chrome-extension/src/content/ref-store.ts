import { SNAPSHOTS_PER_TAB_LIMIT, SNAPSHOT_TTL_MS, normalizeRef, type ElementRefRecord } from '@tabbridge/shared'

function keyFor(tabId: number, frameRef: string, ref: string): string {
  return `${tabId}:${frameRef}:${normalizeRef(ref)}`
}

function isFresh(record: ElementRefRecord, now: number): boolean {
  return now - record.generatedAt <= SNAPSHOT_TTL_MS
}

export class RefStore {
  private recordsBySnapshot = new Map<string, ElementRefRecord[]>()
  private latestRecordByRef = new Map<string, ElementRefRecord>()
  private snapshotOrderByTab = new Map<number, string[]>()
  private latestRecordsByTab = new Map<number, ElementRefRecord[]>()

  saveSnapshot(snapshotId: string, records: ElementRefRecord[], now: number, tabIdHint?: number): void {
    const stamped = records.map((record) => ({ ...record, generatedAt: record.generatedAt || now }))
    this.recordsBySnapshot.set(snapshotId, stamped)

    const tabId = stamped[0]?.tabId ?? tabIdHint
    if (typeof tabId !== 'number') return

    const order = (this.snapshotOrderByTab.get(tabId) ?? []).filter((id) => id !== snapshotId)
    order.push(snapshotId)
    while (order.length > SNAPSHOTS_PER_TAB_LIMIT) {
      const removed = order.shift()
      if (removed) this.recordsBySnapshot.delete(removed)
    }
    this.snapshotOrderByTab.set(tabId, order)

    for (const [key, record] of this.latestRecordByRef.entries()) {
      if (record.tabId === tabId) this.latestRecordByRef.delete(key)
    }
    for (const record of stamped) {
      this.latestRecordByRef.set(keyFor(record.tabId, record.frameRef, record.ref), record)
    }
    this.latestRecordsByTab.set(tabId, stamped)
  }

  getRecord(snapshotId: string, frameRef: string, ref: string, now: number): ElementRefRecord | undefined {
    const records = this.recordsBySnapshot.get(snapshotId)
    if (!records) return undefined

    const record = records.find((candidate) => candidate.frameRef === frameRef && normalizeRef(candidate.ref) === normalizeRef(ref))
    if (!record) return undefined
    if (!isFresh(record, now)) {
      this.recordsBySnapshot.delete(snapshotId)
      return undefined
    }
    return record
  }

  getLatestRecord(tabId: number, frameRef: string, ref: string, now: number): ElementRefRecord | undefined {
    const key = keyFor(tabId, frameRef, ref)
    const record = this.latestRecordByRef.get(key)
    if (!record) return undefined
    if (!isFresh(record, now)) {
      this.latestRecordByRef.delete(key)
      return undefined
    }
    return record
  }

  getPreviousCandidates(tabId: number, frameRef: string, now: number): ElementRefRecord[] {
    const records = this.latestRecordsByTab.get(tabId) ?? []
    return records.filter((record) => record.frameRef === frameRef && isFresh(record, now))
  }

  clearForTab(tabId: number): void {
    const order = this.snapshotOrderByTab.get(tabId) ?? []
    for (const snapshotId of order) this.recordsBySnapshot.delete(snapshotId)
    this.snapshotOrderByTab.delete(tabId)
    this.latestRecordsByTab.delete(tabId)
    for (const [key, record] of this.latestRecordByRef.entries()) {
      if (record.tabId === tabId) this.latestRecordByRef.delete(key)
    }
  }
}
