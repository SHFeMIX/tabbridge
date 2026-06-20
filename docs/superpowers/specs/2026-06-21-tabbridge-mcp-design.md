# TabBridge MCP 设计文档

日期：2026-06-21

## 摘要

TabBridge 是一个本地优先的 MCP server + Chrome 扩展，用来让本地 agent 检查并控制用户已授权、已经打开的 Chrome 标签页。它默认不启动独立浏览器、不创建新浏览器 profile，也不新开标签页；它连接的是用户当前真实浏览器里的页面，因此能复用用户已有登录态、Cookie、页面状态和正在使用的浏览器上下文。

MVP 只支持 macOS + Chrome/Chromium。MCP server、Native Messaging host 和共享协议使用 TypeScript；Chrome 扩展使用 **WXT + Vue + Vite + TailwindCSS** 开发。WXT 官方定位是 Next-gen Web Extension Framework，支持 TypeScript、文件式 entrypoints、快速 dev mode，并提供 Vue starter template。

项目名统一为 **TabBridge**：

- CLI：`tabbridge`
- Chrome 扩展名：`TabBridge`
- Native Messaging host：`com.tabbridge.host`
- MCP server 显示名：`tabbridge`

## 目标

- 让本地 MCP 客户端控制用户已经打开的 Chrome 标签页。
- 让 agent 能发现候选 tab，但默认不暴露完整 URL。
- 通过明确的 tab/site 授权和高风险操作确认，保护用户隐私与控制权。
- 提供接近现有浏览器控制 MCP 工具使用习惯的命名和交互方式。
- 默认用语义化页面快照和稳定元素引用作为页面状态表示。
- 在许可证和运行环境允许时，优先复用或适配 Vercel `vercel-labs/agent-browser` 的工具接口、snapshot/ref 输出格式和可迁移源码。
- 在 macOS 上提供可安装、可诊断的 MVP，不引入常驻 daemon。

## MVP 非目标

- 不支持 Windows、Linux、Firefox、Safari。
- 不提供云端 relay 或远程 agent 控制。
- 不把启动新浏览器、新 browser context、新 tab 作为主要工作流。
- 不追求完整 Playwright API 兼容。
- 不实现常驻后台 daemon。
- 不默认支持 CDP/debugger enhanced mode。
- 不提供任意 JavaScript 执行。
- 不提供网络拦截。
- 不提供 Cookie、localStorage、凭据、token 提取工具。
- 不提供无边界的完整页面 DOM dump。
- 不提供独立于网页正常 UI 之外的专用文件上传/下载自动化工具。

## 推荐方案

MVP 采用 **按站点授权的 Chrome 扩展受限浏览器 MCP**：

1. Agent 调用 `browser_list_tabs`，只看到 tab 的 `title + domain`，默认看不到完整 URL。
2. Agent 根据用户意图选择目标 tab。
3. Agent 调用 `browser_request_tab_access(tabId, reason)` 请求访问。
4. Chrome 扩展向用户展示授权 UI，请用户授权该站点。
5. 用户授权后，agent 才能对该 tab/site 调用页面快照和页面操作工具。
6. 高风险动作即使在已授权站点内，也仍然需要单独确认。

这个方案在用户体验和安全边界之间取得平衡：agent 可以选择已打开的 tab，但不能悄悄读取或操作用户真实登录页面。

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

### 方案 C：按站点授权 + 浏览器控制风格工具面

默认只列出有限 tab 元数据；按需请求站点访问权限；通过 Chrome 扩展提供熟悉的 browser 工具。

优点：

- 符合“控制用户已打开网页”的目标。
- 权限边界容易解释。
- 允许 agent 选择目标 tab，同时保留用户同意。
- 能在 Chrome 扩展能力范围内落地。

缺点：

- 比 `activeTab` only 更复杂。
- 需要权限 UI 与授权状态管理。
- 对受限页面、跨源 iframe 有天然限制。

结论：MVP 采用此方案。

## 架构

MVP 使用一个 TypeScript/Node CLI 包，提供两个显式运行模式：

```bash
tabbridge mcp-server
tabbridge native-host
```

运行结构：

```text
MCP client
  └─ launches: tabbridge mcp-server
        └─ MCP stdio JSON-RPC

Chrome extension
  └─ chrome.runtime.connectNative("com.tabbridge.host")
        └─ Chrome launches: tabbridge native-host
              └─ Chrome Native Messaging length-prefixed JSON

tabbridge mcp-server  <── local IPC ──>  tabbridge native-host  <──> Chrome extension
```

### 组件

#### `packages/mcp-server`

职责：

- 通过 stdio 说 MCP。
- 注册 browser 工具。
- 把 MCP tool call 转换为内部 browser command。
- 维护 browser bridge 连接状态。
- 返回结构化、可恢复的错误。
- 日志只能写 stderr。

#### `packages/native-host`

职责：

- 通过 stdin/stdout 说 Chrome Native Messaging framing。
- 连接 MCP server 暴露的本地 IPC 通道。
- 在 MCP server 和 Chrome 扩展之间转发请求/响应。
- 不直接实现浏览器业务逻辑。
- 日志只能写 stderr 或日志文件。

#### `packages/chrome-extension`

职责：

- 使用 WXT + Vue + Vite 提供 MV3 Chrome 扩展。
- 通过 WXT entrypoints 管理 background/service worker、content scripts、popup/options 等入口。
- 用 Vue 实现站点授权、高风险操作确认、状态诊断等扩展 UI。
- 通过 `chrome.runtime.connectNative` 连接 native host。
- 通过 Chrome extension API 枚举 tabs。
- 按需请求 host permissions。
- 展示站点授权和高风险操作确认 UI。
- 通过 content script 或 `chrome.scripting.executeScript` 生成页面快照并执行页面动作。
- 在权限允许时截取 viewport screenshot。

#### `packages/shared`

职责：

- 定义共享协议类型。
- 定义工具输入/输出 schema。
- 定义错误码。
- 定义风险分类类型。
- 定义 snapshot 与 ref 数据结构。

### CLI 命令

```bash
tabbridge mcp-server
tabbridge native-host
tabbridge install-native-host
tabbridge uninstall-native-host
tabbridge doctor
```

`install-native-host` 写入 macOS Chrome Native Messaging host manifest，并指向一个稳定 wrapper，该 wrapper 运行 `tabbridge native-host`。

`doctor` 检查安装状态、bridge 状态、协议版本、extension ID、manifest path、socket 可用性和基础运行健康度。

## 协议边界

系统里有三种协议，不能混用。

### MCP stdio

只用于 `tabbridge mcp-server`。

- MCP client 拥有进程生命周期。
- stdin/stdout 只属于 MCP 消息。
- stdout 不能包含日志、banner 或调试输出。
- 日志走 stderr。

### Chrome Native Messaging

只用于 `tabbridge native-host`。

- Chrome 拥有进程生命周期。
- stdin/stdout 只属于 Chrome length-prefixed JSON 协议。
- Native Messaging manifest 通过 `allowed_origins` 限制 extension ID。
- 日志走 stderr 或日志文件。

### 本地 IPC

用于 `mcp-server` 和 `native-host` 之间。

MVP 在 macOS 上默认使用 Unix domain socket，放在用户私有 Application Support 目录，例如：

```text
~/Library/Application Support/tabbridge/bridge.sock
```

连接同时使用 per-user session token，token 存储在用户私有配置文件中，用于减少同用户其它进程误连风险。

## 内部 Bridge 消息

内部消息使用统一 envelope：

```ts
type BridgeRequest = {
  id: string
  protocolVersion: 1
  source: 'mcp-server' | 'native-host' | 'extension'
  target: 'mcp-server' | 'native-host' | 'extension'
  type: string
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
    suggestedTool?: string
  }
}
```

每次 MCP tool call 生成一个 request id，并在 IPC、Native Messaging、扩展和返回路径中保持不变。

## 版本握手

每条连接建立后先发送 `hello`：

```json
{
  "type": "hello",
  "protocolVersion": 1,
  "role": "mcp-server",
  "version": "0.1.0",
  "capabilities": {
    "tools": ["browser_snapshot", "browser_click"],
    "snapshot": ["semantic", "text", "html", "screenshot"],
    "permissions": ["tabs", "host-permission"]
  }
}
```

各方校验：

- 协议版本是否兼容。
- extension、native host、CLI 版本是否兼容。
- 是否支持所需 capability。
- bridge 是否已连接。

不兼容时返回 `PROTOCOL_VERSION_MISMATCH` 或更具体的错误。

## MCP 工具面

工具名优先贴近 Vercel `vercel-labs/agent-browser` 已暴露的 browser 工具，以降低模型使用成本。设计和实现时应先对照 agent-browser 的工具接口；如果 Chrome 扩展能安全实现某些额外实用能力，而 agent-browser 没有暴露，也可以加入，但必须遵守本设计的权限、风险分类和可审计原则。

### Tab 发现与授权

```text
browser_status
browser_list_tabs
browser_get_current_tab
browser_request_tab_access
browser_release_tab
```

`browser_list_tabs` 默认返回：

- `tabId`
- `windowId`
- `title`
- `domain`
- `active`
- 可选 `favIconUrl`
- `accessStatus`

默认不返回完整 URL。

`browser_request_tab_access` 输入 `tabId` 和 `reason`，由扩展提示用户并为目标站点请求 host permission。

### 页面状态

```text
browser_snapshot
browser_get_page_text
browser_get_element_html
browser_screenshot
```

`browser_snapshot` 是默认页面理解工具，返回 semantic interactables snapshot，而不是完整 DOM dump。

`browser_get_page_text` 返回有大小限制的可见文本。

`browser_get_element_html` 返回指定 ref 的有限 subtree HTML。

`browser_screenshot` 截取可见 viewport，并被视为隐私敏感操作。

### 元素动作

```text
browser_click
browser_type
browser_clear
browser_select_option
browser_check
browser_uncheck
browser_focus
```

元素动作默认使用 `tabId + ref`。执行前扩展重新解析并校验 ref。

### 键盘、指针和滚动

```text
browser_press_key
browser_scroll
browser_click_coordinates
browser_drag_coordinates
```

坐标动作是 fallback 操作，默认风险高于 ref-based action。

### 导航与等待

```text
browser_wait
browser_wait_for_text
browser_reload
browser_go_back
browser_go_forward
browser_navigate
```

`browser_navigate` 会改变用户当前 tab 页面，默认是高风险动作。

## 明确排除的工具

MVP 不提供任意 JavaScript 执行。

未来如果加入，应命名为类似：

```text
browser_dangerous_evaluate_js
```

并且必须：

- 默认关闭。
- 每次执行都确认。
- 在 UI 中展示将执行的代码。
- 限制返回数据大小。
- 明确标注为危险能力。

## 权限模型

### Level 0：Bridge 状态

`browser_status` 不暴露网页内容，默认允许。

### Level 1：Tab 发现

Agent 可以看到有限 tab metadata：

- title
- domain
- active/window state

默认不能看到完整 URL 或页面内容。

### Level 2：页面读取权限

需要用户授权并授予目标站点 host permission。

包括：

- 完整 URL。
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

## Snapshot 与 Ref 设计

### 参考来源

snapshot/ref 实现以 Vercel `vercel-labs/agent-browser` 为一等参考源：

- agent-browser 主仓库，Apache-2.0：<https://github.com/vercel-labs/agent-browser>
- agent-browser Snapshot + Refs workflow 文档：<https://github.com/vercel-labs/open-agents/blob/main/.agents/skills/agent-browser/references/snapshot-refs.md>

实现阶段应先检查 agent-browser 的工具接口、snapshot 输出、ref 生命周期和源码实现。原则是：

- 能直接复用的 browser-compatible TypeScript/JavaScript 代码，优先直接复用或改编。
- 对依赖 Rust、CDP、agent-browser daemon/CLI runtime、Playwright/Puppeteer runtime 的实现，不能照搬运行时依赖；应移植其算法和数据结构到 Chrome extension content script / WXT 环境。
- ref 表示应优先贴近 agent-browser 的 `@e1`、`@e2` 等紧凑引用风格，除非 MCP 工具参数 schema 需要内部无 `@` 的规范化形式。
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

`browser_snapshot` 返回 semantic interactables snapshot：

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

Refs 是短生命周期逻辑标识，优先采用 agent-browser 风格，例如 `@e1`、`@e2`、`@e3`。实现内部可以规范化存储为 `e1`，但 MCP 输出和文档示例应优先使用 `@e*` 形式，降低 agent 迁移成本。

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

MCP client 永远拿不到真实 DOM handle。

执行动作前，ref 必须重新解析和校验：

- 元素仍存在。
- 元素可见。
- 元素 enabled。
- role/name/text fingerprint 仍大致匹配。

如果校验失败，返回 `REF_STALE`，并建议重新调用 `browser_snapshot`。

### Snapshot 提取策略

MVP snapshot extractor 应该：

- 聚焦可见、可操作元素。
- 包括 links、buttons、inputs、textareas、selects、contenteditable、ARIA roles、clickable elements。
- 包括 role、accessible-ish name、visible text、state、box、selector candidates、XPath candidates、有用的 href/form metadata。
- 忽略不可见或无意义布局节点。
- 默认隐藏 password、token-like、hidden、过长敏感值。
- 截断大文本节点和重复结构。

## 风险分类

每个 action 都会被分类：

```ts
type RiskLevel = 'low' | 'medium' | 'high' | 'dangerous'
```

风险输入包括：

- 工具类型。
- 元素 role/type。
- 元素 name/text。
- form context。
- domain/user rules。
- 是否使用坐标。
- 是否会导航。
- 是否涉及 password/payment/2FA 字段。

高风险动作触发扩展确认 UI。

## 用户确认 UI

扩展确认 UI 显示：

- 请求来源 agent 或 MCP client（如果可用）。
- 目标 tab title/domain。
- 请求工具。
- 人类可读的操作描述。
- 风险原因。
- payload 摘要，例如要输入的文本。
- allow once / deny。

后续版本可以增加 allow for site 或 allow for session。

## 错误处理

工具错误使用结构化响应：

```json
{
  "ok": false,
  "error": {
    "code": "TAB_NOT_AUTHORIZED",
    "message": "Request access before reading this tab.",
    "recoverable": true,
    "suggestedTool": "browser_request_tab_access"
  }
}
```

初始错误码：

```text
EXTENSION_NOT_CONNECTED
NATIVE_HOST_NOT_CONNECTED
TAB_NOT_FOUND
TAB_NOT_AUTHORIZED
HOST_PERMISSION_DENIED
UNSUPPORTED_PAGE
FRAME_NOT_ACCESSIBLE
REF_STALE
ELEMENT_NOT_VISIBLE
ELEMENT_DISABLED
ACTION_REQUIRES_CONFIRMATION
USER_DENIED
MESSAGE_TOO_LARGE
PROTOCOL_VERSION_MISMATCH
BROWSER_COMMAND_TIMEOUT
```

错误必须可理解、可恢复；不得静默 fallback 到不安全行为。

## 大小限制与截断

Chrome Native Messaging 有消息大小限制，实现必须避免单次返回巨大页面 dump。

MVP 要求：

- Snapshot 响应有大小边界。
- Text 和 HTML 工具必须接受或应用 `maxBytes`。
- Screenshot 有尺寸限制。
- 超大响应返回 `MESSAGE_TOO_LARGE`，并建议缩小 scope。
- 后续版本可以增加 chunking 或本地临时文件 handoff。

## 安装与诊断

### Native host manifest

`tabbridge install-native-host` 写入 macOS Chrome Native Messaging manifest，形态如下：

```json
{
  "name": "com.tabbridge.host",
  "description": "TabBridge native host",
  "path": "/absolute/path/to/tabbridge-native-host-wrapper",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<extension-id>/"
  ]
}
```

`<extension-id>` 是安装时由用户或开发构建配置提供的 Chrome extension ID，不是固定值。Manifest 应尽可能指向稳定 wrapper path，而不是易变的开发路径。

### Doctor 命令

`tabbridge doctor` 检查：

- native host manifest 是否存在。
- manifest JSON 是否合法。
- manifest path 是否存在且可执行。
- extension ID 是否匹配 `allowed_origins`。
- CLI version 和 Node version。
- Unix socket path 和权限。
- MCP server mode 是否可达。
- native host 和 extension 是否连接。
- protocol version 是否兼容。

## 日志与隐私

- 日志默认不得写入页面正文、截图、输入的 secret 或完整 HTML。
- 两个运行模式的 stdout 都只用于协议消息。
- Debug logging 必须提示用户可能记录页面 metadata。
- `doctor` 输出必须避免敏感页面内容。

## MVP 测试策略

### Unit tests

- shared protocol schemas。
- error mapping。
- risk classifier。
- tab metadata redaction。
- 基于 fixture HTML 的 snapshot extraction。
- ref generation 和 stale-ref detection。
- Native Messaging framing encode/decode。

### Integration tests

- MCP tool call 到 IPC request 的映射。
- native-host 到 extension bridge message 的映射。
- mcp-server/native-host handshake。
- browser bridge unavailable 错误。
- doctor 对 manifest 和版本不匹配的检查。

### Extension tests

- WXT entrypoints 的 background/content script 消息路由。
- Vue 授权/确认 UI 的状态渲染与用户操作。
- content script snapshot extraction。
- fixture 页面中的 form/input/button interaction。
- high-risk action classification。
- permission-flow state transitions。

### 手动 smoke tests

1. 安装 Chrome 扩展。
2. 运行 `tabbridge install-native-host`。
3. 配置 MCP client 运行 `tabbridge mcp-server`。
4. 打开多个 Chrome tabs。
5. 调用 `browser_list_tabs`，确认只暴露 title/domain。
6. 请求访问某个 tab。
7. 在扩展里批准访问。
8. 调用 `browser_snapshot`。
9. 使用 `browser_click`、`browser_type`、`browser_scroll`。
10. 使用 `browser_wait_for_text`。
11. 必要时确认后使用 `browser_screenshot`。
12. 运行 `tabbridge doctor` 并确认状态健康。

## 官方与开源参考

- MCP transports：<https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>
- MCP transport concepts：<https://modelcontextprotocol.io/docs/concepts/transports>
- WXT 官网：<https://wxt.dev/>
- WXT 安装与 starter templates：<https://wxt.dev/guide/installation.html>
- WXT Browser Startup / dev mode：<https://wxt.dev/guide/essentials/config/browser-startup.html>
- Chrome Native Messaging：<https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>
- Chrome runtime `connectNative`：<https://developer.chrome.com/docs/extensions/reference/api/runtime#method-connectNative>
- Chrome tabs API：<https://developer.chrome.com/docs/extensions/reference/api/tabs>
- Chrome `activeTab`：<https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- Chrome scripting API：<https://developer.chrome.com/docs/extensions/reference/api/scripting>
- Vercel agent-browser：<https://github.com/vercel-labs/agent-browser>
- agent-browser Snapshot + Refs workflow：<https://github.com/vercel-labs/open-agents/blob/main/.agents/skills/agent-browser/references/snapshot-refs.md>
- Playwright ARIA snapshots：<https://playwright.dev/docs/aria-snapshots>
- Playwright Page API：<https://playwright.dev/docs/api/class-page>
