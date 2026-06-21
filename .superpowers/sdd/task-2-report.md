# Task 2 Report: CLI Parser, JSON Output, and Command Mapping

## Files
- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/main.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/commands.ts`
- `packages/cli/src/ipc-client.ts`
- `packages/cli/src/json-output.ts`
- `packages/cli/test/cli.test.ts`
- `packages/cli/test/commands.test.ts`
- `packages/cli/test/json-output.test.ts`
- `pnpm-lock.yaml`

## Tests
- RED: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd --filter @tabbridge/cli test` failed before implementation because no `@tabbridge/cli` workspace project existed.
- GREEN: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd --filter @tabbridge/cli test` passed: 3 files, 8 tests.
- GREEN: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd --filter @tabbridge/cli typecheck` passed.
- Workspace: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd test` passed: 9 files, 29 tests.
- Workspace: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd typecheck` passed.

## Commit Hash
- `53dd158`

## Self-review
- CLI parser covers Task 2 MVP commands, including `tabbridge` package bin metadata, `--json` parsing, request-access payloads, stdin typing marker, ref-action `tabId` + `snapshotId` + `ref` validation, and explicit rejection of `navigate`.
- Command mapping imports `createBridgeRequest`, `BridgeRequest`, and `APPROVAL_WAIT_DEFAULT_TIMEOUT_MS` from `@tabbridge/shared` rather than redefining protocol constants or envelope shapes.
- JSON output writes exactly one serialized envelope plus a newline via a single `write` call.
- Runtime IPC client uses local socket IPC only; no arbitrary JS execution, network access, cookies, localStorage, credentials, or tokens were introduced.
- Existing unrelated docs changes were left unstaged and excluded from the Task 2 commit.

## Concerns
- Main error handling currently writes a JSON error envelope to stdout even when `--json` was not parsed successfully; this matches the current minimal implementation brief but may need revisiting if strict non-json stderr behavior is expected for parse errors without `--json`.
- `snapshot --include-url` is parsed for an explicit user command, but discovery-style `tabs list/current` payloads do not request or expose URL/favicon.
- The report path is under `.superpowers/sdd`, which is ignored by that directory's `.gitignore`; the report was written but not included in the feature commit.

## Review Fix Report

### Fixes
- Added `LocalCliCommand` routing for `native-host`, `status`, `doctor`, `install-native-host`, and `uninstall-native-host` so these commands are not converted into bridge requests.
- Tightened value-flag parsing so missing values and another flag used as a value are rejected with a clear error.
- Added CLI error output helper so non-json setup/parse errors write human stderr, while `--json` writes one JSON envelope to stdout.

### Tests
- RED: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd --filter @tabbridge/cli test` failed with 5 expected review-regression failures.
- GREEN: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd --filter @tabbridge/cli test` passed: 3 files, 13 tests.
- GREEN: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd --filter @tabbridge/cli typecheck` passed.
- Workspace: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd test` passed: 9 files, 34 tests.
- Workspace: `pnpm -C /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/0621plan-sdd typecheck` passed.

### Commit Hash
- pending

### Concerns
- Local command handlers currently return a structured not-implemented error rather than performing status/doctor/install/native-host behavior; Task 2 only required separating them from bridge requests.
