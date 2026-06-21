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
- Commit: `1e0fc1e` (`fix: close native host IPC lifecycle gaps`).
- Concerns: malformed extension responses are mapped to the existing shared `PROTOCOL_VERSION_MISMATCH` code because there is no dedicated public malformed-response error code in the MVP shared error surface.

## Final-review malformed native response routing fix
- Red verification setup: dependencies were initially absent in this isolated worktree, so the first native-host test command failed before Vitest could run; after `pnpm install --frozen-lockfile` and building `@tabbridge/shared`, the targeted red test failed as expected with `routeNativeMessage` undefined.
- Red verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/agent-ae7932e07a0629f5a/packages/native-host" test -- test/bridge.test.ts` failed while malformed non-hello native messages with string ids could not be routed through a helper to `BridgeController.acceptResponse` validation.
- Fix: extracted `routeNativeMessage(bridge, message)` from `runNativeHost`; hello messages still route to `acceptHello`, and every other object with a string `id` now routes to `acceptResponse` so `BridgeController` validates `protocolVersion`, `ok`, `payload`, and `error`.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/agent-ae7932e07a0629f5a/packages/native-host" test -- test/bridge.test.ts` passed: 6 files, 26 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/agent-ae7932e07a0629f5a" --filter @tabbridge/native-host test` passed: 6 files, 26 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/agent-ae7932e07a0629f5a" --filter @tabbridge/native-host typecheck` passed.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/agent-ae7932e07a0629f5a" test` passed: 17 files, 70 tests.
- Green verification: `pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/agent-ae7932e07a0629f5a" typecheck` passed.
- Concerns: no new protocol error code was introduced; malformed routed responses continue to resolve as the existing structured `PROTOCOL_VERSION_MISMATCH` protocol error.

## Final-review native-host edge-case hardening fix
- Red verification: after installing dependencies and building `@tabbridge/shared`, `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes" --filter @tabbridge/native-host test` failed with the new regressions: `NativeMessageDecodingError` missing for preserving messages decoded before malformed JSON, `isExecutedEntrypoint` missing for package-bin symlink execution, synchronous `sendToExtension` throws escaping `BridgeController.forward`, duplicate same-tab action request ids waiting until timeout instead of being rejected before queueing, mutually-exclusive extension response payload/error fields being accepted, and per-message native routing not isolating malformed messages.
- Red verification: focused IPC regression coverage failed once socket chunk boundaries were forced; split UTF-8 request bytes decoded as replacement characters (`hello ���`) instead of preserving the original payload (`hello 🌉`).
- Fix: `NativeMessageDecoder` now advances past complete frames and throws `NativeMessageDecodingError` carrying any valid messages decoded before a malformed JSON frame.
- Fix: `BridgeController` now reserves request ids before action queueing, cleans pending state on synchronous/asynchronous send failures, ignores responses for reserved-only ids, and rejects extension responses that mix success payloads with errors or failure errors with payloads.
- Fix: native stdin routing now uses `routeNativeMessages()` to catch routing errors per decoded message so one malformed routed message does not abort later messages from the same chunk.
- Fix: IPC sockets now buffer raw bytes and decode only complete newline-delimited request frames, attach accepted-socket error handling, and use a guarded `socket.end()` response path.
- Fix: entrypoint detection now compares real paths derived from `fileURLToPath()`/`realpathSync()` so execution through a package-bin symlink still starts the native host.
- Green verification: `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes" --filter @tabbridge/native-host test` passed: 6 files, 33 tests.
- Green verification: `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes" --filter @tabbridge/native-host typecheck` passed.
- Green verification: `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes" test` passed: 17 files, 77 tests.
- Green verification: `pnpm -C "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes" typecheck` passed.
- Commit: `4e1d971` (`fix: harden native host edge cases`).
- Concerns: no new public shared `ERROR_CODES` were added; duplicate request ids and malformed extension responses continue to use the existing structured `PROTOCOL_VERSION_MISMATCH` code, and IPC oversize requests continue to use `MESSAGE_TOO_LARGE`.

## Final-review malformed native frame chunk routing fix
- Red verification: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes --filter @tabbridge/native-host test -- test/exports.test.ts` failed with the new regression: a valid response decoded before a malformed native frame stayed pending instead of resolving the CLI request.
- Fix: `runNativeHost()` now recognizes `NativeMessageDecodingError`, routes the decoded `error.messages` through the existing per-message router, and still logs the malformed frame error.
- Green verification: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes --filter @tabbridge/native-host test` passed: 6 files, 34 tests.
- Green verification: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes --filter @tabbridge/native-host typecheck` passed.
- Green verification: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes test` passed: 17 files, 78 tests.
- Green verification: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/task3-native-host-fixes typecheck` passed.
- Concerns: none.
