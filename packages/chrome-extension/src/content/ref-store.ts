import { SNAPSHOTS_PER_TAB_LIMIT, SNAPSHOT_TTL_MS, normalizeRef, type ElementRefRecord } from '@tabbridge/shared'

export class RefStore {
  private recordsBySnapshot = new Map<string, ElementRefRecord[]>()
  private snapshotOrderByTab = new Map<number, string[]>()

  saveSnapshot(snapshotId: string, records: ElementRefRecord[], now: number): void {
    const stamped = records.map((record) => ({ ...record, generatedAt: record.generatedAt || now }))
    this.recordsBySnapshot.set(snapshotId, stamped)

    const tabId = stamped[0]?.tabId
    if (typeof tabId !== 'number') return

    const order = (this.snapshotOrderByTab.get(tabId) ?? []).filter((id) => id !== snapshotId)
    order.push(snapshotId)
    while (order.length > SNAPSHOTS_PER_TAB_LIMIT) {
      const removed = order.shift()
      if (removed) this.recordsBySnapshot.delete(removed)
    }
    this.snapshotOrderByTab.set(tabId, order)
  }

  getRecord(snapshotId: string, frameRef: string, ref: string, now: number): ElementRefRecord | undefined {
    const normalized = normalizeRef(ref)
    const records = this.recordsBySnapshot.get(snapshotId)
    if (!records) return undefined

    const record = records.find((candidate) => candidate.frameRef === frameRef && normalizeRef(candidate.ref) === normalized)
    if (!record) return undefined
    if (now - record.generatedAt > SNAPSHOT_TTL_MS) {
      this.recordsBySnapshot.delete(snapshotId)
      return undefined
    }
    return record
  }

  clearForTab(tabId: number): void {
    const order = this.snapshotOrderByTab.get(tabId) ?? []
    for (const snapshotId of order) this.recordsBySnapshot.delete(snapshotId)
    this.snapshotOrderByTab.delete(tabId)
  }
}
