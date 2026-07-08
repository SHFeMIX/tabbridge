---
name: tabbridge
description: Use when the user asks you to inspect, understand, or interact with a webpage already open in their local Chrome or Chromium browser through the TabBridge CLI. Examples include "check the price on this page", "fill the form in Chrome using TabBridge", or "what does this page say?".
---

# TabBridge

TabBridge controls only user-authorized, already-open tabs in the user's local Chrome or Chromium browser. It does not launch a separate browser, create a new browser profile, open new tabs as the main workflow, extract cookies, read localStorage, run arbitrary JavaScript, intercept network traffic, or bypass user approvals.

## Required Safety Rules

1. Start with `tabbridge status --json`.
2. If the bridge is not connected, ask the user to open Chrome and click the TabBridge extension icon, then re-run `tabbridge status --json`.
3. Discover tabs with `tabbridge tabs list --json` or `tabbridge tabs current --json`.
4. Do not assume discovery grants page-content access.
5. Before reading page content, request access with `tabbridge tabs request-access --tab <tabId> --reason <reason> --json`.
6. If the CLI returns `USER_APPROVAL_REQUIRED`, tell the user what is being requested and wait with `tabbridge approvals wait --id <approvalId> --json`.
7. Prefer `tabbridge snapshot -i` for page understanding.
8. Save the returned refs and use them for ref-based actions. Refs are volatile `@eN` values assigned fresh on every snapshot.
9. After meaningful page actions, take a new snapshot before continuing.
10. If `REF_STALE` is returned, take a new snapshot and retry only if the user still wants the action.
11. Prefer ref-based actions over coordinate actions.
12. Coordinate `click-coordinates` and `drag-coordinates` are high-risk fallback actions that require explicit user confirmation through the extension popup.
13. Use `type --text-stdin` / `fill --text-stdin` for ordinary non-sensitive text instead of placing text in argv.
14. Never put passwords, 2FA codes, payment details, credentials, or token-like values in CLI argv.
15. Do not ask TabBridge for cookies, localStorage, credentials, tokens, arbitrary JavaScript execution, or network interception.
16. Do not paste large HTML, screenshot data, or secrets into the conversation unless the user explicitly asks and the content is not sensitive.

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
