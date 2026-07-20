# TabBridge

简体中文 · [English](README.md)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)


TabBridge 是一款为 AI Agent 设计的 CLI 工具与 Skill：在获得用户授权后，它能让 AI 直接操作你**当前已经打开的浏览器页面**，通过浏览器插件而不是像 Playwright、Puppeteer 或 Agent Browser 那样启动一个全新的浏览器实例。

## 核心定位

> 不是新开一个浏览器实例，而是连接 Agent 与你已打开的网页，让 AI 无缝接手。

传统的浏览器自动化工具会新开一个浏览器进程或实例，导致：

- 已经登录的账号需要重新登录
- Cookie、localStorage、会话状态全部丢失
- 需要额外的认证流程（短信、2FA、扫码）

TabBridge 不同：它接管你**真实浏览器中正在运行的标签页**，让 AI 在你的现有会话上继续工作。

## 为什么是 TabBridge

| 能力 | Playwright / Puppeteer / Agent Browser | TabBridge |
|------|----------------------------------------|-----------|
| 操作对象 | 新开的浏览器实例 | 用户已打开的页面 |
| 登录态 | 需要重新登录 | 继承当前会话 |
| 部署方式 | 需要浏览器驱动或远程环境 | 本地 CLI + 浏览器插件 |
| 对 AI 友好度 | 原始 HTML，Token 消耗大 | 结构化 Snapshot，更省 Token |
| 危险操作审核 | 通常无 | 坐标类等高危操作需用户确认 |

## 主要特性

- **会话接管**：连接当前激活的标签页，或指定任意已打开的标签页。
- **AI 友好的 Snapshot**：将网页转换为结构化的语义视图，包含可交互元素引用（`@e1`、`@e2`…），让大模型更快理解页面，显著减少 Token 消耗。
- **Ref-based 操作**：基于 Snapshot 中的语义引用执行 `click`、`fill`、`type`、`select`、`check` 等操作。
- **细粒度权限控制**：读取页面、执行动作前需要用户显式授权；授权在 30 分钟后过期，且网页切换 origin 后需重新授权。浏览器插件弹窗中的授权请求若 5 分钟内未处理将会过期。
- **高危操作确认**：坐标类操作（`click-coordinates`、`drag-coordinates`）必须通过浏览器插件弹窗手动确认。
- **本地优先**：CLI 经本地 Broker 与浏览器插件建立 WebSocket 通信，不依赖云端浏览器集群。

## 架构概览

```text
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent（via Skill）                    │
│                   调用 `tabbridge` 命令行                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ 进程调用
┌───────────────────────────▼─────────────────────────────────┐
│                   TabBridge CLI（Node.js）                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket
┌───────────────────────────▼─────────────────────────────────┐
│                       TabBridge Broker                       │
│                  （本地 WebSocket 服务）                      │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket
┌───────────────────────────▼─────────────────────────────────┐
│                      Chrome Extension                        │
│           （离屏文档 + 内容脚本 + 浏览器弹窗）                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                        用户已打开的网页                       │
└─────────────────────────────────────────────────────────────┘
```

首次运行任意 `tabbridge` 命令会自动启动本地 Broker，无需手动启动。

## 快速开始

### 前置条件

- Node.js（建议使用 LTS）
- Chrome / Chromium 116+
- macOS、Windows 或 Linux

### 1. 安装 CLI

```bash
npm install -g tabbridge-cli
```

安装完成后，`tabbridge` 命令即可全局使用。

### 2. 安装浏览器插件

> 扩展目前尚未上架 Chrome Web Store。在上架之前，你需要从源码构建并手动加载。

克隆仓库，在 monorepo 根目录安装 workspace 依赖，使用 WXT 构建并加载到 Chrome：

```bash
pnpm install
pnpm --filter @tabbridge/chrome-extension build
```

然后打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展**，选择 `packages/chrome-extension/dist/chrome-mv3/`（包含 `manifest.json` 的目录）。

运行 `tabbridge tabs request-access` 后，在扩展弹窗中批准站点访问。也可以稍后在扩展详情页的站点访问中管理。

开发时请运行 `pnpm --filter @tabbridge/chrome-extension dev`；WXT 会输出到 `packages/chrome-extension/dist/chrome-mv3-dev/`。

### 3. 为 AI Agent 安装 Skill（可选）

TabBridge 提供了供 AI Agent 使用的 Skill。使用 [`skills`](https://www.npmjs.com/package/skills) CLI 安装后，Agent 就可以调用 `tabbridge` 命令：

```bash
# Claude Code
npx skills add SHFeMIX/tabbridge --skill tabbridge -a claude-code

# 其他支持的 Agent（Codex、Cursor、OpenCode 等）
npx skills add SHFeMIX/tabbridge --skill tabbridge -a <agent-name>
```

该命令会从本仓库安装 Skill 到你的 Agent 的 skills 目录。

### 4. 连接并操作页面

请确保当前标签页是正常的 `http://` 或 `https://` 页面。当前版本不支持 Chrome 内部页面、扩展页面、文件 URL 和 `about:` 页面。

```bash
# 检查连接状态
tabbridge status --json

# 列出可操作的标签页
tabbridge tabs list --json

# 连接到当前激活的标签页
tabbridge connect --json

# 请求页面访问授权
tabbridge tabs request-access --tab <tabId> --reason "读取页面内容" --json

# 获取 AI 友好的 Snapshot（`-i` 为兼容参数，可忽略）
tabbridge snapshot -i --json

# 执行操作
tabbridge click @e1 --json
```

## Snapshot：为 AI 大模型优化的页面视图

`tabbridge snapshot` 不会把整个 DOM dump 给模型，而是生成一个紧凑的语义表示：

```text
Page: Example
URL: https://example.com

@e1 [button] "Save"
@e2 [textbox] placeholder="Comment"
```

每个 `@eN` 引用都是当前快照下的临时标签，AI 可以用它精确地指代元素，而无需处理冗长的 HTML 或 CSS 选择器。引用具有易变性，每次快照都会重新分配，确保操作始终基于最新页面状态。

## 安全与审批边界

TabBridge 将用户浏览器上下文的安全放在首位：

- **站点授权**：每个 origin 都需要用户单独授权。
- **会话隔离**：不提取 Cookie、localStorage、凭证或 Token。
- **无任意代码执行**：禁止注入任意 JavaScript 或拦截网络请求。
- **高危操作确认**：坐标类操作必须经浏览器插件弹窗确认后才能执行。
- **无静默降级**：不会把 ref 操作静默替换为坐标操作。
- **不在命令行传 secrets**：永远不要把密码、2FA 码、支付信息、凭证或 Token 放在 CLI 参数里。敏感输入请使用 `type --text-stdin` / `fill --text-stdin`。

## 项目结构

```text
tabbridge/
├── packages/
│   ├── cli/              # TabBridge CLI（tabbridge 命令）
│   ├── chrome-extension/ # Chrome / Chromium 浏览器插件
│   ├── broker/           # 本地 WebSocket 桥接服务
│   └── shared/           # 共享类型与错误码
├── skills/
│   └── tabbridge/        # Claude Skill 与使用参考
└── docs/                 # 设计文档
```

## 开发

```bash
pnpm test        # 运行完整测试套件
pnpm typecheck   # 运行 TypeScript 检查
pnpm lint        # 运行各包的 lint / 类型检查
pnpm clean       # 清理构建产物
```

## 许可证

[MIT](LICENSE)
