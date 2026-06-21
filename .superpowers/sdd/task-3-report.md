# Task 3 Report: Native Messaging Framing and Local IPC Bridge

## Files
- packages/native-host/package.json
- packages/native-host/tsconfig.json
- packages/native-host/src/main.ts
- packages/native-host/src/native-framing.ts
- packages/native-host/src/ipc-server.ts
- packages/native-host/src/bridge.ts
- packages/native-host/src/action-queue.ts
- packages/native-host/src/runtime-paths.ts
- packages/native-host/test/native-framing.test.ts
- packages/native-host/test/action-queue.test.ts
- packages/native-host/test/bridge.test.ts
- packages/native-host/test/runtime-paths.test.ts
- packages/native-host/test/ipc-server.test.ts
- pnpm-lock.yaml

## Red tests observed
- `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` initially failed because no `@tabbridge/native-host` package matched the workspace filter.
- After scaffolding, native-host tests failed for missing source modules and missing runtime security behavior.
- Added regression coverage for the existing CLI IPC socket contract; it failed while the IPC server expected a token-wrapped request instead of raw newline-delimited `BridgeRequest`.
- Added bridge per-tab action serialization coverage; it failed while same-tab `action.*` requests forwarded concurrently.

## Green verification
- `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` passed: 5 files, 12 tests.
- `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host typecheck` passed.
- `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" test` passed: 16 files, 56 tests.
- `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" typecheck` passed.

## Commit
- Message: `feat: add TabBridge native host bridge`
- Hash: recorded in the final Task 3 response after commit creation.

## Self-review
- Reused `@tabbridge/shared` protocol types, constants, limits, and shared error helpers instead of redefining the bridge protocol.
- Native Messaging framing uses 4-byte little-endian lengths, enforces shared message-size limits, and keeps stdout reserved for length-prefixed protocol bytes in `main.ts`.
- IPC server preserves the existing `@tabbridge/cli` Unix socket contract: raw newline-delimited `BridgeRequest` in and raw `BridgeResponse` out.
- Runtime setup creates the macOS Application Support directory with `0700` permissions and a session token file with `0600` permissions.
- Bridge status distinguishes asleep vs connected extension state, correlates extension responses by request id, handles timeouts, and serializes `action.*` requests per `payload.tabId` while allowing non-action and other-tab work to proceed independently.

## Concerns
- Task 2 local `native-host` CLI handler is intentionally not wired to this server yet; this task only creates the package/library behavior and executable entry point.
- Token file creation is implemented for runtime security, but the current CLI IPC contract does not transmit the token; enforcing token authentication should be a future coordinated CLI/native-host protocol change.
