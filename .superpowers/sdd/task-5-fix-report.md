# Task 5 Fix Report

## Status
Fixed blocking Task 5 review findings.

## Changes
- Updated `packages/cli/src/ensure-broker.ts` so `ensureBroker()` can start the broker without requiring a future CLI `broker` parser branch:
  - prefers the built broker entry at `packages/broker/dist/main.js` when present;
  - only falls back to `node <argv1> broker` when the current CLI entrypoint appears usable;
  - otherwise starts the broker via an ESM import of `@tabbridge/broker` and `runBroker()`.
- Added injectable dependencies to `ensureBroker()` for testable spawn/listening/token behavior while preserving the public Task 5 exports.
- Updated missing-token behavior: when a broker is already listening but the token file is absent, `ensureBroker()` now throws `BROKER_TOKEN_MISSING` with restart guidance instead of returning an empty token.
- Restored `@tabbridge/native-host` as a CLI dependency while `doctor.ts` still imports it.
- Restored legacy shared bridge compatibility types/functions still used before Task 6 cleanup, including `BridgeRequest`, `BridgeResponse`, `BridgeHello`, and `createBridgeRequest`.
- Exported `RuntimePaths` from `@tabbridge/broker` so CLI typecheck can consume the injectable path type.
- Rebuilt affected workspace package dist artifacts for `@tabbridge/shared`, `@tabbridge/broker`, and `@tabbridge/native-host` so package exports and declarations match source.

## Verification
- `pnpm --filter @tabbridge/cli test`: passed — 9 test files, 42 tests.
- `pnpm --filter @tabbridge/cli typecheck`: passed.
