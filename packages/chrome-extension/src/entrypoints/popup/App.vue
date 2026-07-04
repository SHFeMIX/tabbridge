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
  <main class="relative min-w-96 overflow-hidden bg-slate-900 p-5 text-slate-400">
    <!-- ambient background -->
    <div
      class="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-cyan-400/[0.04] blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-indigo-400/[0.04] blur-3xl"
      aria-hidden="true"
    />

    <header class="relative flex items-center gap-3 border-b border-slate-800 pb-4">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 shadow-sm"
      >
        <svg
          class="h-5 w-5 text-cyan-400/80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
      </div>
      <div>
        <h1 class="text-base font-semibold tracking-tight text-slate-200">{{ extensionName }}</h1>
        <p class="text-xs font-medium text-slate-500">{{ extensionTagline }}</p>
      </div>
    </header>

    <section
      class="relative mt-4 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.03] p-3.5"
      aria-label="连接信息"
    >
      <div class="flex items-center gap-2.5">
        <span class="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/40 opacity-75" />
          <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <h2 class="text-sm font-medium text-emerald-100/80">Extension UI is available</h2>
      </div>
      <p class="mt-1.5 text-xs leading-relaxed text-emerald-200/50">
        Native bridge status is checked by <code class="rounded bg-emerald-950/20 px-1 py-0.5 text-emerald-200/70">tabbridge status --json</code>.
      </p>
    </section>

    <section class="relative mt-6" aria-label="待处理审批">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-600">待处理审批</h2>
        <span
          class="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs font-medium text-slate-400"
          :aria-label="`待处理审批 ${approvalState.pendingApprovals.value.length} 个`"
        >
          {{ approvalState.pendingApprovals.value.length }}
        </span>
      </div>

      <div v-if="approvalState.pendingApprovals.value.length === 0" class="py-10 text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/40">
          <svg
            class="h-6 w-6 animate-float text-slate-600"
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
        <p class="mt-4 text-sm font-medium text-slate-300">没有待处理的审批</p>
        <p class="mt-1 text-xs text-slate-500">TabBridge 正在后台运行</p>
      </div>

      <TransitionGroup name="approval-list" tag="div" class="relative">
        <article
          v-for="approval in approvalState.siteApprovals.value"
          :key="approval.id"
          class="mt-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4"
        >
          <div class="flex items-start gap-3.5">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/15 bg-cyan-500/10 text-cyan-400/70"
            >
              <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
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
              <h3 class="text-sm font-medium text-cyan-100/80">站点访问请求</h3>
              <p class="mt-1 text-sm leading-relaxed text-slate-400">{{ approval.summary }}</p>
              <p class="mt-2 text-xs font-medium text-slate-500" aria-live="polite">
                剩余 {{ formatTimeRemaining(approval.expiresAt, now) }}
              </p>
            </div>
          </div>
          <div class="mt-4 flex gap-2.5">
            <button
              type="button"
              class="flex-1 rounded-xl border border-transparent bg-cyan-600/80 px-3 py-2 text-sm font-medium text-white/90 shadow-sm hover:-translate-y-[1px] hover:bg-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              :disabled="decidingIds.has(approval.id)"
              @click="decide(approval.id, 'approve')"
            >
              {{ decidingIds.has(approval.id) ? '处理中…' : '允许' }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-xl border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-300 shadow-sm hover:-translate-y-[1px] hover:bg-slate-700/70 focus-visible:ring-2 focus-visible:ring-slate-500/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
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
          class="mt-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4"
        >
          <div class="flex items-start gap-3.5">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/15 bg-amber-500/10 text-amber-400/70"
            >
              <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
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
                <h3 class="text-sm font-medium text-amber-100/80">高风险操作</h3>
                <span class="rounded border border-amber-500/15 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200/70"
                >
                  High
                </span>
              </div>
              <p class="mt-1 text-sm leading-relaxed text-slate-400">{{ approval.summary }}</p>
              <p
                v-if="approval.payloadSummary"
                class="mt-2 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/50 p-2.5 font-mono text-xs text-slate-400"
              >
                {{ approval.payloadSummary }}
              </p>
              <ul v-if="approval.riskReasons?.length" class="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
                <li v-for="reason in approval.riskReasons" :key="reason">{{ reason }}</li>
              </ul>
              <p class="mt-2 text-xs font-medium text-slate-500" aria-live="polite">
                剩余 {{ formatTimeRemaining(approval.expiresAt, now) }}
              </p>
            </div>
          </div>
          <div class="mt-4 flex gap-2.5">
            <button
              type="button"
              class="flex-1 rounded-xl border border-transparent bg-amber-500/80 px-3 py-2 text-sm font-medium text-amber-950/80 shadow-sm hover:-translate-y-[1px] hover:bg-amber-500 focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              :disabled="decidingIds.has(approval.id)"
              @click="decide(approval.id, 'approve')"
            >
              {{ decidingIds.has(approval.id) ? '处理中…' : '允许一次' }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-xl border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-300 shadow-sm hover:-translate-y-[1px] hover:bg-slate-700/70 focus-visible:ring-2 focus-visible:ring-slate-500/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              :disabled="decidingIds.has(approval.id)"
              @click="decide(approval.id, 'deny')"
            >
              拒绝
            </button>
          </div>
        </article>
      </TransitionGroup>
    </section>
  </main>
</template>
