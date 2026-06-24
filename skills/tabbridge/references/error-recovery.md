# TabBridge Error Recovery

- `EXTENSION_NOT_CONNECTED`: Ask the user to open Chrome and click the TabBridge extension icon, or run any `tabbridge` command (e.g., `tabbridge status --json`) to start the broker. Then run `tabbridge status --json`.
- `BRIDGE_SOCKET_UNAVAILABLE`: Ask the user to reopen the extension popup. Run `tabbridge doctor` if it persists.
- `TAB_NOT_AUTHORIZED`: Run `tabbridge tabs request-access --tab <tabId> --reason <reason> --json`.
- `USER_APPROVAL_REQUIRED`: Explain the access request and wait with the returned approval id.
- `ACTION_REQUIRES_CONFIRMATION`: Explain the high-risk action and wait with the returned approval id.
- `REF_STALE`: Take a new snapshot and use a ref from the new snapshot.
- `TAB_NOT_ACTIVE_FOR_SCREENSHOT`: Ask the user to activate the target tab before retrying screenshot.
- `UNSUPPORTED_PAGE`: Explain that Chrome internal pages, extension pages, file URLs, and special pages are outside the MVP.
- `MESSAGE_TOO_LARGE`: Retry with a smaller `--max-bytes` value or a narrower `html --ref` scope.
