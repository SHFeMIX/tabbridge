import type { RiskLevel } from './risk.js'

export type Rect = [number, number, number, number]

export type ViewportSnapshot = {
  width: number
  height: number
  scrollX: number
  scrollY: number
}

export type SnapshotElement = {
  ref: string
  role: string
  name: string
  text: string
  states: string[]
  box: Rect
  risk: RiskLevel
}

export type SnapshotFrame = {
  frameRef: string
  origin: string
  accessible: boolean
  reason?: 'FRAME_ORIGIN_NOT_AUTHORIZED' | 'FRAME_NOT_ACCESSIBLE'
  tree?: SnapshotElement[]
}

type PageSnapshotBase = {
  tabId: number
  snapshotId: string
  title: string
  domain: string
  viewport: ViewportSnapshot
  frames: SnapshotFrame[]
}

export type PageSnapshot =
  | (PageSnapshotBase & { urlVisible: true; url: string })
  | (PageSnapshotBase & { urlVisible: false; url?: never })

export type ElementRefRecord = {
  snapshotId: string
  tabId: number
  frameRef: string
  ref: string
  selectorCandidates: string[]
  xpathCandidates: string[]
  role?: string
  name?: string
  textFingerprint?: string
  boundingBox?: Rect
  generatedAt: number
}

export function normalizeRef(ref: string): string {
  return ref.startsWith('@') ? ref.slice(1) : ref
}

export function displayRef(ref: string): string {
  return ref.startsWith('@') ? ref : `@${ref}`
}
