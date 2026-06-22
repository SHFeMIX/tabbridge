# Task 7 Fix Report

## Summary

Fixed the Task 7 review blockers for the extension WebSocket broker client:

- Moved the browser-safe `BROKER_PORT` constant to `@tabbridge/shared` and removed the extension dependency/import of `@tabbridge/broker`.
- Preserved broker compatibility by re-exporting `BROKER_PORT` from broker runtime.
- Updated CLI references to import `BROKER_PORT` from `@tabbridge/shared` while keeping broker runtime helper imports from `@tabbridge/broker`.
- Added JSON-RPC error responses for request handler failures in the extension broker client.
- Captured the socket that delivered a request and sent that request response on the same open socket.
- Ignored stale socket close handlers so an old connection cannot clear or reconnect over a newer connection.

## TDD Evidence

### RED: shared broker port export

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/shared test
```

Expected failure observed before implementation:

```text
shared protocol envelopes > exports the browser-safe broker port constant
expected undefined to be 9876
```

### RED: extension broker client blockers

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/chrome-extension test
```

Expected failures observed before implementation included:

```text
expected broker-client.ts source not to contain "from '@tabbridge/broker'"
"undefined" is not valid JSON
Unhandled Rejection: Error: tabs unavailable
```

The captured-socket test also demonstrated the stale global socket behavior before the fix: the original request socket did not receive the delayed response after reconnect.

## Final Validation

### Shared tests

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/shared test
```

Output:

```text
> @tabbridge/shared@0.1.0 test /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/shared
> vitest --run

Test Files  7 passed (7)
Tests  26 passed (26)
```

### Shared typecheck

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/shared typecheck
```

Output:

```text
> @tabbridge/shared@0.1.0 typecheck /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/shared
> tsc --noEmit
```

Completed successfully.

### Chrome extension tests

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/chrome-extension test
```

Output:

```text
> @tabbridge/chrome-extension@0.1.0 test /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/chrome-extension
> vitest --run

Test Files  2 passed (2)
Tests  7 passed (7)
```

### Chrome extension typecheck

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/chrome-extension typecheck
```

Output:

```text
> @tabbridge/chrome-extension@0.1.0 typecheck /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/chrome-extension
> vue-tsc --noEmit
```

Completed successfully.

### CLI typecheck

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/cli typecheck
```

Output:

```text
> @tabbridge/cli@0.1.0 typecheck /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/cli
> tsc --noEmit
```

Completed successfully.

### Broker typecheck

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/broker typecheck
```

Output:

```text
> @tabbridge/broker@0.1.0 typecheck /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/broker
> tsc --noEmit
```

Completed successfully.

### Shared build

Command:

```sh
pnpm --dir "/Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket" --filter @tabbridge/shared build
```

Completed successfully to refresh package exports used by dependent package typechecks.
