<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useApprovalState } from '../../ui/useApprovalState'
import { formatTimeRemaining } from '../../ui/formatTimeRemaining'

const extensionName = 'TabBridge'
const extensionTagline = '本地标签页桥接器'
const approvalState = useApprovalState()
const now = ref(Date.now())
const decidingIds = ref<Set<string>>(new Set())
let intervalId: ReturnType<typeof setInterval> | undefined = undefined

const pendingCount = computed(() => approvalState.pendingApprovals.value.length)

function handleStorageChange(changes: Record<string, { newValue?: unknown }>): void {
  const approvalChanges = changes['tabbridge.approvals']
  if (approvalChanges && Array.isArray(approvalChanges.newValue)) {
    approvalState.setApprovals(approvalChanges.newValue)
  }
}

onMounted(() => {
  chrome.runtime?.sendMessage?.({ type: 'tabbridge.popup.listApprovals' }, (response) => {
    if (response?.ok && Array.isArray(response.data?.approvals)) {
      approvalState.setApprovals(response.data.approvals)
    }
  })
  chrome.storage?.onChanged?.addListener(handleStorageChange)
  intervalId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (intervalId !== undefined) {
    clearInterval(intervalId)
  }
  chrome.storage?.onChanged?.removeListener(handleStorageChange)
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
  <main class="w-[380px] bg-white text-slate-900">
    <!-- Header -->
    <header class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
      <div
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"
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
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
      </div>
      <div class="flex-1">
        <h1 class="text-[15px] font-semibold leading-tight">{{ extensionName }}</h1>
        <p class="text-xs text-slate-500">{{ extensionTagline }}</p>
      </div>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        已连接
      </span>
    </header>

    <div class="px-5 py-4">
      <!-- Empty state -->
      <div v-if="pendingCount === 0" class="py-10 text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
          <svg
            class="h-6 w-6 text-slate-400"
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
        </div>
        <p class="mt-4 text-sm font-medium text-slate-900">没有待处理的审批</p>
        <p class="mt-1 text-xs text-slate-500">TabBridge 正在后台运行，等待 AI 操作请求</p>
      </div>

      <!-- Pending approvals -->
      <section v-else aria-label="待处理审批">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-900">待处理审批</h2>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {{ pendingCount }}
          </span>
        </div>

        <TransitionGroup name="approval-list" tag="div" class="space-y-3">
          <!-- Site access requests -->
          <article
            v-for="approval in approvalState.siteApprovals.value"
            :key="approval.id"
            class="rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600"
              >
                <svg
                  class="h-4 w-4"
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
                <h3 class="text-sm font-medium text-slate-900">站点访问请求</h3>
                <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ approval.summary }}</p>
                <p class="mt-2 text-xs text-slate-500" aria-live="polite">
                  剩余 {{ formatTimeRemaining(approval.expiresAt, now) }}
                </p>
              </div>
            </div>
            <div class="mt-4 flex gap-2.5">
              <button
                type="button"
                class="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/40 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="decidingIds.has(approval.id)"
                @click="decide(approval.id, 'approve')"
              >
                {{ decidingIds.has(approval.id) ? '处理中…' : '允许' }}
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400/40 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="decidingIds.has(approval.id)"
                @click="decide(approval.id, 'deny')"
              >
                拒绝
              </button>
            </div>
          </article>

          <!-- High-risk action requests -->
          <article
            v-for="approval in approvalState.highRiskApprovals.value"
            :key="approval.id"
            class="rounded-xl border border-amber-200 bg-amber-50/50 p-4"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600"
              >
                <svg
                  class="h-4 w-4"
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
                  <h3 class="text-sm font-medium text-slate-900">高风险操作</h3>
                  <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    High risk
                  </span>
                </div>
                <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ approval.summary }}</p>
                <p
                  v-if="approval.payloadSummary"
                  class="mt-2 overflow-x-auto rounded-md border border-amber-200/60 bg-white/70 p-2 font-mono text-xs text-slate-600"
                >
                  {{ approval.payloadSummary }}
                </p>
                <ul v-if="approval.riskReasons?.length" class="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
                  <li v-for="reason in approval.riskReasons" :key="reason">{{ reason }}</li>
                </ul>
                <p class="mt-2 text-xs text-slate-500" aria-live="polite">
                  剩余 {{ formatTimeRemaining(approval.expiresAt, now) }}
                </p>
              </div>
            </div>
            <div class="mt-4 flex gap-2.5">
              <button
                type="button"
                class="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/40 active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="decidingIds.has(approval.id)"
                @click="decide(approval.id, 'approve')"
              >
                {{ decidingIds.has(approval.id) ? '处理中…' : '允许一次' }}
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400/40 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="decidingIds.has(approval.id)"
                @click="decide(approval.id, 'deny')"
              >
                拒绝
              </button>
            </div>
          </article>
        </TransitionGroup>
      </section>
    </div>

    <!-- Footer -->
    <footer class="border-t border-slate-100 px-5 py-3">
      <p class="text-center text-[11px] text-slate-400">
        通过命令行检查状态：
        <code class="rounded bg-slate-100 px-1 py-0.5 text-slate-600">tabbridge status --json</code>
      </p>
    </footer>
  </main>
</template>
