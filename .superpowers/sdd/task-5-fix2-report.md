# Task 5 Fix 2 Report

## Summary
- Removed the fallback that spawned `node <cli-entry> broker` when `packages/broker/dist/main.js` is missing.
- `ensureBroker()` now falls back to a self-contained Node `--input-type=module --eval` command that imports `@tabbridge/broker` and calls `runBroker()`.
- Added a regression test verifying that even with a usable CLI entrypoint, the missing built broker entry path uses the import-eval fallback and not a future CLI parser branch.

## TDD RED
Command:

```bash
pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/cli test -- ensure-broker.test.ts
```

Expected failure observed:

```text
FAIL  test/ensure-broker.test.ts > ensure-broker helpers > uses an import eval fallback when the built broker entry is missing
AssertionError: expected "spy" to be called with arguments...
Received args included:
  ["/repo/packages/cli/dist/index.js", "broker"]
```

## Verification
Command:

```bash
pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/cli test
```

Output:

```text
> @tabbridge/cli@0.1.0 test /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/cli
> vitest --run

 RUN  v2.1.9 /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/cli

 ✓ test/json-output.test.ts (3 tests) 1ms
 ✓ test/cli.test.ts (9 tests) 2ms
 ✓ test/commands.test.ts (3 tests) 4ms
 ✓ test/ensure-broker.test.ts (4 tests) 5ms
 ✓ test/native-manifest.test.ts (4 tests) 16ms
 ✓ test/broker-client.test.ts (1 test) 15ms
 ✓ test/main.test.ts (7 tests) 5ms
 ✓ test/doctor.test.ts (3 tests) 33ms
 ✓ test/ipc-client.test.ts (9 tests) 88ms

 Test Files  9 passed (9)
      Tests  43 passed (43)
   Start at  17:07:56
   Duration  436ms (transform 632ms, setup 0ms, collect 881ms, tests 170ms, environment 1ms, prepare 635ms)
```

Command:

```bash
pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/cli typecheck
```

Output:

```text
> @tabbridge/cli@0.1.0 typecheck /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/cli
> tsc --noEmit
```

## Broker build verification
Not run because this fix did not change broker package build or package metadata.
