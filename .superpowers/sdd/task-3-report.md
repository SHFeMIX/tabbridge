# Task 3 Report: Broker WebSocket Server

## Summary

Implemented the Broker WebSocket server (`BrokerServer`) that accepts CLI and extension clients, authenticates them, and routes JSON-RPC requests/responses between them.

## Files Created

- `packages/broker/src/server.ts` — WebSocket server implementation
- `packages/broker/test/server.test.ts` — Test verifying CLI request rejection when no extension is connected

## Files Modified

- `packages/broker/src/index.ts` — Exported `BrokerServer`, `BrokerServerOptions`, `BrokerStatus`, `BrokerClient`

## Implementation Details

### `BrokerServer` class

- **Constructor**: Creates a `WebSocketServer` on the given port (or ephemeral port 0). Exposes the actual bound port via `readonly port`.
- **Authentication**:
  - CLI clients authenticate by sending `{ type: 'auth', token: <token> }` matching the configured token.
  - Extension clients authenticate by sending `{ role: 'extension' }` from an origin starting with `chrome-extension://`.
  - Unauthenticated connections are closed after a 5-second timeout.
- **Message Routing**:
  - CLI JSON-RPC requests are validated and forwarded to the extension client.
  - Extension responses are matched against pending CLI requests by `id` and forwarded back.
  - Extension `broker.hello` messages are stored in `status().extensionHello`.
  - When no extension is connected, CLI requests receive `EXTENSION_NOT_CONNECTED` error.
- **Cleanup**: `close()` terminates all client sockets and shuts down the `WebSocketServer`.

### Types Exported

- `BrokerClient` — socket + role + auth state
- `BrokerServerOptions` — port and token
- `BrokerStatus` — cliConnected, extensionConnected, extensionHello

## Test Results

- **Tests**: 9 passed (3 files)
- **TypeScript**: `tsc --noEmit` passes with zero errors

## Build Note

The `@tabbridge/shared` package needed to be rebuilt (`pnpm --filter @tabbridge/shared build`) before tests could run, because `createJsonRpcError` was not yet present in the built `dist/` output consumed by the broker package.

## TypeScript Strictness Notes

- Used `as const` for `STANDARD_ERRORS` instead of `Record<string, JsonRpcError>` to avoid `noUncheckedIndexedAccess` making lookups potentially `undefined`.
- Used `() => resolve()` wrapper for `wss.close()` because its callback signature `(err?: Error) => void` is incompatible with `Promise` resolve.

## Commit

- `914dd63` — feat(broker): add WebSocket server with auth and routing

## Status

DONE
