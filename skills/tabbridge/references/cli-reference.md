# TabBridge CLI Reference

All agent-facing commands should use `--json` and parse the stable envelope.

## Envelope

Success:

```json
{"ok":true,"data":{"tabId":123,"snapshotId":"snap_abc"}}
```

Failure:

```json
{"ok":false,"error":{"code":"TAB_NOT_AUTHORIZED","message":"Request access before reading this tab.","recoverable":true,"suggestedCommand":"tabbridge tabs request-access --tab 123 --reason <reason> --json"}}
```

## Discovery

```bash
tabbridge tabs list --json
tabbridge tabs current --json
```

Discovery output includes `tabId`, `windowId`, `title`, `domain`, `active`, and `accessStatus`. It does not include full URL or favicon URL by default.

## Access

```bash
tabbridge tabs request-access --tab <tabId> --reason "<reason>" --json
tabbridge approvals wait --id <approvalId> --timeout 30000 --json
tabbridge tabs release --tab <tabId> --json
```

## Reading

```bash
tabbridge snapshot --tab <tabId> --json
tabbridge snapshot --tab <tabId> --include-url --json
tabbridge text --tab <tabId> --max-bytes 131072 --json
tabbridge html --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --max-bytes 65536 --json
tabbridge screenshot --tab <tabId> --json
```

`--include-url` only returns URL after Level 2 authorization. Screenshot is supported only for the current active tab in the selected window.

## Actions

```bash
tabbridge click --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge type --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --text-stdin --json
tabbridge clear --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge select --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --value <value> --json
tabbridge check --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge uncheck --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge focus --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
```

Ref-based actions must include `snapshotId`. If `REF_STALE` is returned, take a fresh snapshot.

## Wait and Navigation

```bash
tabbridge wait --tab <tabId> --ms <ms> --json
tabbridge wait-for-text --tab <tabId> --text <text> --timeout <ms> --json
tabbridge reload --tab <tabId> --json
tabbridge back --tab <tabId> --json
tabbridge forward --tab <tabId> --json
```

After reload, back, or forward, discard old refs and take a new snapshot.
