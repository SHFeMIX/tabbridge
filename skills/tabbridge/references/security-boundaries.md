# TabBridge Security Boundaries

TabBridge is designed to protect the user's real browser context from unapproved agent access.

Allowed after user authorization:

- Redacted tab discovery.
- Semantic interactive snapshots with volatile `@eN` refs.
- Bounded visible text reads.
- Bounded subtree HTML reads for refs.
- Ref-based page actions (`click`, `fill`, `type`, `clear`, `select`, `check`, `uncheck`, `focus`).
- Non-ref page actions (`press`, `scroll`).
- Coordinate actions only after explicit user confirmation through the extension popup.

Forbidden in the MVP:

- Cookie extraction.
- localStorage extraction.
- Credential or token extraction.
- Arbitrary JavaScript execution.
- Network interception.
- Unbounded DOM dumps.
- Secret values in CLI argv.
- Silent fallback from ref actions to coordinate actions.
- Silent execution of coordinate actions.

Coordinate actions (`click-coordinates`, `drag-coordinates`) require explicit user confirmation because they cannot be tied to a stable semantic ref. Ref-based actions resolve against the latest snapshot using stable element identity matching; however, the `@eN` labels exposed to the agent are volatile and should not be cached across snapshots.

Password, 2FA, payment, credential, and token-like fields require user involvement. The agent must not provide secret values directly.
