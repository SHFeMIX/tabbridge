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

## Review Fix: Executable Native Host Wrapper

### Status

Completed Task 4 review fixes with TDD.

### RED Evidence

- `pnpm --filter @tabbridge/cli test -- native-manifest doctor cli main` initially could not run because dependencies were not installed in this worktree (`vitest: command not found`); after `pnpm install`, the focused tests failed for the expected review issues.
- Parser tests failed because `status` and `doctor` returned empty payloads instead of preserving `--browser` and `--extension-id`.
- Manifest install test failed because `writeNativeManifest` did not generate an executable wrapper path and the manifest path was not the Application Support wrapper.
- Main runner tests failed because `install-native-host` still passed `wrapperPath: process.execPath`, and diagnostic commands still defaulted to Chrome without forwarded flags.
- Doctor test failed because missing expected extension id still produced a green `extension id matches allowed_origins` check.

### Implementation

- `writeNativeManifest` now installs an executable wrapper script at `~/Library/Application Support/tabbridge/tabbridge-native-host-wrapper` and points the Native Messaging manifest at that wrapper instead of Node.
- The wrapper script delegates to the TabBridge native-host entry and preserves native messaging argv with `"$@"`.
- `install-native-host` now calls the manifest writer with only browser and extension id; wrapper generation is owned by the installer.
- `status` and `doctor` parsing now preserves optional `--browser` and `--extension-id` flags.
- `runDoctor` now reports an explicit failing `expected extension id was provided` check when no expected id is supplied and does not mark allowed-origin comparison green without an expected id.
- CLI JSON output remains a single envelope for local commands.

### Verification

- `pnpm --filter @tabbridge/cli test` — passed, 7 files / 38 tests.
- `pnpm --filter @tabbridge/cli typecheck` — passed.
- `pnpm test` — passed, 19 files / 93 tests.
- `pnpm typecheck` — passed.
