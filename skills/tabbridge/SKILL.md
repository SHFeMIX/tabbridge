---
name: tabbridge
description: Use this skill whenever the user wants to inspect, understand, fill, click, or interact with a webpage already open in their local Chrome or Chromium browser — even if they don't explicitly mention TabBridge. Examples include "check the price on this page", "fill the form in Chrome", "what does this page say?", or "click the save button in my browser".
---

# TabBridge

TabBridge controls only user-authorized, already-open tabs in the user's local Chrome or Chromium browser. It does not launch a separate browser, create a new browser profile, open new tabs as the main workflow, extract cookies, read localStorage, run arbitrary JavaScript, intercept network traffic, or bypass user approvals.

## Install

If the `tabbridge` command is not available, install the CLI from npm:

```bash
npm install -g tabbridge-cli
```

The published npm package name is `tabbridge-cli`, but the global executable command remains `tabbridge`.

## Compatibility

- Requires the TabBridge CLI (`npm install -g tabbridge-cli`) and the TabBridge Chrome extension.
- Works with Chrome / Chromium on macOS, Windows, and Linux.
- The extension must be installed, enabled, and connected to the local broker.

## Required Safety Rules

1. Start with `tabbridge status --json`.
2. If the bridge is not connected, ask the user to open Chrome and click the TabBridge extension icon, then re-run `tabbridge status --json`.
3. Discover tabs with `tabbridge tabs list --json` or `tabbridge tabs current --json`.
4. Do not assume discovery grants page-content access.
5. Before reading page content, request access with `tabbridge tabs request-access --tab <tabId> --reason <reason> --json`.
6. If the CLI returns `USER_APPROVAL_REQUIRED`, tell the user what is being requested and wait with `tabbridge approvals wait --id <approvalId> --json`.
7. The extension popup UI is currently in Chinese; approval buttons are 允许 (Allow), 允许一次 (Allow once), and 拒绝 (Deny).
8. Prefer `tabbridge snapshot -i` for page understanding.
9. Save the returned refs and use them for ref-based actions. Refs are volatile `@eN` values assigned fresh on every snapshot.
10. After meaningful page actions, take a new snapshot before continuing.
11. If `REF_STALE` is returned, take a new snapshot and retry only if the user still wants the action.
12. Prefer ref-based actions over coordinate actions.
13. Coordinate `click-coordinates` and `drag-coordinates` are high-risk fallback actions that require explicit user confirmation through the extension popup, because they cannot be tied to a stable semantic ref.
14. Use `type --text-stdin` / `fill --text-stdin` for ordinary non-sensitive text instead of placing text in argv, because shell history and process lists can expose command-line arguments.
15. Never put passwords, 2FA codes, payment details, credentials, or token-like values in CLI argv, because arguments may be visible in process lists and shell history.
16. Do not ask TabBridge for cookies, localStorage, credentials, tokens, arbitrary JavaScript execution, or network interception; these are outside the security model and will be refused.
17. Do not paste large HTML, screenshot data, or secrets into the conversation unless the user explicitly asks and the content is not sensitive, because it consumes tokens and may leak sensitive page content.

## Standard Workflow

```bash
tabbridge status --json
tabbridge tabs list --json
tabbridge connect --current --json
tabbridge tabs request-access --tab <tabId> --reason "<short user-visible reason>" --json
tabbridge approvals wait --id <approvalId> --json
tabbridge snapshot -i --json
```

When acting on elements:

```bash
tabbridge click <ref> --json
tabbridge snapshot -i --json
```

When typing ordinary non-sensitive text:

```bash
printf '%s' "ordinary text" | tabbridge type <ref> --text-stdin --json
```

## Error Recovery

Always parse the JSON envelope. A failed command still prints a machine-readable error envelope to stdout in `--json` mode.

If the error includes `suggestedCommand`, explain the situation and run or ask for that recovery step when appropriate. If the error includes `approvalId` or `pollCommand`, explain the pending approval and wait for the user decision.

For the full command reference, see [references/cli-reference.md](references/cli-reference.md). For error codes and recovery steps, see [references/error-recovery.md](references/error-recovery.md). For the security model, see [references/security-boundaries.md](references/security-boundaries.md).
