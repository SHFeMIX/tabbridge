# Task 9 Build Fix Report

## Change
- Updated `packages/cli/package.json` build script to remove unsupported `--banner.js` usage.
- The build now runs `tsup src/main.ts --format esm --dts --clean`, then runs a small `node -e` script that prepends `#!/usr/bin/env node\n` to `dist/main.js` if missing and chmods it to `0755`.

## Verification
- Reproduced blocker before the fix: `pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/cli build` failed with `CACError: Unknown option --banner`.
- After the fix, `pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket --filter @tabbridge/cli build` passed.
- `pnpm --dir /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket build` passed.
- `node /Users/alan/Desktop/agent-browser-extension/.claude/worktrees/tabbridge-websocket/packages/cli/dist/main.js doctor --json` executed the built CLI, but exited 1 because the broker/extension state reported `EXTENSION_NOT_CONNECTED` / `extension_asleep`.

## Notes
- No unrelated source changes were made.
