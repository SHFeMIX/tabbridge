# TabBridge Popup UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改动内部功能的前提下，优化 TabBridge 浏览器扩展 popup 的视觉层级、信息展示和操作反馈。

**Architecture:** 保留现有 Vue 3 + Tailwind 技术栈；新增一个倒计时格式化工具函数；通过内联 SVG 图标、语义化卡片、空状态和按钮加载态提升 UX。

**Tech Stack:** Vue 3, Tailwind CSS, WXT, Vitest

## Global Constraints

- 仅修改 `packages/chrome-extension/src/entrypoints/popup/App.vue` 和 `packages/chrome-extension/src/styles.css`。
- 不新增任何数据获取逻辑、不新增消息协议。
- 不引入新的运行时依赖。
- 图标使用内联 SVG。
- 倒计时从已有的 `expiresAt` 字段计算，每秒刷新一次。
- 现有测试（vitest）必须通过；若测试断言的文案变化，需同步更新测试。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `packages/chrome-extension/src/ui/formatTimeRemaining.ts` | 将毫秒级截止时间格式化为 "X 分 XX 秒" / "XX 秒" 的展示文案 |
| `packages/chrome-extension/test/formatTimeRemaining.test.ts` | 倒计时格式化函数的单元测试 |
| `packages/chrome-extension/src/entrypoints/popup/App.vue` | popup 主界面：品牌标题、信息卡片、审批列表、空状态、操作按钮 |
| `packages/chrome-extension/src/styles.css` | 全局基础样式：focus-visible、平滑过渡 |
| `packages/chrome-extension/test/popup.test.ts` | popup 组件的渲染测试，断言品牌名与空状态文案 |

---

### Task 1: Countdown Formatter Utility

**Files:**
- Create: `packages/chrome-extension/src/ui/formatTimeRemaining.ts`
- Test: `packages/chrome-extension/test/formatTimeRemaining.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `formatTimeRemaining(targetMs: number, nowMs?: number): string`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { formatTimeRemaining } from '../src/ui/formatTimeRemaining'

describe('formatTimeRemaining', () => {
  it('formats remaining time with minutes and seconds', () => {
    expect(formatTimeRemaining(1_000_000, 0)).toBe('16 分 40 秒')
  })

  it('formats remaining time with only seconds when under one minute', () => {
    expect(formatTimeRemaining(45_000, 0)).toBe('45 秒')
  })

  it('pads seconds with zero', () => {
    expect(formatTimeRemaining(305_000, 0)).toBe('5 分 05 秒')
  })

  it('clamps to zero for past times', () => {
    expect(formatTimeRemaining(0, 1000)).toBe('0 秒')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/alan/Desktop/tabbridge/packages/chrome-extension
pnpm test -- formatTimeRemaining.test.ts
```

Expected: FAIL with "Cannot find module '../src/ui/formatTimeRemaining'"

- [ ] **Step 3: Write minimal implementation**

```typescript
export function formatTimeRemaining(targetMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, targetMs - nowMs)
  const totalSeconds = Math.floor(diff / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes > 0) {
    return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 秒`
  }
  return `${seconds} 秒`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/alan/Desktop/tabbridge/packages/chrome-extension
pnpm test -- formatTimeRemaining.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension/src/ui/formatTimeRemaining.ts \
  packages/chrome-extension/test/formatTimeRemaining.test.ts
git commit -m "feat(extension): add formatTimeRemaining utility for approval countdown

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Global Styles Update

**Files:**
- Modify: `packages/chrome-extension/src/styles.css`

**Interfaces:**
- Consumes: 无
- Produces: 全局 `:focus-visible` 与过渡样式

- [ ] **Step 1: Add focus-visible and transition styles**

完整替换 `packages/chrome-extension/src/styles.css` 为：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:focus-visible {
  outline: 2px solid #38bdf8;
  outline-offset: 2px;
}

button,
[role="button"] {
  transition: background-color 150ms ease, border-color 150ms ease, transform 100ms ease;
}

button:active:not(:disabled),
[role="button"]:active:not(:disabled) {
  transform: scale(0.98);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/chrome-extension/src/styles.css
git commit -m "feat(extension): improve global focus and button transition styles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Refactor Popup App.vue

**Files:**
- Modify: `packages/chrome-extension/src/entrypoints/popup/App.vue`
- Modify: `packages/chrome-extension/test/popup.test.ts`

**Interfaces:**
- Consumes: `useApprovalState()` 的 `siteApprovals`、`highRiskApprovals`、`pendingApprovals`、`setApprovals`
- Consumes: `formatTimeRemaining(expiresAt, now)`
- Produces: 无新导出；组件内部维护 `now`（每秒更新）和 `decidingIds`（处理中审批 ID 集合）

- [ ] **Step 1: Update popup test expectations**

将 `packages/chrome-extension/test/popup.test.ts` 的断言文案更新为新的空状态文案：

```typescript
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from '../src/entrypoints/popup/App.vue'

describe('popup approval UI', () => {
  it('renders bridge status and empty approval state', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockImplementation((_message, callback) => {
          if (callback) callback({ ok: true, data: { approvals: [] } })
        }),
      },
    })

    const wrapper = mount(App)
    expect(wrapper.text()).toContain('TabBridge')
    expect(wrapper.text()).toContain('没有待处理的审批')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/alan/Desktop/tabbridge/packages/chrome-extension
pnpm test -- popup.test.ts
```

Expected: FAIL with "expected "没有待处理的审批" to be in string"

- [ ] **Step 3: Refactor App.vue with new dashboard UI**

完整替换 `packages/chrome-extension/src/entrypoints/popup/App.vue` 为：

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useApprovalState } from '../../ui/useApprovalState'
import { formatTimeRemaining } from '../../ui/formatTimeRemaining'

const extensionName = 'TabBridge'
const extensionTagline = '本地标签页桥接器'
const approvalState = useApprovalState()
const now = ref(Date.now())
const decidingIds = ref<Set<string>>(new Set())
let intervalId: ReturnType<typeof setInterval> | undefined = undefined

onMounted(() => {
  chrome.runtime?.sendMessage?.({ type: 'tabbridge.popup.listApprovals' }, (response) => {
    if (response?.ok && Array.isArray(response.data?.approvals)) {
      approvalState.setApprovals(response.data.approvals)
    }
  })
  intervalId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (intervalId !== undefined) {
    clearInterval(intervalId)
  }
})

function setDeciding(id: string, deciding: boolean): void {
  const next = new Set(decidingIds.value)
  if (deciding) {
    next.add(id)
  } else {
    next.delete(id)
  }
  decidingIds.value = next
}

function decide(id: string, decision: 'approve' | 'deny'): void {
  setDeciding(id, true)
  chrome.runtime?.sendMessage?.({ type: 'tabbridge.popup.decideApproval', id, decision }, (response) => {
    setDeciding(id, false)
    if (response?.ok && Array.isArray(response.data?.approvals)) {
      approvalState.setApprovals(response.data.approvals)
    }
  })
}
</script>

<template>
  <main class="min-w-96 bg-slate-950 p-4 text-slate-100">
    <header class="flex items-center gap-3 border-b border-slate-800 pb-3">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-sky-600 text-sm font-bold text-white"
      >
        T
      </div>
      <div>
        <h1 class="text-base font-semibold leading-tight">{{ extensionName }}</h1>
        <p class="text-xs text-slate-400">{{ extensionTagline }}</p>
      </div>
    </header>

    <section
      class="mt-4 rounded-xl border border-emerald-800 bg-emerald-950/60 p-3"
      aria-label="连接信息"
    >
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
        <h2 class="text-sm font-medium text-emerald-100">Extension UI is available</h2>
      </div>
      <p class="mt-1 text-xs text-emerald-200/80">
        Native bridge status is checked by <code class="rounded bg-emerald-900/60 px-1 py-0.5">tabbridge status --json</code>.
      </p>
    </section>

    <section class="mt-5" aria-label="待处理审批">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">待处理审批</h2>
        <span
          class="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-300"
          aria-live="polite"
        >
          {{ approvalState.pendingApprovals.value.length }}
        </span>
      </div>

      <div v-if="approvalState.pendingApprovals.value.length === 0" class="py-8 text-center">
        <svg
          class="mx-auto h-10 w-10 text-slate-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <p class="mt-3 text-sm font-medium text-slate-300">没有待处理的审批</p>
        <p class="mt-1 text-xs text-slate-500">TabBridge 正在后台运行</p>
      </div>

      <article
        v-for="approval in approvalState.siteApprovals.value"
        :key="approval.id"
        class="mt-3 rounded-xl border border-sky-800/80 bg-sky-950/50 p-3"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-medium text-sky-100">站点访问请求</h3>
            <p class="mt-1 text-sm text-sky-200">{{ approval.summary }}</p>
            <p class="mt-2 text-xs text-sky-300/80">
              剩余 {{ formatTimeRemaining(approval.expiresAt, now) }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="decidingIds.has(approval.id)"
            @click="decide(approval.id, 'approve')"
          >
            {{ decidingIds.has(approval.id) ? '处理中…' : '允许' }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg border border-sky-700 bg-transparent px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-900/40 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="decidingIds.has(approval.id)"
            @click="decide(approval.id, 'deny')"
          >
            拒绝
          </button>
        </div>
      </article>

      <article
        v-for="approval in approvalState.highRiskApprovals.value"
        :key="approval.id"
        class="mt-3 rounded-xl border border-amber-700/80 bg-amber-950/50 p-3"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-medium text-amber-100">高风险操作</h3>
              <span class="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">
                High
              </span>
            </div>
            <p class="mt-1 text-sm text-amber-200">{{ approval.summary }}</p>
            <p
              v-if="approval.payloadSummary"
              class="mt-2 overflow-x-auto rounded-md bg-amber-950/70 p-2 font-mono text-xs text-amber-100"
            >
              {{ approval.payloadSummary }}
            </p>
            <ul v-if="approval.riskReasons?.length" class="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-200">
              <li v-for="reason in approval.riskReasons" :key="reason">{{ reason }}</li>
            </ul>
            <p class="mt-2 text-xs text-amber-300/80">
              剩余 {{ formatTimeRemaining(approval.expiresAt, now) }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="decidingIds.has(approval.id)"
            @click="decide(approval.id, 'approve')"
          >
            {{ decidingIds.has(approval.id) ? '处理中…' : '允许一次' }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg border border-amber-700 bg-transparent px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="decidingIds.has(approval.id)"
            @click="decide(approval.id, 'deny')"
          >
            拒绝
          </button>
        </div>
      </article>
    </section>
  </main>
</template>
```

- [ ] **Step 4: Run popup test to verify it passes**

Run:
```bash
cd /Users/alan/Desktop/tabbridge/packages/chrome-extension
pnpm test -- popup.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension/src/entrypoints/popup/App.vue \
  packages/chrome-extension/test/popup.test.ts
git commit -m "feat(extension): redesign popup with dashboard UI and approval feedback

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Final Verification

**Files:**
- None

**Interfaces:**
- Consumes: 前面任务产出的所有文件
- Produces: 无

- [ ] **Step 1: Run full test suite**

Run:
```bash
cd /Users/alan/Desktop/tabbridge/packages/chrome-extension
pnpm test
```

Expected: 全部通过

- [ ] **Step 2: Run typecheck**

Run:
```bash
cd /Users/alan/Desktop/tabbridge/packages/chrome-extension
pnpm typecheck
```

Expected: 无类型错误

- [ ] **Step 3: Optional lint check**

Run:
```bash
cd /Users/alan/Desktop/tabbridge/packages/chrome-extension
pnpm lint
```

Expected: 无 lint 错误

- [ ] **Step 4: Commit any remaining fixes**

如果在验证步骤中做了任何修改，提交它们：

```bash
git add -A
git commit -m "fix(extension): address typecheck and test issues from popup redesign

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [ ] **Spec coverage**：spec 中的每条需求（品牌标题、信息卡片、审批计数、站点访问卡片、高风险卡片、空状态、按钮反馈、倒计时、可访问性、不新增数据获取）都有对应任务。
- [ ] **Placeholder scan**：计划中没有 TBD、TODO、"implement later"、"add appropriate error handling" 等占位符。
- [ ] **Type consistency**：`formatTimeRemaining` 的签名在所有任务中一致；`decidingIds` 使用 `Set<string>`；`useApprovalState` 的导入路径未变。
- [ ] **Scope check**：计划仅修改 App.vue、styles.css、新增 formatTimeRemaining 及其测试、更新 popup.test.ts，未触及 background/content/shared。
- [ ] **Test churn**：popup.test.ts 因空状态文案改为中文而同步更新，符合 spec。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-tabbridge-popup-ui-redesign.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** - 每个任务派一个子代理执行，任务间由我审核，快速迭代。
2. **Inline Execution** - 在当前会话中用 executing-plans 顺序执行，关键节点停下来确认。

**Which approach?**
