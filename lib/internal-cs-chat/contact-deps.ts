import "server-only"

// resolveContact 의 서버 연결(실제 저장소 함수). 화면·채널(어드민 API, 나중의 갈매봇·위컴 응답)이 이것을 넘긴다.
//
// 쓰는 자료(모두 기존 repository 함수, 새 쿼리·DB 변경 없음):
// - 고객 이름 찾기: getCrmUnifiedCustomers (통합 고객 목록 — 리드·NEO 계정·포털 고객, 60초 캐시 스냅샷)
// - 담당·딜·주문·수금·위험 사유·최근 연락: getCrmCustomer360 (고객 360)
// - 사람을 역할·권한으로 찾기: listAdminUserDirectoryCached (admin_profiles 역할·팀 역할·capabilities)
// - 과거 채널 상담(선택): searchConsultationEvidence — 질문 임베딩을 만드므로 consultations:true 일 때만 연결
//
// 없는 것(근거에 넣지 못함): 고객 단위 견적 작성자 조회(listQuotes 는 파트너 단위), 사내 CS 대화의 고객 연결 색인,
// 팀원 주간 보고·프로젝트 기록 저장소(lib/marketing/weekly-report-* 는 마케팅 지표 보고), 쇼룸 예약 어드민 화면.

import { listAdminUserDirectoryCached } from "@/lib/repositories/admin-users"
import { getCrmCustomer360, parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"

import type { CustomerOwnerEvidence, CustomerRef, ResolveContactDeps, StaffMember } from "./contact"
import { searchConsultationEvidence } from "./consultation-search"

/** 이름이 이보다 짧으면 질문 글 일치로 고객을 찾지 않는다(흔한 낱말과 겹친다). */
const MIN_NAME_LENGTH = 3
const MAX_MATCHES = 3

function normalize(value: string) {
  return value.replace(/\s+/g, "").toLowerCase()
}

/** 질문 글 안에 이름이 그대로 들어 있는 고객. 긴 이름이 먼저(짧은 이름이 긴 이름 안에 들어 있는 경우를 피한다). */
export function matchCustomersInText(question: string, rows: Array<{ key: string; name: string; href: string }>): CustomerRef[] {
  const haystack = normalize(question)
  const seen = new Set<string>()
  return rows
    .filter((row) => {
      const name = normalize(row.name ?? "")
      return name.length >= MIN_NAME_LENGTH && haystack.includes(name)
    })
    .sort((a, b) => normalize(b.name).length - normalize(a.name).length)
    .filter((row) => {
      const name = normalize(row.name)
      if ([...seen].some((longer) => longer.includes(name))) return false
      seen.add(name)
      return true
    })
    .slice(0, MAX_MATCHES)
    .map((row) => ({ key: row.key, name: row.name, href: row.href }))
}

async function findCustomersInText(question: string): Promise<CustomerRef[]> {
  const list = await getCrmUnifiedCustomers({ limit: 2_000, includeUnconfirmed: false })
  return matchCustomersInText(question, list.rows)
}

async function loadCustomerEvidence(customer: CustomerRef): Promise<CustomerOwnerEvidence | null> {
  const parsed = parseUnifiedCustomerKey(customer.key)
  if (!parsed) return null
  const view = await getCrmCustomer360(parsed, { eventsLimit: 5, tasksLimit: 1, dealsLimit: 50 })
  if (!view.found) return null
  const dealOwners = [
    ...new Set(view.deals.rows.map((deal) => deal.ownerNameSnapshot?.trim()).filter((name): name is string => Boolean(name))),
  ]
  const issues = [
    ...view.risk.reasons,
    ...(view.serviceRisk?.reasons.map((reason) => reason.label) ?? []),
  ]
  return {
    ownerName: view.header?.ownerName ?? null,
    ownerSource: view.header?.sourceLabel ? `${view.header.sourceLabel} 담당` : null,
    deals: { total: view.deals.summary.total, open: view.deals.summary.open, ownerNames: dealOwners },
    orders: view.money.available ? view.money.orders.length : null,
    collections: view.money.available ? view.money.collections.length : null,
    issues,
    activityTotal: view.activity.summary.total,
    lastContactAt: view.contactSummary.last?.at ?? null,
    lastContactActor: view.contactSummary.last?.actor ?? null,
    generatedAt: view.generatedAt,
    warnings: view.health.ok ? [] : view.health.warnings,
  }
}

async function listStaff(): Promise<StaffMember[]> {
  const directory = await listAdminUserDirectoryCached()
  return directory.users.map((user) => ({
    displayName: user.displayName,
    role: user.role,
    teamRole: user.teamRole ?? null,
    capabilities: user.capabilities ?? [],
    active: user.status === "ACTIVE",
  }))
}

export function buildContactDeps(options: { consultations?: boolean } = {}): ResolveContactDeps {
  return {
    findCustomersInText,
    loadCustomerEvidence,
    listStaff,
    ...(options.consultations
      ? {
          searchConsultations: async (question: string, customer: CustomerRef) => {
            const hits = await searchConsultationEvidence(question, { limit: 8 })
            const name = normalize(customer.name)
            return hits
              .filter((hit) => hit.matchedOrg && normalize(hit.matchedOrg).includes(name))
              .map((hit) => ({ conversationId: hit.conversationId, occurredAt: hit.occurredAt }))
          },
        }
      : {}),
  }
}
