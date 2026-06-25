# TabBridge Current Full Manual Smoke Tests

Date: 2026-06-26

Run this checklist after automated tests pass. It verifies the current TabBridge product surface end to end: CLI, broker, Chrome extension, permissions, snapshots, stable refs, reads, actions, approvals, navigation, screenshots, and error recovery.

## 0. Test Record

Use this section to record one manual run.

| Field | Value |
|---|---|
| Date/time | |
| Commit | |
| OS | macOS |
| Chrome version | |
| Extension id | |
| Tester | |
| Result | Pass / Fail |
| Notes | |

## 1. Scope

This smoke test covers the main current features:

- Workspace build, typecheck, and automated tests.
- Local WebSocket broker startup and health.
- Chrome extension connection and popup-mediated approvals.
- Tab discovery with privacy-preserving tab metadata.
- Per-tab site authorization and release.
- Semantic snapshots with stable `@r_` refs.
- Bounded text and sanitized HTML reads.
- Ref actions: click, focus, type, clear, select, check, uncheck.
- Non-ref actions: key press, scroll, coordinate click, coordinate drag.
- High-risk action approval behavior.
- Wait, wait-for-text, reload, back, forward.
- Screenshot happy path and inactive-tab error.
- Expected error behavior for unauthorized tabs, stale refs, unsupported pages, and unsafe actions.

This smoke test does not verify every unit-test edge case. It is meant to answer: “Can the current product be manually driven through its major user-visible capabilities?”

## 2. Prerequisites

1. Use a clean checkout on the commit under test.
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build packages that expose runtime `dist` entry points:

   ```bash
   pnpm --filter @tabbridge/shared build
   pnpm --filter @tabbridge/broker build
   ```

4. Run automated verification:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   ```

5. Expected result:

   - `pnpm typecheck` exits `0`.
   - `pnpm test` exits `0`.
   - `pnpm build` exits `0`.

6. If port `9876` is already occupied by an old TabBridge broker, stop that broker before testing broker startup:

   ```bash
   lsof -nP -iTCP:9876 -sTCP:LISTEN
   ```

   If the process is a known local TabBridge broker, stop it before continuing.

## 3. Start the Extension

1. Start WXT dev mode:

   ```bash
   pnpm --filter @tabbridge/chrome-extension dev
   ```

2. Open Chrome and load the generated unpacked extension from the WXT output directory shown by the dev command.
3. Open the extension popup once.
4. Record the extension id in the test record.
5. Expected result:

   - Extension loads without Chrome manifest errors.
   - Popup opens.
   - Popup can display connection / authorization state.

## 4. Test Fixture Page

Open a normal `https://` page that you can safely interact with. For best coverage, use a local/static fixture page containing at least:

```html
<main>
  <h1>TabBridge Smoke Fixture</h1>

  <button id="save">Save</button>
  <button id="delete">Delete account</button>
  <button id="duplicate-a">Duplicate</button>
  <button id="duplicate-b">Duplicate</button>

  <form aria-label="Profile form">
    <label for="name">Name</label>
    <input id="name" name="name" placeholder="Name" value="private initial value">

    <label for="plan">Plan</label>
    <select id="plan" name="plan">
      <option value="free">Free</option>
      <option value="pro">Pro</option>
    </select>

    <label><input id="agree" type="checkbox"> Agree</label>
    <input id="hidden-token" type="hidden" value="secret-token">
    <button type="submit">Submit profile</button>
  </form>

  <button id="toggle-reorder" onclick="document.querySelector('main').append(document.querySelector('#save'))">
    Reorder Save
  </button>

  <p id="status">Ready for TabBridge smoke test</p>
</main>
```

If you do not have a fixture server, use any safe page with equivalent controls. Avoid production pages for destructive or high-risk action checks.

## 5. Broker and CLI Health

1. Run:

   ```bash
   tabbridge status --json
   ```

2. Expected result:

   - CLI starts the broker automatically if needed.
   - Output is a JSON envelope with `ok: true`.
   - Result indicates the bridge is connected or reachable.

3. Run:

   ```bash
   tabbridge doctor --json
   ```

4. Expected result:

   - JSON output is well-formed.
   - It reports broker status, runtime files, protocol checks, and extension connectivity in understandable terms.
   - If the extension is not connected yet, the message should be actionable rather than a crash.

## 6. Tab Discovery and Privacy

1. Run:

   ```bash
   tabbridge tabs list --json
   ```

2. Expected result:

   - Output is `ok: true`.
   - Normal Chrome tabs are listed.
   - Entries include safe metadata such as tab id, title, and domain.
   - Entries do not expose full URLs unless explicitly authorized by product behavior.
   - Favicon URLs are not exposed.

3. Run:

   ```bash
   tabbridge tabs current --json
   ```

4. Expected result:

   - Output identifies Chrome’s focused active tab.
   - The tab id matches the fixture tab if that tab is active.

5. Record the fixture tab id as:

   ```text
   TAB_ID=<tab id>
   ```

## 7. Authorization Flow

1. Try a snapshot before requesting access:

   ```bash
   tabbridge snapshot --tab <TAB_ID> --json
   ```

2. Expected result:

   - If the tab has not already been granted, output is `ok: false` with `TAB_NOT_AUTHORIZED`.
   - Error includes a recoverable path / suggested command.

3. Request access:

   ```bash
   tabbridge tabs request-access --tab <TAB_ID> --reason "Full smoke test" --json
   ```

4. Expected result:

   - Output is `ok: true` or an approval envelope.
   - If approval is required, output includes an approval id.
   - The extension popup shows a clear approval request with tab/domain/reason.

5. Approve in the extension popup.
6. If an approval id was returned, wait for it:

   ```bash
   tabbridge approvals wait --id <APPROVAL_ID> --timeout 30000 --json
   ```

7. Expected result:

   - Approval completes successfully.
   - Future commands for this tab are authorized.

8. Optional cancel/status check:

   ```bash
   tabbridge approvals status --id <APPROVAL_ID> --json
   tabbridge approvals cancel --id <APPROVAL_ID> --json
   ```

   Expected result: status/cancel either reports the current approval state or a clear not-found/expired response. It must not crash.

## 8. Snapshot and Stable Ref Identity

1. Take a snapshot:

   ```bash
   tabbridge snapshot --tab <TAB_ID> --json
   ```

2. Record:

   ```text
   SNAPSHOT_ID=<snapshotId>
   SAVE_REF=<ref for Save>
   DELETE_REF=<ref for Delete account>
   NAME_REF=<ref for Name input>
   PLAN_REF=<ref for Plan select>
   AGREE_REF=<ref for Agree checkbox>
   ```

3. Expected result:

   - Output is `ok: true`.
   - Snapshot contains frames and semantic elements.
   - Element refs use stable identity format like `@r_<hash>`, not old index refs like `@e1`.
   - Each element includes role/name semantics.
   - Form controls have correct roles:
     - text input -> `textbox`
     - checkbox -> `checkbox`
     - select -> `combobox`
     - buttons -> `button`
   - Elements include state labels such as `enabled`, `checked`, `disabled`, or `expanded` where applicable.
   - Snapshot does not leak typed input values.

4. Verify URL privacy default:

   ```bash
   tabbridge snapshot --tab <TAB_ID> --json
   ```

   Expected result: full URL is not included unless the command requests it.

5. Verify explicit URL inclusion:

   ```bash
   tabbridge snapshot --tab <TAB_ID> --include-url --json
   ```

   Expected result: URL is included only in this explicit mode.

6. Verify stable refs after DOM reorder:

   - Click the fixture page’s `Reorder Save` button manually, or run a safe action that moves the `Save` button.
   - Take another snapshot:

     ```bash
     tabbridge snapshot --tab <TAB_ID> --json
     ```

   Expected result:

   - `Save` still has the same `SAVE_REF`.
   - Other unchanged elements keep their refs where semantically possible.
   - Duplicate buttons named `Duplicate` receive distinct refs.

## 9. Bounded Text Read

1. Run:

   ```bash
   tabbridge text --tab <TAB_ID> --max-bytes 1024 --json
   ```

2. Expected result:

   - Output is `ok: true`.
   - Visible page text is returned.
   - Script/style/noscript content is absent.
   - Output indicates whether it was truncated.

3. Run with a small byte limit:

   ```bash
   tabbridge text --tab <TAB_ID> --max-bytes 16 --json
   ```

4. Expected result:

   - Output is truncated cleanly.
   - Multi-byte characters are not split.

## 10. Sanitized HTML Read

1. Run:

   ```bash
   tabbridge html --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <NAME_REF> --max-bytes 2048 --json
   ```

2. Expected result:

   - Output is `ok: true`.
   - Returned HTML is scoped to the semantically matched element.
   - Scripts, styles, noscript, hidden inputs, and form values are removed.
   - The original input value such as `private initial value` is not present.
   - This should work through semantic ref matching, not selector/xpath identity.

3. Run with an ambiguous duplicate ref if available:

   ```bash
   tabbridge html --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <DUPLICATE_REF> --json
   ```

4. Expected result:

   - If the live DOM has ambiguous same-semantic candidates, command returns `REF_STALE` rather than guessing.

## 11. Ref Actions

Use refs from the latest snapshot unless the step explicitly tests stability across snapshots.

### 11.1 Focus

```bash
tabbridge focus --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <NAME_REF> --json
```

Expected result:

- Output is `ok: true`.
- The corresponding input receives focus.

### 11.2 Type

```bash
tabbridge type --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <NAME_REF> --text "Alice" --json
```

Expected result:

- Output is `ok: true`.
- The input value changes in the page.
- A subsequent snapshot does not leak the typed value.

### 11.3 Type from stdin

```bash
printf " from stdin" | tabbridge type --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <NAME_REF> --text-stdin --json
```

Expected result:

- Output is `ok: true`.
- Text from stdin is appended.

### 11.4 Clear

```bash
tabbridge clear --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <NAME_REF> --json
```

Expected result:

- Output is `ok: true`.
- The input is empty.
- An `input` event is dispatched.

### 11.5 Select

```bash
tabbridge select --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <PLAN_REF> --value pro --json
```

Expected result:

- Output is `ok: true`.
- The select value becomes `pro`.
- A `change` event is dispatched.

### 11.6 Check and Uncheck

```bash
tabbridge check --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <AGREE_REF> --json
tabbridge uncheck --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <AGREE_REF> --json
```

Expected result:

- Both commands return `ok: true`.
- The checkbox state changes accordingly.
- A `change` event is dispatched.

### 11.7 Click

```bash
tabbridge click --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <SAVE_REF> --json
```

Expected result:

- Output is `ok: true` for low-risk safe controls.
- If the live DOM moved but the same semantic element still exists, the action resolves via stable ref identity.
- If the live DOM no longer contains a safe semantic match, output is `REF_STALE`.

## 12. High-Risk and Coordinate Approvals

### 12.1 High-risk ref action

1. Use the `Delete account` button only on a safe fixture page.
2. Run:

   ```bash
   tabbridge click --tab <TAB_ID> --snapshot-id <SNAPSHOT_ID> --ref <DELETE_REF> --json
   ```

3. Expected result:

   - If classified high risk, the extension creates a high-risk confirmation request.
   - The CLI receives an approval envelope or recoverable response.
   - Denying the request prevents the action.
   - Approving the request allows the action.

### 12.2 Coordinate click

```bash
tabbridge click-coordinates --tab <TAB_ID> --x 20 --y 20 --json
```

Expected result:

- Coordinate action requires high-risk confirmation because it cannot be tied to a stable semantic ref.
- If approved, it clicks the element at that point.
- If no element exists at that point, output is `ELEMENT_NOT_VISIBLE`.

### 12.3 Coordinate drag

```bash
tabbridge drag-coordinates --tab <TAB_ID> --from-x 20 --from-y 20 --to-x 120 --to-y 120 --json
```

Expected result:

- Coordinate drag requires high-risk confirmation.
- If approved and both points resolve to elements, drag events are dispatched.
- If either point has no element, output is `ELEMENT_NOT_VISIBLE`.

## 13. Keyboard and Scroll

### 13.1 Press

```bash
tabbridge press --tab <TAB_ID> --key Escape --json
```

Expected result:

- Output is `ok: true`.
- Page receives keydown/keyup for `Escape`.

### 13.2 Scroll

```bash
tabbridge scroll --tab <TAB_ID> --dx 0 --dy 300 --json
```

Expected result:

- Output is `ok: true`.
- Returned data includes updated `scrollX` and `scrollY`.
- Page scroll position changes.

## 14. Wait Commands

### 14.1 Wait

```bash
tabbridge wait --tab <TAB_ID> --ms 250 --json
```

Expected result:

- Output is `ok: true`.
- Returned data includes waited duration.

### 14.2 Wait for text

```bash
tabbridge wait-for-text --tab <TAB_ID> --text "Ready for TabBridge smoke test" --timeout 5000 --json
```

Expected result:

- Output is `ok: true`.
- `found` is `true`.

Run a negative case:

```bash
tabbridge wait-for-text --tab <TAB_ID> --text "Text that should not exist" --timeout 1000 --json
```

Expected result:

- Output is `ok: true`.
- `found` is `false`.

## 15. Navigation and Ref Lifecycle

### 15.1 Reload

```bash
tabbridge reload --tab <TAB_ID> --json
```

Expected result:

- Output is `ok: true`.
- Page reloads.
- Ref cache is cleared.
- Old refs may return `REF_STALE` until a new snapshot is taken.

### 15.2 Back and forward

Use a safe tab with navigation history.

```bash
tabbridge back --tab <TAB_ID> --json
tabbridge forward --tab <TAB_ID> --json
```

Expected result:

- Each command returns `ok: true` if the browser can navigate.
- Ref cache is cleared after navigation.
- A new snapshot is required for subsequent ref actions.

## 16. Screenshot

1. Make the fixture tab the active tab in the active Chrome window.
2. Run:

   ```bash
   tabbridge screenshot --tab <TAB_ID> --json
   ```

3. Expected result:

   - Output is `ok: true`.
   - Returned data includes screenshot information.
   - Message size limits are respected.

4. Switch to another tab.
5. Run screenshot for the now-inactive fixture tab:

   ```bash
   tabbridge screenshot --tab <TAB_ID> --json
   ```

6. Expected result:

   - Output is `ok: false`.
   - Error code is `TAB_NOT_ACTIVE_FOR_SCREENSHOT`.
   - Suggested recovery tells the user to activate the tab and retry.

## 17. Unsupported Pages and Error Recovery

### 17.1 Unsupported page

Open an unsupported browser page such as a Chrome internal page, then run a snapshot command for that tab.

Expected result:

- Output is `ok: false`.
- Error code is `UNSUPPORTED_PAGE` or the project’s specific unsupported-page code.
- Error is clear and not recoverable by retrying the same command.

### 17.2 Unauthorized tab after release

1. Release access:

   ```bash
   tabbridge tabs release --tab <TAB_ID> --json
   ```

2. Expected result:

   - Output is `ok: true` with `released: true`.

3. Try snapshot again:

   ```bash
   tabbridge snapshot --tab <TAB_ID> --json
   ```

4. Expected result:

   - Output is `ok: false`.
   - Error code is `TAB_NOT_AUTHORIZED`.
   - Suggested recovery points to `tabs request-access`.

### 17.3 Stale ref

1. Take a snapshot and record a ref.
2. Remove that element from the fixture page or navigate/reload.
3. Run a ref action with the old ref.

Expected result:

- Output is `ok: false`.
- Error code is `REF_STALE`.
- It does not click a different element.

### 17.4 Disabled / hidden element

Use a fixture control that is disabled or hidden and run a ref action on it.

Expected result:

- Disabled target returns `ELEMENT_DISABLED`.
- Hidden target returns `ELEMENT_NOT_VISIBLE` or `REF_STALE`, depending on whether it appears in the current interactable snapshot.
- It does not perform the action.

## 18. Final Cleanup

1. Release any tab grants used in testing:

   ```bash
   tabbridge tabs release --tab <TAB_ID> --json
   ```

2. Stop WXT dev mode with `Ctrl-C`.
3. Stop any test broker only if you started it for this smoke test.
4. Confirm the repository is still clean, unless intentionally testing local changes:

   ```bash
   git status --short
   ```

## 19. Pass/Fail Criteria

Mark the smoke test **Pass** only if all are true:

- Automated tests, typecheck, and build pass before manual testing.
- CLI can start/reach broker.
- Extension connects and can mediate approvals.
- Tabs can be listed/current tab can be identified without leaking full URLs by default.
- Authorization flow works.
- Snapshot returns semantic `@r_` refs with role/name/state/bounding box/identity hash semantics.
- Text and HTML reads are bounded and do not leak secrets or form values.
- Ref actions operate on stable semantic refs and fail stale on ambiguity.
- Coordinate actions require confirmation.
- Navigation clears refs.
- Screenshot works only for the active tab and reports inactive-tab errors correctly.
- Unsupported/unauthorized/stale/disabled/hidden scenarios produce clear errors.

Mark **Fail** if any command crashes, leaks private form values, misidentifies a destructive action as safe, clicks the wrong element, or returns an unclear/unrecoverable error for a recoverable state.

## 20. Notes for Future Updates

Update this document whenever one of these changes:

- CLI command syntax.
- Broker startup/auth behavior.
- Extension popup approval flow.
- Snapshot schema.
- Ref identity semantics.
- Risk classification rules.
- Screenshot limitations.
- Error codes or suggested recovery commands.
