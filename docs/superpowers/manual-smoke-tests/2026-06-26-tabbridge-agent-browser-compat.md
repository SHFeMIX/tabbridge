# TabBridge Agent-Browser-Compatible vNext Manual Smoke Test

## Goal

Verify the current-tab session workflow, interactive snapshots, volatile refs, latest-only actions, and authorization behavior.

## Prerequisites

- Chrome is running with the TabBridge extension installed and connected to the broker.
- The CLI is built from this branch.
- A normal `http` or `https` page is active in the current Chrome window.

## Script

1. Discover the current tab.

   ```bash
   tabbridge tabs current --json
   ```

2. Request access for the current tab ID if needed.

   ```bash
   tabbridge tabs request-access --tab <tabId> --reason "Manual vNext smoke test" --json
   tabbridge approvals wait --id <approvalId> --timeout 30000 --json
   ```

3. Connect the default session to the active tab.

   ```bash
   tabbridge connect --current --json
   tabbridge session --json
   ```

   Expected: session reports `connected: true`, the active `tabId`, and `hasLatestSnapshot: false` before snapshot.

4. Take an interactive snapshot.

   ```bash
   tabbridge snapshot -i
   ```

   Expected: compact text beginning with `Page:` and `URL:`, followed by volatile refs such as `@e1`.

5. Take a JSON snapshot.

   ```bash
   tabbridge snapshot -i --json
   tabbridge session --json
   ```

   Expected: JSON data includes `page`, `refs`, and `text`; session now reports `hasLatestSnapshot: true`.

6. Run a latest-ref action against a safe interactive element from the latest snapshot.

   ```bash
   tabbridge focus @e1 --json
   ```

   Expected: action succeeds or returns an element-specific recoverable error if the element cannot be focused.

7. If a text input is available, verify fill/type semantics.

   ```bash
   tabbridge fill @eN "hello" --json
   tabbridge type @eN " world" --json
   ```

   Expected: `fill` replaces the value; `type` appends.

8. Verify navigation clears refs.

   ```bash
   tabbridge reload --json
   tabbridge click @e1 --json
   ```

   Expected: the click returns `SNAPSHOT_REQUIRED`. Run `tabbridge snapshot -i` again before further ref actions.

9. Verify authorization is still enforced after an origin change.

   Navigate the tab to a different origin, then run:

   ```bash
   tabbridge snapshot -i --json
   ```

   Expected: `TAB_NOT_AUTHORIZED` until access is requested for the new origin.

## Pass Criteria

- `snapshot` and `snapshot -i` both produce interactive snapshots for the session tab.
- Refs are reassigned fresh on each snapshot.
- Ref actions do not require tab IDs or snapshot IDs.
- Actions before a latest snapshot return `SNAPSHOT_REQUIRED`.
- Authorization is required before inspection and action.
