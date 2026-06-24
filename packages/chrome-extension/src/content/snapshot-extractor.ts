import { classifyRisk, displayRef, domainFromUrl, type ElementRefRecord, type PageSnapshot, type Rect, type SnapshotElement } from '@tabbridge/shared'

export type ExtractSnapshotInput = {
  tabId: number
  snapshotId: string
  title: string
  url: string
  includeUrl: boolean
  now: number
}

export type ExtractSnapshotResult = {
  snapshot: PageSnapshot
  records: ElementRefRecord[]
}

const INTERACTABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[onclick]',
].join(',')

function rectFor(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)]
}

function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement
  const style = window.getComputedStyle(htmlElement)
  const rect = htmlElement.getBoundingClientRect()
  // Use >= 0 so jsdom tests without layout can still discover elements.
  // In a real Chrome tab, getBoundingClientRect reflects actual visibility.
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 0 && rect.height >= 0
}

function roleFor(element: Element): string {
  const explicit = element.getAttribute('role')
  if (explicit) return explicit
  const tag = element.tagName.toLowerCase()
  if (tag === 'a') return 'link'
  if (tag === 'button') return 'button'
  if (tag === 'input' || tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  return 'button'
}

function nameFor(element: Element): string {
  const aria = element.getAttribute('aria-label')
  if (aria) return aria.trim()
  const title = element.getAttribute('title')
  if (title) return title.trim()
  const text = element.textContent?.replace(/\s+/g, ' ').trim()
  if (text) return text.slice(0, 120)
  const placeholder = element.getAttribute('placeholder')
  if (placeholder) return placeholder.trim()
  return roleFor(element)
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return value.replace(/([!"#$%&'()*+,.\/;<=>?@[\\\]^`{|}~])/g, '\\$1')
}

function selectorFor(element: Element): string[] {
  if (element.id) return [`#${cssEscape(element.id)}`]
  const tag = element.tagName.toLowerCase()
  const aria = element.getAttribute('aria-label')
  if (aria) return [`${tag}[aria-label="${cssEscape(aria)}"]`]
  return [tag]
}

function xpathFor(element: Element): string[] {
  if (element.id) return [`//*[@id="${element.id}"]`]
  return [`//${element.tagName.toLowerCase()}`]
}

export function extractSnapshotFromDocument(input: ExtractSnapshotInput): ExtractSnapshotResult {
  const elements = Array.from(document.querySelectorAll(INTERACTABLE_SELECTOR)).filter(isVisible)
  const records: ElementRefRecord[] = []
  const tree: SnapshotElement[] = []

  elements.forEach((element, index) => {
    const role = roleFor(element)
    const name = nameFor(element)
    const text = element.tagName.toLowerCase() === 'input' ? '' : (element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '')
    const inputType = element.getAttribute('type') ?? undefined
    const risk = classifyRisk({ command: 'snapshot', role, name, text, inputType, usesCoordinates: false })
    const ref = displayRef(`e${index + 1}`)
    const box = rectFor(element)

    tree.push({ ref, role, name, text, states: ['enabled'], box, risk: risk.risk })
    records.push({
      snapshotId: input.snapshotId,
      tabId: input.tabId,
      frameRef: 'f0',
      ref,
      selectorCandidates: selectorFor(element),
      xpathCandidates: xpathFor(element),
      role,
      name,
      textFingerprint: text || name,
      boundingBox: box,
      generatedAt: input.now,
    })
  })

  const snapshot: PageSnapshot = {
    tabId: input.tabId,
    snapshotId: input.snapshotId,
    title: input.title,
    domain: domainFromUrl(input.url),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    frames: [{ frameRef: 'f0', origin: new URL(input.url).origin, accessible: true, tree }],
    urlVisible: input.includeUrl,
    ...(input.includeUrl ? { url: input.url } : {}),
  } as PageSnapshot

  return { snapshot, records }
}
