import "server-only"

import { createHash } from "node:crypto"

import type { LeadRecord } from "@/lib/repositories/leads"

export interface LeadAssignmentSnapshotRoster {
  healthy: boolean
  ownerKeys: string[]
}

export function buildLeadAssignmentExpectedVersions(allLeads: LeadRecord[]) {
  return Object.fromEntries(
    allLeads.map((lead) => [lead.id, lead.updated_at ?? null])
  ) as Record<string, string | null>
}

/**
 * 배정 미리보기와 적용 사이에 리드·중복 코호트·담당자 명단이 바뀌었는지 감지한다.
 * 전체 활성 리드 200여 건의 최소 상태만 해시하므로 PII를 응답에 싣지 않으면서도,
 * 선택 밖 중복 상대가 새로 생긴 경우까지 fail-closed로 잡는다.
 */
export function buildLeadAssignmentSnapshotToken(
  allLeads: LeadRecord[],
  requestedIds: string[],
  roster: LeadAssignmentSnapshotRoster
) {
  const requested = Array.from(new Set(requestedIds.map((id) => id.trim()).filter(Boolean))).sort()
  const leadState = allLeads
    .map((lead) => ({
      id: lead.id,
      status: lead.status,
      assignedTo: lead.assigned_to?.trim() || null,
      confirmedAt: lead.confirmed_at ?? null,
      createdAt: lead.timestamp,
      updatedAt: lead.updated_at ?? null,
      // 연락처 원문은 서버 안에서만 해시 입력으로 사용된다. 토큰에서 역산할 수 없다.
      phone: lead.phone?.replace(/\D/g, "") || null,
      email: lead.email?.trim().toLowerCase() || null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        requested,
        roster: {
          healthy: roster.healthy,
          ownerKeys: [...roster.ownerKeys].sort(),
        },
        leadState,
      })
    )
    .digest("base64url")

  return `v1:${digest}`
}
