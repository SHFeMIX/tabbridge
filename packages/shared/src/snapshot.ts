import type { RiskLevel } from './risk.js'

export type Rect = [number, number, number, number]

export type ElementState = {
  disabled: boolean
  checked: boolean
  selected: boolean
  expanded: boolean
  hidden: boolean
  focused: boolean
}

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
  accessibleName: string
  text: string
  states: string[]
  box: Rect
  risk: RiskLevel
  identityHash: string
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
  identityHash: string
  role: string
  accessibleName: string
  name: string
  textFingerprint: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
  states: ElementState
  boundingBox: Rect
  generatedAt: number
  selectorCandidates?: string[]
  xpathCandidates?: string[]
}

export function normalizeRef(ref: string): string {
  return ref.startsWith('@') ? ref.slice(1) : ref
}

export function displayRef(ref: string): string {
  return ref.startsWith('@') ? ref : `@${ref}`
}
