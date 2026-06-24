<script setup lang="ts">
import { onMounted } from 'vue'
import { useApprovalState } from '../../ui/useApprovalState'

const extensionName = 'TabBridge'
const approvalState = useApprovalState()

onMounted(() => {
  chrome.runtime?.sendMessage?.({ type: 'tabbridge.popup.listApprovals' }, (response) => {
    if (response?.ok && Array.isArray(response.data?.approvals)) {
      approvalState.setApprovals(response.data.approvals)
    }
  })
})

function decide(id: string, decision: 'approve' | 'deny'): void {
  chrome.runtime?.sendMessage?.({ type: 'tabbridge.popup.decideApproval', id, decision }, (response) => {
    if (response?.ok && Array.isArray(response.data?.approvals)) {
      approvalState.setApprovals(response.data.approvals)
    }
  })
}
</script>

<template>
  <main class="min-w-96 bg-slate-950 p-4 text-slate-100">
    <header class="border-b border-slate-800 pb-3">
      <h1 class="text-lg font-semibold">{{ extensionName }}</h1>
      <p class="mt-1 text-xs text-slate-400">Local bridge for authorized, already-open Chrome tabs.</p>
    </header>

    <section class="mt-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Bridge status</h2>
      <p class="mt-2 rounded-md border border-emerald-800 bg-emerald-950 px-3 py-2 text-sm text-emerald-100">
        Extension UI is available. Native bridge status is checked by <code>tabbridge status --json</code>.
      </p>
    </section>

    <section class="mt-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Pending approvals</h2>
      <p v-if="approvalState.pendingApprovals.value.length === 0" class="mt-2 text-sm text-slate-400">No pending approvals.</p>

      <article
        v-for="approval in approvalState.siteApprovals.value"
        :key="approval.id"
        class="mt-3 rounded-lg border border-sky-800 bg-sky-950 p-3"
      >
        <h3 class="font-medium text-sky-100">Site access request</h3>
        <p class="mt-1 text-sm text-sky-200">{{ approval.summary }}</p>
        <div class="mt-3 flex gap-2">
          <button class="rounded bg-sky-300 px-3 py-1 text-sm font-semibold text-sky-950" @click="decide(approval.id, 'approve')">Allow</button>
          <button class="rounded border border-sky-700 px-3 py-1 text-sm text-sky-100" @click="decide(approval.id, 'deny')">Deny</button>
        </div>
      </article>

      <article
        v-for="approval in approvalState.highRiskApprovals.value"
        :key="approval.id"
        class="mt-3 rounded-lg border border-amber-700 bg-amber-950 p-3"
      >
        <h3 class="font-medium text-amber-100">High-risk action</h3>
        <p class="mt-1 text-sm text-amber-200">{{ approval.summary }}</p>
        <p v-if="approval.payloadSummary" class="mt-2 rounded bg-amber-900 px-2 py-1 font-mono text-xs text-amber-100">{{ approval.payloadSummary }}</p>
        <ul v-if="approval.riskReasons?.length" class="mt-2 list-disc pl-5 text-xs text-amber-200">
          <li v-for="reason in approval.riskReasons" :key="reason">{{ reason }}</li>
        </ul>
        <div class="mt-3 flex gap-2">
          <button class="rounded bg-amber-300 px-3 py-1 text-sm font-semibold text-amber-950" @click="decide(approval.id, 'approve')">Allow once</button>
          <button class="rounded border border-amber-700 px-3 py-1 text-sm text-amber-100" @click="decide(approval.id, 'deny')">Deny</button>
        </div>
      </article>
    </section>
  </main>
</template>
