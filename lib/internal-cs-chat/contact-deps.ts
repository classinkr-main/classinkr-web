import "server-only"

// resolveContact 의 서버 연결(실제 저장소 함수). 화면·채널(어드민 API, 나중의 갈매봇·위컴 응답)이 이것을 넘긴다.
//
// 쓰는 자료(모두 repository 함수):
// - 고객 이름 찾기: getCrmUnifiedCustomers (통합 고객 목록 — 리드·NEO 계정·포털 고객, 60초 캐시 스냅샷)
// - 담당·딜·주문·수금·위험 사유·최근 연락: getCrmCustomer360 (고객 360)
// - 사람을 역할·권한으로 찾기: listAdminUserDirectoryCached (admin_profiles 역할·팀 역할·capabilities)
// - 한국 담당표: readActiveTeamContactsCached (internal_team_contacts 활성 KR 행, 60초 캐시 — 실패면 빈 표 + failed)
//   HQ 행은 넘기지 않는다 — 본사 카드는 HQ_DOMAINS 그대로(보충은 설계 메모 docs/active/internal-team-contacts-2026-11-26.md §5).
// - 과거 채널 상담(선택): searchConsultationEvidence — 질문 임베딩을 만드므로 consultations:true 일 때만 연결
//
// 이 연결을 쓰는 곳: 갈매봇(lib/admin-ai/server/deps.ts buildServerOrchestratorDeps — 어드민 위젯 /api/admin/ai/chat 와
// 위컴 수신구 lib/wecom/aibot-server.ts 가 함께 쓴다). 내부 CS 코파일럿(/admin/cs-chatbot)은 담당자 안내를 부르지 않는다.
//
// 없는 것(근거에 넣지 못함): 고객 단위 견적 작성자 조회(listQuotes 는 파트너 단위), 사내 CS 대화의 고객 연결 색인,
// 팀원 주간 보고·프로젝트 기록 저장소(lib/marketing/weekly-report-* 는 마케팅 지표 보고), 쇼룸 예약 어드민 화면.

import { listAdminUserDirectoryCached } from "@/lib/repositories/admin-users"
import { getCrmCustomer360, parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"
import { readActiveTeamContactsCached } from "@/lib/repositories/team-contacts"
import type { TeamContactRecord } from "@/lib/team-contacts/model"

import {
  KR_TOPICS,
  type CustomerOwnerEvidence,
  type CustomerRef,
  type KrContactRow,
  type KrContactTable,
  type KrTopicKey,
  type ResolveContactDeps,
  type StaffMember,
} from "./contact"
import { searchConsultationEvidence } from "./consultation-search"

/** 이름이 이보다 짧으면 질문 글 일치로 고객을 찾지 않는다(흔한 낱말과 겹친다). */
const MIN_NAME_LENGTH = 3
/** 서로 다른 이름 기준 최대 후보 수. 같은 이름의 고객은 이 수에 넣지 않고 모두 남긴다(경고 인원수가 잘리지 않게). */
const MAX_MATCHES = 3
const MAX_SAME_NAME = 20

function normalize(value: string) {
  return value.replace(/\s+/g, "").toLowerCase()
}

/**
 * 질문 글 안에 이름이 그대로 들어 있는 고객. 긴 이름이 먼저(짧은 이름이 긴 이름 안에 들어 있는 경우를 피한다).
 * 이름이 완전히 같은 고객이 여럿이면 하나만 고르지 않고 모두 남긴다(같은 키만 한 번으로 센다) —
 * 호출자가 첫 고객을 대표로, 나머지를 후보로 보인다.
 */
export function matchCustomersInText(question: string, rows: Array<{ key: string; name: string; href: string }>): CustomerRef[] {
  const haystack = normalize(question)
  const seenKeys = new Set<string>()
  const longerNames: string[] = []
  const acceptedNames = new Set<string>()
  const counts = new Map<string, number>()
  let distinct = 0
  return rows
    .filter((row) => {
      const name = normalize(row.name ?? "")
      return name.length >= MIN_NAME_LENGTH && haystack.includes(name)
    })
    .sort((a, b) => normalize(b.name).length - normalize(a.name).length)
    .filter((row) => {
      if (seenKeys.has(row.key)) return false
      const name = normalize(row.name)
      // 더 긴 이름 안에 들어 있는 짧은 이름만 버린다. 같은 이름은 버리지 않는다.
      if (longerNames.some((longer) => longer.length > name.length && longer.includes(name))) return false
      seenKeys.add(row.key)
      if (!acceptedNames.has(name)) {
        acceptedNames.add(name)
        longerNames.push(name)
      }
      return true
    })
    .filter((row) => {
      const name = normalize(row.name)
      const perName = (counts.get(name) ?? 0) + 1
      counts.set(name, perName)
      if (perName > MAX_SAME_NAME) return false
      if (perName > 1) return true
      distinct += 1
      return distinct <= MAX_MATCHES
    })
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

const KR_TOPIC_KEYS = new Set<string>(KR_TOPICS.map((topic) => topic.key))

/** DB 행(활성 KR) → 한국 담당표 행. 모르는 영역·비활성·본사 행은 뺀다. */
export function toKrContactRows(records: TeamContactRecord[]): KrContactRow[] {
  return records
    .filter((record) => record.org === "KR" && record.active && KR_TOPIC_KEYS.has(record.area))
    .map((record) => ({
      topic: record.area as KrTopicKey,
      role: record.role,
      primaryName: record.name,
      backupName: record.deputy,
      channel: record.channel,
      prepare: record.prep,
      adminLink: record.adminLink,
      verifiedAt: record.confirmedAt,
      note: record.note,
    }))
}

async function loadKrContacts(): Promise<KrContactTable> {
  const read = await readActiveTeamContactsCached()
  return { rows: read.failed ? [] : toKrContactRows(read.rows), failed: read.failed, warning: read.warning }
}

/**
 * customers:false — 고객사 갈래(통합 고객 목록·고객 360·과거 상담)를 끈다. 답이 여러 사람에게 보이는 곳(위컴 단체방)용:
 * 이 조회는 행위자 범위를 보지 않으므로 연결 단계에서 뺀다.
 */
export function buildContactDeps(
  options: { consultations?: boolean; customers?: boolean; names?: boolean } = {}
): ResolveContactDeps {
  // names:false — 한국 지사·모름 카드에 사람 이름(담당표·어드민 계정) 없이 역할만(위컴 단체방).
  const shared: ResolveContactDeps = { listStaff, loadKrContacts, ...(options.names === false ? { roleOnly: true } : {}) }
  if (options.customers === false) return shared
  return {
    ...shared,
    findCustomersInText,
    loadCustomerEvidence,
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
