# Task 5 fix3 report

## Summary
- Added `tabbridge-broker` bin metadata pointing at `dist/main.js`.
- Updated `@tabbridge/broker` build to compile both `src/index.ts` and `src/main.ts` with splitting disabled so `dist/main.js` contains the executed-entrypoint block.
- Added an executable `src/main.ts` entrypoint that runs `runBroker()` when invoked directly, logs startup errors to stderr, and sets `process.exitCode = 1`.
- Updated `ensureBroker()` to spawn the concrete built broker entry and removed the cwd-dependent `node --eval import('@tabbridge/broker')` fallback.
- Added tests for broker package executable metadata and missing-entry failure behavior.

## TDD red checks

### `pnpm --filter @tabbridge/cli test -- ensure-broker.test.ts`
```
Exit code 1
FAIL test/ensure-broker.test.ts > ensure-broker helpers > reports a clear error when the built broker entry is missing
AssertionError: expected [Function] to throw error including 'BROKER_ENTRY_MISSING' but got 'BROKER_START_FAILED: broker did not start in time'
```

### `pnpm --filter @tabbridge/broker test -- main.test.ts`
```
Exit code 1
FAIL test/main.test.ts > broker package executable entry > declares a tabbridge-broker bin that is built from src/main.ts
AssertionError: expected undefined to deeply equal { 'tabbridge-broker': 'dist/main.js' }
```

## Verification

### `pnpm --filter @tabbridge/broker test`
```
Test Files  4 passed (4)
Tests  14 passed (14)
```

### `pnpm --filter @tabbridge/broker typecheck`
```
tsc --noEmit
```

### `pnpm --filter @tabbridge/broker build`
```
ESM dist/index.js 6.78 KB
ESM dist/main.js  6.67 KB
ESM Build success
DTS Build success
```

Additional build sanity check:
```
dist/main.js contains: if (isExecutedEntrypoint())
dist/main.js contains: runBroker().catch((error) => {
```

### `pnpm --filter @tabbridge/cli test`
```
Test Files  9 passed (9)
Tests  43 passed (43)
```

### `pnpm --filter @tabbridge/cli typecheck`
```
tsc --noEmit
```

## Notes
- An initial build attempt using `--banner.js` failed because the installed tsup CLI rejected `--banner`; the shebang was moved into `src/main.ts` instead.
- An initial successful build with default splitting emitted the entrypoint guard into a shared chunk, leaving `dist/main.js` as a re-export-only file. Adding `--splitting false` fixed the concrete executable entry path.
