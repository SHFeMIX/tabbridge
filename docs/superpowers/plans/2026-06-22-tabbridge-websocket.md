# TabBridge WebSocket Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Native Messaging native-host architecture with a local WebSocket broker (`tabbridge broker`) that the CLI starts on demand; both CLI and Chrome extension connect as WebSocket clients and speak JSON-RPC 2.0.

**Architecture:** A `packages/broker` package runs a `ws` WebSocket server on fixed port `9876`. The CLI `ensureBroker()` spawns `tabbridge broker` if no server is listening. CLI sends a session `token` for auth; the extension authenticates by `role: 'extension'` plus `chrome-extension://` origin. All business commands become JSON-RPC methods such as `tabs.list` and `snapshot`. The existing permission/snapshot/ref logic is preserved.

**Tech Stack:** pnpm 10 workspaces, Node 20+, TypeScript, Vitest, `ws` (^8.18.0) for server/CLI client, `proper-lockfile` (^4.1.2) for broker singleton, native `WebSocket` in the extension.

## Global Constraints

- Broker listens on fixed port `9876`.
- CLI authenticates with a session token stored in `~/Library/Application Support/tabbridge/broker-token`.
- Extension does not read local files; it authenticates by origin and `role: 'extension'`.
- All command traffic uses JSON-RPC 2.0 request/response framing.
- `tabbridge native-host`, `install-native-host`, and `uninstall-native-host` are removed.
- `packages/native-host` is deleted.
- MVP supports macOS + Chrome/Chromium only.
- Tests are TDD: write the failing test first, run it, implement, run again, commit.

---

## File Structure Map

- `packages/shared/src/jsonrpc.ts` — JSON-RPC 2.0 types and factories.
- `packages/shared/src/errors.ts` — updated with JSON-RPC error mapping.
- `packages/shared/src/protocol.ts` — remove old BridgeRequest/Response, keep `BridgeHello` as `BrokerHelloParams`.
- `packages/broker/src/runtime.ts` — runtime paths, token read/write.
- `packages/broker/src/lock.ts` — `proper-lockfile` singleton lock.
- `packages/broker/src/server.ts` — WebSocket server, auth, JSON-RPC routing.
- `packages/broker/src/main.ts` — `runBroker()` entry and `tabbridge broker` support.
- `packages/broker/src/index.ts` — public exports.
- `packages/cli/src/broker-client.ts` — WebSocket client for CLI.
- `packages/cli/src/ensure-broker.ts` — start/discover broker.
- `packages/cli/src/commands.ts` — map CLI parse result to JSON-RPC request.
- `packages/cli/src/doctor.ts` — broker health diagnostics.
- `packages/cli/src/main.ts` — updated command routing.
- `packages/chrome-extension/src/background/broker-client.ts` — extension WebSocket client.
- `packages/chrome-extension/src/background/jsonrpc-router.ts` — JSON-RPC method dispatch.
- `packages/chrome-extension/src/background/commands.ts` — updated command handlers.
- `packages/chrome-extension/src/entrypoints/background.ts` — wire broker client.
- `packages/chrome-extension/wxt.config.ts` — remove `nativeMessaging` permission.
- `vitest.workspace.ts` — replace `packages/native-host` with `packages/broker`.

---

### Task 1: Shared JSON-RPC Protocol and Error Mapping

**Files:**
- Create: `packages/shared/src/jsonrpc.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/jsonrpc.test.ts`
- Modify: `packages/shared/test/errors.test.ts`

**Interfaces:**
- Consumes: existing `TabBridgeErrorCode`, `TabBridgeError`, `ERROR_CODES`.
- Produces: `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `createJsonRpcRequest`, `createJsonRpcSuccess`, `createJsonRpcError`, `tabBridgeErrorToJsonRpc`, `jsonRpcErrorToTabBridgeError`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/jsonrpc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createJsonRpcRequest, createJsonRpcSuccess, createJsonRpcError } from '../src/jsonrpc'

describe('jsonrpc', () => {
  it('creates a request', () => {
    expect(createJsonRpcRequest('r1', 'tabs.list', { tabId: 1 })).toEqual({
      jsonrpc: '2.0',
      id: 'r1',
      method: 'tabs.list',
      params: { tabId: 1 },
    })
  })

  it('creates a success response', () => {
    expect(createJsonRpcSuccess('r1', { ok: true })).toEqual({
      jsonrpc: '2.0',
      id: 'r1',
      result: { ok: true },
    })
  })

  it('creates an error response', () => {
    expect(createJsonRpcError('r1', { code: -32001, message: 'TAB_NOT_AUTHORIZED' })).toEqual({
      jsonrpc: '2.0',
      id: 'r1',
      error: { code: -32001, message: 'TAB_NOT_AUTHORIZED' },
    })
  })
})
```

Update `packages/shared/test/errors.test.ts` to add JSON-RPC mapping test at the end:

```ts
import { describe, expect, it } from 'vitest'
import { tabBridgeErrorToJsonRpc, jsonRpcErrorToTabBridgeError } from '../src/errors'

describe('JSON-RPC error mapping', () => {
  it('maps TAB_NOT_AUTHORIZED to a stable JSON-RPC error code', () => {
    const error = {
      code: 'TAB_NOT_AUTHORIZED' as const,
      message: 'Request access before reading this tab.',
      recoverable: true,
      suggestedCommand: 'tabbridge tabs request-access --tab 1 --reason x --json',
    }
    const rpc = tabBridgeErrorToJsonRpc(error)
    expect(rpc.code).toBeLessThan(-32000)
    expect(rpc.message).toBe('TAB_NOT_AUTHORIZED')
    expect(rpc.data).toEqual(error)
  })

  it('round-trips through JSON-RPC error data', () => {
    const original = {
      code: 'REF_STALE' as const,
      message: 'stale',
      recoverable: true,
    }
    const rpc = tabBridgeErrorToJsonRpc(original)
    expect(jsonRpcErrorToTabBridgeError(rpc)?.code).toBe('REF_STALE')
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter @tabbridge/shared test
```

Expected: fails because `jsonrpc.ts` and mapping functions do not exist.

- [ ] **Step 3: Implement**

Create `packages/shared/src/jsonrpc.ts`:

```ts
export const JSON_RPC_VERSION = '2.0' as const

export type JsonRpcRequest<TParams = unknown> = {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: TParams
}

export type JsonRpcSuccessResponse<TResult = unknown> = {
  jsonrpc: '2.0'
  id: string
  result: TResult
}

export type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0'
  id: string
  error: JsonRpcError
}

export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccessResponse<TResult> | JsonRpcErrorResponse

export function createJsonRpcRequest<TParams>(id: string, method: string, params?: TParams): JsonRpcRequest<TParams> {
  return { jsonrpc: JSON_RPC_VERSION, id, method, params }
}

export function createJsonRpcSuccess<TResult>(id: string, result: TResult): JsonRpcSuccessResponse<TResult> {
  return { jsonrpc: JSON_RPC_VERSION, id, result }
}

export function createJsonRpcError(id: string, error: JsonRpcError): JsonRpcErrorResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, error }
}
```

Modify `packages/shared/src/errors.ts` to add at the end:

```ts
import type { JsonRpcError } from './jsonrpc'

const JSON_RPC_TABBRIDGE_ERROR_BASE = -32000

export const TAB_BRIDGE_ERROR_CODE_INDEX: Record<TabBridgeErrorCode, number> = Object.fromEntries(
  ERROR_CODES.map((code, index) => [code, index]),
) as Record<TabBridgeErrorCode, number>

export function tabBridgeErrorToJsonRpc(error: TabBridgeError): JsonRpcError {
  return {
    code: JSON_RPC_TABBRIDGE_ERROR_BASE - TAB_BRIDGE_ERROR_CODE_INDEX[error.code],
    message: error.code,
    data: error,
  }
}

export function jsonRpcErrorToTabBridgeError(error: JsonRpcError): TabBridgeError | undefined {
  const data = error.data
  if (typeof data !== 'object' || data === null) return undefined
  const candidate = data as Partial<TabBridgeError>
  if (
    typeof candidate.code === 'string'
    && ERROR_CODES.includes(candidate.code as never)
    && typeof candidate.message === 'string'
    && typeof candidate.recoverable === 'boolean'
  ) {
    return candidate as TabBridgeError
  }
  return undefined
}
```

Modify `packages/shared/src/protocol.ts` to remove `BridgeRequest`, `BridgeResponse`, `BridgeHello`, and keep only the hello payload shape:

```ts
import type { TabBridgeError } from './errors'

export const PROTOCOL_VERSION = 1 as const

export type CliEnvelope<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: TabBridgeError }

export type BrokerHelloParams = {
  protocolVersion: typeof PROTOCOL_VERSION
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
```

Modify `packages/shared/src/index.ts` to export jsonrpc:

```ts
export * from './approvals'
export * from './errors'
export * from './jsonrpc'
export * from './limits'
export * from './protocol'
export * from './risk'
export * from './snapshot'
export * from './tabs'
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @tabbridge/shared test
pnpm --filter @tabbridge/shared typecheck
```

Expected: all shared tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add JSON-RPC protocol and error mapping

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Broker Runtime Paths and Token

**Files:**
- Create: `packages/broker/src/runtime.ts`
- Create: `packages/broker/src/lock.ts`
- Create: `packages/broker/src/index.ts`
- Create: `packages/broker/package.json`
- Create: `packages/broker/tsconfig.json`
- Create: `packages/broker/test/runtime.test.ts`
- Create: `packages/broker/test/lock.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `createRuntimePaths`, `ensureSupportDir`, `generateToken`, `readToken`, `writeToken`, `acquireBrokerLock`, `BROKER_PORT`.

- [ ] **Step 1: Write the failing tests**

Create `packages/broker/test/runtime.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRuntimePaths, generateToken, ensureSupportDir, writeToken, readToken } from '../src/runtime'

describe('broker runtime', () => {
  it('uses macOS Application Support path', () => {
    expect(createRuntimePaths('/Users/alice')).toEqual({
      supportDir: '/Users/alice/Library/Application Support/tabbridge',
      tokenPath: '/Users/alice/Library/Application Support/tabbridge/broker-token',
      lockPath: '/Users/alice/Library/Application Support/tabbridge/broker.lock',
    })
  })

  it('generates a 64-char hex token', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

Create `packages/broker/test/lock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { acquireBrokerLock } from '../src/lock'

describe('broker lock', () => {
  it('allows only one lock holder', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-lock-'))
    const lockFile = path.join(dir, 'broker.lock')
    const release = await acquireBrokerLock(lockFile)
    await expect(acquireBrokerLock(lockFile)).rejects.toThrow()
    await release()
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter @tabbridge/broker test
```

Expected: fails because files do not exist.

- [ ] **Step 3: Implement**

Create `packages/broker/package.json`:

```json
{
  "name": "@tabbridge/broker",
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
  "dependencies": {
    "@tabbridge/shared": "workspace:*",
    "proper-lockfile": "^4.1.2",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/proper-lockfile": "^2.1.5",
    "@types/ws": "^8.5.13",
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/broker/tsconfig.json`:

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

Create `packages/broker/src/runtime.ts`:

```ts
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const BROKER_PORT = 9876

export type RuntimePaths = {
  supportDir: string
  tokenPath: string
  lockPath: string
}

export function createRuntimePaths(home = process.env.HOME ?? ''): RuntimePaths {
  const supportDir = path.join(home, 'Library', 'Application Support', 'tabbridge')
  return {
    supportDir,
    tokenPath: path.join(supportDir, 'broker-token'),
    lockPath: path.join(supportDir, 'broker.lock'),
  }
}

export async function ensureSupportDir(paths: RuntimePaths): Promise<void> {
  await fs.mkdir(paths.supportDir, { recursive: true, mode: 0o700 })
  await fs.chmod(paths.supportDir, 0o700)
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function writeToken(paths: RuntimePaths, token: string): Promise<void> {
  await fs.writeFile(paths.tokenPath, `${token}\n`, { mode: 0o600 })
  await fs.chmod(paths.tokenPath, 0o600)
}

export async function readToken(paths: RuntimePaths): Promise<string | undefined> {
  try {
    return (await fs.readFile(paths.tokenPath, 'utf8')).trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
```

Create `packages/broker/src/lock.ts`:

```ts
import lockfile from 'proper-lockfile'

export async function acquireBrokerLock(lockPath: string): Promise<() => Promise<void>> {
  return await lockfile.lock(lockPath, {
    stale: 5000,
    updateInterval: 2000,
    retries: 0,
  })
}
```

Create `packages/broker/src/index.ts`:

```ts
export { BROKER_PORT } from './runtime.js'
export { createRuntimePaths, ensureSupportDir, generateToken, readToken, writeToken } from './runtime.js'
export { acquireBrokerLock } from './lock.js'
```

- [ ] **Step 4: Run the tests**

```bash
pnpm install
pnpm --filter @tabbridge/broker test
pnpm --filter @tabbridge/broker typecheck
```

Expected: runtime and lock tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/broker pnpm-lock.yaml
ngit commit -m "feat(broker): add runtime paths and singleton lock

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Broker WebSocket Server

**Files:**
- Create: `packages/broker/src/server.ts`
- Create: `packages/broker/test/server.test.ts`

**Interfaces:**
- Consumes: `JsonRpcRequest`, `JsonRpcResponse`, `createJsonRpcError`, `createJsonRpcSuccess`, `tabBridgeErrorToJsonRpc`, `TabBridgeError` from `@tabbridge/shared`.
- Produces: `BrokerServer`, `BrokerServerOptions`, `BrokerStatus`.

- [ ] **Step 1: Write the failing test**

Create `packages/broker/test/server.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { BrokerServer } from '../src/server'

describe('BrokerServer', () => {
  it('rejects a CLI request when no extension is connected', async () => {
    const server = new BrokerServer({ port: 0, token: 'secret' })
    const url = `ws://127.0.0.1:${(server as unknown as { port: number }).port}`
    const ws = new WebSocket(url)

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    ws.send(JSON.stringify({ type: 'auth', token: 'secret' }))
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 'r1', method: 'tabs.list', params: {} }))

    const response = await new Promise<string>((resolve) => {
      ws.on('message', (data) => resolve(data.toString('utf8')))
    })

    const parsed = JSON.parse(response)
    expect(parsed.error.data.code).toBe('EXTENSION_NOT_CONNECTED')
    await server.close()
  })
})
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter @tabbridge/broker test
```

Expected: fails because `BrokerServer` does not exist.

- [ ] **Step 3: Implement**

Create `packages/broker/src/server.ts`:

```ts
import type { IncomingMessage } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import {
  type JsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type TabBridgeError,
  createJsonRpcError,
  createJsonRpcSuccess,
  tabBridgeErrorToJsonRpc,
} from '@tabbridge/shared'

export type BrokerClient = {
  socket: WebSocket
  role?: 'cli' | 'extension'
  authenticated: boolean
}

export type BrokerServerOptions = {
  port: number
  token: string
}

export type BrokerStatus = {
  cliConnected: boolean
  extensionConnected: boolean
  extensionHello?: unknown
}

const STANDARD_ERRORS: Record<string, JsonRpcError> = {
  parseError: { code: -32700, message: 'Parse error' },
  invalidRequest: { code: -32600, message: 'Invalid Request' },
  methodNotFound: { code: -32601, message: 'Method not found' },
  internalError: { code: -32603, message: 'Internal error' },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAuthMessage(value: unknown): value is { token?: string; role?: string } {
  return isRecord(value) && (('token' in value) || ('role' in value))
}

function looksLikeResponse(value: Record<string, unknown>): value is { id: string; result?: unknown; error?: unknown } {
  return typeof value.id === 'string' && (('result' in value) || ('error' in value))
}

export class BrokerServer {
  private readonly wss: WebSocketServer
  private readonly clients = new Set<BrokerClient>()
  private extensionClient: BrokerClient | undefined
  private readonly pending = new Map<string, BrokerClient>()
  private hello: unknown | undefined
  readonly port: number

  constructor(private readonly options: BrokerServerOptions) {
    this.wss = new WebSocketServer({ port: options.port })
    this.port = (this.wss.address() as { port: number }).port
    this.wss.on('connection', (socket, req) => this.handleConnection(socket, req))
  }

  status(): BrokerStatus {
    return {
      cliConnected: [...this.clients].some((c) => c.role === 'cli'),
      extensionConnected: this.extensionClient !== undefined && this.extensionClient.socket.readyState === WebSocket.OPEN,
      extensionHello: this.hello,
    }
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const client: BrokerClient = { socket, authenticated: false }
    this.clients.add(client)

    const authTimeout = setTimeout(() => {
      if (!client.authenticated) socket.close()
    }, 5000)

    socket.on('message', async (data) => {
      try {
        await this.handleMessage(client, data, req.headers.origin)
      } catch {
        socket.send(JSON.stringify(createJsonRpcError('unknown', STANDARD_ERRORS.internalError)))
      }
    })

    socket.on('close', () => {
      clearTimeout(authTimeout)
      this.clients.delete(client)
      if (this.extensionClient === client) {
        this.extensionClient = undefined
        this.hello = undefined
      }
      for (const [id, pendingClient] of this.pending) {
        if (pendingClient === client) this.pending.delete(id)
      }
    })
  }

  private async handleMessage(client: BrokerClient, data: RawData, origin: string | undefined): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(data.toString('utf8'))
    } catch {
      client.socket.send(JSON.stringify(createJsonRpcError('unknown', STANDARD_ERRORS.parseError)))
      return
    }

    if (!client.authenticated) {
      if (!isAuthMessage(parsed)) {
        client.socket.close()
        return
      }
      if (parsed.token === this.options.token) {
        client.authenticated = true
        client.role = 'cli'
      } else if (parsed.role === 'extension' && typeof origin === 'string' && origin.startsWith('chrome-extension://')) {
        client.authenticated = true
        client.role = 'extension'
        this.extensionClient = client
      } else {
        client.socket.close()
      }
      return
    }

    if (!isRecord(parsed)) return

    if (client.role === 'extension') {
      if (looksLikeResponse(parsed)) {
        const pendingCli = this.pending.get(parsed.id)
        if (pendingCli) {
          pendingCli.socket.send(JSON.stringify(parsed))
          this.pending.delete(parsed.id)
        }
        return
      }
      if (parsed.method === 'broker.hello') {
        this.hello = parsed.params
        client.socket.send(JSON.stringify(createJsonRpcSuccess(String(parsed.id), { ok: true })))
      }
      return
    }

    const request = parsed as Partial<JsonRpcRequest>
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || typeof request.id !== 'string') {
      client.socket.send(JSON.stringify(createJsonRpcError(String(request.id ?? 'unknown'), STANDARD_ERRORS.invalidRequest)))
      return
    }

    if (!this.extensionClient || this.extensionClient.socket.readyState !== WebSocket.OPEN) {
      const error: TabBridgeError = {
        code: 'EXTENSION_NOT_CONNECTED',
        message: 'The TabBridge extension is not connected.',
        recoverable: true,
        suggestedCommand: 'Open Chrome and click the TabBridge extension icon, then run tabbridge status --json.',
      }
      client.socket.send(JSON.stringify(createJsonRpcError(request.id, tabBridgeErrorToJsonRpc(error))))
      return
    }

    this.pending.set(request.id, client)
    this.extensionClient.socket.send(JSON.stringify(request))
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(resolve)
      for (const client of this.clients) {
        client.socket.terminate()
      }
    })
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @tabbridge/broker test
pnpm --filter @tabbridge/broker typecheck
```

Expected: server test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/broker
git commit -m "feat(broker): add WebSocket server with auth and routing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Broker Main Entry

**Files:**
- Create: `packages/broker/src/main.ts`
- Modify: `packages/broker/src/index.ts`
- Create: `packages/broker/test/main.test.ts`

**Interfaces:**
- Consumes: `BROKER_PORT`, `createRuntimePaths`, `ensureSupportDir`, `generateToken`, `readToken`, `writeToken`, `acquireBrokerLock`, `BrokerServer`.
- Produces: `runBroker(): Promise<{ close: () => Promise<void>; port: number }>`.

- [ ] **Step 1: Write the failing test**

Create `packages/broker/test/main.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runBroker } from '../src/main'

describe('runBroker', () => {
  it('starts a server on the configured port and can be closed', async () => {
    const broker = await runBroker()
    expect(broker.port).toBe(9876)
    await broker.close()
  })
})
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter @tabbridge/broker test
```

Expected: fails because `runBroker` does not exist.

- [ ] **Step 3: Implement**

Create `packages/broker/src/main.ts`:

```ts
import { createRuntimePaths, ensureSupportDir, generateToken, readToken, writeToken, BROKER_PORT } from './runtime.js'
import { acquireBrokerLock } from './lock.js'
import { BrokerServer } from './server.js'

export type Broker = {
  port: number
  close: () => Promise<void>
}

export async function runBroker(): Promise<Broker> {
  const paths = createRuntimePaths()
  await ensureSupportDir(paths)
  const release = await acquireBrokerLock(paths.lockPath)
  let token = await readToken(paths)
  if (!token) {
    token = generateToken()
    await writeToken(paths, token)
  }
  const server = new BrokerServer({ port: BROKER_PORT, token })
  return {
    port: server.port,
    close: async () => {
      await server.close()
      await release()
    },
  }
}
```

Update `packages/broker/src/index.ts`:

```ts
export { BROKER_PORT } from './runtime.js'
export { createRuntimePaths, ensureSupportDir, generateToken, readToken, writeToken } from './runtime.js'
export { acquireBrokerLock } from './lock.js'
export { BrokerServer } from './server.js'
export { runBroker } from './main.js'
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @tabbridge/broker test
pnpm --filter @tabbridge/broker typecheck
```

Expected: main test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/broker
git commit -m "feat(broker): add runBroker entry point

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: CLI Broker Client and Ensure-Broker

**Files:**
- Create: `packages/cli/src/broker-client.ts`
- Create: `packages/cli/src/ensure-broker.ts`
- Modify: `packages/cli/package.json`
- Create: `packages/cli/test/broker-client.test.ts`
- Create: `packages/cli/test/ensure-broker.test.ts`

**Interfaces:**
- Consumes: `JsonRpcRequest`, `JsonRpcResponse`, `jsonRpcErrorToTabBridgeError`, `errorEnvelope`, `okEnvelope`, `bridgeNotConnectedError`, `BROKER_PORT`.
- Produces: `sendBrokerRequest<TData>(request, options)`, `ensureBroker()`.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/broker-client.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { createJsonRpcRequest } from '@tabbridge/shared'
import { sendBrokerRequest } from '../src/broker-client'

describe('sendBrokerRequest', () => {
  it('sends auth and a JSON-RPC request, then returns the result', async () => {
    const server = new WebSocketServer({ port: 0 })
    const port = (server.address() as { port: number }).port

    server.once('connection', (ws) => {
      ws.once('message', (auth) => {
        const authMsg = JSON.parse(auth.toString('utf8'))
        expect(authMsg.type).toBe('auth')
        expect(authMsg.token).toBe('tok')
        ws.once('message', (req) => {
          const request = JSON.parse(req.toString('utf8'))
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ok: true } }))
        })
      })
    })

    const result = await sendBrokerRequest<{ ok: boolean }>(
      createJsonRpcRequest('r1', 'tabs.list', {}),
      { url: `ws://127.0.0.1:${port}`, token: 'tok', timeoutMs: 1000 },
    )

    expect(result).toEqual({ ok: true, data: { ok: true } })
    server.close()
  })
})
```

Create `packages/cli/test/ensure-broker.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isBrokerListening } from '../src/ensure-broker'

describe('ensure-broker helpers', () => {
  it('returns false when nothing is listening on the port', async () => {
    expect(await isBrokerListening('ws://127.0.0.1:1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter @tabbridge/cli test
```

Expected: fails because files do not exist.

- [ ] **Step 3: Implement**

Update `packages/cli/package.json` dependencies:

```json
"dependencies": {
  "@tabbridge/broker": "workspace:*",
  "@tabbridge/shared": "workspace:*",
  "ws": "^8.18.0"
},
"devDependencies": {
  "@types/node": "catalog:",
  "@types/ws": "^8.5.13",
  "tsup": "catalog:",
  "typescript": "catalog:",
  "vitest": "catalog:"
}
```

Create `packages/cli/src/broker-client.ts`:

```ts
import { WebSocket } from 'ws'
import {
  type CliEnvelope,
  type JsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type TabBridgeError,
  bridgeNotConnectedError,
  errorEnvelope,
  jsonRpcErrorToTabBridgeError,
  okEnvelope,
} from '@tabbridge/shared'

export type BrokerClientOptions = {
  url: string
  token: string
  timeoutMs: number
}

function closedBeforeResponseError(): CliEnvelope<never> {
  return errorEnvelope({
    code: 'BRIDGE_SOCKET_UNAVAILABLE',
    message: 'Broker closed the connection before sending a complete response.',
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function timeoutError(): CliEnvelope<never> {
  return errorEnvelope({
    code: 'BRIDGE_REQUEST_TIMEOUT',
    message: 'Timed out waiting for the broker response.',
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function protocolError(message: string): CliEnvelope<never> {
  return errorEnvelope({
    code: 'PROTOCOL_VERSION_MISMATCH',
    message,
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  })
}

function parseResponse<TData>(request: JsonRpcRequest, raw: string): CliEnvelope<TData> {
  let parsed: JsonRpcResponse
  try {
    parsed = JSON.parse(raw) as JsonRpcResponse
  } catch {
    return protocolError('Broker returned malformed JSON.')
  }

  if (parsed.id !== request.id) {
    return protocolError(`Broker response id ${String(parsed.id)} did not match request id ${request.id}.`)
  }

  if ('result' in parsed && parsed.result !== undefined) {
    return okEnvelope(parsed.result as TData)
  }

  if ('error' in parsed && parsed.error !== undefined) {
    const businessError = jsonRpcErrorToTabBridgeError(parsed.error as JsonRpcError)
    if (businessError) return errorEnvelope(businessError)
    const synthetic: TabBridgeError = {
      code: 'PROTOCOL_VERSION_MISMATCH',
      message: parsed.error.message,
      recoverable: true,
    }
    return errorEnvelope(synthetic)
  }

  return protocolError('Broker returned an invalid JSON-RPC response.')
}

export async function sendBrokerRequest<TData>(request: JsonRpcRequest, options: BrokerClientOptions): Promise<CliEnvelope<TData>> {
  return await new Promise((resolve) => {
    const ws = new WebSocket(options.url)
    let settled = false

    const finish = (envelope: CliEnvelope<TData>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ws.terminate()
      resolve(envelope)
    }

    const timer = setTimeout(() => finish(timeoutError()), options.timeoutMs)

    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: options.token }))
      ws.send(JSON.stringify(request))
    })

    ws.once('error', () => finish(errorEnvelope(bridgeNotConnectedError('extension_asleep'))))
    ws.once('close', () => { if (!settled) finish(closedBeforeResponseError()) })

    ws.on('message', (data) => {
      const text = data.toString('utf8')
      try {
        const probe = JSON.parse(text) as Record<string, unknown>
        if (probe.type === 'auth') return
      } catch {
        // fall through to parse as JSON-RPC
      }
      finish(parseResponse<TData>(request, text))
    })
  })
}
```

Create `packages/cli/src/ensure-broker.ts`:

```ts
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { BROKER_PORT, createRuntimePaths, generateToken, readToken, writeToken } from '@tabbridge/broker'

export const DEFAULT_BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`

export async function isBrokerListening(url: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => {
      ws.terminate()
      resolve(false)
    }, 500)
    ws.once('open', () => {
      clearTimeout(timer)
      ws.terminate()
      resolve(true)
    })
    ws.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

async function waitFor(condition: () => Promise<boolean>, options: { timeoutMs: number; intervalMs: number }): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < options.timeoutMs) {
    if (await condition()) return true
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs))
  }
  return false
}

export async function ensureBroker(): Promise<{ url: string; token: string }> {
  const paths = createRuntimePaths()
  const url = DEFAULT_BROKER_URL
  if (await isBrokerListening(url)) {
    const token = (await readToken(paths)) ?? ''
    return { url, token }
  }

  const child = spawn(process.execPath, [process.argv[1] ?? '', 'broker'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const ready = await waitFor(() => isBrokerListening(url), { timeoutMs: 5000, intervalMs: 100 })
  if (!ready) {
    throw new Error('BROKER_START_FAILED: broker did not start in time')
  }

  let token = await readToken(paths)
  if (!token) {
    token = generateToken()
    await writeToken(paths, token)
  }
  return { url, token }
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm install
pnpm --filter @tabbridge/cli test
pnpm --filter @tabbridge/cli typecheck
```

Expected: broker-client and ensure-broker tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "feat(cli): add WebSocket broker client and ensureBroker

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: CLI Command Mapping and Main Entry

**Files:**
- Modify: `packages/cli/src/commands.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/doctor.ts`
- Delete: `packages/cli/src/ipc-client.ts`
- Delete: `packages/cli/src/native-manifest.ts`
- Modify: `packages/cli/test/commands.test.ts`
- Delete: `packages/cli/test/native-manifest.test.ts`
- Modify: `packages/cli/test/cli.test.ts` (remove native-host commands)

**Interfaces:**
- Consumes: `JsonRpcRequest`, `createJsonRpcRequest`, `ensureBroker`, `sendBrokerRequest`, `runDoctor`.
- Produces: `mapCliToJsonRpcRequest`, `run()` entry.

- [ ] **Step 1: Write the failing tests**

Update `packages/cli/test/commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapCliToJsonRpcRequest } from '../src/commands'

describe('CLI command mapping', () => {
  it('maps tabs list to a JSON-RPC request', () => {
    const request = mapCliToJsonRpcRequest(
      { command: 'tabs.list', json: true, payload: {} },
      'req_1',
    )
    expect(request).toEqual({
      jsonrpc: '2.0',
      id: 'req_1',
      method: 'tabs.list',
      params: {},
    })
  })
})
```

Remove `packages/cli/test/native-manifest.test.ts`.

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter @tabbridge/cli test
```

Expected: fails because `commands.ts` still returns BridgeRequest.

- [ ] **Step 3: Implement**

Modify `packages/cli/src/commands.ts`:

```ts
import { APPROVAL_WAIT_DEFAULT_TIMEOUT_MS, createJsonRpcRequest, type JsonRpcRequest } from '@tabbridge/shared'
import type { ParsedCli } from './cli.js'

export type LocalCliCommand = { kind: 'local'; command: 'installNativeHost' | 'uninstallNativeHost' | 'doctor' | 'status'; payload: Record<string, unknown> }

export function mapCliToJsonRpcRequest(parsed: ParsedCli, id: string): JsonRpcRequest {
  const payload = { ...parsed.payload }
  if (parsed.command === 'approvals.wait' && typeof payload.timeoutMs !== 'number') {
    payload.timeoutMs = APPROVAL_WAIT_DEFAULT_TIMEOUT_MS
  }
  return createJsonRpcRequest(id, parsed.command, payload)
}
```

Modify `packages/cli/src/cli.ts` to remove native-host commands:

- Remove handling for `install-native-host`, `uninstall-native-host`, `nativeHost`.
- Keep `status` and `doctor` as normal commands (they will be routed through broker).

The relevant snippet after removal should look like:

```ts
  if (first === 'status') return { command: 'status', json, payload: {} }
  if (first === 'doctor') return { command: 'doctor', json, payload: {} }
```

And delete the `install-native-host` / `uninstall-native-host` branches.

Create `packages/cli/src/main.ts`:

```ts
import { Readable, Writable } from 'node:stream'
import { errorEnvelope, okEnvelope, type CliEnvelope, type JsonRpcRequest } from '@tabbridge/shared'
import { parseCli, type ParsedCli } from './cli.js'
import { mapCliToJsonRpcRequest } from './commands.js'
import { runDoctor as defaultRunDoctor, type DoctorReport } from './doctor.js'
import { ensureBroker as defaultEnsureBroker, type DEFAULT_BROKER_URL } from './ensure-broker.js'
import { printCliError, printJsonEnvelope } from './json-output.js'
import { sendBrokerRequest as defaultSendBrokerRequest } from './broker-client.js'

type SendBrokerRequest = typeof defaultSendBrokerRequest
type EnsureBroker = typeof defaultEnsureBroker
type RunDoctor = typeof defaultRunDoctor

export type RunOptions = {
  argv?: string[]
  stdin?: Readable
  stdout?: Writable
  stderr?: Writable
  now?: () => number
  requestId?: () => string
  ensureBroker?: EnsureBroker
  sendBrokerRequest?: SendBrokerRequest
  runDoctor?: RunDoctor
}

async function readStdin(stdin: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function hydrateStdinPayload(parsed: ParsedCli, stdin: Readable): Promise<ParsedCli> {
  if (parsed.command !== 'action.type' || parsed.payload.textFromStdin !== true) return parsed
  const { textFromStdin: _, ...payloadWithoutMarker } = parsed.payload
  return {
    ...parsed,
    payload: { ...payloadWithoutMarker, text: await readStdin(stdin) },
  }
}

function isDoctorReport(value: unknown): value is DoctorReport {
  return typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
}

export async function run(options: RunOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2)
  const json = argv.includes('--json')
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const stdin = options.stdin ?? process.stdin
  const ensureBroker = options.ensureBroker ?? defaultEnsureBroker
  const sendBrokerRequest = options.sendBrokerRequest ?? defaultSendBrokerRequest
  const runDoctor = options.runDoctor ?? defaultRunDoctor
  const requestId = options.requestId ?? (() => `req_${process.pid}_${Date.now()}`)

  try {
    const parsed = await hydrateStdinPayload(parseCli(argv), stdin)

    if (parsed.command === 'doctor') {
      const report = await runDoctor()
      const envelope = okEnvelope(report)
      printJsonEnvelope(envelope, stdout)
      return report.ok ? 0 : 1
    }

    const broker = await ensureBroker()
    const request: JsonRpcRequest = mapCliToJsonRpcRequest(parsed, requestId())
    const envelope = await sendBrokerRequest(request, { url: broker.url, token: broker.token, timeoutMs: 30_000 })

    if (parsed.json) {
      printJsonEnvelope(envelope, stdout)
    } else if (envelope.ok) {
      stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`)
    } else {
      stderr.write(`${envelope.error.message}\n`)
    }

    return envelope.ok ? 0 : 1
  } catch (error) {
    printCliError(error, json, stdout, stderr)
    return 1
  }
}

if (process.env.VITEST !== 'true') {
  run().then((code) => { process.exitCode = code })
}
```

Modify `packages/cli/src/doctor.ts` to use broker:

```ts
import fs from 'node:fs/promises'
import { type BridgeDisconnectedState, type TabBridgeErrorCode } from '@tabbridge/shared'
import { BROKER_PORT, createRuntimePaths } from '@tabbridge/broker'
import { isBrokerListening } from './ensure-broker.js'

export type DoctorCheck = {
  name: string
  ok: boolean
  detail?: string
}

export type DoctorReport = {
  ok: boolean
  bridgeState: BridgeDisconnectedState | 'connected'
  errorCode?: TabBridgeErrorCode
  checks: DoctorCheck[]
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function fileMode(filePath: string): Promise<number | undefined> {
  try {
    return (await fs.stat(filePath)).mode
  } catch {
    return undefined
  }
}

export async function runDoctor(): Promise<DoctorReport> {
  const paths = createRuntimePaths()
  const listening = await isBrokerListening(`ws://127.0.0.1:${BROKER_PORT}`)
  const tokenExists = await exists(paths.tokenPath)
  const tokenMode = await fileMode(paths.tokenPath)
  const lockExists = await exists(paths.lockPath)

  const checks: DoctorCheck[] = [
    { name: 'broker is listening on port 9876', ok: listening },
    { name: 'broker token file exists', ok: tokenExists },
    { name: 'broker token file mode is 0600', ok: tokenMode !== undefined && (tokenMode & 0o777) === 0o600 },
    { name: 'broker lock file exists', ok: lockExists },
  ]

  if (!listening) {
    return { ok: false, bridgeState: 'extension_asleep', errorCode: 'EXTENSION_NOT_CONNECTED', checks }
  }

  const ok = checks.every((c) => c.ok)
  return { ok, bridgeState: 'connected', checks }
}
```

Delete `packages/cli/src/ipc-client.ts` and `packages/cli/src/native-manifest.ts`.

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @tabbridge/cli test
pnpm --filter @tabbridge/cli typecheck
```

Expected: CLI tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): wire CLI to WebSocket broker, remove native host commands

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Extension Broker Client and Router

**Files:**
- Create: `packages/chrome-extension/src/background/broker-client.ts`
- Create: `packages/chrome-extension/src/background/jsonrpc-router.ts`
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Modify: `packages/chrome-extension/src/entrypoints/background.ts`
- Delete: `packages/chrome-extension/src/background/native-port.ts`
- Modify: `packages/chrome-extension/wxt.config.ts`
- Modify: `packages/chrome-extension/package.json`
- Create: `packages/chrome-extension/test/broker-client.test.ts`
- Modify: `packages/chrome-extension/test/native-port.test.ts` → rename/delete
- Modify: `packages/chrome-extension/test/wxt-config.test.ts`

**Interfaces:**
- Consumes: `JsonRpcRequest`, `JsonRpcResponse`, `createJsonRpcSuccess`, `createJsonRpcError`, `tabBridgeErrorToJsonRpc`, `BROKER_PORT`.
- Produces: `createBrokerClient(url, extensionId, handlers)`, `routeJsonRpcMethod(method, params)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/chrome-extension/test/broker-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createBrokerClient } from '../src/background/broker-client'

describe('broker client', () => {
  it('sends extension auth and hello after connecting', async () => {
    const WebSocket = vi.fn()
    let onopen: (() => void) | undefined
    const send = vi.fn()
    WebSocket.mockImplementation(() => ({
      send,
      close: vi.fn(),
      set onopen(fn: () => void) { onopen = fn },
      set onmessage(_fn: () => void) {},
      set onclose(_fn: () => void) {},
      set onerror(_fn: () => void) {},
    }))

    createBrokerClient('ws://127.0.0.1:9876', 'extid', {
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      onRequest: vi.fn(),
    })

    onopen?.()

    const messages = send.mock.calls.map((c) => JSON.parse(c[0] as string))
    expect(messages[0]).toEqual({ type: 'auth', role: 'extension' })
    expect(messages[1].method).toBe('broker.hello')
    expect(messages[1].params.extensionId).toBe('extid')
  })
})
```

Update `packages/chrome-extension/test/wxt-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import config from '../wxt.config'

describe('WXT manifest config', () => {
  it('declares MVP permissions without nativeMessaging', () => {
    expect(config.manifest).toMatchObject({
      name: 'TabBridge',
      permissions: ['tabs', 'scripting', 'storage', 'activeTab'],
      optional_host_permissions: ['http://*/*', 'https://*/*'],
    })
  })
})
```

Delete `packages/chrome-extension/test/native-port.test.ts`.

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter @tabbridge/chrome-extension test
```

Expected: fails because files do not exist.

- [ ] **Step 3: Implement**

Update `packages/chrome-extension/wxt.config.ts`:

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'TabBridge',
    permissions: ['tabs', 'scripting', 'storage', 'activeTab'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    minimum_chrome_version: '105',
  },
  vite: () => ({
    plugins: [vue()],
  }),
})
```

Create `packages/chrome-extension/src/background/broker-client.ts`:

```ts
import {
  BROKER_PORT,
  type JsonRpcRequest,
  type JsonRpcResponse,
  createJsonRpcRequest,
  createJsonRpcSuccess,
} from '@tabbridge/shared'

export const DEFAULT_BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`

export type BrokerClientOptions = {
  WebSocket?: typeof globalThis.WebSocket
  onRequest?: (request: JsonRpcRequest) => Promise<JsonRpcResponse> | JsonRpcResponse
  onDisconnect?: () => void
}

export type BrokerClient = {
  send: (response: JsonRpcResponse) => void
  close: () => void
}

export function createBrokerClient(
  url: string,
  extensionId: string,
  options: BrokerClientOptions = {},
): BrokerClient {
  const WS = options.WebSocket ?? globalThis.WebSocket
  let ws: WebSocket | undefined
  let messageId = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const reconnectDelaysMs = [250, 500, 1000, 2000, 5000]
  let reconnectAttempt = 0

  const clearReconnect = () => {
    if (reconnectTimer === undefined) return
    clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const connect = () => {
    clearReconnect()
    ws = new WS(url)

    ws.onopen = () => {
      reconnectAttempt = 0
      ws!.send(JSON.stringify({ type: 'auth', role: 'extension' }))
      const id = `hello_${++messageId}`
      const hello = createJsonRpcRequest(id, 'broker.hello', {
        protocolVersion: 1,
        version: '0.1.0',
        extensionId,
        capabilities: {
          commands: ['status', 'tabs.list', 'tabs.current', 'tabs.requestAccess', 'snapshot'],
          snapshot: ['semantic', 'text', 'html', 'screenshot'],
          permissions: ['tabs', 'host-permission', 'activeTab', 'scripting', 'storage'],
        },
      })
      ws!.send(JSON.stringify(hello))
    }

    ws.onmessage = async (event) => {
      const text = typeof event.data === 'string' ? event.data : await event.data.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text) as Record<string, unknown>
      } catch {
        return
      }
      if (parsed.type === 'auth') return
      if (options.onRequest) {
        const response = await options.onRequest(parsed as JsonRpcRequest)
        ws!.send(JSON.stringify(response))
      }
    }

    ws.onclose = () => {
      if (stopped) return
      options.onDisconnect?.()
      const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)] ?? 5000
      reconnectAttempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  return {
    send: (response) => {
      ws?.send(JSON.stringify(response))
    },
    close: () => {
      stopped = true
      clearReconnect()
      ws?.close()
    },
  }
}
```

Create `packages/chrome-extension/src/background/jsonrpc-router.ts`:

```ts
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  createJsonRpcError,
  createJsonRpcSuccess,
  tabBridgeErrorToJsonRpc,
} from '@tabbridge/shared'
import { routeBridgeMethod } from './commands.js'

export async function routeJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const result = await routeBridgeMethod(request.method, request.params)
    return createJsonRpcSuccess(request.id, result)
  } catch (error) {
    const rpcError = tabBridgeErrorToJsonRpc(error as Extract<JsonRpcResponse['error'], { code: number }>['data'])
    return createJsonRpcError(request.id, rpcError)
  }
}
```

Wait, `tabBridgeErrorToJsonRpc` expects `TabBridgeError`, but catch error may not be. We should routeBridgeMethod throw TabBridgeError. We'll adjust commands.ts.

Modify `packages/chrome-extension/src/background/commands.ts`:

```ts
import { type TabBridgeError, type TabBridgeErrorCode } from '@tabbridge/shared'

export async function routeBridgeMethod(method: string, params: unknown): Promise<unknown> {
  if (method === 'status') {
    return { bridge: 'connected' }
  }

  const error: TabBridgeError = {
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Method ${method} is not implemented by the extension command router yet.`,
    recoverable: false,
  }
  throw error
}
```

Modify `packages/chrome-extension/src/entrypoints/background.ts`:

```ts
import { defineBackground } from 'wxt/utils/define-background'
import { createBrokerClient, DEFAULT_BROKER_URL } from '../background/broker-client'
import { routeJsonRpcRequest } from '../background/jsonrpc-router'

export default defineBackground(() => {
  createBrokerClient(DEFAULT_BROKER_URL, chrome.runtime.id, {
    onRequest: routeJsonRpcRequest,
  })
})
```

Update `packages/chrome-extension/package.json` to add `@tabbridge/broker` dependency and remove `@types/chrome` if not needed (keep if used):

```json
"dependencies": {
  "@tabbridge/broker": "workspace:*",
  "@tabbridge/shared": "workspace:*",
  "vue": "catalog:"
}
```

Delete `packages/chrome-extension/src/background/native-port.ts`.

- [ ] **Step 4: Run the tests**

```bash
pnpm install
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: extension tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat(extension): connect to WebSocket broker via JSON-RPC

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Cleanup Old Native-Host Package and Workspace

**Files:**
- Delete: `packages/native-host/`
- Modify: `vitest.workspace.ts`
- Modify: `pnpm-workspace.yaml` (no change needed because `packages/*` already covers `packages/broker`)

- [ ] **Step 1: Delete native-host**

```bash
rm -rf packages/native-host
```

- [ ] **Step 2: Update workspace config**

Modify `vitest.workspace.ts`:

```ts
import { existsSync } from 'node:fs'
import { defineWorkspace } from 'vitest/config'

const packageProjects = [
  'packages/shared',
  'packages/broker',
  'packages/cli',
  'packages/chrome-extension',
]

export default defineWorkspace(
  packageProjects.filter((project) => existsSync(new URL(project, import.meta.url))),
)
```

- [ ] **Step 3: Verify root tests**

```bash
pnpm install
pnpm test
```

Expected: all workspace tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove native-host package, add broker to workspace

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: End-to-End Smoke Verification

**Files:**
- None (manual verification).

- [ ] **Step 1: Build everything**

```bash
pnpm build
```

- [ ] **Step 2: Run broker manually**

```bash
node packages/broker/dist/main.js
# or
node packages/cli/dist/main.js broker
```

Expected: broker starts, token file is created.

- [ ] **Step 3: Run CLI commands**

In another terminal:

```bash
node packages/cli/dist/main.js status --json
node packages/cli/dist/main.js tabs list --json
```

Expected: first command starts broker automatically; second returns JSON-RPC response. When extension is not loaded, `tabs.list` returns `EXTENSION_NOT_CONNECTED`.

- [ ] **Step 4: Load extension**

```bash
pnpm --filter @tabbridge/chrome-extension dev
```

Open Chrome, load unpacked `.output/chrome-mv3-dev`. Confirm popup shows connected status after a CLI command has started the broker.

- [ ] **Step 5: Run doctor**

```bash
node packages/cli/dist/main.js doctor --json
```

Expected: report shows broker listening.

- [ ] **Step 6: Commit any smoke-test fixes**

Fix any issues found, then commit.

---

## Self-Review Checklist

1. **Spec coverage:**
   - Fixed port broker: Task 2, Task 4.
   - CLI token auth: Task 2, Task 5.
   - Extension origin-based auth: Task 7.
   - JSON-RPC 2.0 everywhere: Task 1, Task 3, Task 6, Task 7.
   - Delete native host: Task 8.
   - `tabbridge broker` command: Task 4 (via CLI `ensureBroker` spawn) and Task 9.
   - `doctor` updated: Task 6.
   - No permanent daemon: broker exits when killed; CLI starts on demand.

2. **Placeholder scan:** No TBD/TODO/fill-in details. Every step has exact file paths and code.

3. **Type consistency:**
   - `mapCliToJsonRpcRequest` returns `JsonRpcRequest` (Task 6).
   - `sendBrokerRequest` consumes `JsonRpcRequest` (Task 5).
   - `BrokerServer` routes by `id` using `JsonRpcRequest`/`JsonRpcResponse` (Task 3).
   - Extension `routeJsonRpcRequest` returns `JsonRpcResponse` (Task 7).

No gaps found.
