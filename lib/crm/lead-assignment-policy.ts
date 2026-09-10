import { isTestLead } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

export type LeadAssignmentBlocker =
  | "missing"
  | "inactive"
  | "unconfirmed"
  | "test_lead"
  | "missing_contact"
  | "stale_30d"
  | "partial_duplicate_cohort"
  | "already_assigned"

export interface LeadAssignmentPolicyPreview {
  requested: number
  found: number
  /** 현재 데이터에는 확정 고객 owner나 승인된 라우팅 정책이 없어 항상 0이다. */
  automaticEvidenceReady: number
  manualReviewReady: number
  safeLeadIds: string[]
  blockedLeadIds: string[]
  blockerCounts: Record<LeadAssignmentBlocker, number>
  duplicateClusters: number
  partialDuplicateClusters: number
  generatedAt: string
}

const EMPTY_BLOCKERS: Record<LeadAssignmentBlocker, number> = {
  missing: 0,
  inactive: 0,
  unconfirmed: 0,
  test_lead: 0,
  missing_contact: 0,
  stale_30d: 0,
  partial_duplicate_cohort: 0,
  already_assigned: 0,
}

function phoneKey(value: string | undefined) {
  const digits = value?.replace(/\D/g, "") ?? ""
  return digits.length >= 8 ? `phone:${digits}` : null
}

function emailKey(value: string | undefined) {
  const email = value?.trim().toLowerCase() ?? ""
  return email ? `email:${email}` : null
}

function contactKeys(lead: LeadRecord) {
  return [phoneKey(lead.phone), emailKey(lead.email)].filter((value): value is string => Boolean(value))
}

function isActiveLead(lead: LeadRecord) {
  return lead.status === "new" || lead.status === "contacted"
}

function buildDuplicateComponents(leads: LeadRecord[]) {
  const parents = leads.map((_, index) => index)
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]]
      index = parents[index]
    }
    return index
  }
  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }
  const firstByContact = new Map<string, number>()

  leads.forEach((lead, index) => {
    for (const key of contactKeys(lead)) {
      const first = firstByContact.get(key)
      if (first === undefined) firstByContact.set(key, index)
      else union(first, index)
    }
  })

  const idsByRoot = new Map<number, string[]>()
  leads.forEach((lead, index) => {
    const root = find(index)
    const ids = idsByRoot.get(root) ?? []
    ids.push(lead.id)
    idsByRoot.set(root, ids)
  })

  const componentByLeadId = new Map<string, string[]>()
  for (const ids of idsByRoot.values()) {
    for (const id of ids) componentByLeadId.set(id, ids)
  }
  return componentByLeadId
}

/**
 * 담당자 자동 추천은 권위 있는 owner 연결이 있을 때만 가능하다. 현재 LeadRecord에는
 * 그 근거가 없으므로 채널·지역·라운드로빈을 추측하지 않고 0으로 닫는다. 대신 운영자가
 * 직접 담당자를 선택할 때 안전하게 검토 가능한 최소 코호트만 계산한다.
 */
export function buildLeadAssignmentPolicyPreview(
  allLeads: LeadRecord[],
  requestedIds: string[],
  nowMs = Date.now()
): LeadAssignmentPolicyPreview {
  const uniqueIds = Array.from(new Set(requestedIds.map((id) => id.trim()).filter(Boolean)))
  const selectedIds = new Set(uniqueIds)
  const activeLeads = allLeads.filter(isActiveLead)
  const allLeadById = new Map(allLeads.map((lead) => [lead.id, lead]))
  const leadById = new Map(activeLeads.map((lead) => [lead.id, lead]))
  const componentByLeadId = buildDuplicateComponents(activeLeads)
  const blockerCounts = { ...EMPTY_BLOCKERS }
  const safeLeadIds: string[] = []
  const blockedLeadIds: string[] = []
  const duplicateRoots = new Set<string>()
  const partialRoots = new Set<string>()

  for (const id of uniqueIds) {
    const lead = leadById.get(id)
    const blockers = new Set<LeadAssignmentBlocker>()
    if (!lead) {
      if (allLeadById.has(id)) blockers.add("inactive")
      else blockers.add("missing")
    }
    else {
      if (!lead.confirmed_at) blockers.add("unconfirmed")
      if (isTestLead(lead)) blockers.add("test_lead")
      if (contactKeys(lead).length === 0) blockers.add("missing_contact")
      if (lead.assigned_to) blockers.add("already_assigned")

      const createdAt = new Date(lead.timestamp).getTime()
      if (!Number.isFinite(createdAt) || nowMs - createdAt >= 30 * 24 * 60 * 60 * 1000) {
        blockers.add("stale_30d")
      }

      const component = componentByLeadId.get(id) ?? [id]
      if (component.length > 1) {
        const root = [...component].sort()[0]
        duplicateRoots.add(root)
        if (component.some((componentId) => !selectedIds.has(componentId))) {
          blockers.add("partial_duplicate_cohort")
          partialRoots.add(root)
        }
      }
    }

    if (blockers.size === 0) safeLeadIds.push(id)
    else {
      blockedLeadIds.push(id)
      for (const blocker of blockers) blockerCounts[blocker] += 1
    }
  }

  return {
    requested: uniqueIds.length,
    found: uniqueIds.length - blockerCounts.missing,
    automaticEvidenceReady: 0,
    manualReviewReady: safeLeadIds.length,
    safeLeadIds,
    blockedLeadIds,
    blockerCounts,
    duplicateClusters: duplicateRoots.size,
    partialDuplicateClusters: partialRoots.size,
    generatedAt: new Date(nowMs).toISOString(),
  }
}

export function hasLeadAssignmentBlockers(preview: LeadAssignmentPolicyPreview) {
  return preview.blockedLeadIds.length > 0 || preview.found !== preview.requested
}
