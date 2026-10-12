// 통합 고객 저장소 — 마지막 연락 읽기 모델(CT8) · NEO 신호(SG2) · 세그먼트 조건 AND(SG4) · 서버 정렬(C1) ·
// CSV 내보내기 계산(SG8)의 조립 계약. 원천은 전부 목으로 세우고(Home 연락 두 테이블은 가짜 PostgREST,
// Compass 는 브리지 목) 저장소 구현을 그대로 통과시킨다.
import { afterEach, describe, expect, it, vi } from "vitest"

import { SEGMENT_NONE_TOKEN } from "@/lib/crm/customer-segment-spec"

import { createFakePostgrest } from "./unified-fake-postgrest"

const NOW = new Date("2026-09-25T03:00:00.000Z")
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

function lead(id: string, phone: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    source: "contact_page",
    name: `리드 ${id}`,
    org: `학원 ${id}`,
    email: `${id}@example.com`,
    phone,
    timestamp: ago(40),
    status: "contacted",
    assigned_to: "김담당",
    confirmed_at: ago(40),
    ...extra,
  }
}

function account(accountId: string, phone: string | null, extra: Record<string, unknown> = {}) {
  return {
    accountId,
    name: `고객 ${accountId}`,
    ownerId: "neo-owner-1",
    ownerName: "박담당",
    phone,
    regionLabel: "부산",
    balance: 0,
    expireAt: ahead(400),
    lastClassAt: ago(3),
    uid: `uid-${accountId}`,
    orderAmount: 0,
    orderCount: 0,
    createdAt: ago(300),
    updatedAt: ago(90),
    riskLevel: "normal",
    riskReasons: [],
    depletionInDays: null,
    billingMode: "subscription",
    ...extra,
  }
}

interface LoadOptions {
  leads?: ReturnType<typeof lead>[]
  accounts?: ReturnType<typeof account>[]
  logs?: Array<Record<string, unknown>>
  events?: Array<Record<string, unknown>>
  homeContactFail?: boolean
  compassRows?: Array<Record<string, unknown>>
  compassDown?: boolean
  compassTruncated?: boolean
  tags?: Record<string, string[]>
}

async function loadRepository(options: LoadOptions = {}) {
  vi.resetModules()
  const compassMock = vi.fn().mockResolvedValue(
    options.compassDown
      ? { rows: [], down: true, error: "bridge down" }
      : { rows: options.compassRows ?? [], down: false, truncated: Boolean(options.compassTruncated) }
  )
  const fake = createFakePostgrest(
    {
      lead_contact_logs: (options.logs ?? []).map((row, index) => ({ id: `log-${index}`, ...row })),
      crm_customer_events: (options.events ?? []).map((row, index) => ({ id: `ev-${index}`, ...row })),
    },
    { failTables: options.homeContactFail ? new Set(["lead_contact_logs"]) : undefined }
  )
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
  vi.doMock("@/lib/compass/bridge", () => ({ getCompassLatestActivityByPhoneKeys: compassMock }))
  vi.doMock("@/lib/repositories/crm-customer-tags", () => ({
    getAllCustomerTagsMap: vi.fn().mockResolvedValue(options.tags ?? {}),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({ getLeads: vi.fn().mockResolvedValue(options.leads ?? []) }))
  vi.doMock("@/lib/repositories/lead-activity", () => ({ getLeadsActivitySummary: vi.fn().mockResolvedValue({}) }))
  vi.doMock("@/lib/crm/compass-demo-source", () => ({
    loadCompassDemoSource: vi.fn().mockResolvedValue({ demos: [], phoneKeysByCompassLeadId: new Map(), down: false }),
  }))
  vi.doMock("@/lib/portal/repositories/customers", () => ({
    listAllCustomerListItemsLite: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    listConfirmedLeadCustomerLinks: vi.fn().mockResolvedValue(new Map()),
    listConfirmedLeadNeoLinkLeadIds: vi.fn().mockResolvedValue(new Set()),
    listConfirmedLeadNeoAccountLinks: vi.fn().mockResolvedValue(new Map()),
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    crmContactTargetKey: (targetType: string, targetId: string) => `${targetType}:${targetId}`,
    getCrmCustomerContactMaps: vi.fn().mockResolvedValue({
      firstResponseByLead: new Map(),
      latestContactByTarget: new Map(
        (options.logs ?? []).map((row) => [`lead:${String(row.lead_id)}`, String(row.contacted_at)])
      ),
    }),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomers: vi.fn().mockResolvedValue({
      ok: true,
      error: null,
      latestSyncedAt: NOW.toISOString(),
      generatedAt: NOW.toISOString(),
      syncHealth: { shroffAccountSyncedAt: NOW.toISOString(), shroffAccountAgeHours: 1, staleAfterHours: 24, isShroffAccountStale: false },
      summary: { totalCount: 0, withEeoCount: 0, expiringSoonCount: 0, totalBalance: 0, totalOrderAmount: 0 },
      owners: [],
      rows: options.accounts ?? [],
    }),
  }))
  const repository = await import("@/lib/repositories/crm-unified-customers")
  return { repository, compassMock, fake }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("마지막 연락 읽기 모델(CT8)", () => {
  it("고객별 max(리드 연락 로그 · 사람 기록 이벤트 · Compass 활동) — 원천·채널·작성자까지 싣는다", async () => {
    const { repository, compassMock } = await loadRepository({
      leads: [lead("L1", "010-1111-2222"), lead("L2", "010-5555-6666")],
      accounts: [account("N1", "010-3333-4444"), account("N2", null)],
      logs: [{ lead_id: "L1", type: "call", contacted_at: ago(5), contacted_by: "김담당" }],
      events: [
        { target_type: "neo_account", target_id: "N1", source_type: "call", occurred_at: ago(10), created_by: "이담당", owner_name: null },
        { target_type: "lead", target_id: "L2", source_type: "manual_note", occurred_at: ago(1), created_by: "메모", owner_name: null },
      ],
      compassRows: [{ phone_key: "01011112222", lead_id: 9, occurred_at: ago(2), kind: "call", actor: "진소망" }],
    })

    const result = await repository.getCrmUnifiedCustomers({ now: NOW })
    const byKey = new Map(result.rows.map((row) => [row.key, row]))

    // L1: Home 로그(5일 전)보다 Compass 콜(2일 전)이 최근.
    expect(byKey.get("lead:L1")).toMatchObject({
      lastContactAt: ago(2),
      lastContactSource: "compass",
      lastContactChannel: "call",
      lastContactActor: "진소망",
    })
    // N1: Compass 에 없는 전화 — Home 사람 기록 이벤트.
    expect(byKey.get("neo:N1")).toMatchObject({ lastContactSource: "home_event", lastContactChannel: "call", lastContactActor: "이담당" })
    // L2: 내부 메모만 있음 → 연락 기록 없음. N2: 전화 없음 → Compass 조인 없음.
    expect(byKey.get("lead:L2")?.lastContactAt ?? null).toBeNull()
    expect(byKey.get("neo:N2")?.lastContactAt ?? null).toBeNull()
    expect(result.summary.noContactRecordCount).toBe(2)
    // 연락 원천 메타만 본다(compassRefs 는 Compass 리드 참조 조회 — 이 목은 흉내 내지 않는다).
    expect(result.meta).toMatchObject({ compass: "ok", homeContactDetail: "ok" })

    // 브리지에는 9자리 이상 정규화 전화 키만, 사람 활동 kind 와 자동 작성자 제외 목록을 넘긴다.
    const [keys, bridgeOptions] = compassMock.mock.calls[0]
    expect([...keys].sort()).toEqual(["01011112222", "01033334444", "01055556666"])
    expect(bridgeOptions.kinds).toContain("call")
    expect([...bridgeOptions.excludeActors]).toContain("BD시트")
  })

  it("Compass 가 끊기면 Home 기록만으로 계산하고 meta.compass=down 으로 알린다(경고 배너는 늘리지 않음)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { repository } = await loadRepository({
      leads: [lead("L1", "010-1111-2222")],
      logs: [{ lead_id: "L1", type: "sms", contacted_at: ago(5), contacted_by: "김담당" }],
      compassDown: true,
    })

    const result = await repository.getCrmUnifiedCustomers({ now: NOW })
    expect(result.meta.compass).toBe("down")
    expect(result.rows[0]).toMatchObject({ lastContactSource: "home_log", lastContactChannel: "sms" })
    expect(result.sources.warnings).toEqual([])
    errorSpy.mockRestore()
  })

  it("Home 세부 조회가 실패해도 시각 지도 폴백('Home 기록')으로 마지막 연락을 잃지 않는다", async () => {
    const { repository } = await loadRepository({
      leads: [lead("L1", "010-1111-2222")],
      logs: [{ lead_id: "L1", type: "sms", contacted_at: ago(5), contacted_by: "김담당" }],
      homeContactFail: true,
    })

    const result = await repository.getCrmUnifiedCustomers({ now: NOW })
    expect(result.meta.homeContactDetail).toBe("down")
    expect(result.rows[0]).toMatchObject({ lastContactAt: ago(5), lastContactSource: "home", lastContactChannel: null })
  })

  it("'30일+ 미접촉' 뷰는 마지막 연락 기준 — 기록 없음 포함, updatedAt(동기화 시각)은 보지 않는다", async () => {
    const { repository } = await loadRepository({
      accounts: [
        // 동기화 시각은 90일 전이지만 Compass 연락은 3일 전 — 미접촉이 아니다.
        account("RECENT", "010-3333-4444"),
        account("STALE", "010-7777-8888"),
        account("NONE", null),
      ],
      compassRows: [
        { phone_key: "01033334444", lead_id: 1, occurred_at: ago(3), kind: "call", actor: "A" },
        { phone_key: "01077778888", lead_id: 2, occurred_at: ago(45), kind: "call", actor: "B" },
      ],
    })

    const dormant = await repository.getCrmUnifiedCustomers({ view: "dormant", now: NOW })
    expect(dormant.rows.map((row) => row.key).sort()).toEqual(["neo:NONE", "neo:STALE"])
    expect(dormant.summary.noContactRecordCount).toBe(1)
    const recent = await repository.getCrmUnifiedCustomers({ view: "recent_contact", now: NOW })
    expect(recent.rows.map((row) => row.key)).toEqual(["neo:RECENT"])
  })
})

describe("NEO 신호(SG2)와 상태 라벨 정합(F4)", () => {
  it("소진 예상·과금 방식·위험 등급(+사유)·최근 수업일·통화별 금액을 통합 행에 싣는다", async () => {
    const { repository } = await loadRepository({
      accounts: [
        account("N1", null, {
          depletionInDays: 12,
          billingMode: "consumption",
          riskLevel: "soon",
          riskReasons: [{ code: "recharge_due", label: "재충전 임박" }],
          balance: 3_000,
          orderAmount: 1_500,
        }),
      ],
    })

    const result = await repository.getCrmUnifiedCustomers({ now: NOW })
    expect(result.rows[0]).toMatchObject({
      depletionInDays: 12,
      billingMode: "consumption",
      riskLevel: "soon",
      riskReasonLabels: ["재충전 임박"],
      lastClassAt: ago(3),
      balance: 3_000,
      orderAmountUsd: 1_500,
    })
  })

  it("'관리 필요' 라벨은 관리 필요 뷰(42점+)와 같은 판정 — 42점 미만 엔진 항목은 '관찰'", async () => {
    const { repository } = await loadRepository({
      accounts: [
        // 잔액 소진 · 최근 수업 없음 → 엔진 38점(휴면 점검) — 관리 필요 뷰 밖.
        account("LOW", null, { balance: 0, lastClassAt: ago(120), riskReasons: [{ code: "depleted_balance" }] }),
        // 10일 내 만료 → 연장 제안(90점대) — 관리 필요.
        account("HIGH", null, { expireAt: ahead(10) }),
      ],
    })

    const result = await repository.getCrmUnifiedCustomers({ now: NOW })
    const byKey = new Map(result.rows.map((row) => [row.key, row]))
    expect(byKey.get("neo:LOW")).toMatchObject({ lifecycle: "active_account", statusLabel: "관찰" })
    expect(byKey.get("neo:HIGH")).toMatchObject({ lifecycle: "account_risk", statusLabel: "관리 필요" })
    const needsCare = await repository.getCrmUnifiedCustomers({ view: "needs_care", now: NOW })
    expect(needsCare.rows.every((row) => row.statusLabel === "관리 필요")).toBe(true)
  })
})

describe("세그먼트 조건 AND(SG4) · 서버 정렬(C1) · 내보내기(SG8)", () => {
  async function fixture() {
    return loadRepository({
      leads: [lead("L1", "010-1111-2222", { assigned_to: "김담당" })],
      accounts: [
        account("A", null, { expireAt: ahead(10), riskLevel: "urgent", billingMode: "consumption", depletionInDays: 5, balance: 20_000 }),
        account("B", null, { expireAt: ahead(20), riskLevel: "soon", billingMode: "subscription", regionLabel: "경기" }),
        account("C", null, { expireAt: ahead(50), riskLevel: "normal", billingMode: "consumption", ownerName: "최담당", ownerId: "neo-9" }),
      ],
      tags: { "neo_account:A": ["VIP", "재계약"], "neo_account:B": ["VIP"] },
      compassRows: [{ phone_key: "01011112222", lead_id: 1, occurred_at: ago(40), kind: "call", actor: "A" }],
    })
  }

  it("조건은 저장 뷰·라벨·검색과 AND 로 묶이고, 조건별·칩별 단독 건수는 현재 베이스 기준이다", async () => {
    const { repository } = await fixture()
    const result = await repository.getCrmUnifiedCustomers({
      now: NOW,
      segment: { expDays: 30, billing: ["consumption"] },
    })

    expect(result.rows.map((row) => row.key)).toEqual(["neo:A"])
    expect(result.segment.active).toBe(true)
    expect(result.segment.baseTotal).toBe(4)
    expect(result.segment.total).toBe(1)
    expect(result.segment.conditionCounts).toEqual({ expDays: 2, billing: 2 })
    expect(result.segment.optionCounts["expDays:60"]).toBe(3)
    expect(result.segment.optionCounts["risk:urgent"]).toBe(1)
    expect(result.segment.optionCounts["kinds:lead"]).toBe(1)
    expect(result.segment.labels).toEqual(["만료 30일 이내", "과금 충전제"])
    // 저장 뷰 칩 건수도 같은 조건 범위로 센다(목록과 칩 숫자 정합).
    expect(result.summary.viewCounts.expiring).toBe(1)

    const withView = await repository.getCrmUnifiedCustomers({ now: NOW, view: "expiring", segment: { risk: ["soon"] } })
    expect(withView.rows.map((row) => row.key)).toEqual(["neo:B"])
    expect(withView.segment.baseTotal).toBe(2)
  })

  it("무연락 조건은 기록 없음을 포함하고 그 수를 따로 센다 · 라벨 모두/하나 · 담당 복수", async () => {
    const { repository } = await fixture()
    const noContact = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { noContactDays: 30 } })
    expect(noContact.rows).toHaveLength(4)
    expect(noContact.segment.noContactNoRecordCount).toBe(3)

    const all = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { tagsAll: ["vip", "재계약"] } })
    expect(all.rows.map((row) => row.key)).toEqual(["neo:A"])
    const any = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { tagsAny: ["VIP"] } })
    expect(any.rows.map((row) => row.key).sort()).toEqual(["neo:A", "neo:B"])
    const owners = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { owners: ["최담당", "김담당"] } })
    expect(owners.rows.map((row) => row.key).sort()).toEqual(["lead:L1", "neo:C"])
    expect(owners.segment.facets.regions.map((facet) => facet.label)).toContain("부산")
  })

  it("정렬은 조건 전체를 정렬한 뒤 페이지를 자른다 — 다음 페이지가 이어진다", async () => {
    const { repository } = await fixture()
    const sort = { key: "name" as const, direction: "desc" as const }
    const first = await repository.getCrmUnifiedCustomers({ now: NOW, sort, limit: 2, offset: 0 })
    const second = await repository.getCrmUnifiedCustomers({ now: NOW, sort, limit: 2, offset: 2 })
    expect([...first.rows, ...second.rows].map((row) => row.name)).toEqual(["학원 L1", "고객 C", "고객 B", "고객 A"])
    expect(first.sort).toEqual(sort)

    // 마지막 연락 오름차순 — 기록 없음은 방향과 무관하게 맨 뒤.
    const byContact = await repository.getCrmUnifiedCustomers({ now: NOW, sort: { key: "last_contact", direction: "asc" } })
    expect(byContact.rows[0].key).toBe("lead:L1")
  })

  it("CSV 계산은 페이지가 아니라 조건 전체(상한까지) — 절단 표시와 선택 키 AND", async () => {
    const { repository } = await fixture()
    const capped = await repository.getCrmUnifiedCustomersForExport({ now: NOW }, 2)
    expect(capped).toMatchObject({ total: 4, truncated: true, limit: 2 })
    expect(capped.rows).toHaveLength(2)

    const selected = await repository.getCrmUnifiedCustomersForExport({ now: NOW, keys: ["neo:B", "neo:Z"] })
    expect(selected.rows.map((row) => row.key)).toEqual(["neo:B"])
    expect(selected.truncated).toBe(false)
  })
})

describe("리뷰 수정(2026-09-25) — 칩·뷰 건수 정합 · NEO 미배정 · 선택지 절단 표시", () => {
  it("'무연락 30일+' 칩 건수 = '30일+ 미접촉' 뷰 건수 — 종료 리드는 둘 다 뺀다", async () => {
    const { repository } = await loadRepository({
      leads: [
        lead("OPEN", "010-1111-2222"),
        lead("LOST", "010-2222-3333", { status: "lost" }),
        lead("DONE", "010-3333-4444", { status: "converted" }),
      ],
      accounts: [account("N1", null)],
    })

    const result = await repository.getCrmUnifiedCustomers({ now: NOW })
    expect(result.summary.viewCounts.dormant).toBe(2)
    expect(result.segment.optionCounts["noContactDays:30"]).toBe(result.summary.viewCounts.dormant)

    const chip = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { noContactDays: 30 } })
    expect(chip.rows.map((row) => row.key).sort()).toEqual(["lead:OPEN", "neo:N1"])
    expect(chip.segment.noContactNoRecordCount).toBe(2)
    const view = await repository.getCrmUnifiedCustomers({ now: NOW, view: "dormant" })
    expect(view.rows.map((row) => row.key).sort()).toEqual(chip.rows.map((row) => row.key).sort())
  })

  it("NEO 자리표시 담당('담당 미지정')은 미배정 — __none 조건이 잡고 선택지에 따로 나오지 않는다", async () => {
    const { repository } = await loadRepository({
      leads: [lead("L1", "010-1111-2222", { assigned_to: null })],
      accounts: [account("NA", null, { ownerId: null, ownerName: "담당 미지정" }), account("NB", null)],
    })

    const none = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { owners: [SEGMENT_NONE_TOKEN] } })
    expect(none.rows.map((row) => row.key).sort()).toEqual(["lead:L1", "neo:NA"])
    const owners = none.segment.facets.owners
    expect(owners.map((facet) => facet.label)).not.toContain("담당 미지정")
    expect(owners.find((facet) => facet.value === SEGMENT_NONE_TOKEN)).toMatchObject({ label: "미배정", count: 2 })
    expect(owners.find((facet) => facet.value === "박담당")?.count).toBe(1)

    // 자리표시 이름으로 온 옛 딥링크도 같은 조건이다.
    const legacy = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { owners: ["담당 미지정"] } })
    expect(legacy.segment.spec).toEqual({ owners: [SEGMENT_NONE_TOKEN] })
    expect(legacy.rows.map((row) => row.key).sort()).toEqual(["lead:L1", "neo:NA"])
  })

  it("선택지는 상위 40개 + 켜진 값 + 미배정 — 숨긴 수를 facetHiddenCounts 로 알린다(조용한 절단 금지)", async () => {
    const accounts = Array.from({ length: 45 }, (_, index) =>
      account(`N${index}`, null, { ownerId: `neo-${index}`, ownerName: `담당${String(index).padStart(2, "0")}` })
    )
    accounts.push(account("NX", null, { ownerId: null, ownerName: "담당 미지정" }))
    const { repository } = await loadRepository({ accounts })

    const plain = await repository.getCrmUnifiedCustomers({ now: NOW })
    expect(plain.segment.facets.owners).toHaveLength(41)
    expect(plain.segment.facets.owners.at(-1)).toMatchObject({ value: SEGMENT_NONE_TOKEN, count: 1 })
    expect(plain.segment.facets.owners.some((facet) => facet.value === "담당44")).toBe(false)
    expect(plain.segment.facetHiddenCounts).toEqual({ owners: 5, regions: 0, tags: 0 })

    // 딥링크로 고른 값(상위 40개 밖)은 실제 건수로 싣고, 숨긴 수에서 뺀다.
    const selected = await repository.getCrmUnifiedCustomers({ now: NOW, segment: { owners: ["담당44"] } })
    expect(selected.rows.map((row) => row.key)).toEqual(["neo:N44"])
    expect(selected.segment.facets.owners.find((facet) => facet.value === "담당44")?.count).toBe(1)
    expect(selected.segment.facetHiddenCounts.owners).toBe(4)
  })
})
