# TabBridge CLI + Skill MVP 设计文档

日期：2026-06-21

> ⚠️ **通信架构已变更**：本 spec 中关于 CLI ↔ 扩展的传输层（Chrome Native Messaging、Unix domain socket、`tabbridge native-host`、`packages/native-host`）已在 2026-06-22 被 **WebSocket broker** 方案取代。当前实现见 [`2026-06-22-tabbridge-websocket-design.md`](./2026-06-22-tabbridge-websocket-design.md)。
>
> 本文档保留的产品层设计（权限模型、授权 UI、snapshot/ref、风险分类、隐私策略等）仍然有效，但任何涉及 Native Messaging / native host / IPC socket 的段落都已过时，请以 WebSocket 设计文档和当前代码为准。

## 摘要

TabBridge 是一个本地优先的 agent-facing CLI + Chrome 扩展，用来让本地 agent 检查并控制用户已授权、已经打开的 Chrome 标签页。它默认不启动独立浏览器、不创建新浏览器 profile，也不新开标签页；它连接的是用户当前真实浏览器里的页面，因此能复用用户已有登录态、Cookie、页面状态和正在使用的浏览器上下文。

MVP 只支持 macOS + Chrome/Chromium。CLI、本地 broker 和共享协议使用 TypeScript；Chrome 扩展使用 **WXT + Vue + Vite + TailwindCSS** 开发。MVP 依赖本地 WebSocket broker 维持 CLI 与 MV3 service worker 之间的连接，最低支持版本应设为 Chrome 105+；如果实现依赖更新的 MV3 行为，`doctor` 必须提示实际最低版本。

项目名统一为 **TabBridge**：

- CLI：`tabbridge`
- Chrome 扩展名：`TabBridge`
- 本地 broker：`tabbridge broker`
- 官方 skill：`tabbridge`
- 未来可选 MCP server 显示名：`tabbridge`

## 仓库状态与实现范围

当前仓库主要包含文档，尚未包含 `packages/*` 或 `skills/tabbridge` 的实现目录。因此本 spec 是 **greenfield MVP scaffold + implementation** 的设计，而不是对既有 monorepo 的增量修改。

MVP 实现计划必须先创建这些新目录和基础工程结构：

- workspace/package manager 配置。
- `packages/cli`：agent-facing `tabbridge` CLI。
- `packages/broker`：本地 WebSocket broker，按需启动并维持 CLI 与扩展之间的连接。
- `packages/chrome-extension`：WXT + Vue + Vite + TailwindCSS MV3 扩展。
- `packages/shared`：协议类型、schema、错误码、风险分类与测试 fixtures。
- `skills/tabbridge`：Claude Code skill。
- `THIRD_PARTY_NOTICES.md`：当复用或改编第三方代码时记录 license notice。

本文件名仍保留 `tabbridge-mcp-design` 是历史命名；MVP 设计以 CLI + skill 为主，MCP 只作为未来可选 adapter。若后续整理文档，可重命名为 `2026-06-21-tabbridge-cli-skill-mvp-design.md`。

## 目标

- 让本地 agent 通过 CLI 控制用户已经打开的 Chrome 标签页。
- 提供官方 Claude Code skill，指导 agent 安全、可靠地使用 CLI。
- 让 agent 能发现候选 tab，但默认不暴露完整 URL。
- 通过明确的 tab/site 授权和高风险操作确认，保护用户隐私与控制权。
- 提供接近现有浏览器控制工具使用习惯的命令命名和交互方式。
- 默认用语义化页面快照和稳定元素引用作为页面状态表示。
- 在许可证和运行环境允许时，优先复用或适配 Vercel `vercel-labs/agent-browser` 的命令习惯、snapshot/ref 输出格式和可迁移源码。
- 在 macOS 上提供可安装、可诊断的 MVP，不引入永久常驻 daemon。

## MVP 非目标

- 不实现 MCP server。
- 不支持 Windows、Linux、Firefox、Safari。
- 不提供云端 relay 或远程 agent 控制。
- 不把启动新浏览器、新 browser context、新 tab 作为主要工作流。
- 不追求完整 Playwright API 兼容。
- 不实现永久常驻后台 daemon。
- 不默认支持 CDP/debugger enhanced mode。
- 不提供任意 JavaScript 执行。
- 不提供网络拦截。
- 不提供 Cookie、localStorage、凭据、token 提取工具。
- 不提供无边界的完整页面 DOM dump。
- 不提供独立于网页正常 UI 之外的专用文件上传/下载自动化工具。

## 推荐方案

MVP 采用 **CLI + 官方 skill + 按站点授权的 Chrome 扩展受限浏览器控制**：

1. Agent 读取官方 TabBridge skill，按推荐流程调用 `tabbridge` CLI。
2. Agent 调用 `tabbridge tabs list --json`，只看到 tab 的 `title + domain`，默认看不到完整 URL。
3. Agent 根据用户意图选择目标 tab。
4. Agent 调用 `tabbridge tabs request-access --tab <tabId> --reason <reason> --json` 请求访问。
5. Chrome 扩展向用户展示授权 UI，请用户在扩展 UI 中授权该站点。
6. 用户授权后，agent 才能对该 tab/site 调用页面快照和页面操作命令。
7. 高风险动作即使在已授权站点内，也仍然需要单独确认。

这个方案在用户体验、安全边界和实现复杂度之间取得平衡：agent 可以选择已打开的 tab，但不能悄悄读取或操作用户真实登录页面；MVP 也不需要承担 MCP server 生命周期和 stdio JSON-RPC 的复杂度。

## 备选方案

### 方案 A：只用 `activeTab`

只使用 Chrome 的 `activeTab` 权限。用户必须切到目标 tab 并点击扩展授权后，agent 才能检查或控制该页面。

优点：

- 浏览器权限最小。
- 实现最简单。
- 隐私边界最强。

缺点：

- 不支持 agent 在多个已打开 tab 中自行选择目标。
- 很难自然控制后台 tab。
- 用户交互频繁。

结论：不作为 MVP，因为它没有充分实现 TabBridge 的核心产品目标。

### 方案 B：安装时请求 `<all_urls>` + CDP/debugger

安装扩展时请求广泛 host 权限，并可选使用 `chrome.debugger` 走 CDP，获得更接近完整浏览器自动化的能力。

优点：

- 浏览器能力最强。
- 最接近完整 browser automation。
- 可以获得 Chrome 原生 accessibility tree 和 DOMSnapshot。

缺点：

- 安装权限提示非常重。
- `debugger` 权限敏感，可能与 DevTools 冲突。
- 与用户真实登录态叠加后，风险面过大。
- 对 MVP 来说复杂度过高。

结论：不作为默认 MVP。后续可以作为明确标注的增强模式。

### 方案 C：CLI + skill + 按站点授权

默认只列出有限 tab 元数据；按需请求站点访问权限；通过 CLI 提供熟悉的 browser-control 命令；通过官方 skill 指导 agent 安全使用。

优点：

- 符合“控制用户已打开网页”的目标。
- 权限边界容易解释。
- 允许 agent 选择目标 tab，同时保留用户同意。
- 比 MCP-first 方案少一层协议和生命周期复杂度。
- CLI 对人类调试和其它 agent 环境都友好。
- 官方 skill 可以表达 ref 生命周期、授权流程、高风险确认、失败恢复等操作策略。

缺点：

- 不是通用 MCP client 即插即用。
- CLI 是短生命周期调用，需要底层 broker 维护连接和状态。
- 仍然需要本地 WebSocket broker 和 Chrome extension 授权流程。

结论：MVP 采用此方案。

### 方案 D：MCP server-first

提供 `tabbridge mcp-server`，由 MCP client 启动 server，再通过本地 WebSocket broker 与扩展通信。

优点：

- 对通用 MCP client 更标准。
- 工具 schema 可被 MCP client 自动发现。
- 长生命周期 server 更适合持有连接状态。

缺点：

- 增加 MCP stdio JSON-RPC、tool schema、server lifecycle、错误映射和 stdout/stderr 严格隔离复杂度。
- 仍然不能省掉本地 WebSocket broker 和 Chrome extension 授权流程。
- 对 Claude Code MVP 来说不如 CLI + skill 直接。

结论：不进入 MVP。后续可以作为 thin adapter 复用 CLI/core command handlers。

## 架构

MVP 使用一个 TypeScript/Node CLI 包提供用户命令和安装诊断命令；`tabbridge broker` 作为本地 WebSocket 服务端，按需启动并维持 CLI 与 Chrome 扩展之间的连接。

```bash
tabbridge status
tabbridge doctor
tabbridge broker       # 通常由 CLI 按需启动，不直接手动运行
```

运行结构：

```text
Agent / Claude Code
  └─ reads official TabBridge skill
       └─ runs: tabbridge <command> --json
             ├─ ensureBroker() 按需启动 broker
             └─ WebSocket client ────────┐
                                        ▼
                            tabbridge broker (WebSocket server)
                                        ▲
                Chrome extension (MV3) ─┘
                  WebSocket client
```

### 连接生命周期

MVP 不引入永久常驻 daemon，但允许 `tabbridge broker` 在首次需要时由 CLI 启动并持续运行：

- CLI 在需要连接扩展的命令前调用 `ensureBroker()`，检查 `ws://127.0.0.1:9876` 是否可连接。
- 若 broker 未运行，CLI 以 detached 方式 `spawn` `tabbridge broker`，等待其写入 lock/token 文件并开始监听端口。
- Chrome extension service worker 启动后主动连接 broker；断线后按 backoff 重连。
- CLI 和扩展都作为 WebSocket client 连接到 broker，业务消息使用 JSON-RPC 2.0。
- 如果 MV3 service worker 尚未唤醒，CLI 错误必须给出精确恢复指令，例如“打开 Chrome 并点击 TabBridge 扩展图标以启动 broker”。
- `tabbridge` CLI 命令作为短生命周期 client 发送一个 JSON-RPC request，等待 response，然后退出。
- 如果扩展未连接，CLI 返回 `EXTENSION_NOT_CONNECTED`，并建议用户打开 Chrome/启用扩展/运行 `tabbridge doctor`。
- broker 退出后，extension 后续唤醒时可以重新连接 broker。
- 每个用户默认只允许一个 active broker 监听固定端口 `9876`。
- 对同一 tab 的动作按队列串行执行，避免同时点击/输入导致页面状态不可预测。

MVP 不要求 broker 在 Chrome 完全关闭后继续存活。

### Bridge 状态机与 CLI 恢复

CLI 必须把 bridge 状态区分清楚，不能只返回模糊的“未连接”：

| 状态 | 典型原因 | CLI 行为 | 恢复建议 |
| --- | --- | --- | --- |
| `chrome_closed` | Chrome 未运行 | `EXTENSION_NOT_CONNECTED` | 打开 Chrome，确认 TabBridge 扩展已启用 |
| `extension_asleep` | MV3 service worker 未唤醒，扩展未连接 broker | `EXTENSION_NOT_CONNECTED` | 点击 TabBridge 扩展图标或打开扩展 popup 启动 broker 连接 |
| `broker_not_running` | broker 未启动或端口不可连 | `EXTENSION_NOT_CONNECTED` | 运行任意 `tabbridge` 命令（如 `tabbridge status --json`）启动 broker |
| `connected` | extension、broker、CLI 都可用 | 正常执行命令 | 无 |

`tabbridge status --json` 和 `tabbridge doctor` 可以在 bridge 未连接时运行，但不得假装可以唤醒 extension。`tabs list`、`tabs current`、`tabs request-access`、`snapshot` 和 action 命令都依赖 `connected` 状态；未连接时必须返回结构化错误和具体恢复指令。

### 组件

#### `packages/cli`

职责：

- 提供 `tabbridge` 用户命令。
- 解析 CLI 参数。
- 将命令转换为内部 command request。
- 通过 WebSocket 连接到本地 broker 发送 JSON-RPC 请求。
- 输出 human-readable 或 `--json` 格式结果。
- 在 `--json` 模式下 stdout 只输出机器可解析 JSON。
- 日志和诊断输出在非 JSON 模式下写 stderr 或明确的人类输出。

#### `packages/broker`

职责：

- 作为本地 WebSocket server 监听固定端口 `9876`。
- 通过 `flock` 保证同一用户只有一个 broker 实例。
- 管理 CLI 和扩展的 WebSocket 连接、认证和 JSON-RPC 路由。
- 维护 extension 连接状态、request correlation、timeout 和基础 action queue。
- 不直接实现页面 snapshot/action 业务逻辑。
- 日志写 stderr 或日志文件。

#### `packages/chrome-extension`

职责：

- 使用 WXT + Vue + Vite 提供 MV3 Chrome 扩展。
- 通过 WXT entrypoints 管理 background/service worker、content scripts、popup/options 等入口。
- 用 Vue 实现站点授权、高风险操作确认、状态诊断等扩展 UI。
- 通过 WebSocket 连接到本地 broker。
- 通过 Chrome extension API 枚举 tabs。
- 按需请求 host permissions。
- 管理 TabBridge internal grants。
- 展示站点授权和高风险操作确认 UI。
- 通过 content script 或 `chrome.scripting.executeScript` 生成页面快照并执行页面动作。
- 在权限和平台限制允许时截取 viewport screenshot。

#### `packages/shared`

职责：

- 定义共享协议类型。
- 定义 CLI 输入/输出 schema。
- 定义错误码。
- 定义风险分类类型。
- 定义 snapshot 与 ref 数据结构。
- 定义未来 adapter 复用的 command handler 类型。

#### `skills/tabbridge`

职责：

- 提供 Claude Code 官方 skill。
- 定义何时使用 TabBridge。
- 指导 agent 按标准 CLI 流程发现 tab、请求授权、snapshot、使用 ref 操作页面。
- 解释安全边界和禁止行为。
- 定义错误恢复策略。
- 要求 agent 默认使用 `--json` 并解析稳定 envelope。

### Chrome extension manifest

MVP extension manifest 应明确声明必要权限，避免隐式假设：

```json
{
  "permissions": [
    "tabs",
    "scripting",
    "storage",
    "activeTab"
  ],
  "optional_host_permissions": [
    "http://*/*",
    "https://*/*"
  ]
}
```

说明：

- `tabs` 用于枚举 tab 并让扩展内部读取 URL/title/favicon 等 tab metadata。
- Agent 默认只能看到 redacted tab metadata，不能看到完整 URL；这是 TabBridge 输出策略，不等同于扩展内部不可见。
- `scripting` 用于在已授权页面注入或执行受控 content script。
- `storage` 用于保存授权状态、pending approval、用户策略和诊断状态。
- `activeTab` 用于支持用户手势触发后的 active tab 截图/临时访问能力；它不是主要授权模型，不能替代 TabBridge internal grant。
- `nativeMessaging` 不再使用；CLI 与扩展通过本地 WebSocket broker 通信。
- `debugger`、`cookies`、`downloads`、`clipboardRead`、`clipboardWrite` 默认不声明。
- `file://` 页面默认不支持，除非后续版本提供明确 opt-in。

### CLI 命令

#### 系统与安装

```bash
tabbridge status [--json]
tabbridge doctor
```

`tabbridge broker` 由 CLI 按需启动，不作为用户常规命令直接运行。

`doctor` 检查 broker 是否监听、token/lock 文件是否存在及权限是否正确、协议版本、CLI version 和 Node version，以及最近一次 bridge 错误摘要。

#### Tab 发现与授权

```bash
tabbridge tabs list --json
tabbridge tabs current --json
tabbridge tabs request-access --tab <tabId> --reason <reason> --json
tabbridge tabs release --tab <tabId> --json
tabbridge approvals status --id <approvalId> --json
tabbridge approvals wait --id <approvalId> [--timeout <ms>] --json
tabbridge approvals cancel --id <approvalId> --json
```

`tabs list` 默认返回：

- `tabId`
- `windowId`
- `title`
- `domain`
- `active`
- `accessStatus`

默认不返回完整 URL，也不返回 `favIconUrl`。Title 本身可能包含敏感信息，后续可提供 privacy mode，只返回 domain 和 redacted title。若未来需要图标，只能返回 `hasFavicon`、sanitized origin 或 extension-local opaque icon id，不能把页面控制的 favicon URL 暴露给 agent。

`tabs current` 返回 Chrome 当前 focused window 的 active tab，输出字段与 `tabs list` 单项一致。如果 Chrome 没有 focused normal window，返回 `TAB_NOT_FOUND`。如果存在多个 Chrome/Chromium profile，MVP 只支持连接本地 broker 的 extension 所对应的 profile；不能跨 profile 枚举或猜测 active tab。`tabs current` 不授予读取页面内容的权限，只是 discovery 命令。

授权后完整 URL 只通过页面读取命令返回，不通过 discovery 命令返回。`snapshot` 默认仍使用 `urlVisible: false` 且只返回 `domain`；如果 agent 确实需要完整 URL，必须显式调用 `tabbridge snapshot --include-url --json`，并且只在 Level 2 授权通过后返回 `url` 和 `urlVisible: true`。MVP 不新增 `tabs detail` 命令。

#### 页面状态

```bash
tabbridge snapshot --tab <tabId> [--include-url] --json
tabbridge text --tab <tabId> [--max-bytes <bytes>] --json
tabbridge html --tab <tabId> --snapshot-id <snapshotId> --ref <ref> [--max-bytes <bytes>] --json
tabbridge screenshot --tab <tabId> --json
```

`snapshot` 是默认页面理解命令，返回 semantic interactables snapshot，而不是完整 DOM dump。默认不包含完整 URL；只有传 `--include-url` 且 Level 2 授权通过时，才返回 `url` 和 `urlVisible: true`。

`text` 返回有大小限制的可见文本。

`html` 返回指定 snapshot/ref 的有限 subtree HTML。

`screenshot` 截取可见 viewport，并被视为隐私敏感操作。MVP 中 screenshot 只保证支持当前窗口 active tab；对后台 tab 应返回 `TAB_NOT_ACTIVE_FOR_SCREENSHOT`。如果未来支持激活后台 tab 再截图，必须先经过高风险确认，因为这会改变用户当前浏览焦点。截图实现必须用已声明权限验证，不能隐式依赖未声明的 debugger/CDP 能力。Chrome `tabs.captureVisibleTab()` 只能捕获指定窗口中当前 active tab 的可见区域，并有调用频率限制；MVP 应按最多约 2 次/秒节流。

#### 元素动作

```bash
tabbridge click --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge type --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --text <text> --json
tabbridge type --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --text-stdin --json
tabbridge clear --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge select --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --value <value> --json
tabbridge check --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge uncheck --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
tabbridge focus --tab <tabId> --snapshot-id <snapshotId> --ref <ref> --json
```

元素动作默认使用 `tabId + snapshotId + ref`。执行前扩展按 `(tabId, snapshotId, frameRef, ref)` 查找 ref record，并重新解析、校验 ref。缺少 `snapshotId`、snapshot 已失效、或 ref 不属于该 snapshot 时，必须返回 `REF_STALE`。短 ref 如 `@e1` 可以在不同 snapshot 中复用，但绝不能在没有 snapshotId 的情况下执行动作。

`type --text <text>` 只适合非敏感文本。官方 skill 必须优先使用 `--text-stdin`，并禁止把 password、2FA、payment、credential、token-like 值放入命令行参数。对 password、2FA、payment、credential、token-like 字段，MVP 的强制行为是：agent 不提供 secret，TabBridge 返回 `ACTION_REQUIRES_CONFIRMATION` 或专用安全输入请求，要求用户直接在页面或扩展安全 prompt 中输入；CLI envelope 只能记录字段类型、长度和 redacted marker，不能携带明文 secret。

#### 键盘、指针和滚动

```bash
tabbridge press --tab <tabId> --key <key> --json
tabbridge scroll --tab <tabId> [--dx <px>] [--dy <px>] --json
tabbridge click-coordinates --tab <tabId> --x <px> --y <px> --json
tabbridge drag-coordinates --tab <tabId> --from-x <px> --from-y <px> --to-x <px> --to-y <px> --json
```

坐标动作是 fallback 操作，默认风险高于 ref-based action。MVP 不使用 CDP/debugger，因此坐标点击、拖拽和键盘事件只能通过 content script 派发 synthetic DOM events，不能保证等价于真实用户输入或 Playwright/CDP 输入。失败时应返回 `ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE` 或更具体错误，不得静默伪装成功。

#### 导航与等待

```bash
tabbridge wait --tab <tabId> --ms <ms> --json
tabbridge wait-for-text --tab <tabId> --text <text> [--timeout <ms>] --json
tabbridge reload --tab <tabId> --json
tabbridge back --tab <tabId> --json
tabbridge forward --tab <tabId> --json
```

MVP 必须实现 `wait`、`wait-for-text`、`reload`、`back` 和 `forward`。这些命令都会清除旧 refs；执行后 agent 必须重新 snapshot。

`navigate` 不进入 MVP 命令集。后续如果加入：

```bash
tabbridge navigate --tab <tabId> --url <url> --json
```

`navigate` 会改变用户当前 tab 页面，默认是高风险动作。跨 origin navigation 必须单独确认，并会清除旧 refs 和旧 origin grant。命令不得半实现、不得静默执行；未发布前调用应返回 `ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE`。

## CLI 输出 envelope

所有 agent-facing 命令必须支持 `--json`，并返回稳定 envelope。

成功：

```json
{
  "ok": true,
  "data": {
    "tabId": 123,
    "snapshotId": "snap_abc"
  }
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "TAB_NOT_AUTHORIZED",
    "message": "Request access before reading this tab.",
    "recoverable": true,
    "suggestedCommand": "tabbridge tabs request-access --tab 123 --reason <reason> --json"
  }
}
```

约束：

- `--json` 模式下 stdout 只能包含单个 JSON envelope。
- 人类日志、debug 信息、progress 信息必须写 stderr。
- 错误时 exit code 非 0，但 stdout 仍应输出 error envelope，方便 agent 解析。
- 非 JSON 模式可以输出 human-readable 文本。

## 官方 skill 行为规范

官方 TabBridge skill 应要求 agent：

1. 默认用 `tabbridge status --json` 检查 bridge 状态。
2. 如果 bridge 未连接，按错误中的恢复指令要求用户打开 Chrome 并点击 TabBridge 扩展图标启动 bridge。
3. 用 `tabbridge tabs list --json` 发现候选 tab。
4. 在读取页面内容前调用 `tabbridge tabs request-access`。
5. 等待用户在扩展 UI 中完成授权。
6. 优先调用 `tabbridge snapshot` 理解页面，并保存返回的 `snapshotId`。
7. 优先使用 `snapshotId + ref`，不优先使用坐标。
8. 每次有意义的页面动作后重新 snapshot。
9. 遇到 `REF_STALE` 时重新 snapshot。
10. 遇到高风险动作确认时，向用户解释 pending action，而不是绕过确认。
11. 对普通文本输入优先使用 `--text-stdin`；不得把 secret 放进 CLI argv。
12. 不请求 Cookie、localStorage、token、凭据、任意 JS 执行或网络拦截。
13. 不把大段 HTML、截图内容或 secret 打印到对话里，除非用户明确需要且内容不敏感。

## 协议边界

系统里有两种协议，不能混用。

### CLI JSON envelope

只用于 agent/human 调用 `tabbridge` 命令。

- CLI 输入来自 argv/stdin。
- `--json` 模式 stdout 只属于 JSON envelope。
- stderr 可用于日志和诊断。
- CLI 每次调用默认是短生命周期 request/response。

### WebSocket / JSON-RPC 2.0

用于 CLI、broker 和 Chrome extension 之间的通信。

- broker 是本地 WebSocket server，监听 `ws://127.0.0.1:9876`。
- CLI 和扩展作为 WebSocket client 连接 broker。
- 连接建立后发送认证消息；扩展随后发送 JSON-RPC `broker.hello` 进行能力握手。
- 业务请求统一使用 JSON-RPC 2.0 request/response，错误映射到 JSON-RPC `error` 对象。
- broker 负责按 `id` 在 CLI 和扩展之间路由消息。

## 内部 Bridge 消息

内部消息使用统一 envelope（已通过 JSON-RPC 2.0 在 WebSocket 上传输）：

```ts
type BridgeRequest = {
  id: string
  protocolVersion: 1
  source: 'cli' | 'extension'
  target: 'cli' | 'extension'
  command: string
  payload: unknown
  createdAt: number
}

type BridgeResponse = {
  id: string
  protocolVersion: 1
  ok: boolean
  payload?: unknown
  error?: {
    code: string
    message: string
    recoverable: boolean
    suggestedCommand?: string
    approvalId?: string
    pollCommand?: string
    expiresAt?: number
  }
}
```

每次 CLI command 生成一个 request id，并在 broker 和扩展返回路径中保持不变。

## 版本握手

扩展连接到 broker 后，发送 JSON-RPC `broker.hello`：

```json
{
  "jsonrpc": "2.0",
  "id": "h1",
  "method": "broker.hello",
  "params": {
    "protocolVersion": 1,
    "version": "0.1.0",
    "extensionId": "...",
    "capabilities": {
      "commands": ["snapshot", "click"],
      "snapshot": ["semantic", "text", "html", "screenshot"],
      "permissions": ["tabs", "host-permission"]
    }
  }
}
```

各方校验：

- 协议版本是否兼容。
- extension、broker、CLI 版本是否兼容。
- 是否支持所需 capability。
- bridge 是否已连接。

不兼容时返回 `PROTOCOL_VERSION_MISMATCH` 或更具体的错误。

## 未来 MCP adapter

MVP 不实现 MCP server，但 core command handler 和 JSON schema 应保持 adapter-friendly。后续如果需要支持 MCP，可以新增：

```bash
tabbridge mcp-server
```

实现方式：

```text
MCP tool call -> internal command handler -> JSON-RPC via broker -> extension command handler -> MCP tool result
```

未来 MCP adapter 不应重新实现 snapshot、权限、风险分类或页面动作逻辑，只应作为 thin adapter 复用 CLI/core command handlers。

## 权限模型

### 权限状态机

TabBridge 必须同时跟踪浏览器层权限和产品层授权：

| 状态 | Chrome host permission | `activeTab` 临时权限 | TabBridge internal grant | 可执行能力 |
| --- | --- | --- | --- | --- |
| `none` | no | no | no | 只允许 status 和 redacted tab discovery |
| `active-tab-temporary` | no | yes，且只对当前 active tab 有效 | no | 只允许用户手势触发后的临时诊断或启动 bridge，不等同于 agent 授权 |
| `host-only` | yes | no/irrelevant | no | 扩展具备浏览器能力，但 agent 仍不能读取或操作页面；返回 `TAB_NOT_AUTHORIZED` |
| `grant-only` | no | no | yes | 产品授权存在但浏览器权限缺失；返回 `HOST_PERMISSION_DENIED` 并要求重新授权 |
| `authorized` | yes | optional | yes，且 `(tabId, origin)` 匹配 | 允许 Level 2/3 能力，并受高风险确认策略约束 |
| `expired-or-cross-origin` | maybe | maybe | no/invalid | 清除 refs，返回 `TAB_NOT_AUTHORIZED` 或 `REF_STALE` |

`activeTab` 只作为用户点击扩展后的临时能力，用于启动/诊断和当前 active tab 场景；它不是后台 tab 的授权模型，也不能替代 TabBridge internal grant。`chrome.scripting.executeScript()` 需要同时具备 `scripting` permission 和 host access 或有效 `activeTab`。

### Level 0：Bridge 状态

`tabbridge status` 不暴露网页内容，默认允许。

### Level 1：Tab 发现

Agent 可以看到有限 tab metadata：

- title
- domain
- active/window state

默认不能看到完整 URL 或页面内容。Title 可能包含敏感信息，因此后续可支持 privacy mode。

### Level 2：页面读取权限

需要用户授权并授予目标站点 host permission，同时写入 TabBridge internal grant。

包括：

- 完整 URL（仅当命令显式请求，例如 `snapshot --include-url`）。
- semantic snapshot。
- 可见文本。
- 元素 HTML。
- screenshot。

### Level 3：低/中风险动作

在已授权站点内允许，受可配置确认策略约束。

例子：

- focus。
- 点击普通 UI。
- 输入普通文本字段。
- scroll。
- 按非破坏性按键。

### Level 4：高风险动作

必须明确确认。

例子：

- 表单提交。
- 点击带危险含义的按钮或链接，例如 delete、pay、purchase、send、confirm、transfer、publish、merge。
- 导航当前 tab。
- 坐标点击或拖拽。
- password、2FA、payment、credential 字段交互。
- 用户策略中配置的敏感域名。

### Level 5：危险能力

MVP 不暴露。

例子：

- 任意 JS 执行。
- cookie 或 localStorage 提取。
- 网络拦截。
- 凭据提取。

## 授权模型

Chrome host permission 是浏览器层能力，TabBridge internal grant 是产品层授权，二者不能混淆。

```ts
type SiteGrant = {
  tabId: number
  origin: string
  grantedByUserAt: number
  expiresAt: number
  source: 'user-click'
}
```

规则：

- MVP 以 origin 作为授权单位，例如 `https://github.com`。
- `tabs request-access` 为目标 tab 的 main frame origin 创建 pending request。
- 产品层授权单位是 `origin`，例如 `https://github.com`；Chrome 权限请求使用 match pattern，例如 `https://github.com/*`。
- MVP grant scope 是 `tab-origin`：grant 只适用于 `(tabId, mainFrameOrigin)`，同 origin 的其它 tab 仍需单独授权，除非未来用户明确选择 site-wide grant。
- MVP 默认 grant lifetime 是 30 分钟；`expiresAt` 必须存在。用户可以通过 `tabs release` 提前释放。grant 可以存入 `chrome.storage.session`，默认不要求跨浏览器重启保留；如果实现选择 `chrome.storage.local`，也必须在过期后失效且 `doctor`/UI 可解释剩余时间。
- 同 tab 内 same-origin navigation 可以保留 grant；cross-origin navigation 必须使旧 grant 失效。
- 用户必须在扩展 UI 中点击 Allow，扩展才调用 `chrome.permissions.request({ origins: [hostPermissionPattern] })`。
- `tabs release` 释放 TabBridge internal grant；后续可在没有其它 grant 使用该 origin 时调用 `chrome.permissions.remove()`。
- 授权请求必须有 timeout，不能让 CLI 无限等待。

## 用户授权与确认 UI

### Approval lifecycle

站点访问授权和高风险动作确认共享同一个 approval state machine。CLI 命令默认不无限阻塞；当需要用户操作时，返回 `USER_APPROVAL_REQUIRED` 或 `ACTION_REQUIRES_CONFIRMATION`，并携带 approval metadata：

```json
{
  "ok": false,
  "error": {
    "code": "USER_APPROVAL_REQUIRED",
    "message": "Approval is required in the TabBridge extension UI.",
    "recoverable": true,
    "approvalId": "appr_123",
    "expiresAt": 1782012345678,
    "pollCommand": "tabbridge approvals wait --id appr_123 --json"
  }
}
```

规则：

- `approvalId` 由 extension/background 创建，并存储 pending request 摘要、风险原因、过期时间和幂等执行状态。
- `approvals status` 查询当前状态：`pending | approved | denied | expired | executed | canceled`。
- `approvals wait` 等待用户决策，但必须有 timeout；CLI 参数名统一为 `--timeout <ms>`，默认 30000ms，允许调用方传更短超时。超时返回 `APPROVAL_TIMEOUT`，pending approval 本身不自动取消，直到过期或用户操作。
- 对高风险动作，用户批准后动作最多执行一次；重复 poll 不得重复执行。
- 对站点授权，用户批准后创建 TabBridge internal grant；重复 poll 只返回已授权结果。
- pending approval 过期后必须返回 `APPROVAL_EXPIRED`，并要求重新发起命令；只有用户明确拒绝时返回 `USER_DENIED`。

### 站点授权 UI

扩展授权 UI 显示：

- 请求来源 agent 或 CLI command（如果可用）。
- 目标 tab title/domain。
- 请求 reason。
- 将授予的 origin。
- allow / deny。

由于 Chrome optional permissions 需要用户手势，`chrome.permissions.request()` 必须在用户点击 Allow 的 handler 内调用。CLI 命令只能创建 pending request 或等待结果，不能绕过用户手势。

### 高风险确认 UI

扩展确认 UI 显示：

- 请求来源 agent 或 CLI command（如果可用）。
- 目标 tab title/domain。
- 请求命令。
- 人类可读的操作描述。
- 风险原因。
- payload 摘要，例如要输入的文本。
- allow once / deny。

对 password、2FA、payment、credential、token-like 字段，payload 默认显示为 `[REDACTED_SECRET length=...]`，不得默认明文展示。

后续版本可以增加 allow for site 或 allow for session。

## 允许的注入脚本边界

MVP 禁止 agent 或用户通过 CLI 提供任意 JavaScript 字符串。扩展可注入或执行的脚本必须来自 TabBridge 代码库内的 allowlisted internal helpers，仅限：

- semantic snapshot extraction。
- bounded DOM text/html read helpers。
- ref revalidation。
- click/type/focus/scroll 等受控 action helpers。
- screenshot 前后的权限与状态检查。

CLI、WebSocket JSON-RPC payload 和 future MCP adapter 都不得接受 `code`、`functionBody`、`selectorEval` 等任意执行字段。若未来加入危险 JS 执行，必须使用 `dangerous-*` 命名、默认关闭并每次确认。

## Unsupported pages 与 iframe 限制

MVP 默认不支持以下页面或能力受限：

- `chrome://*`
- `chrome-extension://*`
- Chrome Web Store 页面
- `devtools://*`
- `file://*`，除非后续明确 opt-in
- 权限无法覆盖的 `about:blank`、`data:`、`blob:`、PDF viewer 等特殊页面

规则：

- `tabs list` 可以显示 redacted metadata。
- 访问 unsupported page 内容或动作返回 `UNSUPPORTED_PAGE`。
- 对跨源 iframe，如果没有对应 origin 权限，snapshot 应返回 inaccessible frame placeholder，而不是报整个页面失败。

示例：

```json
{
  "frameRef": "f2",
  "origin": "https://accounts.google.com",
  "accessible": false,
  "reason": "FRAME_ORIGIN_NOT_AUTHORIZED"
}
```

MVP 只为 accessible frames 生成 element refs。未来如需控制跨源 iframe，可增加 frame-level access request。

## MV3 service worker 状态策略

Chrome MV3 background 是 service worker，可能被挂起或重启。实现必须避免依赖 background 长期持有不可恢复状态。

建议：

- Element ref records 尽量保存在 content script in-memory map 中，跟页面生命周期绑定。
- Background/service worker 负责 routing、pending approvals、WebSocket broker client 管理和 storage 协调。
- Grants、用户策略和 pending approval metadata 存 `chrome.storage.session` 或 `chrome.storage.local`，并带 expiry。
- WebSocket 断开后，extension 可在下次需要时重连。
- 所有 CLI command 都必须处理 worker restart，并返回可恢复错误。

## Snapshot 与 Ref 设计

### 参考来源

snapshot/ref 实现以 Vercel `vercel-labs/agent-browser` 为一等参考源：

- agent-browser 主仓库，Apache-2.0：<https://github.com/vercel-labs/agent-browser>
- agent-browser Snapshot + Refs workflow 文档：<https://github.com/vercel-labs/open-agents/blob/main/.agents/skills/agent-browser/references/snapshot-refs.md>

实现阶段应先检查 agent-browser 的命令习惯、snapshot 输出、ref 生命周期和源码实现。原则是：

- 能直接复用的 browser-compatible TypeScript/JavaScript 代码，优先直接复用或改编。
- 对依赖 Rust、CDP、agent-browser daemon/CLI runtime、Playwright/Puppeteer runtime 的实现，不能照搬运行时依赖；应移植其算法和数据结构到 Chrome extension content script / WXT 环境。
- ref 表示应优先贴近 agent-browser 的 `@e1`、`@e2` 等紧凑引用风格。
- snapshot 应优先贴近 agent-browser 的“紧凑页面结构 + refs + 可操作元素”格式，而不是默认返回完整 DOM。
- ref 生命周期应保留 agent-browser 的关键约束：页面导航、明显 DOM 变化或交互后，旧 refs 可能失效，agent 应重新 snapshot。

其他浏览器控制项目只作为兼容性和行业惯例背景，不能替代 agent-browser 作为主要参考。

实现阶段应重点对照并尽量复用/移植：

- snapshot schema。
- ref 命名方式。
- role/name/text/state 提取。
- selector 和 XPath 生成。
- visibility filtering。
- action-time revalidation。
- iframe handling。
- truncation 和 token-budget 策略。

如果复制 agent-browser 源码或大段改编代码，仓库必须在 `THIRD_PARTY_NOTICES.md` 和必要的文件头中保留 Apache-2.0 license notice。若同时参考其它开源浏览器控制项目的代码，也必须分别保留对应项目的 license notice。

### 默认 snapshot

`tabbridge snapshot` 返回 semantic interactables snapshot：

```json
{
  "tabId": 123,
  "snapshotId": "snap_abc",
  "title": "GitHub Pull Request",
  "domain": "github.com",
  "urlVisible": false,
  "viewport": {
    "width": 1440,
    "height": 900,
    "scrollX": 0,
    "scrollY": 320
  },
  "frames": [
    {
      "frameRef": "f0",
      "origin": "https://github.com",
      "accessible": true,
      "tree": [
        {
          "ref": "@e42",
          "role": "button",
          "name": "Merge pull request",
          "text": "Merge pull request",
          "states": ["enabled"],
          "box": [100, 240, 180, 36],
          "risk": "high"
        }
      ]
    }
  ]
}
```

### 元素 refs

Refs 是短生命周期逻辑标识，优先采用 agent-browser 风格，例如 `@e1`、`@e2`、`@e3`。实现内部可以规范化存储为 `e1`，但 CLI 输出和文档示例应优先使用 `@e*` 形式，降低 agent 迁移成本。

ref-based 命令必须携带 `snapshotId`。短 ref 可以在不同 snapshot 中复用，因此执行动作时必须用 `(tabId, snapshotId, frameRef, ref)` 查找目标。缺少 `snapshotId` 或 snapshot 已不再 current 时，返回 `REF_STALE`，并建议重新 snapshot。

扩展内部保存：

```ts
type ElementRefRecord = {
  snapshotId: string
  tabId: number
  frameRef: string
  ref: string
  selectorCandidates: string[]
  xpathCandidates: string[]
  role?: string
  name?: string
  textFingerprint?: string
  boundingBox?: Rect
  generatedAt: number
}
```

Agent 永远拿不到真实 DOM handle。

执行动作前，ref 必须重新解析和校验：

- 元素仍存在。
- 元素可见。
- 元素 enabled。
- role/name/text fingerprint 仍大致匹配。

如果校验失败，返回 `REF_STALE`，并建议重新调用 `tabbridge snapshot`。

### Snapshot 存储与失效

`ElementRefRecord` 的主存储位置是目标 frame 的 content script in-memory map，生命周期跟页面/frame 绑定。Background/service worker 可以保存 snapshot metadata 和 routing 信息，但不得依赖长期内存保存 ref 详情。

失效规则：

- 每个 snapshot 默认 TTL 为 60 秒，且每 tab 最多保留最近 3 个 snapshot。
- top-level navigation、frame reload、cross-origin navigation、content script reload、extension reload、明显 DOM mutation 超过实现阈值，都会使相关 refs 失效。
- 每次有意义动作后，官方 skill 必须重新 snapshot；实现也可以主动标记旧 snapshot stale。
- 找不到 content script ref map、snapshot metadata、frameRef 或 ref record 时，一律返回 `REF_STALE`，不得 fallback 到 selector 全局重查并继续执行。
- 内存压力或 MV3 restart 导致 ref map 丢失时，返回 `REF_STALE` 并建议重新 `tabbridge snapshot`。

### Snapshot 提取策略

MVP snapshot extractor 应该：

- 聚焦可见、可操作元素。
- 包括 links、buttons、inputs、textareas、selects、contenteditable、ARIA roles、clickable elements。
- 包括 role、accessible-ish name、visible text、state、box、selector candidates、XPath candidates、有用的 href/form metadata。
- 忽略不可见或无意义布局节点。
- 默认隐藏 password、token-like、hidden、过长敏感值。
- 截断大文本节点和重复结构。

### Element HTML 限制

`tabbridge html` 只能返回指定 snapshot/ref 的有限 subtree HTML：

- 只能对当前 snapshot 中出现过的 ref 调用。
- 默认不包含 form values。
- 默认移除或截断 `<script>`、`<style>`、hidden inputs。
- 应限制 subtree depth、node count 和 max bytes。
- password/token-like attributes 必须 redacted。
- 如果 ref 指向过大 container，返回 `ELEMENT_SCOPE_TOO_LARGE`。

## 风险分类

每个 action 都会被分类：

```ts
type RiskLevel = 'low' | 'medium' | 'high' | 'dangerous'
```

风险输入包括：

- 命令类型。
- 元素 role/type。
- 元素 name/text。
- form context。
- domain/user rules。
- 是否使用坐标。
- 是否会导航。
- 是否涉及 password/payment/2FA 字段。

高风险动作触发扩展确认 UI。

风险分类输出应包含原因：

```json
{
  "risk": "high",
  "reasons": [
    "button text contains 'Delete'",
    "inside form submit context"
  ]
}
```

## 明确排除的能力

MVP 不提供任意 JavaScript 执行。

未来如果加入，应命名为类似：

```bash
tabbridge dangerous-evaluate-js --tab <tabId> --code <code> --json
```

并且必须：

- 默认关闭。
- 每次执行都确认。
- 在 UI 中展示将执行的代码。
- 限制返回数据大小。
- 明确标注为危险能力。

## 错误处理

CLI 错误使用结构化响应：

```json
{
  "ok": false,
  "error": {
    "code": "TAB_NOT_AUTHORIZED",
    "message": "Request access before reading this tab.",
    "recoverable": true,
    "suggestedCommand": "tabbridge tabs request-access --tab 123 --reason <reason> --json"
  }
}
```

初始错误码：

```text
EXTENSION_NOT_CONNECTED
BRIDGE_SOCKET_UNAVAILABLE
BRIDGE_REQUEST_TIMEOUT
TAB_NOT_FOUND
TAB_NOT_AUTHORIZED
TAB_NOT_ACTIVE_FOR_SCREENSHOT
HOST_PERMISSION_DENIED
USER_APPROVAL_REQUIRED
APPROVAL_EXPIRED
APPROVAL_TIMEOUT
UNSUPPORTED_PAGE
FRAME_NOT_ACCESSIBLE
FRAME_ORIGIN_NOT_AUTHORIZED
REF_STALE
ELEMENT_NOT_VISIBLE
ELEMENT_DISABLED
ELEMENT_SCOPE_TOO_LARGE
ACTION_REQUIRES_CONFIRMATION
ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE
USER_DENIED
MESSAGE_TOO_LARGE
PROTOCOL_VERSION_MISMATCH
BROWSER_COMMAND_TIMEOUT
EXTENSION_ID_MISMATCH
```

错误必须可理解、可恢复；不得静默 fallback 到不安全行为。

## 大小限制与截断

WebSocket 消息大小默认由 broker 控制，实现必须避免单次返回巨大页面 dump。

MVP 要求：

- Snapshot 响应默认限制在 256 KiB 以内。
- Text 响应默认限制在 128 KiB 以内。
- HTML 响应默认限制在 64 KiB 以内。
- Screenshot 有尺寸限制；必要时降低分辨率或返回 `MESSAGE_TOO_LARGE`。
- 超大响应返回 `MESSAGE_TOO_LARGE`，并建议缩小 scope 或降低 `maxBytes`。
- 后续版本可以增加 chunking 或本地临时文件 handoff，但临时文件也必须遵守隐私清理策略。

## 安装与诊断

### Broker 运行时文件

CLI 按需启动 `tabbridge broker`，broker 运行时使用以下用户私有文件：

```text
~/Library/Application Support/tabbridge/
  broker-token       # CLI 认证 token
  broker.lock        # flock 文件锁
```

- 目录权限 `0700`。
- `broker-token`、`broker.lock` 权限 `0600`。
- broker 启动时生成随机 token；每次启动都轮换，写入 `broker-token`。
- 端口固定为 `9876`，扩展无法读取本地文件，因此不使用动态端口文件。
- CLI 通过读取 `broker-token` 文件获取认证 token，连接时发送 `{ type: 'auth', token: '...' }`。
- 扩展通过 `Origin: chrome-extension://<extension-id>` 认证，不校验 secret token。

### Packaging 与 extension ID 渠道

每个 extension channel 都必须有明确 ID：

- dev：WXT dev 文档必须说明如何查看 extension ID；推荐配置固定 extension key。
- staging/internal：使用独立固定 extension ID。
- production：以 Chrome Web Store extension ID 为准。

`status --json` 和 `doctor` 可以显示当前连接 extension ID（如果已知）。

### Extension ID 稳定性

规则：

- 开发构建应使用固定 extension key，便于 broker 识别允许的 `chrome-extension://` origin。
- broker 通过 WebSocket handshake 的 `Origin` 头校验扩展来源。
- WXT dev mode 文档应说明如何查看和复制 extension ID。
- 正式发布后以 Chrome Web Store ID 为准。

### Doctor 命令

`tabbridge doctor` 检查：

- broker 是否正在监听 `ws://127.0.0.1:9876`。
- broker token 文件是否存在且权限为 `0600`。
- broker lock 文件是否存在。
- CLI version 和 Node version。
- protocol version 是否兼容。
- 最近一次 bridge 错误摘要。

## Threat model

TabBridge 的 MVP 安全边界是防止 agent 在未获用户授权时读取或操作用户真实浏览器页面，并减少同用户环境中的误连和误用。它不防御已经以同一 macOS 用户身份运行的恶意本地进程。这样的进程通常可以读取用户文件、调用 `tabbridge` CLI、连接本地 WebSocket broker，或观察用户终端行为。

因此：

- broker token 只用于降低 accidental misuse，不是强认证边界。
- 用户授权应短期有效，默认绑定 tab-origin，并可由用户释放。
- 高风险动作必须每次确认，不能仅依赖之前的站点授权。
- 日志、CLI argv、shell history、process list 都视为可能被同用户环境观察的表面。

## 日志与隐私

- 日志默认不得写入页面正文、截图、输入的 secret 或完整 HTML。
- `--json` 模式 stdout 只能输出 JSON envelope。
- broker 与扩展、CLI 之间的通信使用 JSON-RPC 2.0。
- Debug logging 必须提示用户可能记录页面 metadata。
- `doctor` 输出必须避免敏感页面内容。
- 对 typed text，默认只记录字段类型、长度和风险分类，不记录原文。

## MVP 测试策略

### Unit tests

- shared protocol schemas。
- CLI argument parsing。
- JSON envelope formatting。
- approval state machine and idempotency。
- error mapping。
- risk classifier。
- tab metadata redaction。
- favicon URL redaction。
- 基于 fixture HTML 的 snapshot extraction。
- ref generation 和 stale-ref detection。
- ref action 必须绑定 snapshotId。
- WebSocket broker 认证与路由。
- broker 与扩展的 JSON-RPC hello 握手。

### Integration tests

- CLI command 到 JSON-RPC request 的映射。
- broker 到 extension JSON-RPC request/response 的路由。
- broker/extension hello handshake。
- broker unavailable 错误。
- extension-owned bridge startup and recovery instruction when CLI cannot wake extension。
- approval status/wait/cancel flow。
- high-risk action approval executes at most once。
- per-tab action queue。
- doctor 对 broker 监听状态和 token 权限的检查。

### Extension tests

- WXT entrypoints 的 background/content script 消息路由。
- Vue 授权/确认 UI 的状态渲染与用户操作。
- optional permission request 必须发生在用户点击 handler 中。
- content script snapshot extraction。
- fixture 页面中的 form/input/button interaction。
- high-risk action classification。
- permission-flow state transitions。
- MV3 service worker suspend/restart 后的恢复行为。

### 手动 smoke tests

1. 安装 Chrome 扩展。
2. 打开多个 Chrome tabs。
3. 调用 `tabbridge status --json`（CLI 自动启动 broker）。
4. 调用 `tabbridge tabs list --json`，确认只暴露 title/domain。
5. 请求访问某个 tab。
6. 在扩展里批准访问。
7. 调用 `tabbridge snapshot --tab <tabId> --json`。
8. 使用 `tabbridge click`、`tabbridge type`、`tabbridge scroll`。
9. 使用 `tabbridge wait-for-text`。
10. 必要时确认后使用 `tabbridge screenshot`。
11. 对 inactive tab 调用 screenshot，确认返回 `TAB_NOT_ACTIVE_FOR_SCREENSHOT`。
12. 运行 `tabbridge doctor` 并确认状态健康。

## 官方与开源参考

- WXT 官网：<https://wxt.dev/>
- WXT 安装与 starter templates：<https://wxt.dev/guide/installation.html>
- WXT Browser Startup / dev mode：<https://wxt.dev/guide/essentials/config/browser-startup.html>
- Chrome tabs API：<https://developer.chrome.com/docs/extensions/reference/api/tabs>
- Chrome `activeTab`：<https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- Chrome permissions API：<https://developer.chrome.com/docs/extensions/reference/api/permissions>
- Chrome scripting API：<https://developer.chrome.com/docs/extensions/reference/api/scripting>
- Vercel agent-browser：<https://github.com/vercel-labs/agent-browser>
- agent-browser Snapshot + Refs workflow：<https://github.com/vercel-labs/open-agents/blob/main/.agents/skills/agent-browser/references/snapshot-refs.md>
- Playwright ARIA snapshots：<https://playwright.dev/docs/aria-snapshots>
- Playwright Page API：<https://playwright.dev/docs/api/class-page>
