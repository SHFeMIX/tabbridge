import { computed, readonly, ref } from 'vue'
import type { ApprovalRecord } from '@tabbridge/shared'

export function useApprovalState() {
  const approvals = ref<ApprovalRecord[]>([])

  const pendingApprovals = computed(() => approvals.value.filter((approval) => approval.status === 'pending'))
  const siteApprovals = computed(() => pendingApprovals.value.filter((approval) => approval.kind === 'site-access'))
  const highRiskApprovals = computed(() => pendingApprovals.value.filter((approval) => approval.kind === 'high-risk-action'))

  function setApprovals(nextApprovals: ApprovalRecord[]): void {
    approvals.value = nextApprovals
  }

  return {
    approvals: readonly(approvals),
    pendingApprovals,
    siteApprovals,
    highRiskApprovals,
    setApprovals,
  }
}
