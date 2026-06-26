# TabBridge Agent-Browser-Compatible vNext Design

Date: 2026-06-26

## Summary

TabBridge vNext will break from the old explicit `snapshot_id` protocol and adopt an agent-browser-style command model. The default user experience becomes a stateful current-tab loop:

```bash
tabbridge snapshot -i
tabbridge click @e1
tabbridge snapshot -i
tabbridge fill @e2 "hello"
```

The first version focuses on the main-frame interactive workflow only. It does not preserve the old user-facing stable-ref or explicit snapshot-id semantics.

## Goals

- Match the agent-browser mental model for normal agent use.
- Remove `--snapshot-id` from the default user-facing workflow.
- Use volatile `@eN` refs assigned fresh on every snapshot.
- Default actions to the latest snapshot for the current session tab.
- Output compact interactive snapshots suitable for direct LLM reading.
- Keep the first implementation scoped to main-frame interactive elements.

## Non-goals for the First Version

- iframe extraction or iframe action routing.
- Stable external refs across snapshots.
- Multiple named browser sessions.
- `open <url>` / `close` browser-controller behavior.
- Full accessibility tree parity with agent-browser.
- CSS-scoped snapshots.
- Annotated screenshots.
- Compatibility with the old `click --tab ... --snapshot-id ... --ref ...` workflow.

## Product Semantics

The core loop is:

```bash
tabbridge snapshot -i
tabbridge click @e1
tabbridge snapshot -i
```

Refs belong to the latest snapshot for the current session tab. Every snapshot reassigns refs from `@e1` upward. A ref from an older snapshot is stale once a new snapshot is taken or the page changes.

`tabbridge snapshot -i` is the canonical snapshot command. In the first version, `tabbridge snapshot` aliases to the same interactive snapshot behavior. Full page snapshots are out of scope for the first version.

## Session Model

TabBridge maintains one default current-tab session.

If no explicit session exists, `tabbridge snapshot -i` binds the session to Chrome's current active tab. Follow-up commands use that tab automatically:

```bash
tabbridge snapshot -i
tabbridge click @e1
tabbridge fill @e2 "hello"
```

Explicit session commands are available for fixed-tab workflows:

```bash
tabbridge connect --current
tabbridge connect --tab 123
tabbridge session
tabbridge disconnect
```

The session binds to a tab, not a URL. If the tab navigates to a new page, the session still points at the tab, but latest refs are cleared or become stale and the agent must snapshot again.

## Snapshot Output

The first version implements interactive snapshots only. The output should be compact and close to agent-browser's `snapshot -i` style:

```text
Page: Example Site - Home
URL: https://example.com

@e1 [button] "Sign In"
@e2 [input type="email"] placeholder="Email"
@e3 [input type="password"] placeholder="Password"
@e4 [button type="submit"] "Log In"
```

The first version outputs a flat list of interactive elements. It does not reconstruct a complete accessibility hierarchy.

Interactive elements include buttons, links, inputs, textareas, selects, contenteditable elements, common ARIA interactive roles, dialogs, modal containers, and clickable elements. This matches the current TabBridge extractor's existing scope and keeps the first version focused.

## JSON Output

`--json` remains useful for programmatic callers, but its schema changes to the new agent-browser-oriented model. The old `PageSnapshot` shape is not a compatibility target.

Example:

```json
{
  "ok": true,
  "data": {
    "page": {
      "title": "Example Site - Home",
      "url": "https://example.com"
    },
    "refs": [
      {
        "ref": "@e1",
        "role": "button",
        "name": "Sign In",
        "text": "Sign In",
        "attributes": {
          "type": "submit"
        }
      }
    ],
    "text": "Page: Example Site - Home\nURL: https://example.com\n\n@e1 [button type=\"submit\"] \"Sign In\""
  }
}
```

Internal fields such as identity hashes, bounding boxes, risk metadata, and generated snapshot IDs may remain internal implementation details, but they should not be part of the default user-facing snapshot API.

## Ref Model

Refs are volatile `@eN` values.

Rules:

- Each snapshot assigns refs from `@e1` upward.
- Refs belong only to the latest snapshot for the current session tab.
- Actions resolve refs against the latest snapshot map.
- Old refs are stale after navigation, reload, back, forward, or a page-changing action.
- Stable refs are not exposed in the first version.

If an action is attempted before any snapshot exists, TabBridge returns a recoverable error that tells the agent to snapshot first.

Example:

```json
{
  "ok": false,
  "error": {
    "code": "SNAPSHOT_REQUIRED",
    "message": "Run tabbridge snapshot -i before using @refs.",
    "recoverable": true,
    "suggestedCommand": "tabbridge snapshot -i"
  }
}
```

If a ref is missing from the latest snapshot:

```json
{
  "ok": false,
  "error": {
    "code": "REF_STALE",
    "message": "Ref @e1 is not available in the latest snapshot. Run tabbridge snapshot -i again.",
    "recoverable": true,
    "suggestedCommand": "tabbridge snapshot -i"
  }
}
```

## Commands

First-version commands:

```bash
tabbridge snapshot -i
tabbridge snapshot

tabbridge click @e1
tabbridge fill @e2 "hello"
tabbridge type @e2 "hello"
tabbridge clear @e2
tabbridge select @e3 "value"
tabbridge check @e4
tabbridge uncheck @e4
tabbridge focus @e5

tabbridge text
tabbridge screenshot [path]

tabbridge reload
tabbridge back
tabbridge forward

tabbridge connect --current
tabbridge connect --tab 123
tabbridge session
tabbridge disconnect
```

`fill` replaces the target element's current value.

`type` appends text to the target element's current value.

`clear` clears the target element's current value.

The old raw form is not a vNext compatibility target:

```bash
tabbridge click --tab 123 --snapshot-id snap_abc --ref @e1
```

## Error Handling

Main errors:

- no active tab available for implicit session binding;
- snapshot required before using a ref;
- ref stale or not found in the latest snapshot;
- element not visible;
- element disabled;
- unsupported page;
- access denied or authorization required;
- session tab closed or unavailable.

Navigation commands clear latest refs. After `reload`, `back`, or `forward`, the agent must run `tabbridge snapshot -i` again.

If the tab's origin changes, TabBridge should continue to enforce its authorization policy. If access is no longer authorized, the command should return the existing authorization-required flow rather than silently inspecting or acting on the new origin.

## Implementation Notes

The first implementation can simplify `RefStore` around a per-tab latest snapshot map:

```text
tabId -> latest refs -> @eN -> ElementRefRecord
```

The action path resolves a ref from the current session tab's latest map and then acts on the corresponding live element. It does not need to expose or preserve stable refs across snapshots.

The extractor can keep the current interactable selector as the starting point. Snapshot formatting becomes a separate presentation layer that converts extracted records into agent-browser-style text and the new JSON refs array.

## Testing Strategy

Unit tests should cover:

- `snapshot` and `snapshot -i` both produce interactive snapshot behavior;
- refs are assigned as `@e1`, `@e2`, ... per snapshot;
- taking a new snapshot replaces the latest ref map;
- action commands resolve refs from latest snapshot without `snapshot_id`;
- action before snapshot returns `SNAPSHOT_REQUIRED`;
- stale or missing refs return `REF_STALE` with `tabbridge snapshot -i` suggestion;
- navigation clears latest refs;
- `fill`, `type`, and `clear` have distinct replacement/append/clear semantics;
- JSON output follows the new schema;
- iframe content is ignored in the first version.

Manual smoke tests should cover:

1. Connect implicitly to active tab with `tabbridge snapshot -i`.
2. Click a visible button by `@eN`.
3. Fill and clear an input by `@eN`.
4. Navigate/reload and confirm old refs fail until a new snapshot is taken.
5. Confirm the text output is compact enough for direct agent use.
