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
- Hash: `ef976b1`

## Self-review
- Reused `@tabbridge/shared` protocol types, constants, limits, and shared error helpers instead of redefining the bridge protocol.
- Native Messaging framing uses 4-byte little-endian lengths, enforces shared message-size limits, and keeps stdout reserved for length-prefixed protocol bytes in `main.ts`.
- IPC server preserves the existing `@tabbridge/cli` Unix socket contract: raw newline-delimited `BridgeRequest` in and raw `BridgeResponse` out.
- Runtime setup creates the macOS Application Support directory with `0700` permissions and a session token file with `0600` permissions.
- Bridge status distinguishes asleep vs connected extension state, correlates extension responses by request id, handles timeouts, and serializes `action.*` requests per `payload.tabId` while allowing non-action and other-tab work to proceed independently.

## Concerns
- Task 2 local `native-host` CLI handler is intentionally not wired to this server yet; this task only creates the package/library behavior and executable entry point.
- Token file creation is implemented for runtime security, but the current CLI IPC contract does not transmit the token; enforcing token authentication should be a future coordinated CLI/native-host protocol change.

## Controller note after hardening fix
- Cherry-picked implementation fix as `b1d60d5` from fixer subagent commit `8e884c7`.
- Fixer reported red verification for bridge/IPC hardening cases and green native-host/root test+typecheck.

## Controller note after shared error-code fix
- Root cause: native-host production code and tests used non-MVP/shared declaration error codes `DUPLICATE_BRIDGE_REQUEST_ID` and `IPC_REQUEST_TOO_LARGE`, while the active shared `TabBridgeErrorCode` type exposed to dependent packages only includes the spec MVP codes.
- Red verification: after updating native-host regression expectations, `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` failed with duplicate request IDs still returning `DUPLICATE_BRIDGE_REQUEST_ID` and oversized IPC frames still returning `IPC_REQUEST_TOO_LARGE`.
- Fix: mapped duplicate in-flight bridge request IDs to `PROTOCOL_VERSION_MISMATCH` and oversized IPC request frames to `MESSAGE_TOO_LARGE`, preserving the existing recoverability and messages.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` passed: 5 files, 17 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host typecheck` passed.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" test` passed: 16 files, 61 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" typecheck` passed.

## Controller note after final library export review fix
- Red verification: added native-host package export/import-side-effect coverage in `packages/native-host/test/exports.test.ts`; `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` failed while package metadata still pointed at `dist/main.js`, `src/index.ts` did not exist, and importing `src/main.ts` started the host.
- Red verification: adjusted shared exact `ERROR_CODES` coverage in `packages/shared/test/errors.test.ts`; `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/shared test` failed while public shared codes still included non-MVP `IPC_SOCKET_ACTIVE`, `IPC_REQUEST_TOO_LARGE`, and `DUPLICATE_BRIDGE_REQUEST_ID`.
- Fix: added side-effect-free `packages/native-host/src/index.ts` exporting `encodeNativeMessage`, `NativeMessageDecoder`, `createRuntimePaths`, `BridgeController`, `TabActionQueue`, and `startIpcServer`, plus related public types.
- Fix: moved the native-host package root `main`/`types`/`.` export to `dist/index.*`, retained the executable as `bin.tabbridge-native-host` on `dist/main.js`, and exposed `./main` as the explicit executable subpath.
- Fix: guarded `runNativeHost()` so importing `packages/native-host/src/main.ts` no longer starts stdin/stdout bridging or the IPC server unless the file is executed as the process entrypoint.
- Fix: removed the unused non-MVP IPC/duplicate request codes from public shared `ERROR_CODES`; native-host production mappings continue to use existing MVP codes (`MESSAGE_TOO_LARGE` and `PROTOCOL_VERSION_MISMATCH`) for public protocol errors.
- Build fix: replaced the unsupported `tsup --banner.js` build option with a post-build shebang/chmod step for `dist/main.js` while still emitting both `dist/index.js` and `dist/main.js`.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` passed: 6 files, 20 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host typecheck` passed.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host build` passed and emitted `dist/index.js`, `dist/main.js`, `dist/index.d.ts`, and `dist/main.d.ts`.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/shared test` passed: 6 files, 21 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/shared typecheck` passed.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" test` passed: 17 files, 64 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" typecheck` passed.
- Commit: `bfc41bd` (`fix: expose native host library APIs`).
- Concerns: `removeStaleSocket()` still throws internal `Error('IPC_SOCKET_ACTIVE')` for an actually active socket, but this is intentionally not part of the public shared `ERROR_CODES` protocol surface.

## Final-review lifecycle/validation fix
- Red verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` failed with the new regressions: malformed native JSON frames poisoned `NativeMessageDecoder`, malformed extension success/failure responses produced invalid CLI envelopes, native stdin end did not close the IPC server, and the IPC concurrent-drain regression exposed an unsafe second write path.
- Fix: advanced the native-message decoder buffer before parsing complete frames so a malformed frame cannot block later frames.
- Fix: closed the stored IPC `net.Server` on native stdin `end`/`close`, with idempotent shutdown handling around startup races.
- Fix: runtime-validated extension responses before resolving pending CLI requests, including `id`, `protocolVersion`, `ok`, success `payload`, and failure `TabBridgeError` shape, mapping invalid envelopes to structured `PROTOCOL_VERSION_MISMATCH` protocol errors.
- Fix: serialized IPC socket draining with a one-response socket lifecycle guard to avoid concurrent shared-buffer mutation and late writes after `socket.end()`.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host test` passed: 6 files, 25 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" --filter @tabbridge/native-host typecheck` passed.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" test` passed: 17 files, 69 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd" typecheck` passed.
- Commit: pending (`fix: close native host IPC lifecycle gaps`).
- Concerns: malformed extension responses are mapped to the existing shared `PROTOCOL_VERSION_MISMATCH` code because there is no dedicated public malformed-response error code in the MVP shared error surface.
