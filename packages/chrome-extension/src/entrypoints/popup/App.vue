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
