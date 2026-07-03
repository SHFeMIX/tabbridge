import type { ElementRefRecord } from '@tabbridge/shared'
import type { ElementFingerprint } from './element-fingerprint'

export type MatchDecision =
  | { kind: 'reuse'; ref: string; score: number; reason: string }
  | { kind: 'create'; identityHash: string; score: number; reason: string }

export type LiveMatch<T> =
  | { kind: 'matched'; element: T; score: number; reason: string }
  | { kind: 'ambiguous'; score: number; reason: string }
  | { kind: 'missing'; score: number; reason: string }

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function wordSimilarity(left: string, right: string): number {
  const leftWords = new Set(normalize(left).split(' ').filter(Boolean))
  const rightWords = new Set(normalize(right).split(' ').filter(Boolean))
  if (leftWords.size === 0 && rightWords.size === 0) return 1
  if (leftWords.size === 0 || rightWords.size === 0) return 0
  const intersection = Array.from(leftWords).filter((word) => rightWords.has(word)).length
  const union = new Set([...leftWords, ...rightWords]).size
  return intersection / union
}

function keyAttributeScore(left: Record<string, string>, right: Record<string, string>): number {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)]))
  if (keys.length === 0) return 0
  const matches = keys.filter((key) => left[key] && right[key] && normalize(left[key]) === normalize(right[key])).length
  return Math.round((matches / keys.length) * 20)
}

function domScore(left: string, right: string): number {
  if (normalize(left) === normalize(right)) return 15
  const leftParts = left.split('/').filter(Boolean)
  const rightParts = right.split('/').filter(Boolean)
  const shared = leftParts.filter((part) => rightParts.includes(part)).length
  const total = new Set([...leftParts, ...rightParts]).size
  return total === 0 ? 0 : Math.round((shared / total) * 15)
}

function boxScore(left: ElementRefRecord['boundingBox'], right: ElementFingerprint['boundingBox']): number {
  const dx = Math.abs(left[0] - right[0])
  const dy = Math.abs(left[1] - right[1])
  const dw = Math.abs(left[2] - right[2])
  const dh = Math.abs(left[3] - right[3])
  const distance = dx + dy + dw + dh
  if (distance <= 10) return 10
  if (distance <= 50) return 7
  if (distance <= 150) return 4
  return 0
}

function stateScore(left: ElementRefRecord['states'], right: ElementFingerprint['states']): number {
  if (left.disabled !== right.disabled) return 0
  if (left.checked !== right.checked) return 3
  return 5
}

function scoreRecord(record: ElementRefRecord, next: ElementFingerprint): { score: number; roleConflict: boolean; nameConflict: boolean } {
  const roleConflict = normalize(record.role) !== normalize(next.role)
  const nameSimilarity = wordSimilarity(record.accessibleName || record.name, next.accessibleName)
  const nameConflict = nameSimilarity < 0.25
  if (record.identityHash === next.identityHash && !roleConflict && !nameConflict) {
    // Exact identity match is very strong, but include bounding-box score so
    // duplicated elements (e.g. header + footer nav) can still be disambiguated
    // by their original position.
    return { score: 100 + boxScore(record.boundingBox, next.boundingBox), roleConflict: false, nameConflict: false }
  }
  let score = 0
  if (!roleConflict) score += 30
  if (normalize(record.accessibleName || record.name) === normalize(next.accessibleName)) score += 35
  else score += Math.round(nameSimilarity * 25)
  score += keyAttributeScore(record.keyAttributes, next.keyAttributes)
  score += domScore(record.domSignature, next.domSignature)
  score += boxScore(record.boundingBox, next.boundingBox)
  score += stateScore(record.states, next.states)
  return { score, roleConflict, nameConflict }
}

export function matchElementIdentity(previous: ElementRefRecord[], next: ElementFingerprint): MatchDecision {
  const scored = previous.map((candidate) => ({ candidate, ...scoreRecord(candidate, next) })).sort((left, right) => right.score - left.score)
  const best = scored[0]
  if (!best) return { kind: 'create', identityHash: next.identityHash, score: 0, reason: 'no previous candidates' }
  if (best.candidate.identityHash === next.identityHash && !best.roleConflict && !best.nameConflict) return { kind: 'reuse', ref: best.candidate.ref, score: 100, reason: 'identity hash exact match' }
  if (best.roleConflict || best.nameConflict || best.score < 70) return { kind: 'create', identityHash: next.identityHash, score: best.score, reason: 'semantic match below reuse threshold' }
  const second = scored[1]
  if (second && best.score - second.score <= 5) return { kind: 'create', identityHash: next.identityHash, score: best.score, reason: 'ambiguous previous candidates' }
  return { kind: 'reuse', ref: best.candidate.ref, score: best.score, reason: 'semantic match above reuse threshold' }
}

export function findBestLiveMatch<T>(record: ElementRefRecord, candidates: Array<{ element: T; fingerprint: ElementFingerprint }>): LiveMatch<T> {
  const scored = candidates.map((candidate) => ({ ...candidate, ...scoreRecord(record, candidate.fingerprint) })).sort((left, right) => right.score - left.score)
  const best = scored[0]
  if (!best || best.roleConflict || best.nameConflict || best.score < 70) return { kind: 'missing', score: best?.score ?? 0, reason: 'no live semantic match above threshold' }
  const second = scored[1]
  if (second && best.score - second.score <= 5) return { kind: 'ambiguous', score: best.score, reason: 'multiple live candidates are too similar' }
  return { kind: 'matched', element: best.element, score: best.score, reason: 'live semantic match above threshold' }
}
