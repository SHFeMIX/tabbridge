---
name: tabbridge
---

# TabBridge

Use this skill when the user asks you to inspect, understand, or interact with a webpage that is already open in their local Chrome or Chromium browser, and they explicitly want to use TabBridge.

TabBridge controls only user-authorized, already-open tabs. It does not launch a separate browser, create a new browser profile, open new tabs as the main workflow, extract cookies, read localStorage, run arbitrary JavaScript, intercept network traffic, or bypass user approvals.

## Required Safety Rules

1. Start with `tabbridge status --json`.
2. If the bridge is not connected, follow the structured error recovery instruction and ask the user to open Chrome and click the TabBridge extension icon.
3. Discover tabs with `tabbridge tabs list --json` or `tabbridge tabs current --json`.
4. Do not assume discovery grants page-content access.
5. Before reading page content, request access with `tabbridge tabs request-access --tab <tabId> --reason <reason> --json`.
6. If the CLI returns `USER_APPROVAL_REQUIRED`, tell the user what is being requested and wait with `tabbridge approvals wait --id <approvalId> --json`.
7. Prefer `tabbridge snapshot --tab <tabId> --json` for page understanding.
8. Save the returned `snapshotId` and use `snapshotId + ref` for ref-based actions.
9. After meaningful page actions, take a new snapshot before continuing.
10. If `REF_STALE` is returned, take a new snapshot and retry only if the user still wants the action.
11. Prefer ref-based actions over coordinate actions.
12. Coordinate click and drag are high-risk fallback actions and may require confirmation.
13. Use `type --text-stdin` for ordinary non-sensitive text instead of placing text in argv.
14. Never put passwords, 2FA codes, payment details, credentials, or token-like values in CLI argv.
15. Do not ask TabBridge for cookies, localStorage, credentials, tokens, arbitrary JavaScript execution, or network interception.
16. Do not paste large HTML, screenshot data, or secrets into the conversation unless the user explicitly asks and the content is not sensitive.

## Standard Workflow

```bash
tabbridge status --json
tabbridge tabs list --json
tabbridge tabs request-access --tab <tabId> --reason "<short user-visible reason>" --json
tabbridge approvals wait --id <approvalId> --json
tabbridge snapshot --tab <tabId> --json
```

When acting on elements:

```bash
tabbridge click --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge snapshot --tab <tabId> --json
```

When typing ordinary non-sensitive text:

```bash
printf '%s' "ordinary text" | tabbridge type --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --text-stdin --json
```

## Error Recovery

Always parse the JSON envelope. A failed command still prints a machine-readable error envelope to stdout in `--json` mode.

If the error includes `suggestedCommand`, explain the situation and run or ask for that recovery step when appropriate. If the error includes `approvalId` or `pollCommand`, explain the pending approval and wait for the user decision.
