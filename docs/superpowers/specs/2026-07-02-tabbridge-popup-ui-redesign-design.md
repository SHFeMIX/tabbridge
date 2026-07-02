# TabBridge 浏览器扩展 Popup UI 优化设计

**日期**: 2026-07-02  
**范围**: `packages/chrome-extension/src/entrypoints/popup/App.vue`、`packages/chrome-extension/src/styles.css`  
**约束**: 仅 UI 展示与交互层面的改动，不新增任何数据获取逻辑，不修改 background / content script / shared 包。

---

## 1. 背景与目标

当前 popup 界面结构简单、视觉层级扁平，用户反馈：
- 缺少图标与空状态，界面显得“简陋”；
- 审批卡片信息密度低，信任感不足；
- 点击 Allow/Deny 后没有即时交互反馈；
- 整体没有现代浏览器扩展应有的精致感。

本设计在**不动任何内部功能**的前提下，优化 popup 的视觉层级、信息展示和操作反馈。

---

## 2. 设计原则

1. **UI-only**：只改展示和交互，不新增消息协议、不新增数据获取。
2. **信息全部来自现有数据**：`ApprovalRecord` 的 `kind`、`summary`、`riskReasons`、`payloadSummary`、`expiresAt`。
3. **轻量实现**：不引入新依赖，图标使用内联 SVG。
4. **可访问性**：颜色不是唯一信息载体，按钮 focus 状态清晰。

---

## 3. 总体布局

popup 宽度保持 384px（`min-w-96`），整体采用暗色主题（`bg-slate-950`）。结构从上至下：

```
┌─────────────────────────────┐
│  TabBridge 品牌标题          │
├─────────────────────────────┤
│  连接信息卡片（静态展示）      │
├─────────────────────────────┤
│  待处理审批 · 计数徽章        │
├─────────────────────────────┤
│  站点访问卡片                  │
│  高风险操作卡片                │
│  ...                         │
├─────────────────────────────┤
│  空状态提示（无审批时）        │
└─────────────────────────────┘
```

---

## 4. 组件详细设计

### 4.1 品牌标题

- 左侧：品牌色块 + “T” 字母 Logo（内联 SVG）。
- 右侧：
  - 第一行：`TabBridge`，`font-semibold text-slate-100`；
  - 第二行：`本地标签页桥接器`，`text-xs text-slate-400`。

### 4.2 连接信息卡片

- 位置：标题下方。
- 内容：保持现有文案，仅做视觉升级。
  - 标题：`Extension UI is available`
  - 说明：`Native bridge status is checked by tabbridge status --json.`
- 样式：
  - 背景 `bg-emerald-950`，边框 `border-emerald-800`；
  - 左侧加一个小圆点指示器；
  - 文字使用 `text-emerald-100`。
- **注意**：此卡片为纯信息展示，**不实时检测原生桥接状态**，不发送额外消息。

### 4.3 待处理审批标题栏

- 左侧：`待处理审批`，小写大写字母样式，颜色 `text-slate-400`。
- 右侧：计数徽章，显示 `pendingApprovals.value.length`，`bg-sky-500/15 text-sky-300`。

### 4.4 站点访问卡片

适用 `kind === 'site-access'` 的审批。

- 左侧图标：地球/链接图标（内联 SVG），颜色 `text-sky-400`，背景 `bg-sky-400/10`。
- 标题：`站点访问请求`，`text-sky-100 font-medium`。
- 摘要：`summary`（如 `Allow example.com for tab #42: reason`），`text-sm text-sky-200`。
- 元信息：由 `expiresAt` 计算剩余时间，例如 `剩余 4 分 12 秒`。
- 操作按钮：
  - 允许：`bg-sky-500 text-white`，hover 加深；
  - 拒绝：透明背景 + `border-sky-700 text-sky-100`。

### 4.5 高风险操作卡片

适用 `kind === 'high-risk-action'` 的审批。

- 左侧图标：警告三角（内联 SVG），颜色 `text-amber-400`，背景 `bg-amber-400/10`。
- 标题行：
  - `高风险操作`，`text-amber-100 font-medium`；
  - 右侧 `HIGH` 标签，`bg-amber-400 text-amber-950`。
- 摘要：`summary`，`text-sm text-amber-200`。
- Payload 代码块：`payloadSummary`，等宽字体，背景 `bg-amber-950/50`，带圆角。
- 风险原因：当 `riskReasons` 存在时展示为无序列表，`text-xs text-amber-200`。
- 元信息：剩余时间。
- 操作按钮：
  - 允许一次：`bg-amber-500 text-amber-950`，hover 加深；
  - 拒绝：透明背景 + `border-amber-700 text-amber-100`。

### 4.6 空状态

当 `pendingApprovals.value.length === 0` 时展示：

- 居中图标：勾选或盾牌图标（内联 SVG），`text-slate-500`。
- 主文案：`没有待处理的审批`，`text-slate-300`。
- 副文案：`TabBridge 正在后台运行`，`text-xs text-slate-500`。

### 4.7 按钮交互反馈

- hover：背景色加深或边框高亮。
- active：轻微缩放或内阴影。
- 点击后：按钮进入禁用状态并显示 `处理中…`，等待 `decideApproval` 响应。
- 响应后列表自然刷新（已有行为）。

---

## 5. 设计 Token

| Token | 值 | 用途 |
|-------|-----|------|
| 背景主色 | `bg-slate-950` | popup 主背景 |
| 背景卡片 | `bg-slate-900` | 未采用，卡片按语义色区分 |
| 主文本 | `text-slate-100` | 标题、主文案 |
| 次级文本 | `text-slate-400` | 说明、元信息 |
| 站点访问主题 | `sky-*` | 站点访问卡片 |
| 高风险主题 | `amber-*` | 高风险操作卡片 |
| 正向/连接 | `emerald-*` | 信息卡片 |
| 圆角卡片 | `rounded-xl` (12px) | 所有卡片 |
| 圆角按钮 | `rounded-lg` (8px) | 所有按钮 |
| 字体 | Inter + system-ui | 保持现有 |

---

## 6. 可访问性

- 高风险卡片的危险状态不仅依赖颜色，还附带 `HIGH` 文字标签。
- 按钮具有清晰的 `:focus-visible` 轮廓。
- 图标使用 `aria-hidden="true"`，不干扰屏幕阅读器。
- 倒计时变化使用 `aria-live="polite"` 区域，避免频繁打扰。

---

## 7. 数据流（无变化）

```
popup 打开
  └─ chrome.runtime.sendMessage({ type: 'tabbridge.popup.listApprovals' })
       └─ approvalState.setApprovals(response.data.approvals)

用户点击 Allow/Deny
  └─ chrome.runtime.sendMessage({ type: 'tabbridge.popup.decideApproval', id, decision })
       └─ approvalState.setApprovals(response.data.approvals)
```

本次 redesign **不增加任何新的消息类型、不增加心跳检测、不调用任何新的 API**。

---

## 8. 文件改动清单

- `packages/chrome-extension/src/entrypoints/popup/App.vue`
  - 重构模板结构；
  - 引入内联 SVG 图标；
  - 增加按钮加载状态；
  - 增加空状态；
  - 增加倒计时展示。
- `packages/chrome-extension/src/styles.css`
  - 可选：增加 `:focus-visible` 全局样式；
  - 可选：增加 `aria-live` 相关辅助样式。

---

## 9. 不在本次范围内的改动

- 不修改 `background/`、`content/`、`offscreen/` 下的任何文件。
- 不修改 `packages/shared/`。
- 不引入新依赖（如图标库、动画库）。
- 不改 manifest.json 或 wxt 配置。
- 不实现主题切换。
- 不实现实时桥接状态检测。

---

## 10. 验收标准

- [ ] popup 打开后视觉层级清晰，品牌标题、信息卡片、审批列表分区明确。
- [ ] 站点访问卡片和高风险操作卡片在颜色、图标、文案上有明显区分。
- [ ] 无审批时显示空状态，而不是干文本。
- [ ] 点击 Allow/Deny 后按钮有“处理中…”反馈，防止重复点击。
- [ ] 倒计时从 `expiresAt` 正确计算并展示。
- [ ] 不引入新的运行时依赖。
- [ ] 现有测试（vitest）仍通过；若测试依赖具体 class 名，则同步更新。
