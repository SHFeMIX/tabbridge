# TabBridge Stable UI Identity Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade TabBridge from index-based snapshot refs to a stable semantic UI identity layer with cross-snapshot matching and action-time semantic rematching.

**Architecture:** Add small content-script modules for accessible names, roles, element states, stable identity hashes, fingerprints, and matching. Keep `snapshot-extractor.ts` close to pure by passing previous records in, upgrade `RefStore` to dual indexes, and make actions resolve via latest ref identity before snapshot fallback.

**Tech Stack:** TypeScript, WXT Chrome extension content scripts, `@tabbridge/shared`, Vitest with jsdom, pnpm workspace.

## Global Constraints

- `snapshotId = observation version / 快照版本上下文`.
- `ref = stable UI identity / 稳定 UI 元素身份`.
- Do not implement selector candidates enhancement.
- Do not implement xpath candidates enhancement.
- Do not use selector/xpath as primary identity or action resolution input.
- Preserve backward compatibility for existing `snapshotId + frameRef + ref` callers.
- On semantic ambiguity, return or create stale-safe behavior; never guess the first matching element.
- New behavior must be implemented with TDD: write failing tests first and watch them fail before production code.
- Commit steps are included for implementation sessions where the user has explicitly authorized commits; otherwise stop after verification and report the clean diff.

---

## File Structure

- Create `packages/chrome-extension/src/content/accessible-name.ts` — computes deterministic accessible names from DOM elements.
- Create `packages/chrome-extension/test/accessible-name.test.ts` — jsdom tests for `aria-labelledby`, labels, placeholders, text normalization, truncation, and value privacy.
- Create `packages/chrome-extension/src/content/role-normalizer.ts` — normalizes explicit/native roles.
- Create `packages/chrome-extension/test/role-normalizer.test.ts` — role mapping tests for native elements and explicit roles.
- Create `packages/chrome-extension/src/content/element-state.ts` — computes disabled/checked/selected/expanded/hidden/focused state labels.
- Create `packages/chrome-extension/test/element-state.test.ts` — state model tests.
- Modify `packages/shared/src/snapshot.ts` — adds shared `ElementState`, `accessibleName`, `identityHash`, fingerprint fields, and optional compatibility selector/xpath arrays.
- Create `packages/chrome-extension/src/content/stable-ref.ts` — deterministic identity hash and `@r_` ref generation.
- Create `packages/chrome-extension/test/stable-ref.test.ts` — hash determinism/order tests.
- Create `packages/chrome-extension/src/content/element-fingerprint.ts` — converts live DOM elements into semantic fingerprints.
- Create `packages/chrome-extension/test/element-fingerprint.test.ts` — tests DOM signatures, key attributes, form context, and value privacy.
- Create `packages/chrome-extension/src/content/identity-matcher.ts` — scores previous records against next fingerprints.
- Create `packages/chrome-extension/test/identity-matcher.test.ts` — reuse/create/ambiguity tests.
- Modify `packages/chrome-extension/src/content/ref-store.ts` — dual indexes: snapshot records and latest records by ref.
- Modify `packages/chrome-extension/test/ref-store.test.ts` — latest lookup, TTL, clear, and per-tab limit tests.
- Modify `packages/chrome-extension/src/content/snapshot-extractor.ts` — uses semantic modules, previous records, stable refs, and upgraded snapshot records.
- Modify `packages/chrome-extension/test/snapshot-extractor.test.ts` — ref stability over insertion/reorder and new snapshot fields.
- Modify `packages/chrome-extension/src/content/actions.ts` — latest ref lookup plus semantic live DOM rematch.
- Modify `packages/chrome-extension/test/actions.test.ts` — action stability and stale-safe tests.
- Modify `packages/chrome-extension/src/entrypoints/content.ts` — passes previous candidates to snapshot extractor and avoids selector-based HTML lookup.

---

### Task 1: Accessible Name Resolver

**Files:**
- Create: `packages/chrome-extension/src/content/accessible-name.ts`
- Create: `packages/chrome-extension/test/accessible-name.test.ts`

**Interfaces:**
- Consumes: DOM `Element` and `document.getElementById`.
- Produces: `computeAccessibleName(element: Element): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/chrome-extension/test/accessible-name.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeAccessibleName } from '../src/content/accessible-name'

describe('computeAccessibleName', () => {
  it('uses aria-labelledby references in declared order and follows reference chains', () => {
    document.body.innerHTML = `
      <span id="first">  Save   </span>
      <span id="second" aria-labelledby="nested"></span>
      <span id="nested"> changes </span>
      <button aria-labelledby="first second">Ignored text</button>
    `

    expect(computeAccessibleName(document.querySelector('button')!)).toBe('Save changes')
  })

  it('does not loop forever for cyclic aria-labelledby references', () => {
    document.body.innerHTML = `
      <span id="a" aria-labelledby="b">Alpha</span>
      <span id="b" aria-labelledby="a">Beta</span>
      <button aria-labelledby="a">Fallback text</button>
    `

    expect(computeAccessibleName(document.querySelector('button')!)).toBe('button')
  })

  it('uses aria-label before label placeholder and text', () => {
    document.body.innerHTML = `
      <label for="email">Email label</label>
      <input id="email" aria-label="Email aria" placeholder="Email placeholder" value="secret@example.com">
    `

    expect(computeAccessibleName(document.querySelector('input')!)).toBe('Email aria')
  })

  it('uses label for form controls when aria label is absent', () => {
    document.body.innerHTML = '<label for="comment">Comment</label><textarea id="comment"></textarea>'

    expect(computeAccessibleName(document.querySelector('textarea')!)).toBe('Comment')
  })

  it('uses placeholder and never leaks input values', () => {
    document.body.innerHTML = '<input placeholder="Search docs" value="private typed query">'

    expect(computeAccessibleName(document.querySelector('input')!)).toBe('Search docs')
  })

  it('normalizes whitespace and truncates long text to 120 chars', () => {
    const longText = 'Create '.repeat(40)
    document.body.innerHTML = `<button>${longText}</button>`

    const name = computeAccessibleName(document.querySelector('button')!)

    expect(name.length).toBeLessThanOrEqual(120)
    expect(name).not.toContain('  ')
    expect(name.startsWith('Create Create')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- accessible-name.test.ts
```

Expected: FAIL with an import error containing `Cannot find module '../src/content/accessible-name'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/chrome-extension/src/content/accessible-name.ts`:

```ts
const MAX_ACCESSIBLE_NAME_LENGTH = 120

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string): string {
  return value.length > MAX_ACCESSIBLE_NAME_LENGTH ? value.slice(0, MAX_ACCESSIBLE_NAME_LENGTH).trim() : value
}

function fallbackRole(element: Element): string {
  const explicit = normalizeWhitespace(element.getAttribute('role') ?? '')
  if (explicit) return explicit
  const tag = element.tagName.toLowerCase()
  if (tag === 'a' && element.hasAttribute('href')) return 'link'
  if (tag === 'button') return 'button'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase()
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'file') return 'file'
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button'
    return 'textbox'
  }
  if (tag === 'dialog' || element.getAttribute('aria-modal') === 'true') return 'dialog'
  return tag || 'element'
}

function textName(element: Element): string {
  if (element instanceof HTMLInputElement) return ''
  return normalizeWhitespace(element.textContent ?? '')
}

function labelForName(element: Element): string {
  const id = element.getAttribute('id')
  if (!id) return ''
  const labels = Array.from(document.querySelectorAll('label[for]'))
    .filter((label) => label.getAttribute('for') === id)
    .map((label) => normalizeWhitespace(label.textContent ?? ''))
    .filter(Boolean)
  return labels.join(' ')
}

function labelledByName(element: Element, visited: Set<string>): string {
  const raw = element.getAttribute('aria-labelledby')
  if (!raw) return ''

  const names: string[] = []
  for (const id of raw.split(/\s+/).filter(Boolean)) {
    if (visited.has(id)) continue
    visited.add(id)
    const referenced = document.getElementById(id)
    if (!referenced) continue
    const nested = labelledByName(referenced, visited)
    const aria = normalizeWhitespace(referenced.getAttribute('aria-label') ?? '')
    const text = textName(referenced)
    const value = nested || aria || text
    if (value) names.push(value)
  }
  return normalizeWhitespace(names.join(' '))
}

export function computeAccessibleName(element: Element): string {
  const labelledBy = labelledByName(element, new Set())
  if (labelledBy) return truncate(labelledBy)

  const aria = normalizeWhitespace(element.getAttribute('aria-label') ?? '')
  if (aria) return truncate(aria)

  const label = labelForName(element)
  if (label) return truncate(label)

  const placeholder = normalizeWhitespace(element.getAttribute('placeholder') ?? '')
  if (placeholder) return truncate(placeholder)

  const text = textName(element)
  if (text) return truncate(text)

  return fallbackRole(element)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- accessible-name.test.ts
```

Expected: PASS with all six tests passing.

- [ ] **Step 5: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/chrome-extension/src/content/accessible-name.ts packages/chrome-extension/test/accessible-name.test.ts
git commit -m "feat(extension): add accessible name resolver"
```

---

### Task 2: Role Normalizer

**Files:**
- Create: `packages/chrome-extension/src/content/role-normalizer.ts`
- Create: `packages/chrome-extension/test/role-normalizer.test.ts`
- Modify: `packages/chrome-extension/src/content/accessible-name.ts`

**Interfaces:**
- Consumes: `computeAccessibleName(element)` from Task 1 remains unchanged.
- Produces: `normalizeRole(element: Element): NormalizedRole | string`.

- [ ] **Step 1: Write the failing test**

Create `packages/chrome-extension/test/role-normalizer.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { normalizeRole } from '../src/content/role-normalizer'

describe('normalizeRole', () => {
  it('normalizes native interactive roles', () => {
    document.body.innerHTML = `
      <button id="button">Save</button>
      <a id="link" href="/settings">Settings</a>
      <textarea id="textarea"></textarea>
      <select id="select"><option>One</option></select>
      <dialog id="dialog"></dialog>
      <div id="modal" aria-modal="true"></div>
    `

    expect(normalizeRole(document.querySelector('#button')!)).toBe('button')
    expect(normalizeRole(document.querySelector('#link')!)).toBe('link')
    expect(normalizeRole(document.querySelector('#textarea')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#select')!)).toBe('combobox')
    expect(normalizeRole(document.querySelector('#dialog')!)).toBe('dialog')
    expect(normalizeRole(document.querySelector('#modal')!)).toBe('dialog')
  })

  it('normalizes input types precisely', () => {
    document.body.innerHTML = `
      <input id="text" type="text">
      <input id="email" type="email">
      <input id="search" type="search">
      <input id="password" type="password">
      <input id="checkbox" type="checkbox">
      <input id="radio" type="radio">
      <input id="file" type="file">
      <input id="submit" type="submit">
      <input id="button" type="button">
      <input id="reset" type="reset">
    `

    expect(normalizeRole(document.querySelector('#text')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#email')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#search')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#password')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#checkbox')!)).toBe('checkbox')
    expect(normalizeRole(document.querySelector('#radio')!)).toBe('radio')
    expect(normalizeRole(document.querySelector('#file')!)).toBe('file')
    expect(normalizeRole(document.querySelector('#submit')!)).toBe('button')
    expect(normalizeRole(document.querySelector('#button')!)).toBe('button')
    expect(normalizeRole(document.querySelector('#reset')!)).toBe('button')
  })

  it('prefers explicit non-empty roles', () => {
    document.body.innerHTML = '<div role="menuitemcheckbox">Item</div><button role="  ">Button</button>'

    expect(normalizeRole(document.querySelector('div')!)).toBe('menuitemcheckbox')
    expect(normalizeRole(document.querySelector('button')!)).toBe('button')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- role-normalizer.test.ts
```

Expected: FAIL with an import error containing `Cannot find module '../src/content/role-normalizer'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/chrome-extension/src/content/role-normalizer.ts`:

```ts
export type NormalizedRole = 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'file' | 'dialog'

function normalizedAttribute(element: Element, name: string): string {
  return (element.getAttribute(name) ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function normalizeRole(element: Element): NormalizedRole | string {
  const explicit = normalizedAttribute(element, 'role')
  if (explicit) return explicit

  const tag = element.tagName.toLowerCase()
  if (tag === 'button') return 'button'
  if (tag === 'a' && element.hasAttribute('href')) return 'link'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  if (tag === 'dialog' || normalizedAttribute(element, 'aria-modal') === 'true') return 'dialog'

  if (tag === 'input') {
    const type = normalizedAttribute(element, 'type') || 'text'
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'file') return 'file'
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button'
    return 'textbox'
  }

  return 'button'
}
```

Update `packages/chrome-extension/src/content/accessible-name.ts` so fallback uses the shared normalizer. Replace the private `fallbackRole` implementation with this import and function:

```ts
import { normalizeRole } from './role-normalizer'

const MAX_ACCESSIBLE_NAME_LENGTH = 120
```

and replace the current private `fallbackRole` function with:

```ts
function fallbackRole(element: Element): string {
  return normalizeRole(element)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- role-normalizer.test.ts accessible-name.test.ts
```

Expected: PASS with all role normalizer and accessible name tests passing.

- [ ] **Step 5: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/chrome-extension/src/content/role-normalizer.ts packages/chrome-extension/test/role-normalizer.test.ts packages/chrome-extension/src/content/accessible-name.ts
git commit -m "feat(extension): add role normalizer"
```

---

### Task 3: Element State Model and Shared Snapshot Types

**Files:**
- Modify: `packages/shared/src/snapshot.ts`
- Create: `packages/chrome-extension/src/content/element-state.ts`
- Create: `packages/chrome-extension/test/element-state.test.ts`

**Interfaces:**
- Consumes: `Rect`, `RiskLevel`, and existing snapshot types from `@tabbridge/shared`.
- Produces: shared `ElementState`, upgraded `SnapshotElement`, upgraded `ElementRefRecord`, `computeElementState(element)`, and `stateLabels(state)`.

- [ ] **Step 1: Write the failing test**

Create `packages/chrome-extension/test/element-state.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeElementState, stateLabels } from '../src/content/element-state'

describe('element state model', () => {
  it('computes disabled checked selected expanded hidden and focused states', () => {
    document.body.innerHTML = `
      <button id="disabled" disabled>Save</button>
      <input id="checked" type="checkbox" checked>
      <option id="selected" selected>One</option>
      <button id="expanded" aria-expanded="true">Menu</button>
      <button id="hidden" hidden>Hidden</button>
      <input id="focused">
    `
    ;(document.querySelector('#focused') as HTMLInputElement).focus()

    expect(computeElementState(document.querySelector('#disabled')!)).toMatchObject({ disabled: true })
    expect(computeElementState(document.querySelector('#checked')!)).toMatchObject({ checked: true })
    expect(computeElementState(document.querySelector('#selected')!)).toMatchObject({ selected: true })
    expect(computeElementState(document.querySelector('#expanded')!)).toMatchObject({ expanded: true })
    expect(computeElementState(document.querySelector('#hidden')!)).toMatchObject({ hidden: true })
    expect(computeElementState(document.querySelector('#focused')!)).toMatchObject({ focused: true })
  })

  it('emits stable state labels', () => {
    expect(stateLabels({ disabled: false, checked: true, selected: false, expanded: true, hidden: false, focused: false })).toEqual(['enabled', 'checked', 'expanded'])
    expect(stateLabels({ disabled: true, checked: false, selected: false, expanded: false, hidden: true, focused: false })).toEqual(['disabled', 'hidden'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- element-state.test.ts
```

Expected: FAIL with an import error containing `Cannot find module '../src/content/element-state'`.

- [ ] **Step 3: Update shared types**

Modify `packages/shared/src/snapshot.ts` so it contains these exported types:

```ts
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
```

- [ ] **Step 4: Write element-state implementation**

Create `packages/chrome-extension/src/content/element-state.ts`:

```ts
import type { ElementState } from '@tabbridge/shared'

function hasBooleanProperty(element: Element, key: 'disabled' | 'checked' | 'selected'): boolean {
  return key in element && Boolean((element as HTMLInputElement & HTMLOptionElement & HTMLButtonElement)[key])
}

export function computeElementState(element: Element): ElementState {
  const html = element as HTMLElement
  const style = window.getComputedStyle(html)
  return {
    disabled: hasBooleanProperty(element, 'disabled') || element.getAttribute('aria-disabled') === 'true',
    checked: hasBooleanProperty(element, 'checked') || element.getAttribute('aria-checked') === 'true',
    selected: hasBooleanProperty(element, 'selected') || element.getAttribute('aria-selected') === 'true',
    expanded: element.getAttribute('aria-expanded') === 'true',
    hidden: element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden',
    focused: document.activeElement === element,
  }
}

export function stateLabels(state: ElementState): string[] {
  const labels: string[] = []
  labels.push(state.disabled ? 'disabled' : 'enabled')
  if (state.checked) labels.push('checked')
  if (state.selected) labels.push('selected')
  if (state.expanded) labels.push('expanded')
  if (state.hidden) labels.push('hidden')
  if (state.focused) labels.push('focused')
  return labels
}

export type { ElementState }
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- element-state.test.ts
pnpm --filter @tabbridge/shared typecheck
```

Expected: first command PASS; second command PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/shared/src/snapshot.ts packages/chrome-extension/src/content/element-state.ts packages/chrome-extension/test/element-state.test.ts
git commit -m "feat(extension): add element state model"
```

---

### Task 4: Stable Ref Generator and Element Fingerprints

**Files:**
- Create: `packages/chrome-extension/src/content/stable-ref.ts`
- Create: `packages/chrome-extension/src/content/element-fingerprint.ts`
- Create: `packages/chrome-extension/test/stable-ref.test.ts`
- Create: `packages/chrome-extension/test/element-fingerprint.test.ts`

**Interfaces:**
- Consumes: `computeAccessibleName`, `normalizeRole`, `computeElementState`, `Rect`, `ElementState`.
- Produces: `createIdentityHash`, `createStableRef`, `fingerprintElement`, `ElementFingerprint`.

- [ ] **Step 1: Write stable-ref failing test**

Create `packages/chrome-extension/test/stable-ref.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createIdentityHash, createStableRef } from '../src/content/stable-ref'

describe('stable refs', () => {
  it('creates deterministic identity hashes independent of key attribute insertion order', () => {
    const first = createIdentityHash({
      role: 'button',
      accessibleName: 'Save changes',
      domSignature: 'main/form/button',
      keyAttributes: { name: 'save', type: 'submit' },
      formContext: 'profile',
    })
    const second = createIdentityHash({
      role: 'button',
      accessibleName: 'Save changes',
      domSignature: 'main/form/button',
      keyAttributes: { type: 'submit', name: 'save' },
      formContext: 'profile',
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{12}$/)
    expect(createStableRef(first)).toBe(`@r_${first}`)
  })
})
```

- [ ] **Step 2: Write fingerprint failing test**

Create `packages/chrome-extension/test/element-fingerprint.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fingerprintElement } from '../src/content/element-fingerprint'

describe('fingerprintElement', () => {
  it('builds semantic fingerprints without sibling indexes or input values', () => {
    document.body.innerHTML = `
      <main>
        <form id="profile" aria-label="Profile form" action="https://example.com/profile?secret=yes">
          <input id="email" type="email" name="email" autocomplete="email" placeholder="Email" value="private@example.com">
        </form>
      </main>
    `

    const fingerprint = fingerprintElement(document.querySelector('input')!)

    expect(fingerprint.role).toBe('textbox')
    expect(fingerprint.accessibleName).toBe('Email')
    expect(fingerprint.textFingerprint).toBe('Email')
    expect(fingerprint.domSignature).toBe('main/form/input[type=email]')
    expect(fingerprint.formContext).toBe('Profile form')
    expect(fingerprint.keyAttributes).toMatchObject({ type: 'email', name: 'email', autocomplete: 'email', id: 'email' })
    expect(JSON.stringify(fingerprint)).not.toContain('private@example.com')
  })

  it('normalizes href key attributes to pathname only', () => {
    document.body.innerHTML = '<a href="https://example.com/settings?token=secret#hash">Settings</a>'

    expect(fingerprintElement(document.querySelector('a')!).keyAttributes).toMatchObject({ href: '/settings' })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- stable-ref.test.ts element-fingerprint.test.ts
```

Expected: FAIL with import errors for `stable-ref` and `element-fingerprint`.

- [ ] **Step 4: Write stable-ref implementation**

Create `packages/chrome-extension/src/content/stable-ref.ts`:

```ts
export type IdentityInput = {
  role: string
  accessibleName: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function stableJson(input: IdentityInput): string {
  const sortedAttributes = Object.fromEntries(Object.entries(input.keyAttributes).sort(([left], [right]) => left.localeCompare(right)))
  return JSON.stringify({
    role: normalize(input.role),
    accessibleName: normalize(input.accessibleName),
    domSignature: normalize(input.domSignature),
    keyAttributes: sortedAttributes,
    formContext: normalize(input.formContext ?? ''),
  })
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const first = (hash >>> 0).toString(16).padStart(8, '0')
  let secondHash = 0x811c9dc5
  for (let index = value.length - 1; index >= 0; index -= 1) {
    secondHash ^= value.charCodeAt(index)
    secondHash = Math.imul(secondHash, 0x01000193)
  }
  const second = (secondHash >>> 0).toString(16).padStart(8, '0')
  return `${first}${second}`.slice(0, 12)
}

export function createIdentityHash(input: IdentityInput): string {
  return fnv1a(stableJson(input))
}

export function createStableRef(identityHash: string): string {
  return `@r_${identityHash}`
}
```

- [ ] **Step 5: Write element-fingerprint implementation**

Create `packages/chrome-extension/src/content/element-fingerprint.ts`:

```ts
import type { ElementState, Rect } from '@tabbridge/shared'
import { computeAccessibleName } from './accessible-name'
import { computeElementState } from './element-state'
import { normalizeRole } from './role-normalizer'
import { createIdentityHash } from './stable-ref'

export type ElementFingerprint = {
  identityHash: string
  role: string
  accessibleName: string
  textFingerprint: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
  boundingBox: Rect
  states: ElementState
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function rectFor(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)]
}

function signatureSegment(element: Element): string {
  const tag = element.tagName.toLowerCase()
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase()
    return `input[type=${type}]`
  }
  return tag
}

function domSignature(element: Element): string {
  const segments: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && current !== document.documentElement) {
    segments.unshift(signatureSegment(current))
    current = current.parentElement
  }
  return segments.join('/')
}

function pathOnly(value: string): string {
  try {
    return new URL(value, window.location.href).pathname
  } catch {
    return value.split('?')[0]?.split('#')[0] ?? value
  }
}

function keyAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const name of ['type', 'name', 'autocomplete', 'aria-controls', 'aria-expanded', 'id']) {
    const value = normalizeText(element.getAttribute(name) ?? '')
    if (value) attributes[name] = value
  }
  if (element instanceof HTMLAnchorElement) {
    const href = normalizeText(element.getAttribute('href') ?? '')
    if (href) attributes.href = pathOnly(href)
  }
  return attributes
}

function formContext(element: Element): string | undefined {
  const form = element.closest('form')
  if (!form) return undefined
  const name = computeAccessibleName(form)
  if (name && name !== 'form') return name
  const id = normalizeText(form.getAttribute('id') ?? '')
  if (id) return id
  const action = normalizeText(form.getAttribute('action') ?? '')
  return action ? pathOnly(action) : undefined
}

function textFingerprintFor(element: Element, accessibleName: string): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return accessibleName
  return normalizeText(element.textContent ?? '').slice(0, 160) || accessibleName
}

export function fingerprintElement(element: Element): ElementFingerprint {
  const role = normalizeRole(element)
  const accessibleName = computeAccessibleName(element)
  const dom = domSignature(element)
  const attrs = keyAttributes(element)
  const context = formContext(element)
  const identityHash = createIdentityHash({ role, accessibleName, domSignature: dom, keyAttributes: attrs, formContext: context })
  return {
    identityHash,
    role,
    accessibleName,
    textFingerprint: textFingerprintFor(element, accessibleName),
    domSignature: dom,
    keyAttributes: attrs,
    formContext: context,
    boundingBox: rectFor(element),
    states: computeElementState(element),
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- stable-ref.test.ts element-fingerprint.test.ts accessible-name.test.ts role-normalizer.test.ts element-state.test.ts
```

Expected: PASS with all listed tests passing.

- [ ] **Step 7: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/chrome-extension/src/content/stable-ref.ts packages/chrome-extension/src/content/element-fingerprint.ts packages/chrome-extension/test/stable-ref.test.ts packages/chrome-extension/test/element-fingerprint.test.ts
git commit -m "feat(extension): add stable element fingerprints"
```

---

### Task 5: Cross-Snapshot Identity Matcher

**Files:**
- Create: `packages/chrome-extension/src/content/identity-matcher.ts`
- Create: `packages/chrome-extension/test/identity-matcher.test.ts`

**Interfaces:**
- Consumes: `ElementRefRecord` and `ElementFingerprint`.
- Produces: `matchElementIdentity(previous, next)` and `findBestLiveMatch(records, nextCandidates)`.

- [ ] **Step 1: Write the failing test**

Create `packages/chrome-extension/test/identity-matcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import type { ElementFingerprint } from '../src/content/element-fingerprint'
import { findBestLiveMatch, matchElementIdentity } from '../src/content/identity-matcher'

const state = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'snap_1',
    tabId: 1,
    frameRef: 'f0',
    ref: '@r_prev',
    identityHash: 'hash-save',
    role: 'button',
    accessibleName: 'Save',
    name: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/form/button',
    keyAttributes: { type: 'submit' },
    states: state,
    boundingBox: [10, 10, 100, 40],
    generatedAt: 1000,
    ...overrides,
  }
}

function fingerprint(overrides: Partial<ElementFingerprint>): ElementFingerprint {
  return {
    identityHash: 'hash-save',
    role: 'button',
    accessibleName: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/form/button',
    keyAttributes: { type: 'submit' },
    states: state,
    boundingBox: [12, 12, 100, 40],
    ...overrides,
  }
}

describe('identity matcher', () => {
  it('reuses refs for exact identity hash matches', () => {
    expect(matchElementIdentity([record({})], fingerprint({}))).toMatchObject({ kind: 'reuse', ref: '@r_prev' })
  })

  it('reuses refs for strong semantic matches when identity hash changes slightly', () => {
    expect(matchElementIdentity([record({ identityHash: 'old-hash' })], fingerprint({ identityHash: 'new-hash', boundingBox: [20, 10, 100, 40] }))).toMatchObject({ kind: 'reuse', ref: '@r_prev' })
  })

  it('creates a new identity for role or name mismatches', () => {
    expect(matchElementIdentity([record({ role: 'checkbox' })], fingerprint({ role: 'button' })).kind).toBe('create')
    expect(matchElementIdentity([record({ accessibleName: 'Delete' })], fingerprint({ accessibleName: 'Save' })).kind).toBe('create')
  })

  it('treats close high-scoring live matches as ambiguous', () => {
    const candidates = [
      { element: 'first', fingerprint: fingerprint({ identityHash: 'candidate-1', boundingBox: [10, 10, 100, 40] }) },
      { element: 'second', fingerprint: fingerprint({ identityHash: 'candidate-2', boundingBox: [11, 10, 100, 40] }) },
    ]

    expect(findBestLiveMatch(record({ identityHash: 'stored-hash' }), candidates)).toMatchObject({ kind: 'ambiguous' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- identity-matcher.test.ts
```

Expected: FAIL with an import error containing `Cannot find module '../src/content/identity-matcher'`.

- [ ] **Step 3: Write implementation**

Create `packages/chrome-extension/src/content/identity-matcher.ts`:

```ts
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
  if (record.identityHash === next.identityHash) return { score: 100, roleConflict: false, nameConflict: false }
  const roleConflict = normalize(record.role) !== normalize(next.role)
  const nameSimilarity = wordSimilarity(record.accessibleName || record.name, next.accessibleName)
  const nameConflict = nameSimilarity < 0.25
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
  if (best.candidate.identityHash === next.identityHash) return { kind: 'reuse', ref: best.candidate.ref, score: 100, reason: 'identity hash exact match' }
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- identity-matcher.test.ts
```

Expected: PASS with all identity matcher tests passing.

- [ ] **Step 5: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/chrome-extension/src/content/identity-matcher.ts packages/chrome-extension/test/identity-matcher.test.ts
git commit -m "feat(extension): add identity matcher"
```

---

### Task 6: Dual RefStore

**Files:**
- Modify: `packages/chrome-extension/src/content/ref-store.ts`
- Modify: `packages/chrome-extension/test/ref-store.test.ts`

**Interfaces:**
- Consumes: upgraded `ElementRefRecord` from `@tabbridge/shared`.
- Produces: `getLatestRecord(tabId, frameRef, ref, now)` and `getPreviousCandidates(tabId, frameRef, now)` while preserving `getRecord`.

- [ ] **Step 1: Replace RefStore tests with failing dual-index tests**

Modify `packages/chrome-extension/test/ref-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'snap_1',
    tabId: 1,
    frameRef: 'f0',
    ref: '@r_save',
    identityHash: 'hash-save',
    role: 'button',
    accessibleName: 'Save',
    name: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/button',
    keyAttributes: {},
    states,
    boundingBox: [0, 0, 100, 40],
    generatedAt: 1000,
    ...overrides,
  }
}

describe('RefStore', () => {
  it('supports snapshot lookup and latest ref lookup', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    expect(store.getRecord('snap_1', 'f0', '@r_save', 2000)?.accessibleName).toBe('Save')
    expect(store.getLatestRecord(1, 'f0', '@r_save', 2000)?.accessibleName).toBe('Save')
    expect(store.getPreviousCandidates(1, 'f0', 2000)).toHaveLength(1)
  })

  it('expires snapshot records latest records and previous candidates after TTL', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    expect(store.getRecord('snap_1', 'f0', '@r_save', 62001)).toBeUndefined()
    expect(store.getLatestRecord(1, 'f0', '@r_save', 62001)).toBeUndefined()
    expect(store.getPreviousCandidates(1, 'f0', 62001)).toEqual([])
  })

  it('keeps only the latest three snapshots per tab without deleting latest identity for reused refs', () => {
    const store = new RefStore()
    for (let index = 1; index <= 4; index += 1) {
      store.saveSnapshot(`snap_${index}`, [record({ snapshotId: `snap_${index}`, generatedAt: index, accessibleName: `Save ${index}`, name: `Save ${index}` })], index)
    }

    expect(store.getRecord('snap_1', 'f0', '@r_save', 10)).toBeUndefined()
    expect(store.getRecord('snap_4', 'f0', '@r_save', 10)?.accessibleName).toBe('Save 4')
    expect(store.getLatestRecord(1, 'f0', '@r_save', 10)?.accessibleName).toBe('Save 4')
  })

  it('clears snapshot and latest indexes for a tab', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)
    store.clearForTab(1)

    expect(store.getRecord('snap_1', 'f0', '@r_save', 1001)).toBeUndefined()
    expect(store.getLatestRecord(1, 'f0', '@r_save', 1001)).toBeUndefined()
    expect(store.getPreviousCandidates(1, 'f0', 1001)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- ref-store.test.ts
```

Expected: FAIL with TypeScript or runtime errors for missing `getLatestRecord` and `getPreviousCandidates`.

- [ ] **Step 3: Implement dual RefStore**

Replace `packages/chrome-extension/src/content/ref-store.ts` with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- ref-store.test.ts
```

Expected: PASS with all RefStore tests passing.

- [ ] **Step 5: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/chrome-extension/src/content/ref-store.ts packages/chrome-extension/test/ref-store.test.ts
git commit -m "feat(extension): upgrade ref store identity registry"
```

---

### Task 7: Snapshot Extractor Identity Integration

**Files:**
- Modify: `packages/chrome-extension/src/content/snapshot-extractor.ts`
- Modify: `packages/chrome-extension/test/snapshot-extractor.test.ts`
- Modify: `packages/chrome-extension/src/entrypoints/content.ts`

**Interfaces:**
- Consumes: `fingerprintElement`, `matchElementIdentity`, `createStableRef`, `stateLabels`, `RefStore.getPreviousCandidates`.
- Produces: snapshots with stable refs, `accessibleName`, `identityHash`, structured records, and no selector/xpath dependence.

- [ ] **Step 1: Replace snapshot extractor tests with failing stability tests**

Modify `packages/chrome-extension/test/snapshot-extractor.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractSnapshotFromDocument } from '../src/content/snapshot-extractor'

describe('semantic snapshot extractor', () => {
  it('extracts semantic interactables with stable identity fields and no input value leakage', () => {
    document.body.innerHTML = '<main><button id="merge">Merge pull request</button><input type="checkbox" aria-label="Confirm" checked><input aria-label="Comment" value="secret typed value"><a href="/settings">Settings</a><span>Plain text</span></main>'

    const result = extractSnapshotFromDocument({
      tabId: 123,
      snapshotId: 'snap_1',
      title: 'GitHub Pull Request',
      url: 'https://github.com/acme/repo/pull/1',
      includeUrl: false,
      now: 1782010000000,
    })

    expect(result.snapshot).toMatchObject({ tabId: 123, snapshotId: 'snap_1', title: 'GitHub Pull Request', domain: 'github.com', urlVisible: false })
    expect(result.snapshot.frames[0]?.tree).toEqual([
      expect.objectContaining({ role: 'button', name: 'Merge pull request', accessibleName: 'Merge pull request', risk: 'high' }),
      expect.objectContaining({ role: 'checkbox', name: 'Confirm', states: expect.arrayContaining(['checked']) }),
      expect.objectContaining({ role: 'textbox', name: 'Comment', risk: 'low' }),
      expect.objectContaining({ role: 'link', name: 'Settings', risk: 'low' }),
    ])
    for (const element of result.snapshot.frames[0]?.tree ?? []) {
      expect(element.ref).toMatch(/^@r_[a-f0-9]{12}$/)
      expect(element.identityHash).toMatch(/^[a-f0-9]{12}$/)
    }
    expect(JSON.stringify(result.snapshot)).not.toContain('secret typed value')
    expect(result.records[0]?.selectorCandidates).toEqual([])
    expect(result.records[0]?.xpathCandidates).toEqual([])
  })

  it('keeps refs stable across DOM insertion and reorder when previous records are supplied', () => {
    document.body.innerHTML = '<main><button>Save</button><button>Delete</button></main>'
    const first = extractSnapshotFromDocument({ tabId: 1, snapshotId: 'snap_1', title: 'App', url: 'https://example.com', includeUrl: false, now: 1000 })
    const saveRef = first.snapshot.frames[0]?.tree?.find((element) => element.name === 'Save')?.ref
    const deleteRef = first.snapshot.frames[0]?.tree?.find((element) => element.name === 'Delete')?.ref

    document.body.innerHTML = '<main><button>New banner</button><button>Delete</button><button>Save</button></main>'
    const second = extractSnapshotFromDocument({ tabId: 1, snapshotId: 'snap_2', title: 'App', url: 'https://example.com', includeUrl: false, now: 2000, previousRecords: first.records })

    expect(second.snapshot.frames[0]?.tree?.find((element) => element.name === 'Save')?.ref).toBe(saveRef)
    expect(second.snapshot.frames[0]?.tree?.find((element) => element.name === 'Delete')?.ref).toBe(deleteRef)
    expect(second.snapshot.frames[0]?.tree?.find((element) => element.name === 'New banner')?.ref).toMatch(/^@r_[a-f0-9]{12}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- snapshot-extractor.test.ts
```

Expected: FAIL because refs are still `@e1`, `accessibleName` and `identityHash` are absent, checkbox role is wrong, and selector/xpath arrays are non-empty.

- [ ] **Step 3: Replace snapshot extractor implementation**

Replace `packages/chrome-extension/src/content/snapshot-extractor.ts` with:

```ts
import { classifyRisk, displayRef, domainFromUrl, type ElementRefRecord, type PageSnapshot, type Rect, type SnapshotElement } from '@tabbridge/shared'
import { computeElementState, stateLabels } from './element-state'
import { fingerprintElement } from './element-fingerprint'
import { matchElementIdentity } from './identity-matcher'
import { createStableRef } from './stable-ref'

export type ExtractSnapshotInput = {
  tabId: number
  snapshotId: string
  title: string
  url: string
  includeUrl: boolean
  now: number
  previousRecords?: ElementRefRecord[]
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
  '[role="combobox"]',
  '[role="dialog"]',
  'dialog',
  '[aria-modal="true"]',
  '[onclick]',
].join(',')

function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement
  const style = window.getComputedStyle(htmlElement)
  const rect = htmlElement.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 0 && rect.height >= 0
}

function rectFor(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)]
}

function textFor(element: Element, accessibleName: string): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return ''
  return (element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) || accessibleName)
}

export function extractSnapshotFromDocument(input: ExtractSnapshotInput): ExtractSnapshotResult {
  const elements = Array.from(document.querySelectorAll(INTERACTABLE_SELECTOR)).filter(isVisible)
  const records: ElementRefRecord[] = []
  const tree: SnapshotElement[] = []
  const previousRecords = input.previousRecords ?? []

  for (const element of elements) {
    const fingerprint = fingerprintElement(element)
    const decision = matchElementIdentity(previousRecords, fingerprint)
    const ref = decision.kind === 'reuse' ? decision.ref : createStableRef(decision.identityHash)
    const text = textFor(element, fingerprint.accessibleName)
    const inputType = element.getAttribute('type') ?? undefined
    const risk = classifyRisk({ command: 'snapshot', role: fingerprint.role, name: fingerprint.accessibleName, text, inputType, usesCoordinates: false })
    const states = computeElementState(element)
    const labels = stateLabels(states)
    const box = rectFor(element)

    tree.push({
      ref,
      role: fingerprint.role,
      name: fingerprint.accessibleName,
      accessibleName: fingerprint.accessibleName,
      text,
      states: labels,
      box,
      risk: risk.risk,
      identityHash: fingerprint.identityHash,
    })
    records.push({
      snapshotId: input.snapshotId,
      tabId: input.tabId,
      frameRef: 'f0',
      ref: displayRef(ref),
      identityHash: fingerprint.identityHash,
      role: fingerprint.role,
      accessibleName: fingerprint.accessibleName,
      name: fingerprint.accessibleName,
      textFingerprint: fingerprint.textFingerprint,
      domSignature: fingerprint.domSignature,
      keyAttributes: fingerprint.keyAttributes,
      formContext: fingerprint.formContext,
      states,
      boundingBox: box,
      selectorCandidates: [],
      xpathCandidates: [],
      generatedAt: input.now,
    })
  }

  let origin: string
  try {
    origin = new URL(input.url).origin
  } catch {
    origin = domainFromUrl(input.url)
  }

  const snapshotBase = {
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
    frames: [{ frameRef: 'f0', origin, accessible: true, tree }],
  }

  const snapshot: PageSnapshot = input.includeUrl
    ? { ...snapshotBase, urlVisible: true, url: input.url }
    : { ...snapshotBase, urlVisible: false }

  return { snapshot, records }
}
```

- [ ] **Step 4: Wire previous records in content entrypoint**

In `packages/chrome-extension/src/entrypoints/content.ts`, replace the snapshot block lines that call `extractSnapshotFromDocument` with:

```ts
const now = Date.now()
const previousRecords = refStore.getPreviousCandidates(message.tabId, 'f0', now)
const result = extractSnapshotFromDocument({
  tabId: message.tabId,
  snapshotId: message.snapshotId,
  title: document.title,
  url: window.location.href,
  includeUrl: Boolean(message.includeUrl),
  now,
  previousRecords,
})
refStore.saveSnapshot(message.snapshotId, result.records, now)
```

Do not change the `tabbridge.html` block in this task; action-safe semantic HTML lookup is handled in Task 8.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- snapshot-extractor.test.ts
```

Expected: PASS with stable ref and semantic snapshot tests passing.

- [ ] **Step 6: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/chrome-extension/src/content/snapshot-extractor.ts packages/chrome-extension/test/snapshot-extractor.test.ts packages/chrome-extension/src/entrypoints/content.ts
git commit -m "feat(extension): emit stable semantic snapshots"
```

---

### Task 8: Action Ref Resolution by Latest Identity and Semantic Rematch

**Files:**
- Modify: `packages/chrome-extension/src/content/actions.ts`
- Modify: `packages/chrome-extension/test/actions.test.ts`
- Modify: `packages/chrome-extension/src/entrypoints/content.ts`

**Interfaces:**
- Consumes: `RefStore.getLatestRecord`, `RefStore.getRecord`, `fingerprintElement`, `findBestLiveMatch`.
- Produces: action execution that prioritizes `ref -> latest record` and resolves live DOM by semantics, not selector/xpath.

- [ ] **Step 1: Replace action tests with failing semantic resolution tests**

Modify `packages/chrome-extension/test/actions.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'
import { executeRefAction } from '../src/content/actions'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'snap_1',
    tabId: 1,
    frameRef: 'f0',
    ref: '@r_save',
    identityHash: 'stored-save',
    role: 'button',
    accessibleName: 'Save',
    name: 'Save',
    textFingerprint: 'Save',
    domSignature: 'main/button',
    keyAttributes: {},
    states,
    boundingBox: [0, 0, 100, 40],
    generatedAt: 1000,
    selectorCandidates: [],
    xpathCandidates: [],
    ...overrides,
  }
}

describe('ref-based actions', () => {
  it('returns REF_STALE when no latest or snapshot record exists', async () => {
    const store = new RefStore()
    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_missing', frameRef: 'f0', ref: '@r_missing' }, store, 1000)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('REF_STALE')
  })

  it('clicks using latest ref identity after DOM reorder without selectors', async () => {
    document.body.innerHTML = '<main><button>Delete</button><button>Save</button></main>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    let clicked = false
    Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save')?.addEventListener('click', () => {
      clicked = true
    })

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_old', frameRef: 'f0', ref: '@r_save' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'click', ref: '@r_save' } })
    expect(clicked).toBe(true)
  })

  it('returns REF_STALE instead of clicking when live candidates are semantically ambiguous', async () => {
    document.body.innerHTML = '<main><button>Save</button><button>Save</button></main>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({})], 1000)

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_1', frameRef: 'f0', ref: '@r_save' }, store, 1001)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('REF_STALE')
  })

  it('returns ELEMENT_DISABLED for disabled resolved targets', async () => {
    document.body.innerHTML = '<main><button disabled>Save</button></main>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [record({ states: { ...states, disabled: true } })], 1000)

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_1', frameRef: 'f0', ref: '@r_save' }, store, 1001)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ELEMENT_DISABLED')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- actions.test.ts
```

Expected: FAIL because current actions resolve only through selector candidates and do not call `getLatestRecord` or semantic rematch.

- [ ] **Step 3: Replace action implementation**

Replace `packages/chrome-extension/src/content/actions.ts` with:

```ts
import { errorEnvelope, okEnvelope, refStaleError, type CliEnvelope, type ElementRefRecord } from '@tabbridge/shared'
import { fingerprintElement } from './element-fingerprint'
import { findBestLiveMatch } from './identity-matcher'
import type { RefStore } from './ref-store'

export type RefActionInput = {
  command: 'click' | 'type' | 'clear' | 'select' | 'check' | 'uncheck' | 'focus'
  tabId: number
  snapshotId: string
  frameRef: string
  ref: string
  text?: string
  value?: string
}

export type ActionResult = {
  action: string
  ref: string
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
  '[role="combobox"]',
  '[role="dialog"]',
  'dialog',
  '[aria-modal="true"]',
  '[onclick]',
].join(',')

function liveCandidates(): Element[] {
  return Array.from(document.querySelectorAll(INTERACTABLE_SELECTOR))
}

function resolveLiveElement(record: ElementRefRecord): Element | undefined {
  const candidates = liveCandidates().map((element) => ({ element, fingerprint: fingerprintElement(element) }))
  const match = findBestLiveMatch(record, candidates)
  return match.kind === 'matched' ? match.element : undefined
}

function visibleAndEnabled(element: Element): CliEnvelope<undefined> | undefined {
  const html = element as HTMLElement
  const style = window.getComputedStyle(html)
  if (style.display === 'none' || style.visibility === 'hidden' || element.hasAttribute('hidden')) {
    return errorEnvelope({ code: 'ELEMENT_NOT_VISIBLE', message: 'The target element is not visible.', recoverable: true })
  }
  if ('disabled' in html && Boolean((html as HTMLButtonElement).disabled)) {
    return errorEnvelope({ code: 'ELEMENT_DISABLED', message: 'The target element is disabled.', recoverable: true })
  }
  if (element.getAttribute('aria-disabled') === 'true') {
    return errorEnvelope({ code: 'ELEMENT_DISABLED', message: 'The target element is disabled.', recoverable: true })
  }
  return undefined
}

function recordFor(input: RefActionInput, store: RefStore, now: number): ElementRefRecord | undefined {
  return store.getLatestRecord(input.tabId, input.frameRef, input.ref, now) ?? store.getRecord(input.snapshotId, input.frameRef, input.ref, now)
}

export async function executeRefAction(input: RefActionInput, store: RefStore, now: number): Promise<CliEnvelope<ActionResult>> {
  const record = recordFor(input, store, now)
  if (!record) return errorEnvelope(refStaleError(input.tabId))

  const element = resolveLiveElement(record)
  if (!element) return errorEnvelope(refStaleError(input.tabId))

  const invalid = visibleAndEnabled(element)
  if (invalid) return invalid as CliEnvelope<ActionResult>

  if (input.command === 'click') {
    ;(element as HTMLElement).click()
  } else if (input.command === 'focus') {
    ;(element as HTMLElement).focus()
  } else if (input.command === 'clear') {
    ;(element as HTMLInputElement).value = ''
    element.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (input.command === 'type') {
    ;(element as HTMLInputElement).value = `${(element as HTMLInputElement).value ?? ''}${input.text ?? ''}`
    element.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (input.command === 'select') {
    ;(element as HTMLSelectElement).value = input.value ?? ''
    element.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (input.command === 'check') {
    ;(element as HTMLInputElement).checked = true
    element.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (input.command === 'uncheck') {
    ;(element as HTMLInputElement).checked = false
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return okEnvelope({ action: input.command, ref: input.ref })
}
```

- [ ] **Step 4: Replace selector-based HTML lookup in content entrypoint**

In `packages/chrome-extension/src/entrypoints/content.ts`, replace the current `tabbridge.html` block with a stale-safe response until semantic HTML lookup gets its own feature design:

```ts
if (message?.type === 'tabbridge.html') {
  sendResponse(errorEnvelope(refStaleError(message.tabId)))
  return true
}
```

This removes selector-based lookup from the current identity system. It intentionally disables ref-based HTML reads rather than guessing a DOM element. A future task can add semantic HTML lookup with the same rematch rules used by actions.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- actions.test.ts
```

Expected: PASS with semantic action resolution tests passing.

- [ ] **Step 6: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/chrome-extension/src/content/actions.ts packages/chrome-extension/test/actions.test.ts packages/chrome-extension/src/entrypoints/content.ts
git commit -m "feat(extension): resolve actions by stable identity"
```

---

### Task 9: Full Integration Verification and Compatibility Cleanup

**Files:**
- Modify if needed: `packages/shared/test/snapshot.test.ts`
- Modify if needed: `packages/chrome-extension/test/bounded-read.test.ts`
- Modify if needed: test fixtures that construct `ElementRefRecord`
- No production file should be changed in this task unless a verification failure identifies a concrete compile or test issue.

**Interfaces:**
- Consumes: all outputs from Tasks 1-8.
- Produces: fully passing package tests and typechecks.

- [ ] **Step 1: Run chrome-extension tests**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
```

Expected: PASS. If a test fixture fails because it constructs an old `ElementRefRecord`, update the fixture to include:

```ts
identityHash: 'test-hash',
accessibleName: 'Test name',
name: 'Test name',
domSignature: 'main/button',
keyAttributes: {},
states: { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false },
boundingBox: [0, 0, 100, 40],
selectorCandidates: [],
xpathCandidates: [],
```

- [ ] **Step 2: Run shared tests**

Run:

```bash
pnpm --filter @tabbridge/shared test
```

Expected: PASS. If a shared snapshot fixture expects `SnapshotElement` without `accessibleName` or `identityHash`, update the fixture to include:

```ts
accessibleName: 'Test name',
identityHash: 'test-hash',
```

- [ ] **Step 3: Run workspace typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run workspace tests**

Run:

```bash
pnpm test
```

Expected: PASS with all workspace tests passing.

- [ ] **Step 5: Search for forbidden index refs and selector/xpath action reliance**

Run:

```bash
grep -R "displayRef(\`e\|selectorCandidates.map\|xpathCandidates.map\|document.querySelector(selector" -n packages/chrome-extension/src packages/shared/src || true
```

Expected: no output. If output references test-only compatibility fixtures, leave tests unchanged; if output references production action or identity code, remove that dependency and rerun the specific failing tests before rerunning `pnpm test`.

- [ ] **Step 6: Review git diff**

Run:

```bash
git diff --stat
git diff -- packages/shared/src/snapshot.ts packages/chrome-extension/src/content packages/chrome-extension/src/entrypoints/content.ts
```

Expected: diff shows semantic modules, dual RefStore, stable snapshot extraction, and action semantic rematch. Diff must not show selector/xpath enhancement logic.

- [ ] **Step 7: Commit**

If commits are authorized for this execution session, run:

```bash
git add packages/shared/src/snapshot.ts packages/shared/test packages/chrome-extension/src packages/chrome-extension/test docs/superpowers/specs/2026-06-26-tabbridge-stable-ui-identity-layer-design.md docs/superpowers/plans/2026-06-26-tabbridge-stable-ui-identity-layer.md
git commit -m "feat(extension): add stable UI identity layer"
```

---

## Self-Review

### Spec coverage

- AccessibleNameResolver is covered by Task 1.
- RoleNormalizer is covered by Task 2.
- State Model and shared snapshot structure are covered by Task 3.
- Stable Ref Generator and ElementFingerprint are covered by Task 4.
- Cross-Snapshot Matching Engine is covered by Task 5.
- Dual RefStore is covered by Task 6.
- Snapshot structure upgrade is covered by Task 7.
- Action ref resolution logic is covered by Task 8.
- Full tests, typecheck, and forbidden selector/xpath reliance scan are covered by Task 9.

### Placeholder scan

This plan contains no placeholder markers or incomplete code blocks. Every created module has concrete code and every test step has a concrete command with expected output.

### Type consistency

- `ElementState` lives in `@tabbridge/shared` so `ElementRefRecord.states` can use it without cross-package reverse dependencies.
- `element-state.ts` re-exports `ElementState` for chrome-extension modules.
- `ElementFingerprint.states` and `ElementRefRecord.states` use the same `ElementState` shape.
- `ref` values are produced as `@r_<12 hex chars>` by `createStableRef` and normalized by existing `normalizeRef`.
- `snapshotId` remains in `RefActionInput` and `ElementRefRecord` for backward compatibility but latest lookup is preferred in actions.
