# TabBridge CLI Reference

All agent-facing commands should use `--json` when they need the stable JSON envelope. Human-readable snapshot output is available without `--json`.

## Envelope

Success:

```json
{"ok":true,"data":{"page":{"title":"Example","url":"https://example.com"},"refs":[{"ref":"@e1","role":"button","name":"Save","text":"Save","attributes":{}}],"text":"Page: Example
URL: https://example.com

@e1 [button] "Save""}}
```

Failure:

```json
{"ok":false,"error":{"code":"TAB_NOT_AUTHORIZED","message":"Request access before reading this tab.","recoverable":true,"suggestedCommand":"tabbridge tabs request-access --tab 123 --reason <reason> --json"}}
```

## Discovery and Session

```bash
tabbridge tabs list --json
tabbridge tabs current --json
tabbridge connect --current --json
tabbridge connect --tab <tabId> --json
tabbridge session --json
tabbridge disconnect --json
```

Discovery output includes `tabId`, `windowId`, `title`, `domain`, `active`, and `accessStatus`. It does not include full URL or favicon URL by default.

`connect --current` stores the current active Chrome tab as the default session tab. If no session exists, session-oriented commands resolve the active tab and create the session implicitly.

## Access

```bash
tabbridge tabs request-access --tab <tabId> --reason "<reason>" --json
tabbridge approvals wait --id <approvalId> --timeout 30000 --json
tabbridge tabs release --tab <tabId> --json
```

Origin authorization is still required before inspection or action. If the tab navigates to a different origin, request access again.

## Reading

```bash
tabbridge snapshot
tabbridge snapshot -i
tabbridge snapshot -i --json
tabbridge text --max-bytes 131072 --json
tabbridge html --ref @e1 --max-bytes 65536 --json
tabbridge screenshot page.png
tabbridge screenshot --json
```

`tabbridge snapshot` aliases to `tabbridge snapshot -i`. Non-JSON snapshot output prints compact agent-browser-style text directly:

```text
Page: Example
URL: https://example.com

@e1 [button] "Save"
@e2 [textbox] placeholder="Comment"
```

Refs are volatile. Every snapshot assigns fresh document-order refs (`@e1`, `@e2`, ...). Do not cache refs across snapshots, reloads, back/forward navigation, or origin changes.

## Actions

```bash
tabbridge click @e1 --json
tabbridge fill @e2 "replacement text" --json
tabbridge fill @e2 --text-stdin --json
tabbridge type @e2 " appended text" --json
tabbridge type @e2 --text-stdin --json
tabbridge clear @e2 --json
tabbridge select @e3 <value> --json
tabbridge check @e4 --json
tabbridge uncheck @e4 --json
tabbridge focus @e5 --json
```

Ref-based actions resolve refs only from the latest interactive snapshot for the current session tab. If `SNAPSHOT_REQUIRED` is returned, run `tabbridge snapshot -i`. If `REF_STALE` is returned, run a fresh `tabbridge snapshot -i` and retry using the new ref.

`fill` replaces the target value. `type` appends text to the current value.

## Wait and Navigation

```bash
tabbridge wait --ms <ms> --json
tabbridge wait-for-text --text <text> --timeout <ms> --json
tabbridge reload --json
tabbridge back --json
tabbridge forward --json
```

After reload, back, or forward, old refs are cleared. Take a new interactive snapshot before using `@refs` again.
