# TabBridge CLI + Skill MVP Implementation Plan

> ⚠️ **传输层已变更**：本 plan 原定的 **Chrome Native Messaging + `packages/native-host` + Unix domain socket** 架构已在 2026-06-22 被 **WebSocket broker** 取代。当前实现计划与代码现状以 [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) 为准。>
> 本 plan 中 Task 3（Native Messaging bridge）、Task 4（native host install/doctor）已作废；Task 5 及以后的业务功能任务（tabs、snapshot、action、UI、skill）仍可作为后续开发参考，但所有涉及 `native-host`、`native-port`、`ipc-client`、`native-manifest`、`install-native-host`、`NATIVE_HOST_NOT_CONNECTED` 的描述和文件路径都应替换为 WebSocket broker 等价物。执行任务前请先阅读 WebSocket plan 并核对当前代码。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the macOS Chrome/Chromium MVP of TabBridge: a local-first `tabbridge` CLI, local WebSocket broker, WXT Vue Chrome extension, shared protocol package, and official Claude Code skill for safe agent control of already-open user tabs.

**Architecture:** Use a pnpm TypeScript monorepo with `packages/shared` defining protocol contracts used by every package. The CLI starts a local WebSocket broker (`tabbridge broker`) on demand; the Chrome extension connects to the broker as a WebSocket client. Short-lived CLI commands connect to the broker over WebSocket and speak JSON-RPC 2.0. The extension enforces tab/site grants, approval state, semantic snapshots, ref-bound actions, high-risk confirmations, privacy redaction, and Chrome permission boundaries.

**Tech Stack:** pnpm 10.x workspaces, Node.js 20+, TypeScript, Vitest, tsup, WXT, Vue 3 Composition API with `<script setup>`, Vite, TailwindCSS, Chrome MV3 APIs, local WebSocket broker (`ws`).

## Global Constraints

- MVP supports only macOS + Chrome/Chromium.
- CLI executable name is `tabbridge`.
- Chrome extension name is `TabBridge`.
- Local WebSocket broker command is `tabbridge broker` (started on demand by the CLI).
- Official Claude Code skill name is `tabbridge`.
- Future optional MCP server display name is `tabbridge`.
- MVP primary integration is CLI + official Claude Code skill, not MCP.
- MCP server is not implemented in MVP.
- Minimum Chrome version is Chrome 105+ unless `doctor` reports a higher actual minimum.
- Extension stack is WXT + Vue + Vite + TailwindCSS.
- Do not launch a separate browser, create a new browser profile, or open new tabs as the main workflow.
- Do not implement Windows, Linux, Firefox, or Safari support.
- Do not implement a permanent daemon.
- Do not default to CDP/debugger enhanced mode.
- Do not expose arbitrary JavaScript execution.
- Do not expose network interception.
- Do not expose Cookie, localStorage, credential, or token extraction.
- Do not expose unbounded full DOM dumps.
- CLI and extension must connect to the broker via WebSocket on `ws://127.0.0.1:9876`; no Native Messaging or Unix socket channel.
- CLI `--json` stdout must contain exactly one JSON envelope.
- Human logs and diagnostics must go to stderr or explicit non-JSON human output.
- Discovery commands must not return full URL or `favIconUrl` by default.
- `snapshot --include-url` may return full URL only after Level 2 authorization.
- Ref-based actions must require `tabId + snapshotId + ref`; missing or stale snapshot returns `REF_STALE`.
- Short refs use agent-browser style such as `@e1` and may be reused across snapshots.
- Default grant lifetime is 30 minutes and is scoped to `(tabId, mainFrameOrigin)`.
- Snapshot TTL is 60 seconds and each tab keeps at most the latest 3 snapshots.
- Snapshot response default limit is 256 KiB.
- Text response default limit is 128 KiB.
- HTML response default limit is 64 KiB.
- Screenshot is privacy-sensitive and MVP only guarantees current window active tab screenshot.
- Inactive tab screenshot must return `TAB_NOT_ACTIVE_FOR_SCREENSHOT`.
- Screenshot calls should be throttled to about 2 calls per second.
- Password, 2FA, payment, credential, and token-like values must never be passed in CLI argv or returned in envelopes.
- High-risk actions require explicit confirmation.
- Coordinate click and drag are high-risk fallback actions.
- Unsupported pages return `UNSUPPORTED_PAGE` when content/action access is requested.
- Cross-origin iframe without permission returns inaccessible frame placeholder instead of failing the whole page.
- Broker runtime directory permission is `0700` and broker token file permission is `0600`.
- Broker token reduces accidental misuse but is not a strong boundary against same-user malicious processes.
- If copying or substantially adapting agent-browser code, update `THIRD_PARTY_NOTICES.md` and file headers with Apache-2.0 notice.

---

## File Structure Map

### Repository root

- Create `package.json` for workspace scripts, package manager pinning, and shared dev dependencies.
- Create `pnpm-workspace.yaml` for workspace membership and centralized catalogs.
- Create `tsconfig.base.json` for shared strict TypeScript defaults.
- Create `.gitignore` for Node/WXT/build artifacts.
- Create `vitest.workspace.ts` for multi-package Vitest projects.
- Create `THIRD_PARTY_NOTICES.md` for license notices and source attribution.

### `packages/shared`

- Create `packages/shared/package.json` for the protocol package.
- Create `packages/shared/tsconfig.json` for library compilation.
- Create `packages/shared/src/protocol.ts` for CLI envelopes, bridge envelopes, protocol version, command names, and capability handshake types.
- Create `packages/shared/src/errors.ts` for exact error codes, recoverability metadata, and suggested command helpers.
- Create `packages/shared/src/tabs.ts` for redacted tab metadata and grant types.
- Create `packages/shared/src/approvals.ts` for approval lifecycle types and reducer.
- Create `packages/shared/src/snapshot.ts` for snapshot, frame, ref, viewport, and bounded read types.
- Create `packages/shared/src/risk.ts` for risk levels and classifier inputs/outputs.
- Create `packages/shared/src/limits.ts` for protocol and response size constants.
- Create `packages/shared/src/index.ts` for public exports.
- Create `packages/shared/test/*.test.ts` for schema, redaction, approvals, risk, and limits tests.

### `packages/cli`

- Create `packages/cli/package.json` for the `tabbridge` bin.
- Create `packages/cli/tsconfig.json` for CLI compilation.
- Create `packages/cli/src/main.ts` for process entrypoint and stdout/stderr handling.
- Create `packages/cli/src/cli.ts` for argument parsing and command routing.
- Create `packages/cli/src/commands.ts` for command-to-JSON-RPC mapping.
- Create `packages/cli/src/broker-client.ts` for WebSocket client behavior.
- Create `packages/cli/src/ensure-broker.ts` to start `tabbridge broker` on demand.
- Create `packages/cli/src/json-output.ts` for stable envelope printing.
- Create `packages/cli/src/doctor.ts` for broker diagnostics.
- Create `packages/cli/test/*.test.ts` for parser, envelope, broker client, ensure-broker, and doctor tests.

### `packages/broker`

- Create `packages/broker/package.json` for the WebSocket broker library and `tabbridge broker` command.
- Create `packages/broker/tsconfig.json` for compilation.
- Create `packages/broker/src/main.ts` for `tabbridge broker` process entrypoint.
- Create `packages/broker/src/runtime.ts` for runtime paths, token, and lock file handling.
- Create `packages/broker/src/lock.ts` for singleton lock using `flock`.
- Create `packages/broker/src/server.ts` for WebSocket server, auth, and JSON-RPC routing.
- Create `packages/broker/src/bridge.ts` for request correlation, timeouts, extension hello state machine, and status.
- Create `packages/broker/src/jsonrpc.ts` for JSON-RPC parsing and error mapping.
- Create `packages/broker/test/*.test.ts` for server, bridge, runtime, and lock tests.

### `packages/chrome-extension`

- Create `packages/chrome-extension/package.json` for WXT scripts and extension dependencies.
- Create `packages/chrome-extension/tsconfig.json` for WXT/Vue TypeScript.
- Create `packages/chrome-extension/wxt.config.ts` for manifest permissions, optional host permissions, Chrome MV3 config, and extension name.
- Create `packages/chrome-extension/src/entrypoints/background.ts` for broker client management, command routing, tabs, approvals, grants, screenshot, and action queue dispatch.
- Create `packages/chrome-extension/src/entrypoints/content.ts` for content script message handlers.
- Create `packages/chrome-extension/src/entrypoints/popup/App.vue` for authorization and confirmation UI.
- Create `packages/chrome-extension/src/entrypoints/popup/main.ts` for Vue mounting.
- Create `packages/chrome-extension/src/styles.css` for Tailwind entry CSS.
- Create `packages/chrome-extension/src/background/broker-client.ts` for WebSocket connection lifecycle, auth, hello, and backoff.
- Create `packages/chrome-extension/src/background/jsonrpc-router.ts` for dispatching JSON-RPC methods to command handlers.
- Create `packages/chrome-extension/src/background/commands.ts` for command handlers.
- Create `packages/chrome-extension/src/background/grants.ts` for grant storage and permission state.
- Create `packages/chrome-extension/src/background/approvals.ts` for pending approvals and idempotent execution.
- Create `packages/chrome-extension/src/background/tabs.ts` for redacted tab discovery.
- Create `packages/chrome-extension/src/background/screenshot.ts` for active-tab screenshot guard and throttling.
- Create `packages/chrome-extension/src/background/action-queue.ts` for per-tab browser action serialization.
- Create `packages/chrome-extension/src/content/snapshot-extractor.ts` for semantic snapshots and ref records.
- Create `packages/chrome-extension/src/content/ref-store.ts` for snapshot TTL and ref lifecycle.
- Create `packages/chrome-extension/src/content/actions.ts` for ref revalidation and controlled DOM actions.
- Create `packages/chrome-extension/src/content/bounded-read.ts` for text/html bounded reads.
- Create `packages/chrome-extension/src/content/unsupported-pages.ts` for unsupported page detection.
- Create `packages/chrome-extension/src/ui/useApprovalState.ts` for popup state composable.
- Create `packages/chrome-extension/test/*.test.ts` for background reducers, permission flow, snapshot extraction, ref stale detection, actions, and UI rendering.

### `skills/tabbridge`

- Create `skills/tabbridge/SKILL.md` for the official skill instructions.
- Create `skills/tabbridge/references/cli-reference.md` for command envelope examples and safe usage.
- Create `skills/tabbridge/references/error-recovery.md` for structured recovery steps.
- Create `skills/tabbridge/references/security-boundaries.md` for forbidden requests and high-risk confirmation behavior.

---

## Interfaces Shared Across Tasks

These interfaces are established in Task 1 and must be imported rather than redefined in later packages.

```ts
export const PROTOCOL_VERSION = 1 as const

export type CliEnvelope<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: TabBridgeError }

export type TabBridgeErrorCode =
  | 'EXTENSION_NOT_CONNECTED'
  | 'BRIDGE_SOCKET_UNAVAILABLE'
  | 'BRIDGE_REQUEST_TIMEOUT'
  | 'TAB_NOT_FOUND'
  | 'TAB_NOT_AUTHORIZED'
  | 'TAB_NOT_ACTIVE_FOR_SCREENSHOT'
  | 'HOST_PERMISSION_DENIED'
  | 'USER_APPROVAL_REQUIRED'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_TIMEOUT'
  | 'UNSUPPORTED_PAGE'
  | 'FRAME_NOT_ACCESSIBLE'
  | 'FRAME_ORIGIN_NOT_AUTHORIZED'
  | 'REF_STALE'
  | 'ELEMENT_NOT_VISIBLE'
  | 'ELEMENT_DISABLED'
  | 'ELEMENT_SCOPE_TOO_LARGE'
  | 'ACTION_REQUIRES_CONFIRMATION'
  | 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE'
  | 'USER_DENIED'
  | 'MESSAGE_TOO_LARGE'
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'BROWSER_COMMAND_TIMEOUT'
  | 'EXTENSION_ID_MISMATCH'

export type TabBridgeError = {
  code: TabBridgeErrorCode
  message: string
  recoverable: boolean
  suggestedCommand?: string
  approvalId?: string
  pollCommand?: string
  expiresAt?: number
}

export type BridgeRequest = {
  id: string
  protocolVersion: typeof PROTOCOL_VERSION
  source: 'cli' | 'extension'
  target: 'cli' | 'extension'
  command: string
  payload: unknown
  createdAt: number
}

export type BridgeResponse = {
  id: string
  protocolVersion: typeof PROTOCOL_VERSION
  ok: boolean
  payload?: unknown
  error?: TabBridgeError
}
```

---

### Task 1: Workspace Foundation and Shared Protocol

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `vitest.workspace.ts`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/tabs.ts`
- Create: `packages/shared/src/approvals.ts`
- Create: `packages/shared/src/snapshot.ts`
- Create: `packages/shared/src/risk.ts`
- Create: `packages/shared/src/limits.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/test/protocol.test.ts`
- Test: `packages/shared/test/errors.test.ts`
- Test: `packages/shared/test/tabs.test.ts`
- Test: `packages/shared/test/approvals.test.ts`
- Test: `packages/shared/test/risk.test.ts`

**Interfaces:**
- Consumes: The spec constants and protocol requirements from `docs/superpowers/specs/2026-06-21-tabbridge-mcp-design.md`.
- Produces: `CliEnvelope<TData>`, `BridgeRequest`, `BridgeResponse`, `TabBridgeErrorCode`, `TabBridgeError`, `RedactedTab`, `SiteGrant`, `ApprovalRecord`, `PageSnapshot`, `ElementRefRecord`, `RiskLevel`, `classifyRisk(input): RiskClassification`, and size constants imported by all later tasks.

- [ ] **Step 1: Write failing shared protocol tests**

Create `packages/shared/test/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, createBridgeRequest, okEnvelope, errorEnvelope } from '../src/index'

describe('shared protocol envelopes', () => {
  it('creates CLI success envelopes with a stable ok/data shape', () => {
    expect(okEnvelope({ tabId: 123, snapshotId: 'snap_abc' })).toEqual({
      ok: true,
      data: { tabId: 123, snapshotId: 'snap_abc' },
    })
  })

  it('creates CLI error envelopes with recoverability metadata', () => {
    expect(errorEnvelope({
      code: 'TAB_NOT_AUTHORIZED',
      message: 'Request access before reading this tab.',
      recoverable: true,
      suggestedCommand: 'tabbridge tabs request-access --tab 123 --reason <reason> --json',
    })).toEqual({
      ok: false,
      error: {
        code: 'TAB_NOT_AUTHORIZED',
        message: 'Request access before reading this tab.',
        recoverable: true,
        suggestedCommand: 'tabbridge tabs request-access --tab 123 --reason <reason> --json',
      },
    })
  })

  it('creates bridge requests with protocol version 1 and stable ids', () => {
    const request = createBridgeRequest({
      id: 'req_1',
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })

    expect(request).toEqual({
      id: 'req_1',
      protocolVersion: PROTOCOL_VERSION,
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })
  })
})
```

Create `packages/shared/test/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ERROR_CODES, bridgeNotConnectedError, refStaleError, tabNotAuthorizedError } from '../src/index'

describe('TabBridge errors', () => {
  it('exports the exact MVP error code set', () => {
    expect(ERROR_CODES).toEqual([
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
    ])
  })

  it('suggests the access command for unauthorized tabs', () => {
    expect(tabNotAuthorizedError(123)).toEqual({
      code: 'TAB_NOT_AUTHORIZED',
      message: 'Request access before reading this tab.',
      recoverable: true,
      suggestedCommand: 'tabbridge tabs request-access --tab 123 --reason <reason> --json',
    })
  })

  it('suggests a new snapshot for stale refs', () => {
    expect(refStaleError(123)).toEqual({
      code: 'REF_STALE',
      message: 'The element reference is stale. Take a new snapshot and retry with a ref from that snapshot.',
      recoverable: true,
      suggestedCommand: 'tabbridge snapshot --tab 123 --json',
    })
  })

  it('describes extension disconnect recovery copy', () => {
    expect(bridgeNotConnectedError('extension_asleep')).toMatchObject({
      code: 'EXTENSION_NOT_CONNECTED',
      recoverable: true,
      suggestedCommand: 'Open Chrome and click the TabBridge extension icon to start the broker, then run tabbridge status --json.',
    })
  })
})
```

Create `packages/shared/test/tabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSiteGrant, redactChromeTab } from '../src/index'

describe('tab metadata and grants', () => {
  it('redacts full URL and favicon from discovery output', () => {
    const tab = redactChromeTab({
      id: 7,
      windowId: 3,
      active: true,
      title: 'Private Inbox - Example Mail',
      url: 'https://mail.example.com/inbox?token=secret',
      favIconUrl: 'https://mail.example.com/favicon.ico',
    })

    expect(tab).toEqual({
      tabId: 7,
      windowId: 3,
      title: 'Private Inbox - Example Mail',
      domain: 'mail.example.com',
      active: true,
      accessStatus: 'none',
    })
    expect(JSON.stringify(tab)).not.toContain('token=secret')
    expect(JSON.stringify(tab)).not.toContain('favicon')
  })

  it('creates tab-origin grants with 30 minute lifetime', () => {
    expect(createSiteGrant({
      tabId: 7,
      origin: 'https://github.com',
      grantedByUserAt: 1782010000000,
    })).toEqual({
      tabId: 7,
      origin: 'https://github.com',
      grantedByUserAt: 1782010000000,
      expiresAt: 1782011800000,
      source: 'user-click',
    })
  })
})
```

Create `packages/shared/test/approvals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createApprovalRequiredError, transitionApproval } from '../src/index'

describe('approval state machine', () => {
  it('returns poll metadata when user approval is required', () => {
    expect(createApprovalRequiredError({ approvalId: 'appr_123', expiresAt: 1782012345678 })).toEqual({
      code: 'USER_APPROVAL_REQUIRED',
      message: 'Approval is required in the TabBridge extension UI.',
      recoverable: true,
      approvalId: 'appr_123',
      expiresAt: 1782012345678,
      pollCommand: 'tabbridge approvals wait --id appr_123 --json',
    })
  })

  it('moves pending approvals to approved only once', () => {
    const pending = {
      id: 'appr_123',
      kind: 'site-access' as const,
      status: 'pending' as const,
      createdAt: 1782010000000,
      expiresAt: 1782010300000,
      summary: 'Allow github.com',
      executed: false,
    }

    const approved = transitionApproval(pending, { type: 'approve', now: 1782010010000 })
    expect(approved.status).toBe('approved')
    expect(approved.executed).toBe(false)

    const executed = transitionApproval(approved, { type: 'mark-executed', now: 1782010011000 })
    expect(executed.status).toBe('executed')
    expect(executed.executed).toBe(true)

    const repeated = transitionApproval(executed, { type: 'mark-executed', now: 1782010012000 })
    expect(repeated).toEqual(executed)
  })

  it('expires pending approvals without converting them to user denial', () => {
    const pending = {
      id: 'appr_456',
      kind: 'high-risk-action' as const,
      status: 'pending' as const,
      createdAt: 1782010000000,
      expiresAt: 1782010300000,
      summary: 'Click Delete repository',
      executed: false,
    }

    expect(transitionApproval(pending, { type: 'expire', now: 1782010300001 })).toMatchObject({
      status: 'expired',
      executed: false,
    })
  })
})
```

Create `packages/shared/test/risk.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyRisk } from '../src/index'

describe('risk classifier', () => {
  it('classifies ordinary focus as low risk', () => {
    expect(classifyRisk({ command: 'focus', role: 'textbox', name: 'Search', text: '', usesCoordinates: false })).toEqual({
      risk: 'low',
      reasons: [],
    })
  })

  it('classifies delete submit buttons as high risk with reasons', () => {
    expect(classifyRisk({ command: 'click', role: 'button', name: 'Delete repository', text: 'Delete repository', usesCoordinates: false })).toEqual({
      risk: 'high',
      reasons: ["element text contains 'delete'"],
    })
  })

  it('classifies coordinate actions as high risk fallback operations', () => {
    expect(classifyRisk({ command: 'click-coordinates', role: undefined, name: undefined, text: undefined, usesCoordinates: true })).toEqual({
      risk: 'high',
      reasons: ['coordinate action cannot be tied to a stable semantic ref'],
    })
  })

  it('classifies credential fields as high risk and redaction-required', () => {
    expect(classifyRisk({ command: 'type', role: 'textbox', name: 'Password', text: '', inputType: 'password', usesCoordinates: false })).toEqual({
      risk: 'high',
      reasons: ['field accepts password or credential-like input'],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm install
pnpm --filter @tabbridge/shared test
```

Expected: install succeeds after workspace files exist, and tests fail with TypeScript/module errors because `packages/shared/src/*` files are not implemented yet. If `pnpm install` fails because workspace files do not exist, create the workspace config in Step 3 first and rerun this step before implementing shared source.

- [ ] **Step 3: Implement workspace and shared package**

Create root `package.json`:

```json
{
  "name": "tabbridge-workspace",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest --run --workspace vitest.workspace.ts",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "clean": "pnpm -r clean"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"

catalog:
  "@types/node": "^20.14.0"
  "typescript": "^5.7.0"
  "vitest": "^2.1.0"
  "tsup": "^8.3.0"
  "wxt": "^0.20.0"
  "vue": "^3.5.0"
  "@vitejs/plugin-vue": "^5.2.0"
  "tailwindcss": "^3.4.0"
  "@vue/test-utils": "^2.4.0"
  "jsdom": "^25.0.0"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.output/
.wxt/
coverage/
*.tsbuildinfo
.DS_Store
.env
.env.*
```

Create `vitest.workspace.ts`:

```ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/shared',
  'packages/cli',
  'packages/broker',
  'packages/chrome-extension',
])
```

Create `THIRD_PARTY_NOTICES.md`:

```markdown
# Third Party Notices

TabBridge may study or adapt concepts from Vercel `vercel-labs/agent-browser`, which is licensed under Apache-2.0.

No third-party source code has been copied into this repository at initial scaffold time. If implementation copies or substantially adapts third-party source code, add the project name, source URL, license, copyright notice, and affected files here before merging that change.
```

Create `packages/shared/package.json`:

```json
{
  "name": "@tabbridge/shared",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest --run",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

Create `packages/shared/src/limits.ts`:

```ts
export const SNAPSHOT_DEFAULT_MAX_BYTES = 256 * 1024
export const TEXT_DEFAULT_MAX_BYTES = 128 * 1024
export const HTML_DEFAULT_MAX_BYTES = 64 * 1024
export const SNAPSHOT_TTL_MS = 60_000
export const SNAPSHOTS_PER_TAB_LIMIT = 3
export const GRANT_TTL_MS = 30 * 60_000
export const APPROVAL_WAIT_DEFAULT_TIMEOUT_MS = 30_000
export const SCREENSHOT_MIN_INTERVAL_MS = 500
```

Create `packages/shared/src/errors.ts`:

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

export type TabBridgeErrorCode = (typeof ERROR_CODES)[number]

export type TabBridgeError = {
  code: TabBridgeErrorCode
  message: string
  recoverable: boolean
  suggestedCommand?: string
  approvalId?: string
  pollCommand?: string
  expiresAt?: number
}

export type BridgeDisconnectedState = 'chrome_closed' | 'extension_asleep'

export function tabNotAuthorizedError(tabId: number): TabBridgeError {
  return {
    code: 'TAB_NOT_AUTHORIZED',
    message: 'Request access before reading this tab.',
    recoverable: true,
    suggestedCommand: `tabbridge tabs request-access --tab ${tabId} --reason <reason> --json`,
  }
}

export function refStaleError(tabId: number): TabBridgeError {
  return {
    code: 'REF_STALE',
    message: 'The element reference is stale. Take a new snapshot and retry with a ref from that snapshot.',
    recoverable: true,
    suggestedCommand: `tabbridge snapshot --tab ${tabId} --json`,
  }
}

export function bridgeNotConnectedError(state: BridgeDisconnectedState): TabBridgeError {
  if (state === 'chrome_closed') {
    return {
      code: 'EXTENSION_NOT_CONNECTED',
      message: 'Chrome is not connected to the TabBridge broker.',
      recoverable: true,
      suggestedCommand: 'Open Chrome, confirm the TabBridge extension is enabled, then run tabbridge status --json.',
    }
  }

  return {
    code: 'EXTENSION_NOT_CONNECTED',
    message: 'The TabBridge extension service worker is not connected to the broker.',
    recoverable: true,
    suggestedCommand: 'Open Chrome and click the TabBridge extension icon to start the broker, then run tabbridge status --json.',
  }
}
```

Create `packages/shared/src/protocol.ts`:

```ts
import type { TabBridgeError } from './errors'

export const PROTOCOL_VERSION = 1 as const

export type CliEnvelope<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: TabBridgeError }

export type BridgeRequest = {
  id: string
  protocolVersion: typeof PROTOCOL_VERSION
  source: 'cli' | 'extension'
  target: 'cli' | 'extension'
  command: string
  payload: unknown
  createdAt: number
}

export type BridgeResponse = {
  id: string
  protocolVersion: typeof PROTOCOL_VERSION
  ok: boolean
  payload?: unknown
  error?: TabBridgeError
}

export type BridgeHello = {
  type: 'hello'
  protocolVersion: typeof PROTOCOL_VERSION
  role: 'extension'
  version: string
  extensionId?: string
  capabilities: {
    commands: string[]
    snapshot: Array<'semantic' | 'text' | 'html' | 'screenshot'>
    permissions: Array<'tabs' | 'host-permission' | 'activeTab' | 'scripting' | 'storage'>
  }
}

export function okEnvelope<TData>(data: TData): CliEnvelope<TData> {
  return { ok: true, data }
}

export function errorEnvelope(error: TabBridgeError): CliEnvelope<never> {
  return { ok: false, error }
}

export function createBridgeRequest(input: Omit<BridgeRequest, 'protocolVersion'>): BridgeRequest {
  return { ...input, protocolVersion: PROTOCOL_VERSION }
}
```

Create `packages/shared/src/tabs.ts`:

```ts
import { GRANT_TTL_MS } from './limits'

export type AccessStatus = 'none' | 'pending' | 'authorized' | 'expired-or-cross-origin'

export type ChromeTabLike = {
  id?: number
  windowId: number
  active: boolean
  title?: string
  url?: string
  favIconUrl?: string
}

export type RedactedTab = {
  tabId: number
  windowId: number
  title: string
  domain: string
  active: boolean
  accessStatus: AccessStatus
}

export type SiteGrant = {
  tabId: number
  origin: string
  grantedByUserAt: number
  expiresAt: number
  source: 'user-click'
}

export function redactChromeTab(tab: ChromeTabLike, accessStatus: AccessStatus = 'none'): RedactedTab {
  if (typeof tab.id !== 'number') {
    throw new Error('Chrome tab id is required for TabBridge discovery output.')
  }

  return {
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title ?? 'Untitled tab',
    domain: domainFromUrl(tab.url),
    active: tab.active,
    accessStatus,
  }
}

export function domainFromUrl(url: string | undefined): string {
  if (!url) return 'unknown'

  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

export function originFromUrl(url: string): string {
  const parsed = new URL(url)
  return parsed.origin
}

export function hostPermissionPatternFromOrigin(origin: string): string {
  return `${origin}/*`
}

export function createSiteGrant(input: { tabId: number; origin: string; grantedByUserAt: number }): SiteGrant {
  return {
    tabId: input.tabId,
    origin: input.origin,
    grantedByUserAt: input.grantedByUserAt,
    expiresAt: input.grantedByUserAt + GRANT_TTL_MS,
    source: 'user-click',
  }
}
```

Create `packages/shared/src/approvals.ts`:

```ts
import type { TabBridgeError } from './errors'

export type ApprovalKind = 'site-access' | 'high-risk-action'
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'executed' | 'canceled'

export type ApprovalRecord = {
  id: string
  kind: ApprovalKind
  status: ApprovalStatus
  createdAt: number
  expiresAt: number
  summary: string
  executed: boolean
  riskReasons?: string[]
  payloadSummary?: string
}

export type ApprovalTransition =
  | { type: 'approve'; now: number }
  | { type: 'deny'; now: number }
  | { type: 'expire'; now: number }
  | { type: 'cancel'; now: number }
  | { type: 'mark-executed'; now: number }

export function createApprovalRequiredError(input: { approvalId: string; expiresAt: number }): TabBridgeError {
  return {
    code: 'USER_APPROVAL_REQUIRED',
    message: 'Approval is required in the TabBridge extension UI.',
    recoverable: true,
    approvalId: input.approvalId,
    expiresAt: input.expiresAt,
    pollCommand: `tabbridge approvals wait --id ${input.approvalId} --json`,
  }
}

export function createActionRequiresConfirmationError(input: { approvalId: string; expiresAt: number }): TabBridgeError {
  return {
    code: 'ACTION_REQUIRES_CONFIRMATION',
    message: 'This action requires confirmation in the TabBridge extension UI.',
    recoverable: true,
    approvalId: input.approvalId,
    expiresAt: input.expiresAt,
    pollCommand: `tabbridge approvals wait --id ${input.approvalId} --json`,
  }
}

export function transitionApproval(record: ApprovalRecord, transition: ApprovalTransition): ApprovalRecord {
  if (record.status === 'executed' || record.status === 'denied' || record.status === 'expired' || record.status === 'canceled') {
    return record
  }

  if (transition.type === 'approve') {
    return { ...record, status: 'approved' }
  }

  if (transition.type === 'deny') {
    return { ...record, status: 'denied' }
  }

  if (transition.type === 'expire') {
    return transition.now > record.expiresAt ? { ...record, status: 'expired' } : record
  }

  if (transition.type === 'cancel') {
    return { ...record, status: 'canceled' }
  }

  return record.status === 'approved' ? { ...record, status: 'executed', executed: true } : record
}
```

Create `packages/shared/src/risk.ts`:

```ts
export type RiskLevel = 'low' | 'medium' | 'high' | 'dangerous'

export type RiskInput = {
  command: string
  role?: string
  name?: string
  text?: string
  inputType?: string
  usesCoordinates: boolean
  willNavigate?: boolean
  domainSensitive?: boolean
}

export type RiskClassification = {
  risk: RiskLevel
  reasons: string[]
}

const DANGEROUS_WORDS = ['delete', 'pay', 'purchase', 'send', 'confirm', 'transfer', 'publish', 'merge']
const CREDENTIAL_WORDS = ['password', 'passcode', '2fa', 'two-factor', 'verification code', 'token', 'credit card', 'payment']

export function classifyRisk(input: RiskInput): RiskClassification {
  const reasons: string[] = []
  const haystack = `${input.role ?? ''} ${input.name ?? ''} ${input.text ?? ''}`.toLowerCase()

  for (const word of DANGEROUS_WORDS) {
    if (haystack.includes(word)) {
      reasons.push(`element text contains '${word}'`)
      break
    }
  }

  if (input.usesCoordinates) {
    reasons.push('coordinate action cannot be tied to a stable semantic ref')
  }

  if (input.willNavigate) {
    reasons.push('action may navigate the current tab')
  }

  if (input.domainSensitive) {
    reasons.push('domain is configured as sensitive')
  }

  if (input.inputType === 'password' || CREDENTIAL_WORDS.some((word) => haystack.includes(word))) {
    reasons.push('field accepts password or credential-like input')
  }

  if (input.command.includes('dangerous')) {
    return { risk: 'dangerous', reasons: ['command is explicitly dangerous'] }
  }

  if (reasons.length > 0) {
    return { risk: 'high', reasons }
  }

  if (input.command === 'type' || input.command === 'select' || input.command === 'check' || input.command === 'uncheck') {
    return { risk: 'medium', reasons: [] }
  }

  return { risk: 'low', reasons: [] }
}
```

Create `packages/shared/src/snapshot.ts`:

```ts
import type { RiskLevel } from './risk'

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

export type PageSnapshot = {
  tabId: number
  snapshotId: string
  title: string
  domain: string
  url?: string
  urlVisible: boolean
  viewport: ViewportSnapshot
  frames: SnapshotFrame[]
}

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
```

Create `packages/shared/src/index.ts`:

```ts
export * from './approvals'
export * from './errors'
export * from './limits'
export * from './protocol'
export * from './risk'
export * from './snapshot'
export * from './tabs'
```

- [ ] **Step 4: Run shared tests and typecheck**

Run:

```bash
pnpm install
pnpm --filter @tabbridge/shared test
pnpm --filter @tabbridge/shared typecheck
```

Expected: all shared package tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore vitest.workspace.ts THIRD_PARTY_NOTICES.md packages/shared
git commit -m "feat: add TabBridge shared protocol package"
```

---

### Task 2: CLI Parser, JSON Output, and Command Mapping

> **传输层注意**：本 Task 的 parser、command mapping 和 JSON envelope 部分仍有效，但 `packages/cli/src/ipc-client.ts` 已被 `packages/cli/src/broker-client.ts` + `packages/cli/src/ensure-broker.ts` 取代。CLI 不再解析 `native-host`、`install-native-host`、`uninstall-native-host` 命令。当前实现细节请参见 [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) 的 Task 5 与 Task 6。

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/main.ts`
- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/commands.ts`
- Create: `packages/cli/src/broker-client.ts`
- Create: `packages/cli/src/ensure-broker.ts`
- Create: `packages/cli/src/json-output.ts`
- Test: `packages/cli/test/cli.test.ts`
- Test: `packages/cli/test/commands.test.ts`
- Test: `packages/cli/test/json-output.test.ts`

**Interfaces:**
- Consumes: `CliEnvelope`, `BridgeRequest`, `createBridgeRequest`, and shared error helpers from `@tabbridge/shared`.
- Produces: `parseCli(argv: string[]): ParsedCli`, `mapCliToBridgeRequest(parsed, now, id): BridgeRequest | LocalCliCommand`, `printJsonEnvelope(envelope, stdout): void`, `createBrokerClient(url, token, options)`, `ensureBroker()`, and a CLI binary entry that routes all MVP commands.

- [ ] **Step 1: Write failing CLI tests**

Create `packages/cli/test/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseCli } from '../src/cli'

describe('CLI parser', () => {
  it('parses tabs list with json mode', () => {
    expect(parseCli(['tabs', 'list', '--json'])).toEqual({
      command: 'tabs.list',
      json: true,
      payload: {},
    })
  })

  it('parses request-access reason and tab id', () => {
    expect(parseCli(['tabs', 'request-access', '--tab', '123', '--reason', 'Check pull request status', '--json'])).toEqual({
      command: 'tabs.requestAccess',
      json: true,
      payload: { tabId: 123, reason: 'Check pull request status' },
    })
  })

  it('requires snapshot id for ref-based actions', () => {
    expect(() => parseCli(['click', '--tab', '123', '--ref', '@e1', '--json'])).toThrow('click requires --tab, --snapshot-id, and --ref')
  })

  it('parses type stdin without placing text in argv payload', () => {
    expect(parseCli(['type', '--tab', '123', '--snapshot-id', 'snap_1', '--ref', '@e1', '--text-stdin', '--json'])).toEqual({
      command: 'action.type',
      json: true,
      payload: { tabId: 123, snapshotId: 'snap_1', ref: '@e1', textFromStdin: true },
    })
  })

  it('rejects navigate because it is outside the MVP command set', () => {
    expect(() => parseCli(['navigate', '--tab', '123', '--url', 'https://example.com', '--json'])).toThrow('navigate is not part of the TabBridge MVP command set')
  })
})
```

Create `packages/cli/test/commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapCliToBridgeRequest } from '../src/commands'

describe('CLI command mapping', () => {
  it('maps bridge-backed commands to protocol versioned requests', () => {
    const request = mapCliToBridgeRequest(
      { command: 'tabs.list', json: true, payload: {} },
      1782012345000,
      'req_tabs',
    )

    expect(request).toEqual({
      id: 'req_tabs',
      protocolVersion: 1,
      source: 'cli',
      target: 'extension',
      command: 'tabs.list',
      payload: {},
      createdAt: 1782012345000,
    })
  })

  it('maps approvals wait timeout to payload with default timeout when omitted', () => {
    const request = mapCliToBridgeRequest(
      { command: 'approvals.wait', json: true, payload: { approvalId: 'appr_123' } },
      1782012345000,
      'req_wait',
    )

    expect(request.payload).toEqual({ approvalId: 'appr_123', timeoutMs: 30000 })
  })
})
```

Create `packages/cli/test/json-output.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { printJsonEnvelope } from '../src/json-output'

describe('JSON output', () => {
  it('prints exactly one JSON envelope plus newline', () => {
    const writes: string[] = []
    printJsonEnvelope({ ok: true, data: { tabId: 1 } }, { write: (chunk: string) => writes.push(chunk) })

    expect(writes).toEqual(['{"ok":true,"data":{"tabId":1}}\n'])
  })
})
```

- [ ] **Step 2: Run CLI tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/cli test
```

Expected: tests fail because the CLI package and parser do not exist yet.

- [ ] **Step 3: Implement CLI package and parser**

Create `packages/cli/package.json`:

```json
{
  "name": "@tabbridge/cli",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "bin": {
    "tabbridge": "dist/main.js"
  },
  "scripts": {
    "build": "tsup src/main.ts --format esm --dts --clean --banner.js '#!/usr/bin/env node'",
    "test": "vitest --run",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@tabbridge/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

Create `packages/cli/src/cli.ts`:

```ts
export type ParsedCli = {
  command: string
  json: boolean
  payload: Record<string, unknown>
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag)
}

function readNumberFlag(argv: string[], flag: string): number | undefined {
  const value = readFlag(argv, flag)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`)
  return parsed
}

function requireNumberFlag(argv: string[], flag: string, command: string): number {
  const value = readNumberFlag(argv, flag)
  if (value === undefined) throw new Error(`${command} requires ${flag}`)
  return value
}

function requireStringFlag(argv: string[], flag: string, command: string): string {
  const value = readFlag(argv, flag)
  if (!value) throw new Error(`${command} requires ${flag}`)
  return value
}

export function parseCli(argv: string[]): ParsedCli {
  const json = hasFlag(argv, '--json')
  const [first, second] = argv

  if (first === 'navigate') {
    throw new Error('navigate is not part of the TabBridge MVP command set')
  }

  if (first === 'status') return { command: 'status', json, payload: {} }
  if (first === 'doctor') return { command: 'doctor', json, payload: {} }

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

  if (first === 'snapshot') {
    return { command: 'snapshot', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'snapshot'), includeUrl: hasFlag(argv, '--include-url') } }
  }
  if (first === 'text') {
    return { command: 'text', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'text'), maxBytes: readNumberFlag(argv, '--max-bytes') } }
  }
  if (first === 'html') {
    return {
      command: 'html',
      json,
      payload: {
        tabId: requireNumberFlag(argv, '--tab', 'html'),
        snapshotId: requireStringFlag(argv, '--snapshot-id', 'html'),
        ref: requireStringFlag(argv, '--ref', 'html'),
        maxBytes: readNumberFlag(argv, '--max-bytes'),
      },
    }
  }
  if (first === 'screenshot') return { command: 'screenshot', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'screenshot') } }

  const refActions = new Set(['click', 'clear', 'select', 'check', 'uncheck', 'focus'])
  if (first && refActions.has(first)) {
    const tabId = readNumberFlag(argv, '--tab')
    const snapshotId = readFlag(argv, '--snapshot-id')
    const ref = readFlag(argv, '--ref')
    if (tabId === undefined || !snapshotId || !ref) throw new Error(`${first} requires --tab, --snapshot-id, and --ref`)
    const payload: Record<string, unknown> = { tabId, snapshotId, ref }
    if (first === 'select') payload.value = requireStringFlag(argv, '--value', 'select')
    return { command: `action.${first}`, json, payload }
  }

  if (first === 'type') {
    const tabId = readNumberFlag(argv, '--tab')
    const snapshotId = readFlag(argv, '--snapshot-id')
    const ref = readFlag(argv, '--ref')
    if (tabId === undefined || !snapshotId || !ref) throw new Error('type requires --tab, --snapshot-id, and --ref')
    const text = readFlag(argv, '--text')
    const textFromStdin = hasFlag(argv, '--text-stdin')
    if (!text && !textFromStdin) throw new Error('type requires --text or --text-stdin')
    return { command: 'action.type', json, payload: textFromStdin ? { tabId, snapshotId, ref, textFromStdin: true } : { tabId, snapshotId, ref, text } }
  }

  if (first === 'press') return { command: 'action.press', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'press'), key: requireStringFlag(argv, '--key', 'press') } }
  if (first === 'scroll') return { command: 'action.scroll', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'scroll'), dx: readNumberFlag(argv, '--dx') ?? 0, dy: readNumberFlag(argv, '--dy') ?? 0 } }
  if (first === 'click-coordinates') return { command: 'action.clickCoordinates', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'click-coordinates'), x: requireNumberFlag(argv, '--x', 'click-coordinates'), y: requireNumberFlag(argv, '--y', 'click-coordinates') } }
  if (first === 'drag-coordinates') return { command: 'action.dragCoordinates', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'drag-coordinates'), fromX: requireNumberFlag(argv, '--from-x', 'drag-coordinates'), fromY: requireNumberFlag(argv, '--from-y', 'drag-coordinates'), toX: requireNumberFlag(argv, '--to-x', 'drag-coordinates'), toY: requireNumberFlag(argv, '--to-y', 'drag-coordinates') } }

  if (first === 'wait') return { command: 'wait', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'wait'), ms: requireNumberFlag(argv, '--ms', 'wait') } }
  if (first === 'wait-for-text') return { command: 'waitForText', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'wait-for-text'), text: requireStringFlag(argv, '--text', 'wait-for-text'), timeoutMs: readNumberFlag(argv, '--timeout') } }
  if (first === 'reload') return { command: 'navigation.reload', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'reload') } }
  if (first === 'back') return { command: 'navigation.back', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'back') } }
  if (first === 'forward') return { command: 'navigation.forward', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'forward') } }

  throw new Error(`Unknown tabbridge command: ${argv.join(' ')}`)
}
```

Create `packages/cli/src/commands.ts`:

```ts
import { APPROVAL_WAIT_DEFAULT_TIMEOUT_MS, createBridgeRequest, type BridgeRequest } from '@tabbridge/shared'
import type { ParsedCli } from './cli'

export function mapCliToBridgeRequest(parsed: ParsedCli, now: number, id: string): BridgeRequest {
  const payload = { ...parsed.payload }
  if (parsed.command === 'approvals.wait' && typeof payload.timeoutMs !== 'number') {
    payload.timeoutMs = APPROVAL_WAIT_DEFAULT_TIMEOUT_MS
  }

  return createBridgeRequest({
    id,
    source: 'cli',
    target: 'extension',
    command: parsed.command,
    payload,
    createdAt: now,
  })
}
```

Create `packages/cli/src/json-output.ts`:

```ts
import type { CliEnvelope } from '@tabbridge/shared'

export type WritableLike = {
  write(chunk: string): unknown
}

export function printJsonEnvelope<TData>(envelope: CliEnvelope<TData>, stdout: WritableLike): void {
  stdout.write(`${JSON.stringify(envelope)}\n`)
}
```

Create `packages/cli/src/broker-client.ts` and `packages/cli/src/ensure-broker.ts`:

> 完整实现参见 [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) Task 5。`ensureBroker()` 按需启动 `tabbridge broker`，`createBrokerClient(url, token, options)` 通过 WebSocket 发送 JSON-RPC 请求并等待响应。

Create `packages/cli/src/main.ts`:

```ts
import { errorEnvelope } from '@tabbridge/shared'
import { createBrokerClient } from './broker-client'
import { parseCli } from './cli'
import { mapCliToBridgeRequest } from './commands'
import { ensureBroker } from './ensure-broker'
import { printJsonEnvelope } from './json-output'

async function run(): Promise<number> {
  try {
    const parsed = parseCli(process.argv.slice(2))
    const broker = await ensureBroker()
    const request = mapCliToBridgeRequest(parsed, Date.now(), `req_${process.pid}_${Date.now()}`)
    const envelope = await createBrokerClient(broker.url, broker.token, { timeoutMs: 30_000 }).request(request)

    if (parsed.json) {
      printJsonEnvelope(envelope, process.stdout)
    } else if (envelope.ok) {
      process.stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`)
    } else {
      process.stderr.write(`${envelope.error.message}\n`)
    }

    return envelope.ok ? 0 : 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error'
    printJsonEnvelope(errorEnvelope({ code: 'BRIDGE_SOCKET_UNAVAILABLE', message, recoverable: true }), process.stdout)
    return 1
  }
}

run().then((code) => {
  process.exitCode = code
})
```

- [ ] **Step 4: Run CLI tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/cli test
pnpm --filter @tabbridge/cli typecheck
```

Expected: CLI parser, command mapping, and JSON output tests pass. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cli package.json pnpm-workspace.yaml vitest.workspace.ts
git commit -m "feat: add TabBridge CLI command parser"
```

---

### Task 3: Native Messaging Framing and Local IPC Bridge

> ❌ **本 Task 已作废**。`packages/native-host`、Chrome Native Messaging framing、Unix domain socket 均已被 [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) 中的 WebSocket broker（Task 3、Task 4、Task 5）取代。请勿按本 Task 实现。`BridgeController`、`TabActionQueue` 等逻辑已迁移到 `packages/broker/src/bridge.ts`。

**Files:**
- Create: `packages/native-host/package.json`
- Create: `packages/native-host/tsconfig.json`
- Create: `packages/native-host/src/main.ts`
- Create: `packages/native-host/src/native-framing.ts`
- Create: `packages/native-host/src/ipc-server.ts`
- Create: `packages/native-host/src/bridge.ts`
- Create: `packages/native-host/src/action-queue.ts`
- Create: `packages/native-host/src/runtime-paths.ts`
- Test: `packages/native-host/test/native-framing.test.ts`
- Test: `packages/native-host/test/action-queue.test.ts`
- Test: `packages/native-host/test/bridge.test.ts`
- Test: `packages/native-host/test/runtime-paths.test.ts`

**Interfaces:**
- Consumes: `BridgeRequest`, `BridgeResponse`, `BridgeHello`, `PROTOCOL_VERSION`, `CliEnvelope`, and shared errors.
- Produces: `encodeNativeMessage(value): Buffer`, `NativeMessageDecoder`, `createRuntimePaths(home): RuntimePaths`, `BridgeController`, `TabActionQueue`, and `startIpcServer(options)` for CLI-to-native-host request forwarding.

- [ ] **Step 1: Write failing native-host tests**

Create `packages/native-host/test/native-framing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NativeMessageDecoder, encodeNativeMessage } from '../src/native-framing'

describe('Chrome Native Messaging framing', () => {
  it('encodes JSON with little-endian 32-bit length prefix', () => {
    const encoded = encodeNativeMessage({ type: 'hello', protocolVersion: 1 })
    const length = encoded.readUInt32LE(0)
    const body = encoded.subarray(4).toString('utf8')

    expect(length).toBe(Buffer.byteLength(body))
    expect(JSON.parse(body)).toEqual({ type: 'hello', protocolVersion: 1 })
  })

  it('decodes messages split across chunks', () => {
    const decoder = new NativeMessageDecoder()
    const encoded = encodeNativeMessage({ id: 'req_1', ok: true })

    expect(decoder.push(encoded.subarray(0, 3))).toEqual([])
    expect(decoder.push(encoded.subarray(3))).toEqual([{ id: 'req_1', ok: true }])
  })
})
```

Create `packages/native-host/test/action-queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TabActionQueue } from '../src/action-queue'

describe('per-tab action queue', () => {
  it('serializes actions for the same tab and allows independent tabs to progress', async () => {
    const queue = new TabActionQueue()
    const events: string[] = []

    const first = queue.run(1, async () => {
      events.push('tab1:first:start')
      await new Promise((resolve) => setTimeout(resolve, 10))
      events.push('tab1:first:end')
      return 'first'
    })
    const second = queue.run(1, async () => {
      events.push('tab1:second:start')
      events.push('tab1:second:end')
      return 'second'
    })
    const other = queue.run(2, async () => {
      events.push('tab2:start')
      events.push('tab2:end')
      return 'other'
    })

    await Promise.all([first, second, other])

    expect(events.indexOf('tab1:first:end')).toBeLessThan(events.indexOf('tab1:second:start'))
    expect(events).toContain('tab2:start')
    expect(events).toContain('tab2:end')
  })
})
```

Create `packages/native-host/test/bridge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BridgeController } from '../src/bridge'

describe('BridgeController', () => {
  it('starts disconnected and reports extension asleep', () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    expect(bridge.status()).toEqual({ connected: false, state: 'extension_asleep' })
  })

  it('accepts compatible extension hello', () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    bridge.acceptHello({
      type: 'hello',
      protocolVersion: 1,
      role: 'extension',
      version: '0.1.0',
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      capabilities: {
        commands: ['tabs.list', 'snapshot'],
        snapshot: ['semantic', 'text', 'html', 'screenshot'],
        permissions: ['tabs', 'host-permission', 'nativeMessaging', 'scripting', 'storage'],
      },
    })

    expect(bridge.status()).toMatchObject({ connected: true, state: 'connected', extensionId: 'abcdefghijklmnopabcdefghijklmnop' })
  })

  it('rejects protocol version mismatch', () => {
    const bridge = new BridgeController({ requestTimeoutMs: 1000 })
    expect(() => bridge.acceptHello({
      type: 'hello',
      protocolVersion: 2 as 1,
      role: 'extension',
      version: '0.1.0',
      capabilities: { commands: [], snapshot: [], permissions: [] },
    })).toThrow('PROTOCOL_VERSION_MISMATCH')
  })
})
```

Create `packages/native-host/test/runtime-paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRuntimePaths } from '../src/runtime-paths'

describe('runtime paths', () => {
  it('uses user private Application Support paths', () => {
    expect(createRuntimePaths('/Users/alice')).toEqual({
      supportDir: '/Users/alice/Library/Application Support/tabbridge',
      socketPath: '/Users/alice/Library/Application Support/tabbridge/bridge.sock',
      tokenPath: '/Users/alice/Library/Application Support/tabbridge/session-token',
    })
  })
})
```

- [ ] **Step 2: Run native-host tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/native-host test
```

Expected: tests fail because the native-host package does not exist.

- [ ] **Step 3: Implement native-host package**

Create `packages/native-host/package.json`:

```json
{
  "name": "@tabbridge/native-host",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "main": "dist/main.js",
  "types": "dist/main.d.ts",
  "scripts": {
    "build": "tsup src/main.ts --format esm --dts --clean --banner.js '#!/usr/bin/env node'",
    "test": "vitest --run",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@tabbridge/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/native-host/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

Create `packages/native-host/src/native-framing.ts`:

```ts
import { CHROME_TO_NATIVE_HOST_MAX_BYTES, NATIVE_HOST_TO_CHROME_MAX_BYTES } from '@tabbridge/shared'

export function encodeNativeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  if (body.byteLength > NATIVE_HOST_TO_CHROME_MAX_BYTES) {
    throw new Error('MESSAGE_TOO_LARGE')
  }

  const header = Buffer.alloc(4)
  header.writeUInt32LE(body.byteLength, 0)
  return Buffer.concat([header, body])
}

export class NativeMessageDecoder {
  private buffer = Buffer.alloc(0)

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: unknown[] = []

    while (this.buffer.byteLength >= 4) {
      const length = this.buffer.readUInt32LE(0)
      if (length > CHROME_TO_NATIVE_HOST_MAX_BYTES) throw new Error('MESSAGE_TOO_LARGE')
      if (this.buffer.byteLength < 4 + length) break

      const body = this.buffer.subarray(4, 4 + length).toString('utf8')
      messages.push(JSON.parse(body))
      this.buffer = this.buffer.subarray(4 + length)
    }

    return messages
  }
}
```

Create `packages/native-host/src/action-queue.ts`:

```ts
export class TabActionQueue {
  private tails = new Map<number, Promise<unknown>>()

  async run<T>(tabId: number, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(tabId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(action)
    this.tails.set(tabId, next)

    try {
      return await next
    } finally {
      if (this.tails.get(tabId) === next) {
        this.tails.delete(tabId)
      }
    }
  }
}
```

Create `packages/native-host/src/runtime-paths.ts`:

```ts
import path from 'node:path'

export type RuntimePaths = {
  supportDir: string
  socketPath: string
  tokenPath: string
}

export function createRuntimePaths(home = process.env.HOME ?? ''): RuntimePaths {
  const supportDir = path.join(home, 'Library', 'Application Support', 'tabbridge')
  return {
    supportDir,
    socketPath: path.join(supportDir, 'bridge.sock'),
    tokenPath: path.join(supportDir, 'session-token'),
  }
}
```

Create `packages/native-host/src/bridge.ts`:

```ts
import { PROTOCOL_VERSION, bridgeNotConnectedError, errorEnvelope, okEnvelope, type BridgeHello, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'

export type BridgeState = 'extension_asleep' | 'connected'

export type BridgeStatus = {
  connected: boolean
  state: BridgeState
  extensionId?: string
  version?: string
}

export type BridgeControllerOptions = {
  requestTimeoutMs: number
}

export class BridgeController {
  private extensionHello: BridgeHello | undefined

  constructor(private readonly options: BridgeControllerOptions) {}

  status(): BridgeStatus {
    if (!this.extensionHello) return { connected: false, state: 'extension_asleep' }
    return {
      connected: true,
      state: 'connected',
      extensionId: this.extensionHello.extensionId,
      version: this.extensionHello.version,
    }
  }

  acceptHello(hello: BridgeHello): void {
    if (hello.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error('PROTOCOL_VERSION_MISMATCH')
    }
    if (hello.role !== 'extension') {
      throw new Error('Expected extension hello')
    }
    this.extensionHello = hello
  }

  async forward<TData>(request: BridgeRequest, sendToExtension: (request: BridgeRequest) => Promise<TData>): Promise<CliEnvelope<TData>> {
    if (!this.extensionHello) return errorEnvelope(bridgeNotConnectedError('extension_asleep'))

    const timeout = new Promise<CliEnvelope<TData>>((resolve) => {
      setTimeout(() => resolve(errorEnvelope({
        code: 'BRIDGE_REQUEST_TIMEOUT',
        message: 'Timed out waiting for the TabBridge extension response.',
        recoverable: true,
        suggestedCommand: 'tabbridge status --json',
      })), this.options.requestTimeoutMs)
    })

    const response = sendToExtension(request).then((payload) => okEnvelope(payload))
    return await Promise.race([response, timeout])
  }
}
```

Create `packages/native-host/src/ipc-server.ts`:

```ts
import fs from 'node:fs/promises'
import net from 'node:net'
import type { BridgeRequest, CliEnvelope } from '@tabbridge/shared'

export type IpcServerOptions = {
  socketPath: string
  onRequest(request: BridgeRequest): Promise<CliEnvelope<unknown>>
}

export async function removeStaleSocket(socketPath: string): Promise<void> {
  try {
    await fs.unlink(socketPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export async function startIpcServer(options: IpcServerOptions): Promise<net.Server> {
  await removeStaleSocket(options.socketPath)

  const server = net.createServer((socket) => {
    let buffer = ''
    socket.on('data', async (chunk) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline < 0) return

      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      const request = JSON.parse(line) as BridgeRequest
      const envelope = await options.onRequest(request)
      socket.write(`${JSON.stringify(envelope)}\n`)
      socket.end()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.socketPath, () => resolve())
  })

  return server
}
```

Create `packages/native-host/src/main.ts`:

```ts
import fs from 'node:fs/promises'
import { encodeNativeMessage, NativeMessageDecoder } from './native-framing'
import { BridgeController } from './bridge'
import { createRuntimePaths } from './runtime-paths'
import { startIpcServer } from './ipc-server'

async function main(): Promise<void> {
  const paths = createRuntimePaths()
  await fs.mkdir(paths.supportDir, { recursive: true, mode: 0o700 })
  const bridge = new BridgeController({ requestTimeoutMs: 30_000 })
  const decoder = new NativeMessageDecoder()

  process.stdin.on('data', (chunk: Buffer) => {
    for (const message of decoder.push(chunk)) {
      const record = message as { type?: string }
      if (record.type === 'hello') {
        bridge.acceptHello(message as Parameters<typeof bridge.acceptHello>[0])
      }
    }
  })

  await startIpcServer({
    socketPath: paths.socketPath,
    onRequest: async (request) => bridge.forward(request, async (bridgeRequest) => {
      process.stdout.write(encodeNativeMessage(bridgeRequest))
      return { forwarded: true }
    }),
  })
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
```

- [ ] **Step 4: Run native-host tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/native-host test
pnpm --filter @tabbridge/native-host typecheck
```

Expected: native framing, bridge status, queue, and runtime path tests pass. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/native-host package.json pnpm-workspace.yaml vitest.workspace.ts
git commit -m "feat: add TabBridge native host bridge core"
```

---

### Task 4: Native Host Installation, Status, and Doctor Diagnostics

> ❌ **本 Task 已作废**。`install-native-host`、`uninstall-native-host`、`native-manifest.ts` 均不再存在。`doctor` 现为 broker 健康检查，实现细节参见 [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) 的 Task 5 / Task 6。请勿按本 Task 实现。

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/main.ts`
- Create: `packages/cli/src/native-manifest.ts`
- Create: `packages/cli/src/doctor.ts`
- Test: `packages/cli/test/native-manifest.test.ts`
- Test: `packages/cli/test/doctor.test.ts`

**Interfaces:**
- Consumes: CLI parser from Task 2 and native runtime path conventions from Task 3.
- Produces: `nativeManifestPath(browser, home): string`, `createNativeManifest(input): NativeManifest`, `writeNativeManifest(input): Promise<NativeManifestInstallResult>`, `removeNativeManifest(input): Promise<NativeManifestUninstallResult>`, and `runDoctor(input): Promise<DoctorReport>`.

- [ ] **Step 1: Write failing installation and doctor tests**

Create `packages/cli/test/native-manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createNativeManifest, nativeManifestPath } from '../src/native-manifest'

describe('Native Messaging manifest', () => {
  it('uses the user-level Google Chrome manifest path on macOS', () => {
    expect(nativeManifestPath('chrome', '/Users/alice')).toBe('/Users/alice/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tabbridge.host.json')
  })

  it('uses the user-level Chromium manifest path on macOS', () => {
    expect(nativeManifestPath('chromium', '/Users/alice')).toBe('/Users/alice/Library/Application Support/Chromium/NativeMessagingHosts/com.tabbridge.host.json')
  })

  it('creates an exact allowed origin for the extension id', () => {
    expect(createNativeManifest({
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      wrapperPath: '/Users/alice/bin/tabbridge-native-host-wrapper',
    })).toEqual({
      name: 'com.tabbridge.host',
      description: 'TabBridge native host',
      path: '/Users/alice/bin/tabbridge-native-host-wrapper',
      type: 'stdio',
      allowed_origins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/'],
    })
  })
})
```

Create `packages/cli/test/doctor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluateDoctorReport } from '../src/doctor'

describe('doctor report evaluation', () => {
  it('reports missing manifest as native_host_missing', () => {
    expect(evaluateDoctorReport({
      manifestExists: false,
      manifestValid: false,
      manifestPathExecutable: false,
      extensionIdMatches: false,
      socketExists: false,
      bridgeConnected: false,
      protocolCompatible: false,
      nodeMajor: 20,
    })).toMatchObject({
      ok: false,
      bridgeState: 'native_host_missing',
      checks: expect.arrayContaining([{ name: 'native host manifest exists', ok: false }]),
    })
  })

  it('reports extension id mismatch distinctly', () => {
    expect(evaluateDoctorReport({
      manifestExists: true,
      manifestValid: true,
      manifestPathExecutable: true,
      extensionIdMatches: false,
      socketExists: true,
      bridgeConnected: true,
      protocolCompatible: true,
      nodeMajor: 20,
    })).toMatchObject({
      ok: false,
      bridgeState: 'connected',
      errorCode: 'EXTENSION_ID_MISMATCH',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/cli test -- native-manifest doctor
```

Expected: tests fail because `native-manifest.ts` and `doctor.ts` do not exist.

- [ ] **Step 3: Implement install/uninstall manifest and doctor evaluation**

Create `packages/cli/src/native-manifest.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

export type BrowserChannel = 'chrome' | 'chromium'

export type NativeManifest = {
  name: 'com.tabbridge.host'
  description: 'TabBridge native host'
  path: string
  type: 'stdio'
  allowed_origins: string[]
}

export type NativeManifestInput = {
  extensionId: string
  wrapperPath: string
}

export function nativeManifestPath(browser: BrowserChannel, home = process.env.HOME ?? ''): string {
  const browserDir = browser === 'chrome' ? 'Google/Chrome' : 'Chromium'
  return path.join(home, 'Library', 'Application Support', browserDir, 'NativeMessagingHosts', 'com.tabbridge.host.json')
}

export function createNativeManifest(input: NativeManifestInput): NativeManifest {
  return {
    name: 'com.tabbridge.host',
    description: 'TabBridge native host',
    path: input.wrapperPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${input.extensionId}/`],
  }
}

export async function writeNativeManifest(input: NativeManifestInput & { browser: BrowserChannel; home?: string }): Promise<{ path: string; manifest: NativeManifest }> {
  const manifestPath = nativeManifestPath(input.browser, input.home)
  const manifest = createNativeManifest(input)
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 })
  return { path: manifestPath, manifest }
}

export async function removeNativeManifest(input: { browser: BrowserChannel; home?: string }): Promise<{ path: string; removed: boolean }> {
  const manifestPath = nativeManifestPath(input.browser, input.home)
  try {
    await fs.unlink(manifestPath)
    return { path: manifestPath, removed: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: manifestPath, removed: false }
    throw error
  }
}
```

Create `packages/cli/src/doctor.ts`:

```ts
import type { TabBridgeErrorCode } from '@tabbridge/shared'

export type DoctorCheck = {
  name: string
  ok: boolean
  detail?: string
}

export type DoctorInputs = {
  manifestExists: boolean
  manifestValid: boolean
  manifestPathExecutable: boolean
  extensionIdMatches: boolean
  socketExists: boolean
  bridgeConnected: boolean
  protocolCompatible: boolean
  nodeMajor: number
}

export type DoctorReport = {
  ok: boolean
  bridgeState: 'native_host_missing' | 'extension_asleep' | 'connected'
  errorCode?: TabBridgeErrorCode
  checks: DoctorCheck[]
}

export function evaluateDoctorReport(input: DoctorInputs): DoctorReport {
  const checks: DoctorCheck[] = [
    { name: 'native host manifest exists', ok: input.manifestExists },
    { name: 'native host manifest JSON is valid', ok: input.manifestValid },
    { name: 'native host wrapper path is executable', ok: input.manifestPathExecutable },
    { name: 'extension id matches allowed_origins', ok: input.extensionIdMatches },
    { name: 'Unix socket path is present', ok: input.socketExists },
    { name: 'native host and extension are connected', ok: input.bridgeConnected },
    { name: 'protocol version is compatible', ok: input.protocolCompatible },
    { name: 'Node.js major version is at least 20', ok: input.nodeMajor >= 20 },
  ]

  if (!input.manifestExists || !input.manifestValid || !input.manifestPathExecutable) {
    return { ok: false, bridgeState: 'native_host_missing', errorCode: 'NATIVE_HOST_NOT_CONNECTED', checks }
  }

  const bridgeState = input.bridgeConnected ? 'connected' : 'extension_asleep'
  if (!input.extensionIdMatches) {
    return { ok: false, bridgeState, errorCode: 'EXTENSION_ID_MISMATCH', checks }
  }

  if (!input.protocolCompatible) {
    return { ok: false, bridgeState, errorCode: 'PROTOCOL_VERSION_MISMATCH', checks }
  }

  if (!input.bridgeConnected) {
    return { ok: false, bridgeState, errorCode: 'EXTENSION_NOT_CONNECTED', checks }
  }

  const ok = checks.every((check) => check.ok)
  return { ok, bridgeState, checks }
}
```

Replace `packages/cli/src/main.ts` with this version so `install-native-host`, `uninstall-native-host`, and `doctor` are handled locally before IPC forwarding:

```ts
import { errorEnvelope, okEnvelope } from '@tabbridge/shared'
import { parseCli } from './cli'
import { mapCliToBridgeRequest } from './commands'
import { evaluateDoctorReport } from './doctor'
import { sendBridgeRequest } from './ipc-client'
import { printJsonEnvelope } from './json-output'
import { removeNativeManifest, writeNativeManifest, type BrowserChannel } from './native-manifest'

const DEFAULT_SOCKET_PATH = `${process.env.HOME ?? ''}/Library/Application Support/tabbridge/bridge.sock`

async function run(): Promise<number> {
  try {
    const parsed = parseCli(process.argv.slice(2))

    if (parsed.command === 'installNativeHost') {
      const browser = parsed.payload.browser as BrowserChannel
      const extensionId = parsed.payload.extensionId as string
      const wrapperPath = process.execPath
      const result = await writeNativeManifest({ browser, extensionId, wrapperPath })
      const envelope = okEnvelope(result)
      printJsonEnvelope(envelope, process.stdout)
      return 0
    }

    if (parsed.command === 'uninstallNativeHost') {
      const browser = parsed.payload.browser as BrowserChannel
      const result = await removeNativeManifest({ browser })
      const envelope = okEnvelope(result)
      printJsonEnvelope(envelope, process.stdout)
      return 0
    }

    if (parsed.command === 'doctor') {
      const report = evaluateDoctorReport({
        manifestExists: false,
        manifestValid: false,
        manifestPathExecutable: false,
        extensionIdMatches: false,
        socketExists: false,
        bridgeConnected: false,
        protocolCompatible: false,
        nodeMajor: Number(process.versions.node.split('.')[0]),
      })
      printJsonEnvelope(okEnvelope(report), process.stdout)
      return report.ok ? 0 : 1
    }

    const request = mapCliToBridgeRequest(parsed, Date.now(), `req_${process.pid}_${Date.now()}`)
    const envelope = await sendBridgeRequest(request, { socketPath: DEFAULT_SOCKET_PATH, timeoutMs: 30_000 })

    if (parsed.json) {
      printJsonEnvelope(envelope, process.stdout)
    } else if (envelope.ok) {
      process.stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`)
    } else {
      process.stderr.write(`${envelope.error.message}\n`)
    }

    return envelope.ok ? 0 : 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error'
    printJsonEnvelope(errorEnvelope({ code: 'BRIDGE_SOCKET_UNAVAILABLE', message, recoverable: true }), process.stdout)
    return 1
  }
}

run().then((code) => {
  process.exitCode = code
})
```

- [ ] **Step 4: Run CLI tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/cli test
pnpm --filter @tabbridge/cli typecheck
```

Expected: all CLI tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat: add native host install and doctor diagnostics"
```

---

### Task 5: WXT Extension Scaffold and Broker Client Lifecycle

> **传输层注意**：本 Task 原定的 `native-port.ts`（`chrome.runtime.connectNative`）已被 `background/broker-client.ts`（WebSocket 连接 broker）取代。扩展 manifest 不再声明 `nativeMessaging` 权限。当前实现细节参见 [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) 的 Task 7。

**Files:**
- Create: `packages/chrome-extension/package.json`
- Create: `packages/chrome-extension/tsconfig.json`
- Create: `packages/chrome-extension/wxt.config.ts`
- Create: `packages/chrome-extension/src/entrypoints/background.ts`
- Create: `packages/chrome-extension/src/background/broker-client.ts`
- Create: `packages/chrome-extension/src/background/jsonrpc-router.ts`
- Create: `packages/chrome-extension/src/background/commands.ts`
- Create: `packages/chrome-extension/src/entrypoints/popup/main.ts`
- Create: `packages/chrome-extension/src/entrypoints/popup/App.vue`
- Create: `packages/chrome-extension/src/styles.css`
- Test: `packages/chrome-extension/test/wxt-config.test.ts`
- Test: `packages/chrome-extension/test/broker-client.test.ts`

**Interfaces:**
- Consumes: `BrokerHelloParams`, `PROTOCOL_VERSION`, and shared command names.
- Produces: WXT MV3 extension scaffold, manifest permissions, `createBrokerClient(url, extensionId, options)`, `routeJsonRpcMethod(request): Promise<JsonRpcResponse>`, and popup Vue entrypoint.

- [ ] **Step 1: Write failing WXT and broker client tests**

Create `packages/chrome-extension/test/wxt-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import config from '../wxt.config'

describe('WXT manifest config', () => {
  it('declares exact MVP permissions and optional host permissions', () => {
    expect(config.manifest).toMatchObject({
      name: 'TabBridge',
      permissions: ['tabs', 'scripting', 'storage', 'activeTab'],
      optional_host_permissions: ['http://*/*', 'https://*/*'],
    })
  })
})
```

Create `packages/chrome-extension/test/broker-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createHelloMessage, createBrokerClient } from '../src/background/broker-client'

describe('broker client', () => {
  it('creates a protocol version 1 extension hello params', () => {
    expect(createHelloMessage('abcdefghijklmnopabcdefghijklmnop')).toEqual({
      protocolVersion: 1,
      version: '0.1.0',
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      capabilities: {
        commands: ['status', 'tabs.list', 'tabs.current', 'tabs.requestAccess', 'snapshot', 'text', 'html', 'screenshot'],
        snapshot: ['semantic', 'text', 'html', 'screenshot'],
        permissions: ['tabs', 'host-permission', 'activeTab', 'scripting', 'storage'],
      },
    })
  })

  it('opens a WebSocket and sends auth + hello', () => {
    const WebSocket = vi.fn().mockImplementation(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    }))

    createBrokerClient('ws://127.0.0.1:9876', 'abcdefghijklmnopabcdefghijklmnop', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    })

    expect(WebSocket).toHaveBeenCalledWith('ws://127.0.0.1:9876')
  })
})
```

- [ ] **Step 2: Run extension tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
```

Expected: tests fail because the extension package does not exist.

- [ ] **Step 3: Implement WXT scaffold and broker client**

Create `packages/chrome-extension/package.json`:

```json
{
  "name": "@tabbridge/chrome-extension",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "wxt",
    "build": "wxt build --browser chrome",
    "test": "vitest --run --environment jsdom",
    "typecheck": "vue-tsc --noEmit",
    "lint": "vue-tsc --noEmit",
    "clean": "rm -rf .output .wxt dist"
  },
  "dependencies": {
    "@tabbridge/shared": "workspace:*",
    "vue": "catalog:"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "catalog:",
    "@vue/test-utils": "catalog:",
    "jsdom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "vue-tsc": "^2.1.0",
    "wxt": "catalog:"
  }
}
```

Create `packages/chrome-extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["wxt/client", "vitest/globals"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src", "test", "wxt.config.ts", ".wxt/types/**/*.d.ts"]
}
```

Create `packages/chrome-extension/wxt.config.ts`:

```ts
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'TabBridge',
    permissions: ['tabs', 'scripting', 'storage', 'activeTab'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    minimum_chrome_version: '105',
  },
})
```

Create `packages/chrome-extension/src/background/broker-client.ts`:

```ts
import { PROTOCOL_VERSION, type BrokerHelloParams } from '@tabbridge/shared'

export const DEFAULT_BROKER_URL = 'ws://127.0.0.1:9876'

export function createHelloMessage(extensionId: string): BrokerHelloParams {
  return {
    protocolVersion: PROTOCOL_VERSION,
    version: '0.1.0',
    extensionId,
    capabilities: {
      commands: ['status', 'tabs.list', 'tabs.current', 'tabs.requestAccess', 'snapshot', 'text', 'html', 'screenshot'],
      snapshot: ['semantic', 'text', 'html', 'screenshot'],
      permissions: ['tabs', 'host-permission', 'activeTab', 'scripting', 'storage'],
    },
  }
}

export function createBrokerClient(url: string, extensionId: string, options: {
  WebSocket?: typeof globalThis.WebSocket
  timer?: typeof globalThis
  reconnectDelaysMs?: number[]
} = {}) {
  // See current implementation in packages/chrome-extension/src/background/broker-client.ts
}
```

Create `packages/chrome-extension/src/background/jsonrpc-router.ts`:

```ts
import { errorEnvelope, okEnvelope, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'

export async function routeJsonRpcMethod(request: BridgeRequest): Promise<CliEnvelope<unknown>> {
  if (request.command === 'status') {
    return okEnvelope({ bridge: 'connected' })
  }

  return errorEnvelope({
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not implemented by the extension command router yet.`,
    recoverable: false,
  })
}
```

Create `packages/chrome-extension/src/entrypoints/background.ts`:

```ts
import { createBrokerClient, DEFAULT_BROKER_URL } from '../background/broker-client'
import { routeJsonRpcMethod } from '../background/jsonrpc-router'

export default defineBackground(() => {
  createBrokerClient(DEFAULT_BROKER_URL, chrome.runtime.id, {
    onRequest: routeJsonRpcMethod,
  })
})
```
```

Create `packages/chrome-extension/src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Create `packages/chrome-extension/src/entrypoints/popup/main.ts`:

```ts
import { createApp } from 'vue'
import App from './App.vue'
import '../../styles.css'

createApp(App).mount('#app')
```

Create `packages/chrome-extension/src/entrypoints/popup/App.vue`:

```vue
<script setup lang="ts">
const extensionName = 'TabBridge'
</script>

<template>
  <main class="min-w-80 p-4 text-slate-900 dark:text-slate-100">
    <h1 class="text-lg font-semibold">{{ extensionName }}</h1>
    <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
      Bridge status and approvals will appear here when a local agent requests access.
    </p>
  </main>
</template>
```

- [ ] **Step 4: Run extension tests, typecheck, and build**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
pnpm --filter @tabbridge/chrome-extension build
```

Expected: tests pass, Vue TypeScript reports no errors, and WXT produces a Chrome MV3 build under `.output/`.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension package.json pnpm-workspace.yaml vitest.workspace.ts
git commit -m "feat: scaffold TabBridge WXT extension"
```

---

### Task 6: Tab Discovery, Grants, and Approval State

**Files:**
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Create: `packages/chrome-extension/src/background/tabs.ts`
- Create: `packages/chrome-extension/src/background/grants.ts`
- Create: `packages/chrome-extension/src/background/approvals.ts`
- Test: `packages/chrome-extension/test/tabs.test.ts`
- Test: `packages/chrome-extension/test/grants.test.ts`
- Test: `packages/chrome-extension/test/approvals.test.ts`

**Interfaces:**
- Consumes: `RedactedTab`, `SiteGrant`, `ApprovalRecord`, `createSiteGrant`, `createApprovalRequiredError`, and `hostPermissionPatternFromOrigin`.
- Produces: `listRedactedTabs(chromeTabs, grants, now): RedactedTab[]`, `requestTabAccess(input): Promise<CliEnvelope<unknown>>`, `releaseTabGrant(tabId): Promise<void>`, `ApprovalStore`, and routed commands for `tabs.list`, `tabs.current`, `tabs.requestAccess`, `tabs.release`, `approvals.status`, `approvals.wait`, and `approvals.cancel`.

- [ ] **Step 1: Write failing tab/grant/approval tests**

Create `packages/chrome-extension/test/tabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { listRedactedTabs } from '../src/background/tabs'

describe('extension tab discovery', () => {
  it('returns redacted metadata and access status only', () => {
    const tabs = listRedactedTabs([
      { id: 1, windowId: 2, active: true, title: 'GitHub PR', url: 'https://github.com/acme/repo/pull/1?secret=1', favIconUrl: 'https://github.com/favicon.ico' },
    ], [], 1782010000000)

    expect(tabs).toEqual([{ tabId: 1, windowId: 2, title: 'GitHub PR', domain: 'github.com', active: true, accessStatus: 'none' }])
    expect(JSON.stringify(tabs)).not.toContain('secret=1')
    expect(JSON.stringify(tabs)).not.toContain('favicon')
  })
})
```

Create `packages/chrome-extension/test/grants.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { grantStatusForTab } from '../src/background/grants'

describe('grant status', () => {
  it('authorizes only matching tab and origin before expiry', () => {
    const grants = [{ tabId: 1, origin: 'https://github.com', grantedByUserAt: 1000, expiresAt: 2000, source: 'user-click' as const }]

    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://github.com/acme/repo' }, 1500)).toBe('authorized')
    expect(grantStatusForTab(grants, { tabId: 2, url: 'https://github.com/acme/repo' }, 1500)).toBe('none')
    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://example.com' }, 1500)).toBe('expired-or-cross-origin')
    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://github.com/acme/repo' }, 2500)).toBe('expired-or-cross-origin')
  })
})
```

Create `packages/chrome-extension/test/approvals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApprovalStore } from '../src/background/approvals'

describe('extension approval store', () => {
  it('creates pending site access approvals with poll metadata', () => {
    const store = new ApprovalStore(() => 1782010000000, () => 'appr_1')
    const result = store.createSiteAccessApproval({ tabId: 1, title: 'GitHub PR', domain: 'github.com', origin: 'https://github.com', reason: 'Review PR' })

    expect(result.envelope).toEqual({
      ok: false,
      error: {
        code: 'USER_APPROVAL_REQUIRED',
        message: 'Approval is required in the TabBridge extension UI.',
        recoverable: true,
        approvalId: 'appr_1',
        expiresAt: 1782010300000,
        pollCommand: 'tabbridge approvals wait --id appr_1 --json',
      },
    })
    expect(store.get('appr_1')).toMatchObject({ status: 'pending', summary: 'Allow github.com for tab 1: Review PR' })
  })
})
```

- [ ] **Step 2: Run extension tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- tabs grants approvals
```

Expected: tests fail because tab/grant/approval modules do not exist.

- [ ] **Step 3: Implement discovery, grants, and approval store**

Create `packages/chrome-extension/src/background/grants.ts`:

```ts
import { originFromUrl, type AccessStatus, type SiteGrant } from '@tabbridge/shared'

export function grantStatusForTab(grants: SiteGrant[], tab: { tabId: number; url?: string }, now: number): AccessStatus {
  if (!tab.url) return 'none'

  let origin: string
  try {
    origin = originFromUrl(tab.url)
  } catch {
    return 'none'
  }

  const sameTabGrant = grants.find((grant) => grant.tabId === tab.tabId)
  if (!sameTabGrant) return 'none'
  if (sameTabGrant.origin === origin && sameTabGrant.expiresAt > now) return 'authorized'
  return 'expired-or-cross-origin'
}

export function releaseGrant(grants: SiteGrant[], tabId: number): SiteGrant[] {
  return grants.filter((grant) => grant.tabId !== tabId)
}
```

Create `packages/chrome-extension/src/background/tabs.ts`:

```ts
import { redactChromeTab, type ChromeTabLike, type RedactedTab, type SiteGrant } from '@tabbridge/shared'
import { grantStatusForTab } from './grants'

export function listRedactedTabs(chromeTabs: ChromeTabLike[], grants: SiteGrant[], now: number): RedactedTab[] {
  return chromeTabs
    .filter((tab) => typeof tab.id === 'number')
    .map((tab) => redactChromeTab(tab, grantStatusForTab(grants, { tabId: tab.id as number, url: tab.url }, now)))
}
```

Create `packages/chrome-extension/src/background/approvals.ts`:

```ts
import { createApprovalRequiredError, errorEnvelope, transitionApproval, type ApprovalRecord, type CliEnvelope } from '@tabbridge/shared'

export type SiteAccessApprovalInput = {
  tabId: number
  title: string
  domain: string
  origin: string
  reason: string
}

export class ApprovalStore {
  private approvals = new Map<string, ApprovalRecord & { tabId?: number; origin?: string; reason?: string }>()

  constructor(
    private readonly now: () => number,
    private readonly createId: () => string,
  ) {}

  createSiteAccessApproval(input: SiteAccessApprovalInput): { approval: ApprovalRecord; envelope: CliEnvelope<never> } {
    const id = this.createId()
    const approval: ApprovalRecord & { tabId: number; origin: string; reason: string } = {
      id,
      kind: 'site-access',
      status: 'pending',
      createdAt: this.now(),
      expiresAt: this.now() + 300_000,
      summary: `Allow ${input.domain} for tab ${input.tabId}: ${input.reason}`,
      executed: false,
      tabId: input.tabId,
      origin: input.origin,
      reason: input.reason,
    }
    this.approvals.set(id, approval)
    return { approval, envelope: errorEnvelope(createApprovalRequiredError({ approvalId: id, expiresAt: approval.expiresAt })) }
  }

  get(id: string): (ApprovalRecord & { tabId?: number; origin?: string; reason?: string }) | undefined {
    return this.approvals.get(id)
  }

  transition(id: string, type: 'approve' | 'deny' | 'expire' | 'cancel' | 'mark-executed'): ApprovalRecord | undefined {
    const current = this.approvals.get(id)
    if (!current) return undefined
    const next = transitionApproval(current, { type, now: this.now() } as Parameters<typeof transitionApproval>[1])
    this.approvals.set(id, next)
    return next
  }

  listPending(): ApprovalRecord[] {
    return Array.from(this.approvals.values()).filter((approval) => approval.status === 'pending')
  }
}
```

Update `packages/chrome-extension/src/background/commands.ts` to route tab and approval commands using injected handlers:

```ts
import { errorEnvelope, okEnvelope, tabNotAuthorizedError, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'

export type CommandContext = {
  listTabs(): Promise<unknown[]>
  currentTab(): Promise<unknown | undefined>
}

export async function routeBridgeCommand(request: BridgeRequest, context?: CommandContext): Promise<CliEnvelope<unknown>> {
  if (request.command === 'status') {
    return okEnvelope({ bridge: 'connected' })
  }

  if (request.command === 'tabs.list' && context) {
    return okEnvelope(await context.listTabs())
  }

  if (request.command === 'tabs.current' && context) {
    const tab = await context.currentTab()
    if (!tab) {
      return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
    }
    return okEnvelope(tab)
  }

  if (request.command === 'snapshot') {
    const payload = request.payload as { tabId: number }
    return errorEnvelope(tabNotAuthorizedError(payload.tabId))
  }

  return errorEnvelope({
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not implemented by the extension command router yet.`,
    recoverable: false,
  })
}
```

- [ ] **Step 4: Run extension tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: tab discovery, grant status, approval store, and previous extension tests pass. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat: add extension tab discovery and approval state"
```

---

### Task 7: Semantic Snapshot Extraction and Ref Store

**Files:**
- Create: `packages/chrome-extension/src/entrypoints/content.ts`
- Create: `packages/chrome-extension/src/content/snapshot-extractor.ts`
- Create: `packages/chrome-extension/src/content/ref-store.ts`
- Create: `packages/chrome-extension/src/content/unsupported-pages.ts`
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Test: `packages/chrome-extension/test/snapshot-extractor.test.ts`
- Test: `packages/chrome-extension/test/ref-store.test.ts`
- Test: `packages/chrome-extension/test/unsupported-pages.test.ts`

**Interfaces:**
- Consumes: `PageSnapshot`, `SnapshotFrame`, `SnapshotElement`, `ElementRefRecord`, `SNAPSHOT_TTL_MS`, `SNAPSHOTS_PER_TAB_LIMIT`, `displayRef`, and `classifyRisk`.
- Produces: `extractSnapshot(input): PageSnapshot`, `RefStore.saveSnapshot(snapshotId, records, now): void`, `RefStore.getRecord(snapshotId, frameRef, ref, now): ElementRefRecord | undefined`, and unsupported URL guards.

- [ ] **Step 1: Write failing snapshot and ref tests**

Create `packages/chrome-extension/test/snapshot-extractor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractSnapshotFromDocument } from '../src/content/snapshot-extractor'

describe('semantic snapshot extractor', () => {
  it('extracts visible interactables with compact refs', () => {
    document.body.innerHTML = '<main><button id="merge">Merge pull request</button><input aria-label="Comment" value="secret typed value"><a href="/settings">Settings</a><span>Plain text</span></main>'

    const result = extractSnapshotFromDocument({
      tabId: 123,
      snapshotId: 'snap_1',
      title: 'GitHub Pull Request',
      url: 'https://github.com/acme/repo/pull/1',
      includeUrl: false,
      now: 1782010000000,
    })

    expect(result.snapshot).toMatchObject({
      tabId: 123,
      snapshotId: 'snap_1',
      title: 'GitHub Pull Request',
      domain: 'github.com',
      urlVisible: false,
    })
    expect(result.snapshot.frames[0]?.tree).toEqual([
      expect.objectContaining({ ref: '@e1', role: 'button', name: 'Merge pull request', risk: 'high' }),
      expect.objectContaining({ ref: '@e2', role: 'textbox', name: 'Comment', risk: 'medium' }),
      expect.objectContaining({ ref: '@e3', role: 'link', name: 'Settings', risk: 'low' }),
    ])
    expect(JSON.stringify(result.snapshot)).not.toContain('secret typed value')
  })
})
```

Create `packages/chrome-extension/test/ref-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RefStore } from '../src/content/ref-store'

describe('RefStore', () => {
  it('requires snapshot id and expires records after TTL', () => {
    const store = new RefStore()
    store.saveSnapshot('snap_1', [{
      snapshotId: 'snap_1',
      tabId: 1,
      frameRef: 'f0',
      ref: '@e1',
      selectorCandidates: ['#merge'],
      xpathCandidates: ['//*[@id="merge"]'],
      role: 'button',
      name: 'Merge',
      textFingerprint: 'Merge',
      boundingBox: [0, 0, 100, 40],
      generatedAt: 1000,
    }], 1000)

    expect(store.getRecord('snap_1', 'f0', '@e1', 2000)?.name).toBe('Merge')
    expect(store.getRecord('snap_2', 'f0', '@e1', 2000)).toBeUndefined()
    expect(store.getRecord('snap_1', 'f0', '@e1', 62001)).toBeUndefined()
  })

  it('keeps only the latest three snapshots per tab', () => {
    const store = new RefStore()
    for (let index = 1; index <= 4; index += 1) {
      store.saveSnapshot(`snap_${index}`, [{
        snapshotId: `snap_${index}`,
        tabId: 1,
        frameRef: 'f0',
        ref: '@e1',
        selectorCandidates: [`#item${index}`],
        xpathCandidates: [`//*[@id="item${index}"]`],
        generatedAt: index,
      }], index)
    }

    expect(store.getRecord('snap_1', 'f0', '@e1', 10)).toBeUndefined()
    expect(store.getRecord('snap_4', 'f0', '@e1', 10)).toBeDefined()
  })
})
```

Create `packages/chrome-extension/test/unsupported-pages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { unsupportedPageReason } from '../src/content/unsupported-pages'

describe('unsupported page detection', () => {
  it('blocks Chrome internal pages and special URLs', () => {
    expect(unsupportedPageReason('chrome://settings')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('chrome-extension://abc/options.html')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('devtools://devtools/bundled')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('file:///Users/alice/private.txt')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('https://github.com')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run extension tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- snapshot-extractor ref-store unsupported-pages
```

Expected: tests fail because content modules do not exist.

- [ ] **Step 3: Implement snapshot extractor and ref store**

Create `packages/chrome-extension/src/content/unsupported-pages.ts`:

```ts
export function unsupportedPageReason(url: string): 'UNSUPPORTED_PAGE' | undefined {
  if (url.startsWith('chrome://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('chrome-extension://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('devtools://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('file://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('about:')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('data:')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('blob:')) return 'UNSUPPORTED_PAGE'
  return undefined
}
```

Create `packages/chrome-extension/src/content/ref-store.ts`:

```ts
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
```

Create `packages/chrome-extension/src/content/snapshot-extractor.ts`:

```ts
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

function selectorFor(element: Element): string[] {
  if (element.id) return [`#${CSS.escape(element.id)}`]
  const tag = element.tagName.toLowerCase()
  const aria = element.getAttribute('aria-label')
  if (aria) return [`${tag}[aria-label="${CSS.escape(aria)}"]`]
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
    url: input.includeUrl ? input.url : undefined,
    urlVisible: input.includeUrl,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    frames: [{ frameRef: 'f0', origin: new URL(input.url).origin, accessible: true, tree }],
  }

  return { snapshot, records }
}
```

Create `packages/chrome-extension/src/entrypoints/content.ts`:

```ts
import { extractSnapshotFromDocument } from '../content/snapshot-extractor'
import { RefStore } from '../content/ref-store'
import { unsupportedPageReason } from '../content/unsupported-pages'

const refStore = new RefStore()

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === 'tabbridge.snapshot') {
        const unsupported = unsupportedPageReason(window.location.href)
        if (unsupported) {
          sendResponse({ ok: false, error: { code: unsupported, message: 'This page cannot be inspected by TabBridge.', recoverable: false } })
          return true
        }

        const result = extractSnapshotFromDocument({
          tabId: message.tabId,
          snapshotId: message.snapshotId,
          title: document.title,
          url: window.location.href,
          includeUrl: Boolean(message.includeUrl),
          now: Date.now(),
        })
        refStore.saveSnapshot(message.snapshotId, result.records, Date.now())
        sendResponse({ ok: true, data: result.snapshot })
        return true
      }

      return false
    })
  },
})
```

- [ ] **Step 4: Run extension tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: snapshot extraction, ref store, unsupported page, and previous tests pass. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat: add semantic snapshots and refs"
```

---

### Task 8: Bounded Read Commands and Screenshot Guard

**Files:**
- Create: `packages/chrome-extension/src/content/bounded-read.ts`
- Create: `packages/chrome-extension/src/background/screenshot.ts`
- Modify: `packages/chrome-extension/src/entrypoints/content.ts`
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Test: `packages/chrome-extension/test/bounded-read.test.ts`
- Test: `packages/chrome-extension/test/screenshot.test.ts`

**Interfaces:**
- Consumes: `TEXT_DEFAULT_MAX_BYTES`, `HTML_DEFAULT_MAX_BYTES`, `SCREENSHOT_MIN_INTERVAL_MS`, `MESSAGE_TOO_LARGE`, `TAB_NOT_ACTIVE_FOR_SCREENSHOT`, and `ELEMENT_SCOPE_TOO_LARGE`.
- Produces: `readVisibleText(document, maxBytes): BoundedReadResult`, `sanitizeElementHtml(element, maxBytes): BoundedReadResult`, and `createScreenshotController(now): ScreenshotController`.

- [ ] **Step 1: Write failing bounded read and screenshot tests**

Create `packages/chrome-extension/test/bounded-read.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readVisibleText, sanitizeElementHtml } from '../src/content/bounded-read'

describe('bounded reads', () => {
  it('limits visible text by byte count', () => {
    document.body.innerHTML = '<main><p>Hello visible world</p><script>secret()</script></main>'
    expect(readVisibleText(document, 11)).toEqual({ ok: true, text: 'Hello visib', truncated: true })
  })

  it('sanitizes html by removing scripts, styles, hidden inputs, and form values', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<form><input value="secret"><input type="hidden" value="token"><script>secret()</script><style>.x{}</style><button>Send</button></form>'
    expect(sanitizeElementHtml(wrapper, 1000)).toEqual({
      ok: true,
      html: '<div><form><input><button>Send</button></form></div>',
      truncated: false,
    })
  })
})
```

Create `packages/chrome-extension/test/screenshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createScreenshotController } from '../src/background/screenshot'

describe('screenshot controller', () => {
  it('rejects inactive tabs', async () => {
    const controller = createScreenshotController(() => 1000)
    const result = await controller.capture({ tabId: 1, windowId: 2, active: false }, async () => 'data:image/png;base64,abc')

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
        message: 'Screenshot is only supported for the current active tab in the selected window.',
        recoverable: true,
        suggestedCommand: 'Activate the target tab in Chrome, then retry tabbridge screenshot --tab 1 --json.',
      },
    })
  })

  it('throttles screenshot calls to about two per second', async () => {
    const controller = createScreenshotController(() => 1000)
    await controller.capture({ tabId: 1, windowId: 2, active: true }, async () => 'data:image/png;base64,abc')
    const second = await controller.capture({ tabId: 1, windowId: 2, active: true }, async () => 'data:image/png;base64,def')

    expect(second).toMatchObject({ ok: false, error: { code: 'BROWSER_COMMAND_TIMEOUT', recoverable: true } })
  })
})
```

- [ ] **Step 2: Run extension tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- bounded-read screenshot
```

Expected: tests fail because bounded read and screenshot modules do not exist.

- [ ] **Step 3: Implement bounded text/html reads and screenshot guard**

Create `packages/chrome-extension/src/content/bounded-read.ts`:

```ts
export type BoundedReadResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: true; html: string; truncated: boolean }
  | { ok: false; code: 'MESSAGE_TOO_LARGE' | 'ELEMENT_SCOPE_TOO_LARGE'; message: string }

function limitUtf8(input: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoder = new TextEncoder()
  let output = ''
  for (const char of input) {
    if (encoder.encode(output + char).byteLength > maxBytes) return { value: output, truncated: true }
    output += char
  }
  return { value: output, truncated: false }
}

export function readVisibleText(doc: Document, maxBytes: number): BoundedReadResult {
  const clone = doc.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script,style,noscript,input[type="hidden"]').forEach((node) => node.remove())
  const text = clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const limited = limitUtf8(text, maxBytes)
  return { ok: true, text: limited.value, truncated: limited.truncated }
}

export function sanitizeElementHtml(element: Element, maxBytes: number): BoundedReadResult {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script,style,noscript,input[type="hidden"]').forEach((node) => node.remove())
  clone.querySelectorAll('input,textarea').forEach((node) => {
    node.removeAttribute('value')
    node.textContent = ''
  })
  clone.querySelectorAll('[data-token],[data-secret]').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.includes('token') || attr.name.includes('secret')) node.removeAttribute(attr.name)
    }
  })

  const html = clone.outerHTML
  const limited = limitUtf8(html, maxBytes)
  return { ok: true, html: limited.value, truncated: limited.truncated }
}
```

Create `packages/chrome-extension/src/background/screenshot.ts`:

```ts
import { errorEnvelope, okEnvelope, SCREENSHOT_MIN_INTERVAL_MS, type CliEnvelope } from '@tabbridge/shared'

export type ScreenshotTab = {
  tabId: number
  windowId: number
  active: boolean
}

export function createScreenshotController(now: () => number) {
  let lastCaptureAt = 0

  return {
    async capture(tab: ScreenshotTab, captureVisibleTab: (windowId: number) => Promise<string>): Promise<CliEnvelope<{ dataUrl: string }>> {
      if (!tab.active) {
        return errorEnvelope({
          code: 'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
          message: 'Screenshot is only supported for the current active tab in the selected window.',
          recoverable: true,
          suggestedCommand: `Activate the target tab in Chrome, then retry tabbridge screenshot --tab ${tab.tabId} --json.`,
        })
      }

      const current = now()
      if (current - lastCaptureAt < SCREENSHOT_MIN_INTERVAL_MS) {
        return errorEnvelope({
          code: 'BROWSER_COMMAND_TIMEOUT',
          message: 'Screenshot capture is throttled to protect Chrome and user privacy.',
          recoverable: true,
          suggestedCommand: `Wait briefly, then retry tabbridge screenshot --tab ${tab.tabId} --json.`,
        })
      }

      lastCaptureAt = current
      return okEnvelope({ dataUrl: await captureVisibleTab(tab.windowId) })
    },
  }
}
```

Replace `packages/chrome-extension/src/entrypoints/content.ts` with this version so content script handles snapshots, bounded text, bounded HTML, ref actions, and ref clearing:

```ts
import { HTML_DEFAULT_MAX_BYTES, TEXT_DEFAULT_MAX_BYTES, errorEnvelope, refStaleError } from '@tabbridge/shared'
import { executeRefAction } from '../content/actions'
import { readVisibleText, sanitizeElementHtml } from '../content/bounded-read'
import { RefStore } from '../content/ref-store'
import { extractSnapshotFromDocument } from '../content/snapshot-extractor'
import { unsupportedPageReason } from '../content/unsupported-pages'

const refStore = new RefStore()

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === 'tabbridge.snapshot') {
        const unsupported = unsupportedPageReason(window.location.href)
        if (unsupported) {
          sendResponse({ ok: false, error: { code: unsupported, message: 'This page cannot be inspected by TabBridge.', recoverable: false } })
          return true
        }

        const result = extractSnapshotFromDocument({
          tabId: message.tabId,
          snapshotId: message.snapshotId,
          title: document.title,
          url: window.location.href,
          includeUrl: Boolean(message.includeUrl),
          now: Date.now(),
        })
        refStore.saveSnapshot(message.snapshotId, result.records, Date.now())
        sendResponse({ ok: true, data: result.snapshot })
        return true
      }

      if (message?.type === 'tabbridge.text') {
        sendResponse({ ok: true, data: readVisibleText(document, message.maxBytes ?? TEXT_DEFAULT_MAX_BYTES) })
        return true
      }

      if (message?.type === 'tabbridge.html') {
        const record = refStore.getRecord(message.snapshotId, message.frameRef ?? 'f0', message.ref, Date.now())
        if (!record) {
          sendResponse(errorEnvelope(refStaleError(message.tabId)))
          return true
        }
        const element = record.selectorCandidates.map((selector) => document.querySelector(selector)).find(Boolean)
        if (!element) {
          sendResponse(errorEnvelope(refStaleError(message.tabId)))
          return true
        }
        sendResponse({ ok: true, data: sanitizeElementHtml(element, message.maxBytes ?? HTML_DEFAULT_MAX_BYTES) })
        return true
      }

      if (message?.type === 'tabbridge.action') {
        executeRefAction({
          command: message.command,
          tabId: message.tabId,
          snapshotId: message.snapshotId,
          frameRef: message.frameRef ?? 'f0',
          ref: message.ref,
          text: message.text,
          value: message.value,
        }, refStore, Date.now()).then(sendResponse)
        return true
      }

      if (message?.type === 'tabbridge.clearRefs') {
        refStore.clearForTab(message.tabId)
        sendResponse({ ok: true, data: { cleared: true } })
        return true
      }

      return false
    })
  },
})
```

- [ ] **Step 4: Run extension tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: bounded read and screenshot tests pass with previous extension tests. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat: add bounded page reads and screenshot guard"
```

---

### Task 9: Ref-Based Actions, Stale Ref Validation, and High-Risk Confirmation

**Files:**
- Create: `packages/chrome-extension/src/content/actions.ts`
- Modify: `packages/chrome-extension/src/entrypoints/content.ts`
- Modify: `packages/chrome-extension/src/background/approvals.ts`
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Test: `packages/chrome-extension/test/actions.test.ts`
- Test: `packages/chrome-extension/test/high-risk-confirmation.test.ts`

**Interfaces:**
- Consumes: `RefStore`, `ElementRefRecord`, `refStaleError`, `classifyRisk`, and `createActionRequiresConfirmationError`.
- Produces: `executeRefAction(input, refStore, now): CliEnvelope<ActionResult>`, `revalidateRef(record): Element`, and high-risk approval creation for one-shot actions.

- [ ] **Step 1: Write failing action and high-risk tests**

Create `packages/chrome-extension/test/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RefStore } from '../src/content/ref-store'
import { executeRefAction } from '../src/content/actions'

describe('ref-based actions', () => {
  it('returns REF_STALE when snapshot id is missing or wrong', async () => {
    const store = new RefStore()
    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_missing', frameRef: 'f0', ref: '@e1' }, store, 1000)

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'REF_STALE',
        message: 'The element reference is stale. Take a new snapshot and retry with a ref from that snapshot.',
        recoverable: true,
        suggestedCommand: 'tabbridge snapshot --tab 1 --json',
      },
    })
  })

  it('clicks visible enabled elements resolved from the matching snapshot', async () => {
    document.body.innerHTML = '<button id="merge">Merge</button>'
    const store = new RefStore()
    store.saveSnapshot('snap_1', [{
      snapshotId: 'snap_1',
      tabId: 1,
      frameRef: 'f0',
      ref: '@e1',
      selectorCandidates: ['#merge'],
      xpathCandidates: ['//*[@id="merge"]'],
      role: 'button',
      name: 'Merge',
      textFingerprint: 'Merge',
      boundingBox: [0, 0, 100, 40],
      generatedAt: 1000,
    }], 1000)

    let clicked = false
    document.querySelector('#merge')?.addEventListener('click', () => {
      clicked = true
    })

    const result = await executeRefAction({ command: 'click', tabId: 1, snapshotId: 'snap_1', frameRef: 'f0', ref: '@e1' }, store, 1001)

    expect(result).toEqual({ ok: true, data: { action: 'click', ref: '@e1' } })
    expect(clicked).toBe(true)
  })
})
```

Create `packages/chrome-extension/test/high-risk-confirmation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApprovalStore } from '../src/background/approvals'

describe('high-risk action approvals', () => {
  it('creates redacted one-shot confirmation for credential-like typing', () => {
    const store = new ApprovalStore(() => 1782010000000, () => 'appr_secret')
    const result = store.createHighRiskActionApproval({
      tabId: 1,
      domain: 'example.com',
      command: 'type',
      description: 'Type into Password',
      riskReasons: ['field accepts password or credential-like input'],
      payloadSummary: '[REDACTED_SECRET length=12]',
    })

    expect(result.envelope).toEqual({
      ok: false,
      error: {
        code: 'ACTION_REQUIRES_CONFIRMATION',
        message: 'This action requires confirmation in the TabBridge extension UI.',
        recoverable: true,
        approvalId: 'appr_secret',
        expiresAt: 1782010300000,
        pollCommand: 'tabbridge approvals wait --id appr_secret --json',
      },
    })
    expect(JSON.stringify(store.get('appr_secret'))).not.toContain('hunter2')
  })
})
```

- [ ] **Step 2: Run extension tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- actions high-risk-confirmation
```

Expected: tests fail because action execution and high-risk approval helpers do not exist.

- [ ] **Step 3: Implement ref action execution and confirmation creation**

Create `packages/chrome-extension/src/content/actions.ts`:

```ts
import { errorEnvelope, okEnvelope, refStaleError, type CliEnvelope } from '@tabbridge/shared'
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

function resolveElement(selectorCandidates: string[]): Element | undefined {
  for (const selector of selectorCandidates) {
    const element = document.querySelector(selector)
    if (element) return element
  }
  return undefined
}

function visibleAndEnabled(element: Element): CliEnvelope<undefined> | undefined {
  const html = element as HTMLElement
  const style = window.getComputedStyle(html)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return errorEnvelope({ code: 'ELEMENT_NOT_VISIBLE', message: 'The target element is not visible.', recoverable: true })
  }
  if ('disabled' in html && Boolean((html as HTMLButtonElement).disabled)) {
    return errorEnvelope({ code: 'ELEMENT_DISABLED', message: 'The target element is disabled.', recoverable: true })
  }
  return undefined
}

export async function executeRefAction(input: RefActionInput, store: RefStore, now: number): Promise<CliEnvelope<ActionResult>> {
  const record = store.getRecord(input.snapshotId, input.frameRef, input.ref, now)
  if (!record) return errorEnvelope(refStaleError(input.tabId))

  const element = resolveElement(record.selectorCandidates)
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

Update `packages/chrome-extension/src/background/approvals.ts` to add high-risk action approvals:

```ts
import { createActionRequiresConfirmationError, createApprovalRequiredError, errorEnvelope, transitionApproval, type ApprovalRecord, type CliEnvelope } from '@tabbridge/shared'

export type SiteAccessApprovalInput = {
  tabId: number
  title: string
  domain: string
  origin: string
  reason: string
}

export type HighRiskActionApprovalInput = {
  tabId: number
  domain: string
  command: string
  description: string
  riskReasons: string[]
  payloadSummary: string
}

export class ApprovalStore {
  private approvals = new Map<string, ApprovalRecord & { tabId?: number; origin?: string; reason?: string; command?: string }>()

  constructor(
    private readonly now: () => number,
    private readonly createId: () => string,
  ) {}

  createSiteAccessApproval(input: SiteAccessApprovalInput): { approval: ApprovalRecord; envelope: CliEnvelope<never> } {
    const id = this.createId()
    const approval: ApprovalRecord & { tabId: number; origin: string; reason: string } = {
      id,
      kind: 'site-access',
      status: 'pending',
      createdAt: this.now(),
      expiresAt: this.now() + 300_000,
      summary: `Allow ${input.domain} for tab ${input.tabId}: ${input.reason}`,
      executed: false,
      tabId: input.tabId,
      origin: input.origin,
      reason: input.reason,
    }
    this.approvals.set(id, approval)
    return { approval, envelope: errorEnvelope(createApprovalRequiredError({ approvalId: id, expiresAt: approval.expiresAt })) }
  }

  createHighRiskActionApproval(input: HighRiskActionApprovalInput): { approval: ApprovalRecord; envelope: CliEnvelope<never> } {
    const id = this.createId()
    const approval: ApprovalRecord & { tabId: number; command: string } = {
      id,
      kind: 'high-risk-action',
      status: 'pending',
      createdAt: this.now(),
      expiresAt: this.now() + 300_000,
      summary: `${input.description} on ${input.domain}`,
      executed: false,
      tabId: input.tabId,
      command: input.command,
      riskReasons: input.riskReasons,
      payloadSummary: input.payloadSummary,
    }
    this.approvals.set(id, approval)
    return { approval, envelope: errorEnvelope(createActionRequiresConfirmationError({ approvalId: id, expiresAt: approval.expiresAt })) }
  }

  get(id: string): (ApprovalRecord & { tabId?: number; origin?: string; reason?: string; command?: string }) | undefined {
    return this.approvals.get(id)
  }

  transition(id: string, type: 'approve' | 'deny' | 'expire' | 'cancel' | 'mark-executed'): ApprovalRecord | undefined {
    const current = this.approvals.get(id)
    if (!current) return undefined
    const next = transitionApproval(current, { type, now: this.now() } as Parameters<typeof transitionApproval>[1])
    this.approvals.set(id, next)
    return next
  }

  listPending(): ApprovalRecord[] {
    return Array.from(this.approvals.values()).filter((approval) => approval.status === 'pending')
  }
}
```

- [ ] **Step 4: Run extension tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: ref action and high-risk confirmation tests pass with previous extension tests. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat: add ref actions and high-risk confirmations"
```

---

### Task 10: Wait, Navigation Commands, and Queue Integration

**Files:**
- Create: `packages/chrome-extension/src/background/action-queue.ts`
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Modify: `packages/chrome-extension/src/entrypoints/content.ts`
- Test: `packages/chrome-extension/test/wait-navigation.test.ts`
- Test: `packages/chrome-extension/test/action-queue.test.ts`

**Interfaces:**
- Consumes: `TabActionQueue` concept from `packages/broker/src/bridge.ts` and shared browser timeout errors.
- Produces: `ExtensionActionQueue`, command handlers for `wait`, `waitForText`, `navigation.reload`, `navigation.back`, `navigation.forward`, and ref clearing after meaningful actions/navigation.

- [ ] **Step 1: Write failing wait/navigation and queue tests**

Create `packages/chrome-extension/test/wait-navigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { waitForTextInDocument, waitMs } from '../src/background/commands'

describe('wait commands', () => {
  it('waits a requested number of milliseconds', async () => {
    const started = Date.now()
    await waitMs(5)
    expect(Date.now() - started).toBeGreaterThanOrEqual(4)
  })

  it('finds text already present in the document', async () => {
    document.body.innerHTML = '<main>Build passed</main>'
    await expect(waitForTextInDocument(document, 'Build passed', 10)).resolves.toEqual({ found: true, text: 'Build passed' })
  })
})
```

Create `packages/chrome-extension/test/action-queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ExtensionActionQueue } from '../src/background/action-queue'

describe('extension action queue', () => {
  it('serializes meaningful actions by tab id', async () => {
    const queue = new ExtensionActionQueue()
    const events: string[] = []

    await Promise.all([
      queue.run(3, async () => {
        events.push('first-start')
        await new Promise((resolve) => setTimeout(resolve, 5))
        events.push('first-end')
      }),
      queue.run(3, async () => {
        events.push('second-start')
      }),
    ])

    expect(events).toEqual(['first-start', 'first-end', 'second-start'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- wait-navigation action-queue
```

Expected: tests fail because wait helpers and extension queue do not exist.

- [ ] **Step 3: Implement wait/navigation helpers and extension queue**

Create `packages/chrome-extension/src/background/action-queue.ts`:

```ts
export class ExtensionActionQueue {
  private tails = new Map<number, Promise<unknown>>()

  async run<T>(tabId: number, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(tabId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(action)
    this.tails.set(tabId, next)

    try {
      return await next
    } finally {
      if (this.tails.get(tabId) === next) this.tails.delete(tabId)
    }
  }
}
```

Append wait helpers to `packages/chrome-extension/src/background/commands.ts`:

```ts
export async function waitMs(ms: number): Promise<{ waitedMs: number }> {
  await new Promise((resolve) => setTimeout(resolve, ms))
  return { waitedMs: ms }
}

export async function waitForTextInDocument(doc: Document, text: string, timeoutMs: number): Promise<{ found: boolean; text: string }> {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if ((doc.body.textContent ?? '').includes(text)) return { found: true, text }
    await waitMs(50)
  }
  return { found: false, text }
}
```

Replace `packages/chrome-extension/src/background/commands.ts` with this version so `wait`, `waitForText`, `navigation.reload`, `navigation.back`, and `navigation.forward` are queued by tab id and navigation clears old refs:

```ts
import { errorEnvelope, okEnvelope, tabNotAuthorizedError, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'
import { ExtensionActionQueue } from './action-queue'

export type CommandContext = {
  listTabs(): Promise<unknown[]>
  currentTab(): Promise<unknown | undefined>
  sendTabMessage(tabId: number, message: unknown): Promise<unknown>
  reloadTab(tabId: number): Promise<void>
  goBack(tabId: number): Promise<void>
  goForward(tabId: number): Promise<void>
}

const actionQueue = new ExtensionActionQueue()

export async function waitMs(ms: number): Promise<{ waitedMs: number }> {
  await new Promise((resolve) => setTimeout(resolve, ms))
  return { waitedMs: ms }
}

export async function waitForTextInDocument(doc: Document, text: string, timeoutMs: number): Promise<{ found: boolean; text: string }> {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if ((doc.body.textContent ?? '').includes(text)) return { found: true, text }
    await waitMs(50)
  }
  return { found: false, text }
}

export async function routeBridgeCommand(request: BridgeRequest, context?: CommandContext): Promise<CliEnvelope<unknown>> {
  if (request.command === 'status') {
    return okEnvelope({ bridge: 'connected' })
  }

  if (request.command === 'tabs.list' && context) {
    return okEnvelope(await context.listTabs())
  }

  if (request.command === 'tabs.current' && context) {
    const tab = await context.currentTab()
    if (!tab) {
      return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
    }
    return okEnvelope(tab)
  }

  if (request.command === 'snapshot') {
    const payload = request.payload as { tabId: number; includeUrl?: boolean }
    if (!context) return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    return okEnvelope(await context.sendTabMessage(payload.tabId, {
      type: 'tabbridge.snapshot',
      tabId: payload.tabId,
      snapshotId: `snap_${Date.now()}`,
      includeUrl: Boolean(payload.includeUrl),
    }))
  }

  if (request.command === 'wait') {
    const payload = request.payload as { tabId: number; ms: number }
    return actionQueue.run(payload.tabId, async () => okEnvelope(await waitMs(payload.ms)))
  }

  if (request.command === 'waitForText') {
    const payload = request.payload as { tabId: number; text: string; timeoutMs?: number }
    if (!context) return errorEnvelope({ code: 'BROWSER_COMMAND_TIMEOUT', message: 'Cannot wait for text without an extension command context.', recoverable: true })
    return actionQueue.run(payload.tabId, async () => okEnvelope(await context.sendTabMessage(payload.tabId, {
      type: 'tabbridge.waitForText',
      text: payload.text,
      timeoutMs: payload.timeoutMs ?? 30_000,
    })))
  }

  if (request.command === 'navigation.reload' || request.command === 'navigation.back' || request.command === 'navigation.forward') {
    const payload = request.payload as { tabId: number }
    if (!context) return errorEnvelope({ code: 'BROWSER_COMMAND_TIMEOUT', message: 'Cannot run navigation without an extension command context.', recoverable: true })
    return actionQueue.run(payload.tabId, async () => {
      if (request.command === 'navigation.reload') await context.reloadTab(payload.tabId)
      if (request.command === 'navigation.back') await context.goBack(payload.tabId)
      if (request.command === 'navigation.forward') await context.goForward(payload.tabId)
      await context.sendTabMessage(payload.tabId, { type: 'tabbridge.clearRefs', tabId: payload.tabId })
      return okEnvelope({ navigated: true, refsCleared: true })
    })
  }

  return errorEnvelope({
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not supported in the current extension mode.`,
    recoverable: false,
  })
}
```

Update `packages/chrome-extension/src/entrypoints/content.ts` by adding this handler before the final `return false` branch:

```ts
      if (message?.type === 'tabbridge.waitForText') {
        const started = Date.now()
        const timeoutMs = message.timeoutMs ?? 30_000
        const poll = () => {
          if ((document.body.textContent ?? '').includes(message.text)) {
            sendResponse({ ok: true, data: { found: true, text: message.text } })
            return
          }
          if (Date.now() - started >= timeoutMs) {
            sendResponse({ ok: true, data: { found: false, text: message.text } })
            return
          }
          setTimeout(poll, 50)
        }
        poll()
        return true
      }
```

- [ ] **Step 4: Run extension tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: wait/navigation and queue tests pass with previous extension tests. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat: add wait navigation and action queue"
```

---

### Task 11: Vue Approval and Confirmation Popup UI

**Files:**
- Modify: `packages/chrome-extension/src/entrypoints/popup/App.vue`
- Create: `packages/chrome-extension/src/ui/useApprovalState.ts`
- Test: `packages/chrome-extension/test/popup.test.ts`
- Test: `packages/chrome-extension/test/use-approval-state.test.ts`

**Interfaces:**
- Consumes: `ApprovalRecord`, `ApprovalStatus`, and background approval messages.
- Produces: Popup UI showing bridge status, site authorization requests, high-risk confirmations, redacted payload summaries, `Allow`, `Allow once`, and `Deny` actions. Uses Vue 3 Composition API and keeps mutation logic inside a composable.

- [ ] **Step 1: Write failing popup UI tests**

Create `packages/chrome-extension/test/use-approval-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { useApprovalState } from '../src/ui/useApprovalState'

describe('useApprovalState', () => {
  it('separates pending site approvals from high-risk confirmations', () => {
    const state = useApprovalState()
    state.setApprovals([
      { id: 'appr_site', kind: 'site-access', status: 'pending', createdAt: 1, expiresAt: 2, summary: 'Allow github.com', executed: false },
      { id: 'appr_action', kind: 'high-risk-action', status: 'pending', createdAt: 1, expiresAt: 2, summary: 'Click Delete', executed: false, payloadSummary: '[REDACTED_SECRET length=4]' },
    ])

    expect(state.siteApprovals.value.map((approval) => approval.id)).toEqual(['appr_site'])
    expect(state.highRiskApprovals.value.map((approval) => approval.id)).toEqual(['appr_action'])
  })
})
```

Create `packages/chrome-extension/test/popup.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from '../src/entrypoints/popup/App.vue'

describe('popup approval UI', () => {
  it('renders bridge status and empty approval state', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('TabBridge')
    expect(wrapper.text()).toContain('No pending approvals')
  })
})
```

- [ ] **Step 2: Run popup tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- popup use-approval-state
```

Expected: tests fail because the composable and final popup UI do not exist.

- [ ] **Step 3: Implement approval composable and Vue popup**

Create `packages/chrome-extension/src/ui/useApprovalState.ts`:

```ts
import { computed, readonly, ref } from 'vue'
import type { ApprovalRecord } from '@tabbridge/shared'

export function useApprovalState() {
  const approvals = ref<ApprovalRecord[]>([])

  const pendingApprovals = computed(() => approvals.value.filter((approval) => approval.status === 'pending'))
  const siteApprovals = computed(() => pendingApprovals.value.filter((approval) => approval.kind === 'site-access'))
  const highRiskApprovals = computed(() => pendingApprovals.value.filter((approval) => approval.kind === 'high-risk-action'))

  function setApprovals(nextApprovals: ApprovalRecord[]): void {
    approvals.value = nextApprovals
  }

  return {
    approvals: readonly(approvals),
    pendingApprovals,
    siteApprovals,
    highRiskApprovals,
    setApprovals,
  }
}
```

Replace `packages/chrome-extension/src/entrypoints/popup/App.vue`:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useApprovalState } from '../../ui/useApprovalState'

const extensionName = 'TabBridge'
const approvalState = useApprovalState()

onMounted(() => {
  chrome.runtime?.sendMessage?.({ type: 'tabbridge.popup.listApprovals' }, (response) => {
    if (response?.ok && Array.isArray(response.data?.approvals)) {
      approvalState.setApprovals(response.data.approvals)
    }
  })
})

function decide(id: string, decision: 'approve' | 'deny'): void {
  chrome.runtime?.sendMessage?.({ type: 'tabbridge.popup.decideApproval', id, decision }, (response) => {
    if (response?.ok && Array.isArray(response.data?.approvals)) {
      approvalState.setApprovals(response.data.approvals)
    }
  })
}
</script>

<template>
  <main class="min-w-96 bg-slate-950 p-4 text-slate-100">
    <header class="border-b border-slate-800 pb-3">
      <h1 class="text-lg font-semibold">{{ extensionName }}</h1>
      <p class="mt-1 text-xs text-slate-400">Local bridge for authorized, already-open Chrome tabs.</p>
    </header>

    <section class="mt-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Bridge status</h2>
      <p class="mt-2 rounded-md border border-emerald-800 bg-emerald-950 px-3 py-2 text-sm text-emerald-100">
        Extension UI is available. Native bridge status is checked by <code>tabbridge status --json</code>.
      </p>
    </section>

    <section class="mt-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Pending approvals</h2>
      <p v-if="approvalState.pendingApprovals.value.length === 0" class="mt-2 text-sm text-slate-400">No pending approvals.</p>

      <article
        v-for="approval in approvalState.siteApprovals.value"
        :key="approval.id"
        class="mt-3 rounded-lg border border-sky-800 bg-sky-950 p-3"
      >
        <h3 class="font-medium text-sky-100">Site access request</h3>
        <p class="mt-1 text-sm text-sky-200">{{ approval.summary }}</p>
        <div class="mt-3 flex gap-2">
          <button class="rounded bg-sky-300 px-3 py-1 text-sm font-semibold text-sky-950" @click="decide(approval.id, 'approve')">Allow</button>
          <button class="rounded border border-sky-700 px-3 py-1 text-sm text-sky-100" @click="decide(approval.id, 'deny')">Deny</button>
        </div>
      </article>

      <article
        v-for="approval in approvalState.highRiskApprovals.value"
        :key="approval.id"
        class="mt-3 rounded-lg border border-amber-700 bg-amber-950 p-3"
      >
        <h3 class="font-medium text-amber-100">High-risk action</h3>
        <p class="mt-1 text-sm text-amber-200">{{ approval.summary }}</p>
        <p v-if="approval.payloadSummary" class="mt-2 rounded bg-amber-900 px-2 py-1 font-mono text-xs text-amber-100">{{ approval.payloadSummary }}</p>
        <ul v-if="approval.riskReasons?.length" class="mt-2 list-disc pl-5 text-xs text-amber-200">
          <li v-for="reason in approval.riskReasons" :key="reason">{{ reason }}</li>
        </ul>
        <div class="mt-3 flex gap-2">
          <button class="rounded bg-amber-300 px-3 py-1 text-sm font-semibold text-amber-950" @click="decide(approval.id, 'approve')">Allow once</button>
          <button class="rounded border border-amber-700 px-3 py-1 text-sm text-amber-100" @click="decide(approval.id, 'deny')">Deny</button>
        </div>
      </article>
    </section>
  </main>
</template>
```

- [ ] **Step 4: Run popup tests, typecheck, and extension build**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
pnpm --filter @tabbridge/chrome-extension build
```

Expected: popup and composable tests pass with previous extension tests. Vue TypeScript reports no errors. WXT build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat: add approval popup UI"
```

---

### Task 12: Official TabBridge Skill, CLI Reference, and End-to-End Verification

**Files:**
- Create: `skills/tabbridge/SKILL.md`
- Create: `skills/tabbridge/references/cli-reference.md`
- Create: `skills/tabbridge/references/error-recovery.md`
- Create: `skills/tabbridge/references/security-boundaries.md`
- Create: `docs/superpowers/manual-smoke-tests/tabbridge-mvp.md`
- Modify: `THIRD_PARTY_NOTICES.md` if implementation copied or substantially adapted third-party source.
- Test: `skills/tabbridge/SKILL.md` by manual review against the spec behavior list.
- Test: Full workspace commands and manual smoke checklist.

**Interfaces:**
- Consumes: Finished CLI command set and shared envelope shapes.
- Produces: Official Claude Code skill that tells agents when and how to use `tabbridge`, plus manual smoke test documentation.

- [ ] **Step 1: Write the official skill file**

Create `skills/tabbridge/SKILL.md`:

```markdown
---
name: tabbridge
---

# TabBridge

Use this skill when the user asks you to inspect, understand, or interact with a webpage that is already open in their local Chrome or Chromium browser, and they explicitly want to use TabBridge.

TabBridge controls only user-authorized, already-open tabs. It does not launch a separate browser, create a new browser profile, open new tabs as the main workflow, extract cookies, read localStorage, run arbitrary JavaScript, intercept network traffic, or bypass user approvals.

## Required Safety Rules

1. Start with `tabbridge status --json`.
2. If the bridge is not connected, follow the structured error recovery instruction and ask the user to open Chrome and click the TabBridge extension icon.
3. Discover tabs with `tabbridge tabs list --json` or `tabbridge tabs current --json`.
4. Do not assume discovery grants page-content access.
5. Before reading page content, request access with `tabbridge tabs request-access --tab <tabId> --reason <reason> --json`.
6. If the CLI returns `USER_APPROVAL_REQUIRED`, tell the user what is being requested and wait with `tabbridge approvals wait --id <approvalId> --json`.
7. Prefer `tabbridge snapshot --tab <tabId> --json` for page understanding.
8. Save the returned `snapshotId` and use `snapshotId + ref` for ref-based actions.
9. After meaningful page actions, take a new snapshot before continuing.
10. If `REF_STALE` is returned, take a new snapshot and retry only if the user still wants the action.
11. Prefer ref-based actions over coordinate actions.
12. Coordinate click and drag are high-risk fallback actions and may require confirmation.
13. Use `type --text-stdin` for ordinary non-sensitive text instead of placing text in argv.
14. Never put passwords, 2FA codes, payment details, credentials, or token-like values in CLI argv.
15. Do not ask TabBridge for cookies, localStorage, credentials, tokens, arbitrary JavaScript execution, or network interception.
16. Do not paste large HTML, screenshot data, or secrets into the conversation unless the user explicitly asks and the content is not sensitive.

## Standard Workflow

```bash
tabbridge status --json
tabbridge tabs list --json
tabbridge tabs request-access --tab <tabId> --reason "<short user-visible reason>" --json
tabbridge approvals wait --id <approvalId> --json
tabbridge snapshot --tab <tabId> --json
```

When acting on elements:

```bash
tabbridge click --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge snapshot --tab <tabId> --json
```

When typing ordinary non-sensitive text:

```bash
printf '%s' "ordinary text" | tabbridge type --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --text-stdin --json
```

## Error Recovery

Always parse the JSON envelope. A failed command still prints a machine-readable error envelope to stdout in `--json` mode.

If the error includes `suggestedCommand`, explain the situation and run or ask for that recovery step when appropriate. If the error includes `approvalId` or `pollCommand`, explain the pending approval and wait for the user decision.
```

- [ ] **Step 2: Write CLI reference**

Create `skills/tabbridge/references/cli-reference.md`:

```markdown
# TabBridge CLI Reference

All agent-facing commands should use `--json` and parse the stable envelope.

## Envelope

Success:

```json
{"ok":true,"data":{"tabId":123,"snapshotId":"snap_abc"}}
```

Failure:

```json
{"ok":false,"error":{"code":"TAB_NOT_AUTHORIZED","message":"Request access before reading this tab.","recoverable":true,"suggestedCommand":"tabbridge tabs request-access --tab 123 --reason <reason> --json"}}
```

## Discovery

```bash
tabbridge tabs list --json
tabbridge tabs current --json
```

Discovery output includes `tabId`, `windowId`, `title`, `domain`, `active`, and `accessStatus`. It does not include full URL or favicon URL by default.

## Access

```bash
tabbridge tabs request-access --tab <tabId> --reason "<reason>" --json
tabbridge approvals wait --id <approvalId> --timeout 30000 --json
tabbridge tabs release --tab <tabId> --json
```

## Reading

```bash
tabbridge snapshot --tab <tabId> --json
tabbridge snapshot --tab <tabId> --include-url --json
tabbridge text --tab <tabId> --max-bytes 131072 --json
tabbridge html --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --max-bytes 65536 --json
tabbridge screenshot --tab <tabId> --json
```

`--include-url` only returns URL after Level 2 authorization. Screenshot is supported only for the current active tab in the selected window.

## Actions

```bash
tabbridge click --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge type --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --text-stdin --json
tabbridge clear --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge select --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --value <value> --json
tabbridge check --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge uncheck --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge focus --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
```

Ref-based actions must include `snapshotId`. If `REF_STALE` is returned, take a fresh snapshot.

## Wait and Navigation

```bash
tabbridge wait --tab <tabId> --ms <ms> --json
tabbridge wait-for-text --tab <tabId> --text <text> --timeout <ms> --json
tabbridge reload --tab <tabId> --json
tabbridge back --tab <tabId> --json
tabbridge forward --tab <tabId> --json
```

After reload, back, or forward, discard old refs and take a new snapshot.
```

- [ ] **Step 3: Write error recovery and security references**

Create `skills/tabbridge/references/error-recovery.md`:

```markdown
# TabBridge Error Recovery

- `EXTENSION_NOT_CONNECTED`: Ask the user to open Chrome and click the TabBridge extension icon, or run any `tabbridge` command (e.g., `tabbridge status --json`) to start the broker. Then run `tabbridge status --json`.
- `BRIDGE_SOCKET_UNAVAILABLE`: Ask the user to reopen the extension popup. Run `tabbridge doctor` if it persists.
- `TAB_NOT_AUTHORIZED`: Run `tabbridge tabs request-access --tab <tabId> --reason <reason> --json`.
- `USER_APPROVAL_REQUIRED`: Explain the access request and wait with the returned approval id.
- `ACTION_REQUIRES_CONFIRMATION`: Explain the high-risk action and wait with the returned approval id.
- `REF_STALE`: Take a new snapshot and use a ref from the new snapshot.
- `TAB_NOT_ACTIVE_FOR_SCREENSHOT`: Ask the user to activate the target tab before retrying screenshot.
- `UNSUPPORTED_PAGE`: Explain that Chrome internal pages, extension pages, file URLs, and special pages are outside the MVP.
- `MESSAGE_TOO_LARGE`: Retry with a smaller `--max-bytes` value or a narrower `html --ref` scope.
```

Create `skills/tabbridge/references/security-boundaries.md`:

```markdown
# TabBridge Security Boundaries

TabBridge is designed to protect the user's real browser context from unapproved agent access.

Allowed after user authorization:

- Redacted tab discovery.
- Semantic snapshots.
- Bounded visible text reads.
- Bounded subtree HTML reads for refs.
- Ref-based low and medium risk page actions.
- High-risk actions only after explicit confirmation.

Forbidden in the MVP:

- Cookie extraction.
- localStorage extraction.
- Credential or token extraction.
- Arbitrary JavaScript execution.
- Network interception.
- Unbounded DOM dumps.
- Secret values in CLI argv.
- Silent fallback from ref actions to coordinate actions.
- Silent execution of high-risk actions.

Password, 2FA, payment, credential, and token-like fields require user involvement. The agent must not provide secret values directly.
```

- [ ] **Step 4: Write manual smoke test checklist**

Create `docs/superpowers/manual-smoke-tests/tabbridge-mvp.md`:

```markdown
# TabBridge MVP Manual Smoke Tests

Run these after unit and integration tests pass.

1. Build all packages with `pnpm build`.
2. Start WXT dev mode with `pnpm --filter @tabbridge/chrome-extension dev`.
3. Load the generated Chrome extension and record the extension id.
4. Open multiple normal Chrome tabs, including one supported `https://` page.
5. Click the TabBridge extension icon to connect to the broker.
6. Run `tabbridge status --json` and confirm `ok: true`.
8. Run `tabbridge tabs list --json` and confirm output includes title/domain but no full URL or favicon URL.
9. Run `tabbridge tabs current --json` and confirm it matches Chrome's focused active tab.
10. Run `tabbridge tabs request-access --tab <tabId> --reason "Smoke test snapshot" --json`.
11. Approve the request in the extension popup.
12. Run `tabbridge approvals wait --id <approvalId> --json` and confirm authorization succeeds.
13. Run `tabbridge snapshot --tab <tabId> --json` and confirm refs use `@e` format.
14. Run a low-risk `tabbridge focus` or `tabbridge click` using the returned `snapshotId` and `ref`.
15. Take a new snapshot after the action.
16. Run `tabbridge wait-for-text --tab <tabId> --text "<visible text>" --timeout 5000 --json`.
17. Run `tabbridge text --tab <tabId> --max-bytes 1024 --json` and confirm bounded visible text is returned.
18. Run `tabbridge html --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --max-bytes 2048 --json` and confirm scripts, styles, hidden inputs, and form values are removed.
19. Run `tabbridge screenshot --tab <tabId> --json` while the tab is active and confirm it succeeds.
20. Switch to another tab and run screenshot for the inactive tab; confirm `TAB_NOT_ACTIVE_FOR_SCREENSHOT`.
21. Trigger a high-risk action such as clicking a button named Delete on a safe fixture page and confirm the extension asks for confirmation.
22. Run `tabbridge doctor` and confirm broker listening, token/lock files, protocol version, and extension id checks are understandable.
23. Run `tabbridge tabs release --tab <tabId> --json` and confirm subsequent snapshot returns `TAB_NOT_AUTHORIZED`.
```

- [ ] **Step 5: Run full automated verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all package tests pass, all packages typecheck, and all packages build successfully.

- [ ] **Step 6: Run manual smoke tests**

Run the checklist in `docs/superpowers/manual-smoke-tests/tabbridge-mvp.md` on macOS with Chrome or Chromium.

Expected: all manual smoke tests pass. Any failure must be fixed before claiming MVP completion.

- [ ] **Step 7: Commit**

```bash
git add skills/tabbridge docs/superpowers/manual-smoke-tests THIRD_PARTY_NOTICES.md
git commit -m "docs: add TabBridge skill and smoke tests"
```

---

## Final Verification Checklist

Run these commands from the repository root after all tasks are complete:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Expected final automated result:

- `pnpm install` completes successfully.
- `pnpm test` passes for `@tabbridge/shared`, `@tabbridge/cli`, `@tabbridge/broker`, and `@tabbridge/chrome-extension`.
- `pnpm typecheck` reports no TypeScript or Vue type errors.
- `pnpm build` builds all packages, including the WXT Chrome extension.

Manual verification must also complete the smoke checklist in `docs/superpowers/manual-smoke-tests/tabbridge-mvp.md` before claiming the MVP works in Chrome.

## Self-Review Notes

### Spec Coverage

- Greenfield monorepo scaffold is covered in Task 1.
- CLI command set, JSON envelope, and safe stdout behavior are covered in Tasks 2 and 6 (broker client/doctor).
- WebSocket broker, extension/broker hello handshake, JSON-RPC routing, request forwarding, and per-tab queues are covered in [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) Tasks 3–5.
- `tabbridge doctor` broker health checks are covered in [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) Task 5 / Task 6.
- WXT + Vue + Vite + Tailwind MV3 extension scaffold, broker client lifecycle, and required permissions are covered in Task 5 and [`2026-06-22-tabbridge-websocket.md`](./2026-06-22-tabbridge-websocket.md) Task 7.
- Redacted tab discovery, `tabs current`, site access requests, product grants, and approval lifecycle are covered in Task 6.
- Semantic snapshots, agent-browser-style refs, ref TTL, snapshot retention, unsupported pages, and iframe placeholder foundations are covered in Task 7.
- Bounded text, bounded HTML, and active-tab-only screenshot guard are covered in Task 8.
- Ref-bound actions, stale ref validation, synthetic DOM action limits, high-risk confirmation, and secret redaction behavior are covered in Task 9.
- Wait, wait-for-text, reload, back, forward, and post-action ref invalidation are covered in Task 10.
- Extension authorization and high-risk confirmation UI are covered in Task 11.
- Official skill behavior, safe CLI workflow, recovery strategy, forbidden capabilities, and smoke tests are covered in Task 12.
- Future MCP adapter is intentionally not implemented and shared protocol remains adapter-friendly through Task 1 interfaces.

### Placeholder Scan

This plan intentionally avoids deferred implementation markers. Every task defines exact files, interfaces, test commands, expected results, and concrete code examples for the core behavior it introduces.

### Type Consistency

- CLI envelope types are defined once in `packages/shared/src/protocol.ts` and imported everywhere.
- Error codes are defined once in `packages/shared/src/errors.ts`.
- Approval state uses `ApprovalRecord` consistently in shared, extension background, and popup UI.
- Snapshot refs use `snapshotId`, `frameRef`, and `ref` consistently across extractor, ref store, and action execution.
- Risk classification uses `RiskLevel` and `RiskClassification` consistently across shared and extension actions.
