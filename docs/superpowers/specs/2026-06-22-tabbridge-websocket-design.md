# TabBridge WebSocket Broker 设计文档

日期：2026-06-22

> 本文档取代 `2026-06-21-tabbridge-mcp-design.md` 中关于 Native Messaging / native host 的通信部分。权限模型、授权 UI、snapshot/ref、风险分类等逻辑保持不变。

## 摘要

MVP 把 TabBridge 的本地通信方式从 **Chrome Native Messaging + Unix domain socket** 改为 **WebSocket + JSON-RPC 2.0**。核心变化：

- 删除 `tabbridge native-host`、`install-native-host`、`uninstall-native-host`。
- 新增 `tabbridge broker`（按需启动、持续运行的本地 WebSocket 服务端）。
- CLI 和 Chrome 扩展都作为 WebSocket client 连接到 broker。
- 通信协议统一为 JSON-RPC 2.0，业务错误映射到 JSON-RPC `error` 对象。
- 扩展 manifest 移除 `nativeMessaging` 权限。

## 目标

- 让 CLI 和浏览器扩展通过本地 WebSocket 通信。
- CLI 按需启动 broker，broker 保持运行供后续命令和扩展使用。
- 保留现有命令集、`tabbridge` CLI 输出格式（变为 JSON-RPC response）。
- 保留站点授权、高风险确认、snapshot/ref 等已有产品逻辑。

## 非目标

- 不实现 Windows/Linux 支持。
- 不实现远程 agent、云端 relay。
- 不实现 WebSocket 以外的通信通道。
- 不重新设计权限、snapshot、risk 等业务模型。
- 不追求过度完善的边界 case；MVP 以“能跑通主链路”优先。

## 架构

```text
Agent / Claude Code
  └─ runs: tabbridge <command> --json
        ├─ ensureBroker() 按需启动 broker
        └─ WebSocket client ────────┐
                                    ▼
                        tabbridge broker (WebSocket server)
                                    ▲
        Chrome extension (MV3) ─────┘
          WebSocket client
```

- **CLI**：短生命周期。需要 bridge 的命令先确保 broker 在运行，然后发送 JSON-RPC request，等待 response，输出后退出。
- **broker**：长生命周期 Node 进程。保证单例、监听动态端口、维护扩展和 CLI 的连接、按 JSON-RPC `id` 路由消息。
- **Chrome extension**：service worker 主动连接 broker；断线后自动重连；popup 显示连接状态。

## 组件

### `packages/broker`（取代 `packages/native-host`）

- `main.ts`：`tabbridge broker` 入口，负责文件锁、启动 WebSocket server、写入 `broker.json`、持有运行循环。
- `lock.ts`：通过 `flock` 保证同一用户只有一个 broker 实例。
- `runtime.ts`：生成/读写 `broker-token`，生成 session token，设置目录/文件权限。
- `server.ts`：WebSocket server，处理连接、认证、JSON-RPC 路由。
- `bridge.ts`：保留自原 native-host：请求关联、扩展 hello 状态机、per-tab action queue、超时处理。
- `jsonrpc.ts`：JSON-RPC request/response 解析、错误码映射。

### `packages/cli`

- `broker-client.ts`：WebSocket client，负责连接、认证、发送 JSON-RPC request、接收 response。
- `ensure-broker.ts`：检查 broker 是否在运行（通过 lock 文件 / pid / WebSocket 可连接性）；若未运行则 `spawn` detached `tabbridge broker`，等待就绪。
- `main.ts`：命令路由。bridge 命令和 `status`/`doctor` 都会先 `ensureBroker()`，再通过 broker-client 发送 JSON-RPC 请求或查询状态。
- `doctor.ts`：改为检查 broker 进程、端口文件、WebSocket 可连接性、token 文件权限。
- 删除 `ipc-client.ts`、`native-manifest.ts`、native-host wrapper 相关逻辑。

### `packages/shared`

- `protocol.ts`：新增 JSON-RPC 2.0 request/response 类型；保留 `BridgeHello` 能力握手，但通过 JSON-RPC `method:'broker.hello'` 发送。
- `errors.ts`：保留所有 `TabBridgeErrorCode`；新增到 JSON-RPC error code 的映射函数。
- 其他（`tabs.ts`、`approvals.ts`、`snapshot.ts`、`risk.ts`、`limits.ts`）基本不变。

### `packages/chrome-extension`

- `background/broker-client.ts`：取代 `native-port.ts`，负责读取 `broker.json`、WebSocket 连接、认证、hello、重连。
- `background/jsonrpc-router.ts`：把 JSON-RPC method 分发到原 command handlers。
- `entrypoints/background.ts`：启动 broker-client，监听连接状态。
- `wxt.config.ts`：manifest 移除 `nativeMessaging`；保留 `tabs`、`scripting`、`storage`、`activeTab` 和 optional host permissions。

### `skills/tabbridge`

- 更新错误恢复说明：从“安装 native host”改为“运行任意 tabbridge 命令启动 broker”。
- 更新输出解析说明：CLI 现在输出 JSON-RPC response，错误在 `error.data.code`。

## 运行时文件

```text
~/Library/Application Support/tabbridge/
  broker-token       # CLI 认证 token
  broker.lock        # flock 文件锁
```

- 目录权限 `0700`。
- `broker-token`、`broker.lock` 权限 `0600`。
- broker 启动时生成随机 token；每次启动都轮换，写入 `broker-token`。
- **端口固定为 `9876`**，扩展无法读取本地文件，因此不使用动态端口文件。

## 连接与认证

1. 扩展和 CLI 都连接到固定地址 `ws://127.0.0.1:9876`。
2. 连接建立后，客户端必须在 5 秒内发送首条消息。
   - CLI 发送：
     ```json
     { "type": "auth", "token": "<broker-token>" }
     ```
   - 扩展发送：
     ```json
     { "type": "auth", "role": "extension" }
     ```
     broker 通过 WebSocket handshake 的 `Origin` 头确认来源为 `chrome-extension://` 后允许连接。
3. broker 校验失败则断开连接。
4. 扩展在 auth 后发送 JSON-RPC `broker.hello`：
   ```json
   { "jsonrpc": "2.0", "id": "h1", "method": "broker.hello", "params": { "protocolVersion": 1, "version": "0.1.0", "extensionId": "...", "capabilities": {...} } }
   ```
5. CLI 不需要发送 hello，直接发送业务请求。

> MVP 取舍：扩展不强制校验 secret token，因为 MV3 扩展无法读取本地文件获取动态 token。后续若要增强，可把 token 编译进扩展或提供配置入口。

## JSON-RPC 协议

### Request

```json
{
  "jsonrpc": "2.0",
  "id": "req_1",
  "method": "tabs.list",
  "params": {}
}
```

method 命名沿用原 command 名，例如 `tabs.list`、`tabs.requestAccess`、`snapshot`、`action.click`。

### Success Response

```json
{
  "jsonrpc": "2.0",
  "id": "req_1",
  "result": { "tabs": [...] }
}
```

### Error Response

```json
{
  "jsonrpc": "2.0",
  "id": "req_1",
  "error": {
    "code": -32001,
    "message": "TAB_NOT_AUTHORIZED",
    "data": {
      "code": "TAB_NOT_AUTHORIZED",
      "message": "Request access before reading this tab.",
      "recoverable": true,
      "suggestedCommand": "tabbridge tabs request-access --tab 123 --reason <reason> --json"
    }
  }
}
```

### 错误码映射

- `-32700` ~ `-32603`：JSON-RPC 标准错误。
- `-32000`：broker 通用内部错误。
- `-32001` ~ `-32xxx`：每个 `TabBridgeErrorCode` 按顺序映射，具体映射表在 `packages/shared/src/errors.ts` 中维护。

## CLI 命令变化

保留：

```bash
tabbridge status [--json]
tabbridge doctor
tabbridge tabs list --json
tabbridge tabs request-access --tab <id> --reason <reason> --json
tabbridge snapshot --tab <id> --json
...
```

新增：

```bash
tabbridge broker   # 前台启动 broker，用于调试
```

删除：

```bash
tabbridge native-host
tabbridge install-native-host
tabbridge uninstall-native-host
```

## 错误恢复

| 状态 | 原因 | CLI 行为 | 恢复建议 |
|---|---|---|---|
| broker 未运行 | CLI 尚未启动 broker | 自动启动；若失败返回 `BROKER_START_FAILED` | 检查端口占用/权限 |
| 扩展未连接 | Chrome 关闭或 service worker 未唤醒 | 返回 `EXTENSION_NOT_CONNECTED` | 打开 Chrome / 扩展 popup |
| 请求超时 | 扩展未响应 | 返回 `BRIDGE_REQUEST_TIMEOUT` | `tabbridge status --json` |
| token 失效 | broker.json 过期/被篡改 | 断开，CLI 重启 broker | 删除 broker.json 后重试 |

## 边界与 MVP 取舍

- 同一用户同时只能有一个 broker；靠文件锁实现，不考虑多用户冲突（目录已按用户隔离）。
- broker 启动后持续运行，不实现自动退出（后续可补充 idle timeout）。
- 扩展断线后固定退避重试（如 1s / 2s / 4s / 最大 10s），不实现复杂网络恢复。
- CLI 启动 broker 时最多等待 5 秒；超时即报错。
- WebSocket 消息大小限制沿用原 spec：snapshot 256 KiB、text 128 KiB、html 64 KiB；超过返回 `MESSAGE_TOO_LARGE`。

## 测试

- **单元**：JSON-RPC 解析、错误码映射、broker 文件锁单例、auth 校验、请求路由。
- **集成**：CLI 自动拉起 broker → mock 扩展 client → 收发 JSON-RPC → 返回结果。
- **扩展**：broker-client 连接/认证/重连、command routing、popup 状态。
- **手动**：按 smoke 列表跑通 `tabs list`、`request-access`、`snapshot`、`click`、`doctor`。

## 未来可扩展

- 增加 broker idle timeout，长时间无 client 自动退出。
- CLI 和扩展支持连接多个 broker profile。
- 在 JSON-RPC 上增加 batch request。
- 可选 MCP adapter 直接复用同一 JSON-RPC method 集。
