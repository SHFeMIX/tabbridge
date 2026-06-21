# Task 5 Report: WXT Extension Scaffold and Native Port Lifecycle

## Status

Completed Task 5 scope only.

## TDD trail

- Started with failing extension/package scaffold checks before creating `packages/chrome-extension`.
- Added manifest configuration tests before wiring the WXT config.
- Added native-port tests for hello creation, `connectNative('com.tabbridge.host')`, and reconnect/backoff behavior before completing the lifecycle implementation.
- Added popup scaffold tests before adding the WXT popup HTML entrypoint and Vue plugin config.

## Implemented

- Added `packages/chrome-extension` WXT/Vue/Vite/Tailwind workspace package.
- Configured Chrome MV3 manifest permissions:
  - `nativeMessaging`
  - `tabs`
  - `scripting`
  - `storage`
  - `activeTab`
  - optional host permissions for `http://*/*` and `https://*/*`
- Added background entrypoint that creates a native port manager and connects to `com.tabbridge.host`.
- Implemented native-port lifecycle with:
  - extension hello message using shared protocol version 1
  - immediate hello post after native connection
  - incoming message routing hook
  - disconnect handling
  - increasing reconnect backoff
  - manual disconnect/stop support
- Added a Task 5-only command router stub:
  - `status` returns a simple connected payload
  - all other commands return `ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE`
- Added runtime-registered content script stub.
- Added Vue popup scaffold with Tailwind CSS and WXT popup HTML entrypoint.

## Verification

- `pnpm --filter @tabbridge/chrome-extension test` passed: 2 files, 6 tests.
- `pnpm --filter @tabbridge/chrome-extension typecheck` passed.
- `pnpm --filter @tabbridge/chrome-extension build` passed and emitted manifest, background, content script, popup HTML, popup JS, and popup CSS assets.
- `pnpm --filter @tabbridge/native-host build && pnpm test && pnpm typecheck` passed after building native-host dist.
- Final root verification:
  - `pnpm test` passed: 21 files, 99 tests.
  - `pnpm typecheck` passed across workspace packages.

## Notes and concerns

- Task 6+ functionality was intentionally not implemented. Grants, tab enumeration, snapshots, page actions, and approval flows remain future work.
- Root test/typecheck currently depend on `@tabbridge/native-host` dist exports being present. A fresh checkout may need `pnpm --filter @tabbridge/native-host build` before root verification until workspace source aliases or project references are introduced.
- WXT 0.20.26 required an explicit Vite 6 dependency in the extension package for a successful production build.
