# Task 7 Report: Extension Broker Client and Router

## Summary
- Added an extension WebSocket broker client that authenticates as the extension, sends `broker.hello`, routes inbound JSON-RPC requests, and reconnects after disconnects.
- Added a JSON-RPC router that wraps extension command results in success responses and maps `TabBridgeError` failures to JSON-RPC errors.
- Updated the WXT background entrypoint to connect to the broker instead of the native host.
- Removed `nativeMessaging` from the extension manifest and deleted the native-port manager and tests.
- Added `@tabbridge/broker` as a chrome-extension workspace dependency for `BROKER_PORT`.

## RED Evidence
Command:

```bash
pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/chrome-extension test
```

Observed failure after writing tests first:

```text
FAIL  test/broker-client.test.ts
Error: Failed to load url ../src/background/broker-client ... Does the file exist?

FAIL  test/wxt-config.test.ts > WXT manifest config > declares MVP permissions without nativeMessaging
Expected permissions without nativeMessaging, received permissions including nativeMessaging.
```

This confirmed the new broker client did not exist yet and the manifest still declared the old native messaging permission.

## GREEN Evidence
Commands:

```bash
pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket install
pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/chrome-extension test
pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/chrome-extension typecheck
```

Results:

```text
Test Files  2 passed (2)
Tests       4 passed (4)

@tabbridge/chrome-extension typecheck: vue-tsc --noEmit
```

## Notes
- Pre-existing unrelated modification remains in `.superpowers/sdd/task-5-report.md` and was not part of this task.
