# TabBridge MVP Manual Smoke Tests

Run these after unit and integration tests pass.

1. Build all packages with `pnpm build`.
2. Start WXT dev mode with `pnpm --filter @tabbridge/chrome-extension dev`.
3. Load the generated Chrome extension and record the extension id.
4. Open multiple normal Chrome tabs, including one supported `https://` page.
5. Click the TabBridge extension icon to connect to the broker.
6. Run `tabbridge status --json` and confirm `ok: true`.
8. Run `tabbridge tabs list --json` and confirm output includes title/domain but no full URL or favicon URL.
9. Run `tabbridge tabs current --json` and confirm it matches Chrome's focused active tab.
10. Run `tabbridge tabs request-access --tab <tabId> --reason "Smoke test snapshot" --json`.
11. Approve the request in the extension popup.
12. Run `tabbridge approvals wait --id <approvalId> --json` and confirm authorization succeeds.
13. Run `tabbridge snapshot --tab <tabId> --json` and confirm refs use `@e` format.
14. Run a low-risk `tabbridge focus` or `tabbridge click` using the returned `snapshotId` and `ref`.
15. Take a new snapshot after the action.
16. Run `tabbridge wait-for-text --tab <tabId> --text "<visible text>" --timeout 5000 --json`.
17. Run `tabbridge text --tab <tabId> --max-bytes 1024 --json` and confirm bounded visible text is returned.
18. Run `tabbridge html --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --max-bytes 2048 --json` and confirm scripts, styles, hidden inputs, and form values are removed.
19. Run `tabbridge screenshot --tab <tabId> --json` while the tab is active and confirm it succeeds.
20. Switch to another tab and run screenshot for the inactive tab; confirm `TAB_NOT_ACTIVE_FOR_SCREENSHOT`.
21. Trigger a high-risk action such as clicking a button named Delete on a safe fixture page and confirm the extension asks for confirmation.
22. Run `tabbridge doctor` and confirm broker listening, token/lock files, protocol version, and extension id checks are understandable.
23. Run `tabbridge tabs release --tab <tabId> --json` and confirm subsequent snapshot returns `TAB_NOT_AUTHORIZED`.
