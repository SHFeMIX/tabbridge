export type BrowserSession = {
  tabId: number
  title?: string
  url?: string
  latestSnapshotAvailable: boolean
}

let currentSession: BrowserSession | undefined

export function connectSession(input: { tabId: number; title?: string; url?: string }): BrowserSession {
  currentSession = { ...input, latestSnapshotAvailable: false }
  return currentSession
}

export function getSession(): BrowserSession | undefined {
  return currentSession
}

export function disconnectSession(): void {
  currentSession = undefined
}

export function markLatestSnapshot(tabId: number, latestSnapshotAvailable: boolean): void {
  if (!currentSession || currentSession.tabId !== tabId) currentSession = { tabId, latestSnapshotAvailable }
  else currentSession = { ...currentSession, latestSnapshotAvailable }
}
