# Task 2 Report: Broker Runtime Paths and Token

## Summary

Created the `@tabbridge/broker` package foundation with runtime path management, token generation, and a singleton process lock.

## Files Created

| File | Description |
|------|-------------|
| `packages/broker/package.json` | Package manifest with `proper-lockfile` and `ws` dependencies |
| `packages/broker/tsconfig.json` | TypeScript config extending base |
| `packages/broker/src/index.ts` | Public API exports |
| `packages/broker/src/runtime.ts` | `createRuntimePaths`, `ensureSupportDir`, `generateToken`, `readToken`, `writeToken`, `BROKER_PORT` |
| `packages/broker/src/lock.ts` | `acquireBrokerLock` using `proper-lockfile` |
| `packages/broker/test/runtime.test.ts` | Tests for macOS paths and token format |
| `packages/broker/test/lock.test.ts` | Tests for singleton lock behavior |

## Modifications to Existing Files

- `vitest.workspace.ts`: Added `packages/broker` to the workspace project list.

## Deviations from Brief

1. **`@types/proper-lockfile` version**: Changed from `^2.1.5` (which does not exist on npm) to `^4.1.4` (latest available).
2. **`updateInterval` option**: Changed to `update` to match the actual `proper-lockfile` `LockOptions` interface.
3. **Test import extensions**: Added `.js` extensions to test imports (`../src/runtime.js`, `../src/lock.js`) to satisfy TypeScript's `NodeNext` module resolution.
4. **Lock test setup**: Added `await fs.writeFile(lockFile, '')` before acquiring the lock, because `proper-lockfile` requires the target file to exist.

## Test Results

- **runtime.test.ts**: 2/2 passed (macOS path structure, 64-char hex token format)
- **lock.test.ts**: 1/1 passed (second lock acquisition throws)
- **TypeScript**: `tsc --noEmit` passes with zero errors

## Commit

`daa866d` feat(broker): add runtime paths and singleton lock
