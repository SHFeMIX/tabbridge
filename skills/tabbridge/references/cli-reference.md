# TabBridge CLI Reference

All agent-facing commands should use `--json` when they need the stable JSON envelope. Human-readable snapshot output is available without `--json`.

## Envelope

Success:

```json
{"ok":true,"data":{"page":{"title":"Example","url":"https://example.com"},"refs":[{"ref":"@e1","role":"button","name":"Save","text":"Save","attributes":{}}],"text":"Page: Example\nURL: https://example.com\n\n@e1 [button] \"Save\""}}
```

Failure:

```json
{"ok":false,"error":{"code":"TAB_NOT_AUTHORIZED","message":"Request access before reading this tab.","recoverable":true,"suggestedCommand":"tabbridge tabs request-access --tab 123 --reason <reason> --json"}}
```

## Session and Discovery

```bash
tabbridge status --json
tabbridge doctor --json
tabbridge tabs list --json
tabbridge tabs current --json
tabbridge connect --current --json
tabbridge connect --tab <tabId> --json
tabbridge session --json
tabbridge disconnect --json
```

Discovery output includes `tabId`, `windowId`, `title`, `domain`, `active`, and `accessStatus`. It does not include the full URL or favicon URL by default.

`connect --current` stores Chrome's current active tab as the default session tab. If no session exists, session-oriented commands such as `snapshot`, `text`, and ref actions resolve the active tab and create the session implicitly.

## Access and Approvals

```bash
tabbridge tabs request-access --tab <tabId> --reason "<reason>" --json
tabbridge approvals wait --id <approvalId> --timeout 30000 --json
tabbridge approvals status --id <approvalId> --json
tabbridge approvals cancel --id <approvalId> --json
tabbridge tabs release --tab <tabId> --json
```

Origin authorization is still required before inspection or action. If the tab navigates to a different origin, request access again.

## Reading

```bash
tabbridge snapshot
tabbridge snapshot -i
tabbridge snapshot -i --json
tabbridge text --max-bytes 131072 --json
tabbridge html --ref <ref> --max-bytes 65536 --json
tabbridge screenshot page.png
tabbridge screenshot --json
```

`tabbridge snapshot` is always interactive. The `-i` flag is accepted but ignored, so `tabbridge snapshot` and `tabbridge snapshot -i` behave identically. Non-JSON snapshot output prints compact agent-browser-style text directly:

```text
Page: Example
URL: https://example.com

@e1 [button] "Save"
@e2 [textbox] placeholder="Comment"
```

Refs are volatile. Every snapshot assigns fresh document-order refs (`@e1`, `@e2`, ...). Do not cache refs across snapshots, reloads, back/forward navigation, or origin changes.

## Ref Actions

```bash
tabbridge click <ref> --json
tabbridge fill <ref> "replacement text" --json
tabbridge fill <ref> --text-stdin --json
tabbridge type <ref> " appended text" --json
tabbridge type <ref> --text-stdin --json
tabbridge clear <ref> --json
tabbridge select <ref> <value> --json
tabbridge check <ref> --json
tabbridge uncheck <ref> --json
tabbridge focus <ref> --json
```

Ref-based actions resolve refs only from the latest interactive snapshot for the current session tab. If `SNAPSHOT_REQUIRED` is returned, run `tabbridge snapshot -i`. If `REF_STALE` is returned, run a fresh `tabbridge snapshot -i` and retry using the new ref.

`fill` replaces the target value. `type` appends text to the current value.

## Other Page Actions

```bash
tabbridge press --key Escape --json
tabbridge scroll --dx 0 --dy 300 --json
tabbridge click-coordinates --x 20 --y 20 --json
tabbridge drag-coordinates --from-x 20 --from-y 20 --to-x 120 --to-y 120 --json
```

`press` dispatches `keydown`/`keyup` on the document. `scroll` scrolls the page by the given delta. `click-coordinates` and `drag-coordinates` are high-risk actions that require explicit user confirmation through the extension popup before they execute.

## Wait and Navigation

```bash
tabbridge wait --ms <ms> --json
tabbridge wait-for-text --text <text> --timeout <ms> --json
tabbridge reload --json
tabbridge back --json
tabbridge forward --json
```

After reload, back, or forward, old refs are cleared. Take a new interactive snapshot before using `@refs` again.
