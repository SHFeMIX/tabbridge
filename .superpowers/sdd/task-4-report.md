# Task 4 Report: Native Host Installation, Status, and Doctor Diagnostics

## Status

Completed Task 4 only.

## Implementation

- Added macOS Chrome/Chromium Native Messaging manifest helpers in `packages/cli/src/native-manifest.ts`.
- Added doctor evaluation and filesystem-based diagnostic checks in `packages/cli/src/doctor.ts`.
- Wired local CLI handling in `packages/cli/src/main.ts` for:
  - `install-native-host`
  - `uninstall-native-host`
  - `doctor`
  - `status`
- Kept shared protocol/error usage from `@tabbridge/shared` and runtime path usage from `@tabbridge/native-host`.
- Added `@tabbridge/native-host` as a CLI workspace dependency.

## TDD Evidence

- Added failing manifest/doctor tests first; verified RED because `native-manifest.ts` and `doctor.ts` did not exist.
- Added failing CLI local install test; verified RED because local native-host install commands were placeholder errors.
- Added failing local `doctor` default-browser test; verified RED because doctor required a missing browser payload.
- Added failing unhealthy-doctor exit-code test; verified RED because local command success was used as the process exit status.
- Implemented minimal code until targeted tests passed.

## Verification

- `pnpm --filter @tabbridge/cli test` — passed, 7 files / 32 tests.
- `pnpm --filter @tabbridge/cli typecheck` — passed.
- `pnpm test` — passed, 19 files / 87 tests.
- `pnpm typecheck` — passed.

## Notes

- Native Messaging host name is `com.tabbridge.host`.
- Manifest `allowed_origins` uses the exact provided extension id as `chrome-extension://<extension-id>/`.
- CLI JSON mode prints a single envelope for local commands.
- `doctor` returns a failing process exit code when the diagnostic report is unhealthy while still emitting a successful JSON envelope containing the report.
- Native-host stdout behavior was not changed.
