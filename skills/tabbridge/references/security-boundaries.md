# TabBridge Security Boundaries

TabBridge is designed to protect the user's real browser context from unapproved agent access.

Allowed after user authorization:

- Redacted tab discovery.
- Semantic snapshots.
- Bounded visible text reads.
- Bounded subtree HTML reads for refs.
- Ref-based low and medium risk page actions.
- High-risk actions only after explicit confirmation.

Forbidden in the MVP:

- Cookie extraction.
- localStorage extraction.
- Credential or token extraction.
- Arbitrary JavaScript execution.
- Network interception.
- Unbounded DOM dumps.
- Secret values in CLI argv.
- Silent fallback from ref actions to coordinate actions.
- Silent execution of high-risk actions.

Password, 2FA, payment, credential, and token-like fields require user involvement. The agent must not provide secret values directly.
