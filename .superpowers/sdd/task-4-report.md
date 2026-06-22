# Task 4 Report: Broker Main Entry

## Summary

Implemented `runBroker()` — the main entry point that wires together all broker subsystems (runtime paths, support dir, lock acquisition, token management, and WebSocket server) into a single callable function. Exported it from the broker package index.

## Files Created

- `packages/broker/src/main.ts` — `runBroker()` implementation and `Broker` type
- `packages/broker/test/main.test.ts` — Vitest test verifying startup and close

## Files Modified

- `packages/broker/src/index.ts` — added `runBroker` and `Broker` type exports

## Implementation Details

### `runBroker()` flow:
1. Creates runtime paths via `createRuntimePaths()`
2. Ensures the support directory exists with `ensureSupportDir()`
3. Creates the lock file and acquires an exclusive broker lock via `acquireBrokerLock()`
4. Reads an existing token or generates a new one and persists it
5. Starts the `BrokerServer` on the configured `BROKER_PORT` (9876)
6. Returns a `Broker` object with `port` and `close()` — the latter shuts down the server and releases the lock

### Key fix beyond the brief:
The `proper-lockfile` library requires the lock file to exist before locking. Added `fs.writeFile(paths.lockPath, '')` before `acquireBrokerLock()` to ensure the lock file is present. Without this, the lock acquisition would throw `ENOENT`.

## Test Results

- **Broker package tests:** 10/10 passed (4 test files)
- **TypeScript typecheck:** clean (no errors)
- **Full workspace tests:** broker tests pass; pre-existing failures in native-host/cli packages are unrelated (Task 9 will address those)

## Commit

`416c135` feat(broker): add runBroker entry point

## Concerns

None. The implementation follows the brief exactly, with one necessary addition (lock file creation) that was discovered during TDD.
