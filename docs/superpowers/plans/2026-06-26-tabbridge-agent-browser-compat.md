# TabBridge Agent-Browser-Compatible vNext Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert TabBridge's default user-facing workflow to an agent-browser-style current-tab session with interactive `snapshot -i`, volatile `@eN` refs, and direct `click @eN` / `fill @eN` commands.

**Architecture:** The Chrome extension background owns the default session and resolves commands against the current session tab. The content script owns the latest per-tab interactive ref map and returns compact agent-browser-style snapshot text plus a new JSON ref schema. The CLI becomes a thin parser/renderer for positional refs and session-oriented commands.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, WXT Chrome extension, jsdom tests, existing TabBridge broker JSON-RPC envelope.

## Global Constraints

- This is a breaking vNext migration; do not preserve the old user-facing `--snapshot-id` workflow.
- First version implements interactive snapshots only.
- `tabbridge snapshot` aliases to `tabbridge snapshot -i`.
- Refs are volatile `@eN` values assigned fresh on every snapshot.
- Actions resolve refs from the latest snapshot for the current session tab.
- iframe extraction and iframe action routing are excluded from the first version.
- External stable refs are excluded from the first version.
- Keep authorization behavior: origin changes must still require access before inspection or action.
- Use TDD: write a failing test, verify it fails, implement, verify it passes.

---

## File Structure

### Shared package

- Modify `packages/shared/src/errors.ts`
  - Add `SNAPSHOT_REQUIRED` to `ERROR_CODES`.
  - Add `snapshotRequiredError()`.
  - Update `refStaleError()` to suggest `tabbridge snapshot -i` instead of tab/snapshot-id commands.
- Create `packages/shared/src/agent-snapshot.ts`
  - Define the new user-facing snapshot schema: `AgentSnapshotRef`, `AgentSnapshotPage`, `AgentInteractiveSnapshot`.
  - Define `formatAgentSnapshotText(snapshot)` for agent-browser-style text output.
- Modify `packages/shared/src/index.ts`
  - Export `agent-snapshot.ts`.
- Create `packages/shared/test/agent-snapshot.test.ts`
  - Test text formatting and empty snapshot formatting.
- Modify `packages/shared/test/errors.test.ts`
  - Cover `SNAPSHOT_REQUIRED` and updated `REF_STALE` suggestion.

### CLI package

- Modify `packages/cli/src/cli.ts`
  - Parse `snapshot` and `snapshot -i` as interactive snapshots.
  - Parse positional ref actions: `click @e1`, `fill @e2 "text"`, `type @e2 "text"`, etc.
  - Parse session commands: `connect --current`, `connect --tab 123`, `session`, `disconnect`.
  - Parse `text`, `screenshot [path]`, `reload`, `back`, `forward` without requiring `--tab`.
- Modify `packages/cli/src/main.ts`
  - Hydrate stdin text for both `action.type` and `action.fill` when `textFromStdin` is set.
  - In non-JSON mode, print `data.text` directly when present.
- Modify `packages/cli/test/cli.test.ts`
  - Replace old snapshot-id parser expectations with vNext parser tests.
- Modify `packages/cli/test/main.test.ts`
  - Test stdin hydration for `fill @e1 --text-stdin`.
  - Test non-JSON snapshot text rendering.

### Chrome extension package

- Create `packages/chrome-extension/src/background/session.ts`
  - Store one default current-tab session in extension background memory.
  - Provide `connectSession`, `getSession`, `disconnectSession`, and `clearSessionRefs` helpers.
- Modify `packages/chrome-extension/src/background/commands.ts`
  - Add session commands.
  - Resolve omitted tab IDs from session or current active tab.
  - Route `snapshot` without `snapshotId` and update session latest state.
  - Route ref actions without `snapshotId`.
  - Clear latest refs after navigation commands.
- Modify `packages/chrome-extension/src/entrypoints/content.ts`
  - Return the new interactive snapshot schema and text.
  - Save latest refs by tab.
  - Accept action messages without `snapshotId`.
- Modify `packages/chrome-extension/src/content/snapshot-extractor.ts`
  - Assign volatile refs `@e1`, `@e2`, ... each snapshot.
  - Return new `AgentInteractiveSnapshot` data while still returning `ElementRefRecord[]` for action lookup.
- Modify `packages/chrome-extension/src/content/ref-store.ts`
  - Simplify to latest-per-tab ref lookup.
  - Keep TTL expiry and tab clearing.
- Modify `packages/chrome-extension/src/content/actions.ts`
  - Remove `snapshotId` from action input.
  - Resolve records only from latest ref map.
  - Add `fill` action that replaces the target value.
  - Keep `type` as append.
- Modify extension tests:
  - `packages/chrome-extension/test/snapshot-extractor.test.ts`
  - `packages/chrome-extension/test/ref-store.test.ts`
  - `packages/chrome-extension/test/actions.test.ts`
  - `packages/chrome-extension/test/commands.test.ts`

### Documentation

- Modify `skills/tabbridge/references/cli-reference.md`
  - Replace explicit `--snapshot-id` commands with agent-browser-style commands.
  - Document volatile refs and `snapshot -i` loop.
- Create `docs/superpowers/manual-smoke-tests/2026-06-26-tabbridge-agent-browser-compat.md`
  - Manual current-tab session smoke test script.

---

### Task 1: Add agent-browser snapshot schema and errors in shared package

**Files:**
- Create: `packages/shared/src/agent-snapshot.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/agent-snapshot.test.ts`
- Test: `packages/shared/test/errors.test.ts`

**Interfaces:**
- Produces: `AgentSnapshotRef`, `AgentSnapshotPage`, `AgentInteractiveSnapshot`, `formatAgentSnapshotText(snapshot: AgentInteractiveSnapshot): string`
- Produces: `snapshotRequiredError(): TabBridgeError`
- Updates: `refStaleError(tabId?: number, ref?: string): TabBridgeError`
- Consumes: existing `CliEnvelope`, `TabBridgeError`, and `ERROR_CODES`

- [ ] **Step 1: Write failing shared snapshot formatter tests**

Add `packages/shared/test/agent-snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatAgentSnapshotText, type AgentInteractiveSnapshot } from '../src/agent-snapshot.js'

describe('agent-browser-compatible snapshot formatting', () => {
  it('formats interactive refs as compact agent-browser-style text', () => {
    const snapshot: AgentInteractiveSnapshot = {
      page: { title: 'Example Site - Home', url: 'https://example.com' },
      refs: [
        { ref: '@e1', role: 'button', name: 'Sign In', text: 'Sign In', attributes: {} },
        { ref: '@e2', role: 'input', name: 'Email', text: '', attributes: { type: 'email', placeholder: 'Email' } },
        { ref: '@e3', role: 'button', name: 'Submit', text: 'Submit', attributes: { type: 'submit' } },
      ],
    }

    expect(formatAgentSnapshotText(snapshot)).toBe([
      'Page: Example Site - Home',
      'URL: https://example.com',
      '',
      '@e1 [button] "Sign In"',
      '@e2 [input type="email"] placeholder="Email"',
      '@e3 [button type="submit"] "Submit"',
    ].join('\n'))
  })

  it('formats empty interactive snapshots with a clear empty marker', () => {
    const snapshot: AgentInteractiveSnapshot = {
      page: { title: 'Empty Page', url: 'https://example.com/empty' },
      refs: [],
    }

    expect(formatAgentSnapshotText(snapshot)).toBe([
      'Page: Empty Page',
      'URL: https://example.com/empty',
      '',
      '(No interactive elements found)',
    ].join('\n'))
  })
})
```

- [ ] **Step 2: Update failing shared error tests**

In `packages/shared/test/errors.test.ts`, update the stale-ref expectation and add a snapshot-required test:

```ts
import { describe, expect, it } from 'vitest'
import { ERROR_CODES, refStaleError, snapshotRequiredError } from '../src/errors.js'

describe('TabBridge errors', () => {
  it('includes SNAPSHOT_REQUIRED in the public error code list', () => {
    expect(ERROR_CODES).toContain('SNAPSHOT_REQUIRED')
  })

  it('suggests interactive snapshot when a snapshot is required', () => {
    expect(snapshotRequiredError()).toEqual({
      code: 'SNAPSHOT_REQUIRED',
      message: 'Run tabbridge snapshot -i before using @refs.',
      recoverable: true,
      suggestedCommand: 'tabbridge snapshot -i',
    })
  })

  it('suggests interactive snapshot for stale refs', () => {
    expect(refStaleError(undefined, '@e1')).toEqual({
      code: 'REF_STALE',
      message: 'Ref @e1 is not available in the latest snapshot. Run tabbridge snapshot -i again.',
      recoverable: true,
      suggestedCommand: 'tabbridge snapshot -i',
    })
  })
})
```

If the existing file already has other tests, merge these `it(...)` blocks into the existing `describe` instead of replacing unrelated tests.

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm --filter @tabbridge/shared test -- --runInBand packages/shared/test/agent-snapshot.test.ts packages/shared/test/errors.test.ts
```

Expected: FAIL because `agent-snapshot.js`, `snapshotRequiredError`, and `SNAPSHOT_REQUIRED` do not exist yet.

If Vitest rejects `--runInBand`, run:

```bash
pnpm --filter @tabbridge/shared test -- packages/shared/test/agent-snapshot.test.ts packages/shared/test/errors.test.ts
```

Expected: same missing export failures.

- [ ] **Step 4: Implement `agent-snapshot.ts`**

Create `packages/shared/src/agent-snapshot.ts`:

```ts
export type AgentSnapshotPage = {
  title: string
  url: string
}

export type AgentSnapshotRef = {
  ref: string
  role: string
  name: string
  text: string
  attributes: Record<string, string>
}

export type AgentInteractiveSnapshot = {
  page: AgentSnapshotPage
  refs: AgentSnapshotRef[]
  text?: string
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function formatAttributes(attributes: Record<string, string>): string {
  const entries = Object.entries(attributes).filter(([, value]) => value.length > 0)
  if (entries.length === 0) return ''
  return ` ${entries.map(([key, value]) => `${key}=${quote(value)}`).join(' ')}`
}

function formatRefLine(ref: AgentSnapshotRef): string {
  const label = ref.text || ref.name
  const suffix = label ? ` ${quote(label)}` : ''
  return `${ref.ref} [${ref.role}${formatAttributes(ref.attributes)}]${suffix}`
}

export function formatAgentSnapshotText(snapshot: AgentInteractiveSnapshot): string {
  const lines = [
    `Page: ${snapshot.page.title}`,
    `URL: ${snapshot.page.url}`,
    '',
  ]

  if (snapshot.refs.length === 0) {
    lines.push('(No interactive elements found)')
  } else {
    lines.push(...snapshot.refs.map(formatRefLine))
  }

  return lines.join('\n')
}
```

- [ ] **Step 5: Update shared exports and errors**

Modify `packages/shared/src/index.ts` to include:

```ts
export * from './agent-snapshot.js'
```

Modify `packages/shared/src/errors.ts`:

```ts
export const ERROR_CODES = [
  'EXTENSION_NOT_CONNECTED',
  'BRIDGE_SOCKET_UNAVAILABLE',
  'BRIDGE_REQUEST_TIMEOUT',
  'TAB_NOT_FOUND',
  'TAB_NOT_AUTHORIZED',
  'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
  'HOST_PERMISSION_DENIED',
  'USER_APPROVAL_REQUIRED',
  'APPROVAL_EXPIRED',
  'APPROVAL_TIMEOUT',
  'UNSUPPORTED_PAGE',
  'FRAME_NOT_ACCESSIBLE',
  'FRAME_ORIGIN_NOT_AUTHORIZED',
  'SNAPSHOT_REQUIRED',
  'REF_STALE',
  'ELEMENT_NOT_VISIBLE',
  'ELEMENT_DISABLED',
  'ELEMENT_SCOPE_TOO_LARGE',
  'ACTION_REQUIRES_CONFIRMATION',
  'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
  'USER_DENIED',
  'MESSAGE_TOO_LARGE',
  'PROTOCOL_VERSION_MISMATCH',
  'BROWSER_COMMAND_TIMEOUT',
  'EXTENSION_ID_MISMATCH',
] as const
```

Replace `refStaleError` and add `snapshotRequiredError`:

```ts
export function snapshotRequiredError(): TabBridgeError {
  return {
    code: 'SNAPSHOT_REQUIRED',
    message: 'Run tabbridge snapshot -i before using @refs.',
    recoverable: true,
    suggestedCommand: 'tabbridge snapshot -i',
  }
}

export function refStaleError(_tabId?: number, ref?: string): TabBridgeError {
  const subject = ref ? `Ref ${ref}` : 'The element reference'
  return {
    code: 'REF_STALE',
    message: `${subject} is not available in the latest snapshot. Run tabbridge snapshot -i again.`,
    recoverable: true,
    suggestedCommand: 'tabbridge snapshot -i',
  }
}
```

- [ ] **Step 6: Run shared tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/shared test -- packages/shared/test/agent-snapshot.test.ts packages/shared/test/errors.test.ts
pnpm --filter @tabbridge/shared typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/shared/src/agent-snapshot.ts packages/shared/src/errors.ts packages/shared/src/index.ts packages/shared/test/agent-snapshot.test.ts packages/shared/test/errors.test.ts
git commit -m "feat(shared): add agent-browser snapshot schema"
```

---

### Task 2: Replace CLI parser with agent-browser-style commands

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/cli.test.ts`
- Test: `packages/cli/test/main.test.ts`

**Interfaces:**
- Consumes from Task 1: new `SNAPSHOT_REQUIRED` semantics are routed by later extension tasks.
- Produces parser payloads:
  - `snapshot`: `{ interactive: true }`
  - `session.connect`: `{ current: true }` or `{ tabId: number }`
  - `session.status`: `{}`
  - `session.disconnect`: `{}`
  - ref actions: `{ ref: string, text?: string, value?: string, textFromStdin?: true }`
  - navigation/text/screenshot commands with no required tab ID.

- [ ] **Step 1: Replace CLI parser tests with vNext expectations**

In `packages/cli/test/cli.test.ts`, replace old snapshot-id action tests with these tests while keeping unrelated status/doctor/native-host tests:

```ts
it('parses snapshot and snapshot -i as interactive snapshots', () => {
  expect(parseCli(['snapshot'])).toEqual({
    command: 'snapshot',
    json: false,
    payload: { interactive: true },
  })
  expect(parseCli(['snapshot', '-i', '--json'])).toEqual({
    command: 'snapshot',
    json: true,
    payload: { interactive: true },
  })
})

it('parses positional ref actions without tab or snapshot id', () => {
  expect(parseCli(['click', '@e1', '--json'])).toEqual({
    command: 'action.click',
    json: true,
    payload: { ref: '@e1' },
  })
  expect(parseCli(['fill', '@e2', 'hello'])).toEqual({
    command: 'action.fill',
    json: false,
    payload: { ref: '@e2', text: 'hello' },
  })
  expect(parseCli(['select', '@e3', 'us-east-1'])).toEqual({
    command: 'action.select',
    json: false,
    payload: { ref: '@e3', value: 'us-east-1' },
  })
})

it('parses stdin text for fill and type', () => {
  expect(parseCli(['fill', '@e1', '--text-stdin', '--json'])).toEqual({
    command: 'action.fill',
    json: true,
    payload: { ref: '@e1', textFromStdin: true },
  })
  expect(parseCli(['type', '@e1', '--text-stdin', '--json'])).toEqual({
    command: 'action.type',
    json: true,
    payload: { ref: '@e1', textFromStdin: true },
  })
})

it('parses current-tab session commands', () => {
  expect(parseCli(['connect', '--current', '--json'])).toEqual({
    command: 'session.connect',
    json: true,
    payload: { current: true },
  })
  expect(parseCli(['connect', '--tab', '123'])).toEqual({
    command: 'session.connect',
    json: false,
    payload: { tabId: 123 },
  })
  expect(parseCli(['session'])).toEqual({ command: 'session.status', json: false, payload: {} })
  expect(parseCli(['disconnect'])).toEqual({ command: 'session.disconnect', json: false, payload: {} })
})

it('parses text screenshot and navigation without tab flags', () => {
  expect(parseCli(['text', '--json'])).toEqual({ command: 'text', json: true, payload: {} })
  expect(parseCli(['screenshot', 'page.png'])).toEqual({ command: 'screenshot', json: false, payload: { path: 'page.png' } })
  expect(parseCli(['reload'])).toEqual({ command: 'navigation.reload', json: false, payload: {} })
  expect(parseCli(['back'])).toEqual({ command: 'navigation.back', json: false, payload: {} })
  expect(parseCli(['forward'])).toEqual({ command: 'navigation.forward', json: false, payload: {} })
})

it('rejects ref actions without a positional ref', () => {
  expect(() => parseCli(['click'])).toThrow('click requires a ref like @e1')
  expect(() => parseCli(['fill', '@e1'])).toThrow('fill requires text or --text-stdin')
})
```

Remove the old test named `requires snapshot id for ref-based actions` and the old `type --tab --snapshot-id` parser expectation.

- [ ] **Step 2: Update CLI main tests for stdin hydration and text rendering**

In `packages/cli/test/main.test.ts`, change the stdin hydration test to use `fill @e1 --text-stdin`:

```ts
it('ensures the broker then sends stdin-hydrated fill requests', async () => {
  const stdout = captureWritable()
  const stderr = captureWritable()
  const sentRequests: unknown[] = []
  const sentOptions: unknown[] = []
  const options: RunOptions = {
    argv: ['fill', '@e1', '--text-stdin', '--json'],
    stdin: stringReadable('hello from stdin'),
    stdout: stdout.writable,
    stderr: stderr.writable,
    requestId: () => 'req_stdin',
    ensureBroker: async () => ({ url: 'ws://127.0.0.1:9876', token: 'tok' }),
    sendBrokerRequest: async <TData>(request: JsonRpcRequest, brokerOptions: BrokerClientOptions) => {
      sentRequests.push(request)
      sentOptions.push(brokerOptions)
      return { ok: true, data: { filled: true } as TData }
    },
  }

  const exitCode = await run(options)

  expect(exitCode).toBe(0)
  expect(sentRequests).toEqual([{
    jsonrpc: '2.0',
    id: 'req_stdin',
    method: 'action.fill',
    params: { ref: '@e1', text: 'hello from stdin' },
  }])
  expect(sentOptions).toEqual([{ url: 'ws://127.0.0.1:9876', token: 'tok', timeoutMs: 30000 }])
  expect(stdout.chunks).toEqual(['{"ok":true,"data":{"filled":true}}\n'])
  expect(stderr.chunks).toEqual([])
})
```

Add a non-JSON text rendering test:

```ts
it('prints snapshot text directly in non-json mode', async () => {
  const stdout = captureWritable()
  const stderr = captureWritable()

  const exitCode = await run({
    argv: ['snapshot', '-i'],
    stdout: stdout.writable,
    stderr: stderr.writable,
    requestId: () => 'req_snapshot',
    ensureBroker: async () => ({ url: 'ws://127.0.0.1:9876', token: 'tok' }),
    sendBrokerRequest: async <TData>() => ({
      ok: true,
      data: { text: 'Page: Example\nURL: https://example.com\n\n@e1 [button] "Sign In"' } as TData,
    }),
  })

  expect(exitCode).toBe(0)
  expect(stdout.chunks).toEqual(['Page: Example\nURL: https://example.com\n\n@e1 [button] "Sign In"\n'])
  expect(stderr.chunks).toEqual([])
})
```

- [ ] **Step 3: Run CLI tests and verify they fail**

Run:

```bash
pnpm --filter @tabbridge/cli test -- packages/cli/test/cli.test.ts packages/cli/test/main.test.ts
```

Expected: FAIL because the parser still requires `--tab` and `--snapshot-id`, does not parse `fill`, and non-JSON rendering still prints JSON.

- [ ] **Step 4: Update `parseCli` for vNext syntax**

Modify `packages/cli/src/cli.ts` so the relevant branches read like this:

```ts
function readPositional(argv: string[], index: number): string | undefined {
  const value = argv[index]
  if (!value || value.startsWith('--')) return undefined
  return value
}

function requireRef(argv: string[], command: string): string {
  const ref = readPositional(argv, 1)
  if (!ref) throw new Error(`${command} requires a ref like @e1`)
  return ref
}

function readActionText(argv: string[], command: string): { text?: string; textFromStdin?: true } {
  if (hasFlag(argv, '--text-stdin')) return { textFromStdin: true }
  const text = readPositional(argv, 2) ?? readFlag(argv, '--text')
  if (!text) throw new Error(`${command} requires text or --text-stdin`)
  return { text }
}

export function parseCli(argv: string[]): ParsedCli {
  const json = hasFlag(argv, '--json')
  const [first, second] = argv

  if (first === 'navigate') {
    throw new Error('navigate is not part of the TabBridge MVP command set')
  }

  if (first === 'status') return { command: 'status', json, payload: {} }
  if (first === 'doctor') return { command: 'doctor', json, payload: {} }

  if (first === 'connect') {
    const tabId = readNumberFlag(argv, '--tab')
    if (hasFlag(argv, '--current')) return { command: 'session.connect', json, payload: { current: true } }
    if (tabId !== undefined) return { command: 'session.connect', json, payload: { tabId } }
    throw new Error('connect requires --current or --tab <tabId>')
  }
  if (first === 'session') return { command: 'session.status', json, payload: {} }
  if (first === 'disconnect') return { command: 'session.disconnect', json, payload: {} }

  if (first === 'tabs' && second === 'list') return { command: 'tabs.list', json, payload: {} }
  if (first === 'tabs' && second === 'current') return { command: 'tabs.current', json, payload: {} }
  if (first === 'tabs' && second === 'release') {
    return { command: 'tabs.release', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'tabs release') } }
  }
  if (first === 'tabs' && second === 'request-access') {
    return {
      command: 'tabs.requestAccess',
      json,
      payload: {
        tabId: requireNumberFlag(argv, '--tab', 'tabs request-access'),
        reason: requireStringFlag(argv, '--reason', 'tabs request-access'),
      },
    }
  }

  if (first === 'approvals' && second === 'status') {
    return { command: 'approvals.status', json, payload: { approvalId: requireStringFlag(argv, '--id', 'approvals status') } }
  }
  if (first === 'approvals' && second === 'cancel') {
    return { command: 'approvals.cancel', json, payload: { approvalId: requireStringFlag(argv, '--id', 'approvals cancel') } }
  }
  if (first === 'approvals' && second === 'wait') {
    const timeout = readNumberFlag(argv, '--timeout')
    return { command: 'approvals.wait', json, payload: { approvalId: requireStringFlag(argv, '--id', 'approvals wait'), timeoutMs: timeout } }
  }

  if (first === 'snapshot') return { command: 'snapshot', json, payload: { interactive: true } }
  if (first === 'text') return { command: 'text', json, payload: { maxBytes: readNumberFlag(argv, '--max-bytes') } }
  if (first === 'screenshot') return { command: 'screenshot', json, payload: second && !second.startsWith('--') ? { path: second } : {} }

  const noTextRefActions = new Set(['click', 'clear', 'check', 'uncheck', 'focus'])
  if (first && noTextRefActions.has(first)) {
    return { command: `action.${first}`, json, payload: { ref: requireRef(argv, first) } }
  }

  if (first === 'fill' || first === 'type') {
    return { command: `action.${first}`, json, payload: { ref: requireRef(argv, first), ...readActionText(argv, first) } }
  }

  if (first === 'select') {
    const value = readPositional(argv, 2) ?? readFlag(argv, '--value')
    if (!value) throw new Error('select requires a value')
    return { command: 'action.select', json, payload: { ref: requireRef(argv, 'select'), value } }
  }

  if (first === 'press') return { command: 'action.press', json, payload: { key: requireStringFlag(argv, '--key', 'press') } }
  if (first === 'scroll') return { command: 'action.scroll', json, payload: { dx: readNumberFlag(argv, '--dx') ?? 0, dy: readNumberFlag(argv, '--dy') ?? 0 } }
  if (first === 'click-coordinates') return { command: 'action.clickCoordinates', json, payload: { x: requireNumberFlag(argv, '--x', 'click-coordinates'), y: requireNumberFlag(argv, '--y', 'click-coordinates') } }
  if (first === 'drag-coordinates') return { command: 'action.dragCoordinates', json, payload: { fromX: requireNumberFlag(argv, '--from-x', 'drag-coordinates'), fromY: requireNumberFlag(argv, '--from-y', 'drag-coordinates'), toX: requireNumberFlag(argv, '--to-x', 'drag-coordinates'), toY: requireNumberFlag(argv, '--to-y', 'drag-coordinates') } }

  if (first === 'wait') return { command: 'wait', json, payload: { ms: requireNumberFlag(argv, '--ms', 'wait') } }
  if (first === 'wait-for-text') return { command: 'waitForText', json, payload: { text: requireStringFlag(argv, '--text', 'wait-for-text'), timeoutMs: readNumberFlag(argv, '--timeout') } }
  if (first === 'reload') return { command: 'navigation.reload', json, payload: {} }
  if (first === 'back') return { command: 'navigation.back', json, payload: {} }
  if (first === 'forward') return { command: 'navigation.forward', json, payload: {} }

  throw new Error(`Unknown tabbridge command: ${argv.join(' ')}`)
}
```

Keep the existing helper functions at the top of the file unless replaced by the snippets above.

- [ ] **Step 5: Update stdin hydration and non-JSON rendering**

Modify `packages/cli/src/main.ts`:

```ts
async function hydrateStdinPayload(parsed: ParsedCli, stdin: Readable): Promise<ParsedCli> {
  if ((parsed.command !== 'action.type' && parsed.command !== 'action.fill') || parsed.payload.textFromStdin !== true) return parsed

  const { textFromStdin: _textFromStdin, ...payloadWithoutMarker } = parsed.payload
  return {
    ...parsed,
    payload: {
      ...payloadWithoutMarker,
      text: await readStdin(stdin),
    },
  }
}

function dataText(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const candidate = data as { text?: unknown }
  return typeof candidate.text === 'string' ? candidate.text : undefined
}
```

Then replace the non-JSON success branch with:

```ts
} else if (envelope.ok) {
  const text = dataText(envelope.data)
  stdout.write(text ? `${text}\n` : `${JSON.stringify(envelope.data, null, 2)}\n`)
} else {
```

- [ ] **Step 6: Run CLI tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/cli test -- packages/cli/test/cli.test.ts packages/cli/test/main.test.ts
pnpm --filter @tabbridge/cli typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add packages/cli/src/cli.ts packages/cli/src/main.ts packages/cli/test/cli.test.ts packages/cli/test/main.test.ts
git commit -m "feat(cli): parse agent-browser style commands"
```

---

### Task 3: Implement background current-tab session routing

**Files:**
- Create: `packages/chrome-extension/src/background/session.ts`
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Test: `packages/chrome-extension/test/commands.test.ts`

**Interfaces:**
- Consumes from Task 2: broker commands `session.connect`, `session.status`, `session.disconnect`, sessionless `snapshot`, sessionless ref actions.
- Produces: `getSession(): BrowserSession | undefined`, `connectSession(input): BrowserSession`, `disconnectSession(): void`, `setLatestSnapshot(tabId, snapshotAvailable)`.
- Produces background routing where omitted tab IDs resolve from session or active tab.

- [ ] **Step 1: Add background command tests for session connect/status/disconnect**

In `packages/chrome-extension/test/commands.test.ts`, add:

```ts
it('connects status checks and disconnects the current tab session', async () => {
  const query = vi.fn().mockResolvedValue([{ id: 42, windowId: 7, active: true, title: 'Docs', url: 'https://docs.example.com/page' }])
  vi.stubGlobal('chrome', { tabs: { query } })

  await expect(routeBridgeMethod('session.connect', { current: true })).resolves.toEqual({
    connected: true,
    tabId: 42,
    title: 'Docs',
    url: 'https://docs.example.com/page',
  })
  await expect(routeBridgeMethod('session.status', {})).resolves.toMatchObject({ connected: true, tabId: 42 })
  await expect(routeBridgeMethod('session.disconnect', {})).resolves.toEqual({ disconnected: true })
  await expect(routeBridgeMethod('session.status', {})).resolves.toEqual({ connected: false })
})
```

- [ ] **Step 2: Add background tests for implicit snapshot tab binding and latest ref actions**

Add:

```ts
it('implicitly binds snapshot to the current active tab and sends no snapshot id', async () => {
  setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
  const query = vi.fn().mockResolvedValue([{ id: 42, windowId: 7, active: true, title: 'Docs', url: 'https://docs.example.com/page' }])
  const get = vi.fn().mockResolvedValue({ id: 42, windowId: 7, active: true, title: 'Docs', url: 'https://docs.example.com/page' })
  const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [], text: 'Page: Docs\nURL: https://docs.example.com/page\n\n(No interactive elements found)' } })
  vi.stubGlobal('chrome', { tabs: { query, get, sendMessage } })

  await expect(routeBridgeMethod('snapshot', { interactive: true })).resolves.toMatchObject({
    page: { title: 'Docs', url: 'https://docs.example.com/page' },
    refs: [],
  })
  expect(sendMessage).toHaveBeenCalledWith(42, {
    type: 'tabbridge.snapshot',
    tabId: 42,
    interactive: true,
    includeUrl: true,
  })
})

it('routes ref actions through the current session without snapshot id', async () => {
  setGrants([createSiteGrant({ tabId: 42, origin: 'https://docs.example.com', grantedByUserAt: Date.now() })])
  const query = vi.fn().mockResolvedValue([{ id: 42, windowId: 7, active: true, title: 'Docs', url: 'https://docs.example.com/page' }])
  const get = vi.fn().mockResolvedValue({ id: 42, windowId: 7, active: true, title: 'Docs', url: 'https://docs.example.com/page' })
  const sendMessage = vi.fn()
    .mockResolvedValueOnce({ ok: true, data: { page: { title: 'Docs', url: 'https://docs.example.com/page' }, refs: [{ ref: '@e1', role: 'button', name: 'Save', text: 'Save', attributes: {} }], text: 'Page: Docs\nURL: https://docs.example.com/page\n\n@e1 [button] "Save"' } })
    .mockResolvedValueOnce({ ok: true, data: { action: 'click', ref: '@e1' } })
  vi.stubGlobal('chrome', { tabs: { query, get, sendMessage } })

  await routeBridgeMethod('snapshot', { interactive: true })
  await expect(routeBridgeMethod('action.click', { ref: '@e1' })).resolves.toEqual({ action: 'click', ref: '@e1' })
  expect(sendMessage).toHaveBeenLastCalledWith(42, {
    type: 'tabbridge.action',
    command: 'click',
    tabId: 42,
    frameRef: 'f0',
    ref: '@e1',
    value: undefined,
  })
})
```

- [ ] **Step 3: Run command tests and verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- test/commands.test.ts
```

Expected: FAIL because session commands do not exist and snapshot/action still expect explicit tab/snapshot IDs.

- [ ] **Step 4: Create background session store**

Create `packages/chrome-extension/src/background/session.ts`:

```ts
export type BrowserSession = {
  connected: true
  tabId: number
  title?: string
  url?: string
  latestSnapshotAvailable: boolean
}

let currentSession: BrowserSession | undefined

export function connectSession(input: { tabId: number; title?: string; url?: string }): BrowserSession {
  currentSession = {
    connected: true,
    tabId: input.tabId,
    title: input.title,
    url: input.url,
    latestSnapshotAvailable: false,
  }
  return currentSession
}

export function getSession(): BrowserSession | undefined {
  return currentSession
}

export function markLatestSnapshot(tabId: number, available: boolean): void {
  if (currentSession?.tabId === tabId) {
    currentSession = { ...currentSession, latestSnapshotAvailable: available }
  }
}

export function disconnectSession(): void {
  currentSession = undefined
}

export function clearSessionRefs(tabId: number): void {
  if (currentSession?.tabId === tabId) {
    currentSession = { ...currentSession, latestSnapshotAvailable: false }
  }
}
```

- [ ] **Step 5: Add session resolution helpers in `commands.ts`**

In `packages/chrome-extension/src/background/commands.ts`, import session helpers:

```ts
import { clearSessionRefs, connectSession, disconnectSession, getSession, markLatestSnapshot } from './session'
```

Add helpers near `waitMs`:

```ts
async function currentTabLike(context: CommandContext): Promise<ChromeTabLike | undefined> {
  const tab = await context.currentTab()
  return tab && typeof tab === 'object' ? tab as ChromeTabLike : undefined
}

async function resolveSessionTab(context: CommandContext | undefined): Promise<ChromeTabLike | undefined> {
  if (!context?.getTab || !context.currentTab) return undefined
  const session = getSession()
  if (session) return context.getTab(session.tabId)
  const tab = await currentTabLike(context)
  if (typeof tab?.id === 'number') {
    return connectSession({ tabId: tab.id, title: tab.title, url: tab.url })
  }
  return undefined
}

function tabIdFrom(tab: ChromeTabLike | undefined): number | undefined {
  return typeof tab?.id === 'number' ? tab.id : undefined
}
```

- [ ] **Step 6: Add session command branches in `routeBridgeCommand`**

Add before snapshot handling:

```ts
if (request.command === 'session.connect') {
  const payload = request.payload as { current?: boolean; tabId?: number }
  if (!context?.getTab || !context.currentTab) {
    return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Session tab lookup is not available.', recoverable: false })
  }
  const tab = payload.current ? await currentTabLike(context) : await context.getTab(payload.tabId ?? -1)
  const tabId = tabIdFrom(tab)
  if (tabId === undefined) {
    return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No tab is available for the TabBridge session.', recoverable: true })
  }
  const session = connectSession({ tabId, title: tab?.title, url: tab?.url })
  return okEnvelope({ connected: true, tabId: session.tabId, title: session.title, url: session.url })
}

if (request.command === 'session.status') {
  const session = getSession()
  return okEnvelope(session ? { connected: true, tabId: session.tabId, title: session.title, url: session.url, latestSnapshotAvailable: session.latestSnapshotAvailable } : { connected: false })
}

if (request.command === 'session.disconnect') {
  disconnectSession()
  return okEnvelope({ disconnected: true })
}
```

- [ ] **Step 7: Update snapshot and action routing to resolve session tab**

In the `snapshot` branch, replace payload tab access with resolved tab:

```ts
const payload = request.payload as { interactive?: boolean; includeUrl?: boolean }
const tab = await resolveSessionTab(context)
const tabId = tabIdFrom(tab)
if (tabId === undefined) {
  return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No active tab is available. Open a Chrome tab or run tabbridge connect --tab <tabId>.', recoverable: true })
}
```

Send message:

```ts
const result = await context.sendMessageToTab(tabId, {
  type: 'tabbridge.snapshot',
  tabId,
  interactive: true,
  includeUrl: true,
})
```

After a successful snapshot result, call:

```ts
markLatestSnapshot(tabId, true)
```

In ref action branches, resolve tab from session:

```ts
const payload = request.payload as { ref: string; frameRef?: string; value?: string; text?: string }
const tab = await resolveSessionTab(context)
const tabId = tabIdFrom(tab)
if (tabId === undefined) {
  return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No active tab is available. Run tabbridge snapshot -i first.', recoverable: true })
}
```

Pass action message without `snapshotId`:

```ts
{
  type: 'tabbridge.action',
  command: request.command.replace('action.', ''),
  tabId,
  frameRef: payload.frameRef ?? 'f0',
  ref: payload.ref,
  value: payload.value,
}
```

For `action.type`, send `text`. For `action.fill`, also send `text`.

In navigation branch, resolve tab from session and after successful navigation call:

```ts
clearSessionRefs(tabId)
```

- [ ] **Step 8: Update legacy adapter context**

In `routeBridgeMethod`, always provide `sendMessageToTab`, not only for `method === 'snapshot'`, because action routing now depends on session resolution:

```ts
context.sendMessageToTab = async (tabId: number, message: unknown) => {
  const tab = await context.getTab?.(tabId)
  if (!tab?.url || grantStatusForTab(getGrants(), { tabId, url: tab.url }, Date.now()) !== 'authorized') {
    throw tabNotAuthorizedError(tabId)
  }
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/content.js'] })
    return await chrome.tabs.sendMessage(tabId, message)
  }
}
```

- [ ] **Step 9: Run command tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- test/commands.test.ts
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: PASS for command tests added in this task. Some content/action tests may still fail until later tasks if run globally.

- [ ] **Step 10: Commit Task 3**

```bash
git add packages/chrome-extension/src/background/session.ts packages/chrome-extension/src/background/commands.ts packages/chrome-extension/test/commands.test.ts
git commit -m "feat(extension): add current tab session routing"
```

---

### Task 4: Convert content snapshot extraction to volatile interactive refs

**Files:**
- Modify: `packages/chrome-extension/src/content/snapshot-extractor.ts`
- Modify: `packages/chrome-extension/src/content/ref-store.ts`
- Modify: `packages/chrome-extension/src/entrypoints/content.ts`
- Test: `packages/chrome-extension/test/snapshot-extractor.test.ts`
- Test: `packages/chrome-extension/test/ref-store.test.ts`

**Interfaces:**
- Consumes from Task 1: `AgentInteractiveSnapshot`, `AgentSnapshotRef`, `formatAgentSnapshotText`.
- Produces from extractor: `{ snapshot: AgentInteractiveSnapshot; records: ElementRefRecord[] }` where `snapshot.text` is set and `records[].ref` are volatile refs.
- Produces from ref store: `saveLatest(tabId, records, now)`, `getLatestRecord(tabId, frameRef, ref, now)`, `clearForTab(tabId)`.

- [ ] **Step 1: Replace snapshot extractor tests with volatile ref expectations**

In `packages/chrome-extension/test/snapshot-extractor.test.ts`, replace stable-ref tests with:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractSnapshotFromDocument } from '../src/content/snapshot-extractor'

describe('interactive snapshot extractor', () => {
  it('extracts interactive elements with volatile @eN refs and no input value leakage', () => {
    document.body.innerHTML = '<main><button id="merge">Merge pull request</button><input type="checkbox" aria-label="Confirm" checked><input aria-label="Comment" value="secret typed value" placeholder="Leave a comment"><a href="/settings">Settings</a><span>Plain text</span></main>'

    const result = extractSnapshotFromDocument({
      tabId: 123,
      title: 'GitHub Pull Request',
      url: 'https://github.com/acme/repo/pull/1',
      now: 1782010000000,
    })

    expect(result.snapshot).toMatchObject({
      page: { title: 'GitHub Pull Request', url: 'https://github.com/acme/repo/pull/1' },
      refs: [
        expect.objectContaining({ ref: '@e1', role: 'button', name: 'Merge pull request', text: 'Merge pull request' }),
        expect.objectContaining({ ref: '@e2', role: 'checkbox', name: 'Confirm' }),
        expect.objectContaining({ ref: '@e3', role: 'textbox', name: 'Comment', attributes: { placeholder: 'Leave a comment' } }),
        expect.objectContaining({ ref: '@e4', role: 'link', name: 'Settings', attributes: { href: '/settings' } }),
      ],
    })
    expect(result.snapshot.text).toContain('@e1 [button] "Merge pull request"')
    expect(JSON.stringify(result.snapshot)).not.toContain('secret typed value')
    expect(result.records.map((record) => record.ref)).toEqual(['@e1', '@e2', '@e3', '@e4'])
  })

  it('reassigns refs from @e1 on every snapshot instead of preserving stable refs', () => {
    document.body.innerHTML = '<main><button>Save</button><button>Delete</button></main>'
    const first = extractSnapshotFromDocument({ tabId: 1, title: 'App', url: 'https://example.com', now: 1000 })

    document.body.innerHTML = '<main><button>New banner</button><button>Delete</button><button>Save</button></main>'
    const second = extractSnapshotFromDocument({ tabId: 1, title: 'App', url: 'https://example.com', now: 2000 })

    expect(first.snapshot.refs.map((element) => `${element.ref}:${element.name}`)).toEqual(['@e1:Save', '@e2:Delete'])
    expect(second.snapshot.refs.map((element) => `${element.ref}:${element.name}`)).toEqual(['@e1:New banner', '@e2:Delete', '@e3:Save'])
  })
})
```

- [ ] **Step 2: Replace RefStore tests with latest-only expectations**

In `packages/chrome-extension/test/ref-store.test.ts`, use:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'latest',
    tabId: 1,
    frameRef: 'f0',
    ref: '@e1',
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
  it('stores and replaces the latest refs per tab', () => {
    const store = new RefStore()
    store.saveLatest(1, [record({ ref: '@e1', accessibleName: 'Save', name: 'Save' })], 1000)
    expect(store.getLatestRecord(1, 'f0', '@e1', 1001)?.accessibleName).toBe('Save')

    store.saveLatest(1, [record({ ref: '@e1', accessibleName: 'Delete', name: 'Delete' })], 2000)
    expect(store.getLatestRecord(1, 'f0', '@e1', 2001)?.accessibleName).toBe('Delete')
  })

  it('expires latest records after TTL', () => {
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)
    expect(store.getLatestRecord(1, 'f0', '@e1', 62001)).toBeUndefined()
  })

  it('clears latest refs for a tab', () => {
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)
    store.clearForTab(1)
    expect(store.getLatestRecord(1, 'f0', '@e1', 1001)).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run snapshot/ref tests and verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- test/snapshot-extractor.test.ts test/ref-store.test.ts
```

Expected: FAIL because extractor still requires `snapshotId`, returns old `PageSnapshot`, and `RefStore.saveLatest` does not exist.

- [ ] **Step 4: Update extractor input/output and volatile ref assignment**

Modify `packages/chrome-extension/src/content/snapshot-extractor.ts` imports:

```ts
import { displayRef, formatAgentSnapshotText, type AgentInteractiveSnapshot, type AgentSnapshotRef, type ElementRefRecord, type Rect } from '@tabbridge/shared'
```

Change `ExtractSnapshotInput` and result:

```ts
export type ExtractSnapshotInput = {
  tabId: number
  title: string
  url: string
  now: number
}

export type ExtractSnapshotResult = {
  snapshot: AgentInteractiveSnapshot
  records: ElementRefRecord[]
}
```

Add helper functions:

```ts
function refForIndex(index: number): string {
  return `@e${index + 1}`
}

function attributesFor(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {}
  const type = element.getAttribute('type')
  const placeholder = element.getAttribute('placeholder')
  const href = element.getAttribute('href')
  const ariaLabel = element.getAttribute('aria-label')
  if (type) attributes.type = type
  if (placeholder) attributes.placeholder = placeholder
  if (href) attributes.href = href
  if (ariaLabel) attributes['aria-label'] = ariaLabel
  return attributes
}
```

Inside the element loop, replace stable ref allocation with:

```ts
const ref = refForIndex(records.length)
```

Build `snapshotRefs` rather than `tree`:

```ts
const refs: AgentSnapshotRef[] = []
```

Push refs:

```ts
refs.push({
  ref,
  role: fingerprint.role,
  name: fingerprint.accessibleName,
  text,
  attributes: attributesFor(element),
})
```

Build records with volatile ref and a synthetic snapshot ID:

```ts
const record: ElementRefRecord = {
  snapshotId: 'latest',
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
  states,
  boundingBox: box,
  selectorCandidates: [],
  xpathCandidates: [],
  generatedAt: input.now,
}
```

At the end:

```ts
const snapshotBase: AgentInteractiveSnapshot = {
  page: {
    title: input.title,
    url: input.url,
  },
  refs,
}

const snapshot: AgentInteractiveSnapshot = {
  ...snapshotBase,
  text: formatAgentSnapshotText(snapshotBase),
}

return { snapshot, records }
```

Remove unused stable-ref imports and `previousRecords` logic.

- [ ] **Step 5: Simplify RefStore to latest-only**

Replace `packages/chrome-extension/src/content/ref-store.ts` with:

```ts
import { SNAPSHOT_TTL_MS, normalizeRef, type ElementRefRecord } from '@tabbridge/shared'

function keyFor(tabId: number, frameRef: string, ref: string): string {
  return `${tabId}:${frameRef}:${normalizeRef(ref)}`
}

function isFresh(record: ElementRefRecord, now: number): boolean {
  return now - record.generatedAt <= SNAPSHOT_TTL_MS
}

export class RefStore {
  private latestRecordByRef = new Map<string, ElementRefRecord>()

  saveLatest(tabId: number, records: ElementRefRecord[], now: number): void {
    this.clearForTab(tabId)
    for (const record of records) {
      const stamped = { ...record, generatedAt: record.generatedAt || now }
      this.latestRecordByRef.set(keyFor(tabId, stamped.frameRef, stamped.ref), stamped)
    }
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

  clearForTab(tabId: number): void {
    for (const [key, record] of this.latestRecordByRef.entries()) {
      if (record.tabId === tabId) this.latestRecordByRef.delete(key)
    }
  }
}
```

- [ ] **Step 6: Update content snapshot listener to use new extractor/store**

In `packages/chrome-extension/src/entrypoints/content.ts`, update snapshot extraction:

```ts
const result = extractSnapshotFromDocument({
  tabId: message.tabId,
  title: document.title,
  url: window.location.href,
  now,
})
refStore.saveLatest(message.tabId, result.records, now)
sendResponse({ ok: true, data: result.snapshot })
```

Update HTML lookup to latest-only:

```ts
const record = refStore.getLatestRecord(message.tabId, message.frameRef ?? 'f0', message.ref, now)
```

- [ ] **Step 7: Run snapshot/ref tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- test/snapshot-extractor.test.ts test/ref-store.test.ts
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add packages/chrome-extension/src/content/snapshot-extractor.ts packages/chrome-extension/src/content/ref-store.ts packages/chrome-extension/src/entrypoints/content.ts packages/chrome-extension/test/snapshot-extractor.test.ts packages/chrome-extension/test/ref-store.test.ts
git commit -m "feat(extension): emit volatile interactive snapshots"
```

---

### Task 5: Update ref actions to latest-only and add fill semantics

**Files:**
- Modify: `packages/chrome-extension/src/content/actions.ts`
- Modify: `packages/chrome-extension/src/entrypoints/content.ts`
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Test: `packages/chrome-extension/test/actions.test.ts`
- Test: `packages/chrome-extension/test/commands.test.ts`

**Interfaces:**
- Consumes from Task 4: `RefStore.saveLatest` and `getLatestRecord`.
- Produces: `executeRefAction(input: RefActionInput, store: RefStore, now: number)` where `RefActionInput.command` includes `'fill'` and no `snapshotId`.
- Produces: action result `{ action: string; ref: string }`.

- [ ] **Step 1: Replace action tests with latest-only fill/type/click expectations**

In `packages/chrome-extension/test/actions.test.ts`, use:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { RefStore } from '../src/content/ref-store'
import { executeRefAction } from '../src/content/actions'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'latest',
    tabId: 1,
    frameRef: 'f0',
    ref: '@e1',
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

describe('latest-ref actions', () => {
  it('returns SNAPSHOT_REQUIRED when no latest record exists', async () => {
    const store = new RefStore()
    const result = await executeRefAction({ command: 'click', tabId: 1, frameRef: 'f0', ref: '@e1' }, store, 1000)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SNAPSHOT_REQUIRED')
  })

  it('clicks using the latest ref identity after DOM reorder', async () => {
    document.body.innerHTML = '<main><button>Delete</button><button>Save</button></main>'
    const store = new RefStore()
    store.saveLatest(1, [record({})], 1000)

    let clicked = false
    Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save')?.addEventListener('click', () => {
      clicked = true
    })

    const result = await executeRefAction({ command: 'click', tabId: 1, frameRef: 'f0', ref: '@e1' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'click', ref: '@e1' } })
    expect(clicked).toBe(true)
  })

  it('fills by replacing the current input value', async () => {
    document.body.innerHTML = '<main><input aria-label="Comment" value="old"></main>'
    const store = new RefStore()
    store.saveLatest(1, [record({ role: 'textbox', accessibleName: 'Comment', name: 'Comment', textFingerprint: '', domSignature: 'main/input' })], 1000)

    const input = document.querySelector('input') as HTMLInputElement
    const result = await executeRefAction({ command: 'fill', tabId: 1, frameRef: 'f0', ref: '@e1', text: 'new value' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'fill', ref: '@e1' } })
    expect(input.value).toBe('new value')
  })

  it('types by appending to the current input value', async () => {
    document.body.innerHTML = '<main><input aria-label="Comment" value="old"></main>'
    const store = new RefStore()
    store.saveLatest(1, [record({ role: 'textbox', accessibleName: 'Comment', name: 'Comment', textFingerprint: '', domSignature: 'main/input' })], 1000)

    const input = document.querySelector('input') as HTMLInputElement
    const result = await executeRefAction({ command: 'type', tabId: 1, frameRef: 'f0', ref: '@e1', text: ' plus' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'type', ref: '@e1' } })
    expect(input.value).toBe('old plus')
  })
})
```

- [ ] **Step 2: Run action tests and verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- test/actions.test.ts
```

Expected: FAIL because `snapshotId` is still required and `fill` is not implemented.

- [ ] **Step 3: Update action input and record resolution**

In `packages/chrome-extension/src/content/actions.ts`, update types:

```ts
export type RefActionInput = {
  command: 'click' | 'fill' | 'type' | 'clear' | 'select' | 'check' | 'uncheck' | 'focus'
  tabId: number
  frameRef: string
  ref: string
  text?: string
  value?: string
}
```

Update imports:

```ts
import { errorEnvelope, okEnvelope, refStaleError, snapshotRequiredError, type CliEnvelope, type ElementRefRecord } from '@tabbridge/shared'
```

Replace `recordFor`:

```ts
function recordFor(input: RefActionInput, store: RefStore, now: number): ElementRefRecord | undefined {
  return store.getLatestRecord(input.tabId, input.frameRef, input.ref, now)
}
```

Update missing-record handling:

```ts
const record = recordFor(input, store, now)
if (!record) return errorEnvelope(snapshotRequiredError())

const element = resolveLiveElement(record)
if (!element) return errorEnvelope(refStaleError(input.tabId, input.ref))
```

Add `fill` before `type`:

```ts
} else if (input.command === 'fill') {
  ;(element as HTMLInputElement).value = input.text ?? ''
  element.dispatchEvent(new Event('input', { bubbles: true }))
} else if (input.command === 'type') {
```

- [ ] **Step 4: Update content action listener**

In `packages/chrome-extension/src/entrypoints/content.ts`, update action call to remove `snapshotId`:

```ts
executeRefAction({
  command: message.command,
  tabId: message.tabId,
  frameRef: message.frameRef ?? 'f0',
  ref: message.ref,
  text: message.text,
  value: message.value,
}, refStore, Date.now()).then(sendResponse)
```

- [ ] **Step 5: Update background ref action command set for fill**

In `packages/chrome-extension/src/background/commands.ts`, include `action.fill` in ref/text action routing. The no-text action set remains:

```ts
const refActions = new Set(['action.click', 'action.clear', 'action.select', 'action.check', 'action.uncheck', 'action.focus'])
```

Handle fill with type:

```ts
if (request.command === 'action.type' || request.command === 'action.fill') {
  const payload = request.payload as { ref: string; frameRef?: string; text?: string }
  const tab = await resolveSessionTab(context)
  const tabId = tabIdFrom(tab)
  if (tabId === undefined) {
    return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No active tab is available. Run tabbridge snapshot -i first.', recoverable: true })
  }
  return runActionOnTab(tabId, context, {
    type: 'tabbridge.action',
    command: request.command.replace('action.', ''),
    tabId,
    frameRef: payload.frameRef ?? 'f0',
    ref: payload.ref,
    text: payload.text,
  })
}
```

- [ ] **Step 6: Run action and command tests**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- test/actions.test.ts test/commands.test.ts
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add packages/chrome-extension/src/content/actions.ts packages/chrome-extension/src/entrypoints/content.ts packages/chrome-extension/src/background/commands.ts packages/chrome-extension/test/actions.test.ts packages/chrome-extension/test/commands.test.ts
git commit -m "feat(extension): resolve actions from latest refs"
```

---

### Task 6: Update docs and smoke tests for vNext CLI

**Files:**
- Modify: `skills/tabbridge/references/cli-reference.md`
- Create: `docs/superpowers/manual-smoke-tests/2026-06-26-tabbridge-agent-browser-compat.md`

**Interfaces:**
- Consumes from Tasks 1-5: final CLI syntax and error semantics.
- Produces: user-facing reference that no longer teaches `--snapshot-id`.

- [ ] **Step 1: Replace CLI reference with vNext workflow**

Write `skills/tabbridge/references/cli-reference.md` with:

```md
# TabBridge CLI Reference

TabBridge vNext uses an agent-browser-style current-tab workflow. The normal loop is:

```bash
tabbridge snapshot -i
tabbridge click @e1
tabbridge snapshot -i
tabbridge fill @e2 "hello"
```

Refs are volatile. Every snapshot assigns refs from `@e1` upward. Refs belong to the latest snapshot for the current session tab. After navigation, reload, back, forward, form submission, or dynamic page changes, run `tabbridge snapshot -i` again before using refs.

## Output Envelope

Use `--json` when programmatic parsing is needed.

Success:

```json
{"ok":true,"data":{"text":"Page: Example\nURL: https://example.com\n\n@e1 [button] \"Sign In\""}}
```

Failure:

```json
{"ok":false,"error":{"code":"SNAPSHOT_REQUIRED","message":"Run tabbridge snapshot -i before using @refs.","recoverable":true,"suggestedCommand":"tabbridge snapshot -i"}}
```

## Session

```bash
tabbridge connect --current
tabbridge connect --tab <tabId>
tabbridge session
tabbridge disconnect
```

If no explicit session exists, `tabbridge snapshot -i` binds to the current active Chrome tab.

## Discovery

```bash
tabbridge tabs list --json
tabbridge tabs current --json
```

Discovery output includes `tabId`, `windowId`, `title`, `domain`, `active`, and `accessStatus`.

## Access

```bash
tabbridge tabs request-access --tab <tabId> --reason "<reason>" --json
tabbridge approvals wait --id <approvalId> --timeout 30000 --json
tabbridge tabs release --tab <tabId> --json
```

## Snapshot and Reading

```bash
tabbridge snapshot -i
tabbridge snapshot
tabbridge snapshot -i --json
tabbridge text
tabbridge text --max-bytes 131072 --json
tabbridge screenshot
tabbridge screenshot page.png
```

`tabbridge snapshot` is an alias for the interactive snapshot behavior in the first vNext version.

## Actions

```bash
tabbridge click @e1
tabbridge fill @e2 "hello"
tabbridge type @e2 " more text"
tabbridge clear @e2
tabbridge select @e3 "value"
tabbridge check @e4
tabbridge uncheck @e4
tabbridge focus @e5
```

`fill` replaces the current value. `type` appends to the current value.

## Wait and Navigation

```bash
tabbridge wait --ms 500
tabbridge wait-for-text --text "Done" --timeout 30000
TabBridge reload
tabbridge back
tabbridge forward
```

After reload, back, or forward, discard old refs and run `tabbridge snapshot -i` again.

## First-Version Limitations

- iframe content is not included.
- Full accessibility snapshots are not implemented.
- Stable external refs are not exposed.
- Multiple named sessions are not implemented.
```

Correct the accidental capitalized `TabBridge reload` line to `tabbridge reload` before saving.

- [ ] **Step 2: Add manual smoke test document**

Create `docs/superpowers/manual-smoke-tests/2026-06-26-tabbridge-agent-browser-compat.md`:

```md
# TabBridge Agent-Browser-Compatible vNext Smoke Test

Date: 2026-06-26

## Preconditions

- Chrome is running.
- TabBridge extension is installed and connected.
- A normal HTTP or HTTPS tab is active.
- The active tab has at least one visible interactive element.

## Test 1: Interactive snapshot binds the active tab

Run:

```bash
tabbridge snapshot -i
```

Expected:

```text
Page: <page title>
URL: <current url>

@e1 [...]
```

## Test 2: Ref action uses latest snapshot

Choose a harmless visible ref from Test 1, then run:

```bash
tabbridge focus @e1
```

Expected: command succeeds, or returns a recoverable visibility/disabled error for the selected element.

## Test 3: Fill replaces input value

Open a page with a text input, run:

```bash
tabbridge snapshot -i
tabbridge fill @eN "hello"
```

Expected: the input value becomes exactly `hello`.

## Test 4: Type appends input value

Run:

```bash
tabbridge type @eN " world"
```

Expected: the input value becomes `hello world`.

## Test 5: Navigation clears refs

Run:

```bash
tabbridge reload
tabbridge click @e1 --json
```

Expected: `REF_STALE` or `SNAPSHOT_REQUIRED` with `suggestedCommand: "tabbridge snapshot -i"`.

Then run:

```bash
tabbridge snapshot -i
```

Expected: fresh `@eN` refs are printed.
```

- [ ] **Step 3: Run doc scan**

Run:

```bash
rg -n "snapshot-id|--snapshot-id|snap_abc|TabBridge reload|TB[D]|TO[D]O" skills/tabbridge/references/cli-reference.md docs/superpowers/manual-smoke-tests/2026-06-26-tabbridge-agent-browser-compat.md
```

Expected: no output.

- [ ] **Step 4: Commit Task 6**

```bash
git add skills/tabbridge/references/cli-reference.md docs/superpowers/manual-smoke-tests/2026-06-26-tabbridge-agent-browser-compat.md
git commit -m "docs: document agent-browser compatible tabbridge cli"
```

---

### Task 7: Run full verification and remove stale stable-ref surface area

**Files:**
- Modify as needed: `packages/chrome-extension/test/stable-ref.test.ts`
- Modify as needed: `packages/chrome-extension/src/content/stable-ref.ts`
- Modify as needed: `packages/chrome-extension/src/content/identity-matcher.ts`
- Modify as needed: `packages/chrome-extension/test/identity-matcher.test.ts`
- Verify: full workspace tests and typechecks

**Interfaces:**
- Consumes all prior tasks.
- Produces a clean workspace with no test expectations for external stable refs in the default vNext workflow.

- [ ] **Step 1: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS. If tests fail only because they assert old external stable refs, update or remove those tests as described in the next steps.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If type errors reference removed `snapshotId` payloads or `saveSnapshot`, update those call sites to use latest-ref APIs from Tasks 3-5.

- [ ] **Step 3: Decide whether stable-ref internals are still imported**

Run:

```bash
rg -n "createStableRef|stable-ref|matchElementIdentity|previousRecords|saveSnapshot|getRecord\(" packages/chrome-extension packages/shared packages/cli
```

Expected after Tasks 1-6:

- No production imports of `createStableRef` from `snapshot-extractor.ts`.
- No production calls to `RefStore.saveSnapshot`.
- No production calls to `RefStore.getRecord`.
- `identity-matcher.ts` may remain if `actions.ts` still uses it for live DOM matching.

- [ ] **Step 4: Remove or quarantine stale stable-ref tests**

If `packages/chrome-extension/test/stable-ref.test.ts` only tests old external stable refs and no production file imports `stable-ref.ts`, delete both files:

```bash
git rm packages/chrome-extension/src/content/stable-ref.ts packages/chrome-extension/test/stable-ref.test.ts
```

If another production file still imports `stable-ref.ts`, keep the source file and update the test name to make the internal-only purpose explicit:

```ts
describe('internal element identity helpers', () => {
  it('creates deterministic hashes for internal matching only', () => {
    // keep existing deterministic hash expectation here
  })
})
```

Do not expose stable refs in snapshot output.

- [ ] **Step 5: Re-run verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: PASS for all commands.

- [ ] **Step 6: Commit Task 7**

```bash
git add packages/chrome-extension packages/shared packages/cli skills/tabbridge docs/superpowers
git commit -m "test: verify agent-browser compatible tabbridge migration"
```

---

## Self-Review

### Spec coverage

- Breaking vNext migration: covered by Tasks 2, 3, 6, and 7.
- `snapshot -i` and `snapshot` alias: covered by Tasks 2 and 4.
- Default active-tab session: covered by Task 3.
- Latest snapshot ref basis: covered by Tasks 3, 4, and 5.
- Volatile `@eN` refs: covered by Task 4.
- Interactive snapshot only: covered by Tasks 4 and 6.
- iframe excluded: covered by Task 6 docs and Task 4 extractor scope.
- No external stable refs: covered by Tasks 4 and 7.
- JSON schema changes: covered by Tasks 1, 4, and 6.
- Fill/type semantics: covered by Tasks 2 and 5.
- Navigation clears refs: covered by Task 3 and Task 6 smoke test.

### Placeholder scan

This plan intentionally contains no placeholder markers or open-ended implementation instructions. Every task includes exact files, tests, commands, and code snippets.

### Type consistency

- The plan consistently uses `AgentInteractiveSnapshot`, `AgentSnapshotRef`, and `formatAgentSnapshotText` from `@tabbridge/shared`.
- CLI parser commands match background command names: `session.connect`, `session.status`, `session.disconnect`, `action.fill`, `action.type`, `snapshot`.
- Ref action payloads consistently use `{ ref, frameRef?, text?, value? }` without `snapshotId`.
- `RefStore` consistently exposes `saveLatest`, `getLatestRecord`, and `clearForTab`.
