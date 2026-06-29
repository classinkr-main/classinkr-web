import { describe, expect, it } from "vitest"

import { attentionFromQueueItem } from "@/lib/repositories/crm-manager-report"
import type { CrmPriorityItem } from "@/lib/crm/priority"

function item(overrides: Partial<CrmPriorityItem>): CrmPriorityItem {
  return {
    id: "x",
    source: "task",
    title: "할 일",
    subtitle: null,
    ownerName: "김지사",
    ownerKeys: ["김지사"],
    statusLabel: "할 일",
    score: 80,
    severity: "high",
    bucket: "today",
    bucketLabel: "오늘 처리",
    action: "do_task",
    actionLabel: "전화",
    reason: "2일 지연된 할 일",
    href: "/admin/crm/customers/leads?lead=1",
    dueAt: null,
    updatedAt: null,
    ...overrides,
  }
}

describe("attentionFromQueueItem", () => {
  it("maps overdue tasks (today bucket) to overdue_task", () => {
    expect(attentionFromQueueItem(item({ source: "task", bucket: "today" }))?.kind).toBe("overdue_task")
  })

  it("drops non-today tasks (future, not overdue)", () => {
    expect(attentionFromQueueItem(item({ source: "task", bucket: "watch" }))).toBeNull()
  })

  it("maps respond_lead leads to unresponded_lead", () => {
    expect(
      attentionFromQueueItem(item({ source: "lead", action: "respond_lead", bucket: "today" }))?.kind
    ).toBe("unresponded_lead")
  })

  it("ignores follow-up leads that are not first-response", () => {
    expect(attentionFromQueueItem(item({ source: "lead", action: "follow_up_lead" }))).toBeNull()
  })

  it("maps neo accounts to renewal_risk and carries owner/severity/href", () => {
    const result = attentionFromQueueItem(
      item({ source: "neo_account", action: "renew_account", severity: "critical", ownerName: "이매니저", href: "/x" })
    )
    expect(result).toMatchObject({ kind: "renewal_risk", ownerName: "이매니저", severity: "critical", href: "/x" })
  })
})
