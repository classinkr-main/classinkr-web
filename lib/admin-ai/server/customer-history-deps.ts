import "server-only"

// 고객 이력(customer-history.ts)의 서버 연결 — 저장소 함수만 쓴다(마이그레이션·새 표 없음).
//
//  - 고객 찾기: 담당자 찾기와 같은 findCustomersInText(CRM 통합 고객 이름 일치 — buildContactDeps 가 넘긴 것). 없으면 열린 화면 고객만.
//  - 기록 대상: 고객 키(neo:{계정 id}·lead:{리드 id}, parseUnifiedCustomerKey). 리드가 NEO 계정에 확정 연결돼 있으면
//    그 계정 기록도 읽는다(findConfirmedLeadNeoLink — 고객 360 과 같은 확정 링크만, 이름 유사도로 잇지 않는다).
//  - 담당 영업: NEO 계정은 crm_neo_customer_snapshots.owner_name(getCrmNeoCustomerSnapshotOwner), 리드는 leads.assigned_to.
//    연결된 리드는 NEO 담당을 먼저 쓰고, 리드 담당이 다르면 안내 줄로 밝힌다.
//  - 기록: listCrmCustomerEventsByTags(태그가 겹치는 최근 기록 — 제목·요지·다음 할 일·출처 칸만, 본문·녹음 없음).
// 로그에는 단계 이름과 오류 종류만 남긴다(질문·고객 이름·기록 글 없음).
import { parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"
import { listCrmCustomerEventsByTags } from "@/lib/repositories/crm-events"
import { getCrmNeoCustomerSnapshotOwner } from "@/lib/repositories/crm-neo-customer-snapshots"
import { findConfirmedLeadNeoLink } from "@/lib/repositories/crm-source-links"
import { getLeadById } from "@/lib/repositories/leads"
import type { CustomerRef } from "@/lib/internal-cs-chat/contact"

import type { CustomerHistoryDeps, CustomerHistoryOwner, CustomerHistoryProfile, CustomerHistoryTarget } from "./customer-history"

function logged<T>(step: string, task: () => Promise<T>): Promise<T> {
  return task().catch((error: unknown) => {
    console.warn(`[admin-ai/customer-history] step_failed step=${step} code=${error instanceof Error ? error.name.replace(/\W/g, "") : "unknown"}`)
    throw error
  })
}

const sameName = (a: string, b: string) => a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase()

interface ProfileReaders {
  neoOwner: typeof getCrmNeoCustomerSnapshotOwner
  lead: typeof getLeadById
  leadNeoLink: typeof findConfirmedLeadNeoLink
}

const SERVER_READERS: ProfileReaders = {
  neoOwner: getCrmNeoCustomerSnapshotOwner,
  lead: getLeadById,
  leadNeoLink: findConfirmedLeadNeoLink,
}

/** 고객 키 → 기록 대상과 담당 영업. 담당·연결 조회 실패는 던지지 않고 ownerFailed·안내 줄로 남긴다. 시험은 readers 를 바꾼다. */
export async function loadCustomerHistoryProfile(
  customer: CustomerRef,
  readers: ProfileReaders = SERVER_READERS
): Promise<CustomerHistoryProfile | null> {
  const parsed = parseUnifiedCustomerKey(customer.key)
  if (!parsed) return null

  if (parsed.source === "neo") {
    const targets: CustomerHistoryTarget[] = [{ targetType: "neo_account", targetId: parsed.entityId }]
    try {
      const snapshot = await logged("neo_owner", () => readers.neoOwner(parsed.entityId))
      const owner: CustomerHistoryOwner | null = snapshot ? { name: snapshot.ownerName, from: "neo", ...(snapshot.isStale ? { stale: true } : {}) } : null
      return { targets, owner, uid: snapshot?.uid ?? null, ...(snapshot ? {} : { notes: ["NEO 스냅숏에 이 계정이 없어 담당 영업을 확인하지 못했습니다."] }) }
    } catch {
      return { targets, owner: null, ownerFailed: true }
    }
  }

  const targets: CustomerHistoryTarget[] = [{ targetType: "lead", targetId: parsed.entityId }]
  const notes: string[] = []
  const [leadResult, linkResult] = await Promise.allSettled([
    logged("lead", () => readers.lead(parsed.entityId)),
    logged("lead_neo_link", () => readers.leadNeoLink(parsed.entityId)),
  ])
  const leadOwnerName = leadResult.status === "fulfilled" ? leadResult.value?.assigned_to?.trim() || null : null
  let owner: CustomerHistoryOwner | null = leadOwnerName ? { name: leadOwnerName, from: "lead" } : null
  let ownerFailed = leadResult.status === "rejected"
  let uid: string | null = null

  if (linkResult.status === "rejected") {
    notes.push("연결된 NEO 계정을 확인하지 못해 리드 기록만 봅니다.")
  } else if (linkResult.value) {
    targets.push({ targetType: "neo_account", targetId: linkResult.value.targetId })
    try {
      const snapshot = await logged("neo_owner", () => readers.neoOwner(linkResult.value!.targetId))
      uid = snapshot?.uid ?? null
      if (snapshot?.ownerName) {
        const neoOwner: CustomerHistoryOwner = { name: snapshot.ownerName, from: "neo", ...(snapshot.isStale ? { stale: true } : {}) }
        if (leadOwnerName && !sameName(leadOwnerName, snapshot.ownerName)) notes.push(`리드 담당은 ${leadOwnerName}입니다.`)
        owner = neoOwner
        ownerFailed = false
      }
    } catch {
      if (!owner) ownerFailed = true
    }
  }
  return { targets, owner, ...(ownerFailed ? { ownerFailed } : {}), uid, ...(notes.length ? { notes } : {}) }
}

export function buildCustomerHistoryDeps(options: { findCustomersInText?: (question: string) => Promise<CustomerRef[]> } = {}): CustomerHistoryDeps {
  return {
    ...(options.findCustomersInText ? { findCustomersInText: options.findCustomersInText } : {}),
    loadProfile: (customer) => loadCustomerHistoryProfile(customer),
    listEvents: async ({ targets, tags, limit, from, to }) => {
      const result = await logged("events", () => listCrmCustomerEventsByTags({ targets, tags, limit, from, to }))
      return {
        events: result.rows.map((row) => ({
          id: row.id,
          occurredAt: row.occurredAt,
          title: row.title,
          summary: row.summary,
          nextActions: row.nextActions.map((action) => ({ title: action.title, dueAt: action.dueAt, done: action.done })),
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          tags: row.tags,
        })),
        total: result.total,
        unavailable: result.ok ? null : result.message,
      }
    },
  }
}
