// 고객 이력 서버 연결 — 고객 키 → 기록 대상·담당 영업, 저장소 두 함수(태그 기록·NEO 담당)의 쿼리 모양.
// 저장소는 기록형 가짜 Supabase(DB·네트워크 없음). 기관·사람 이름은 가짜.
import { afterEach, describe, expect, it, vi } from "vitest"

import { loadCustomerHistoryProfile } from "@/lib/admin-ai/server/customer-history-deps"
import type { CustomerRef } from "@/lib/internal-cs-chat/contact"
import type { CrmNeoCustomerSnapshotOwner } from "@/lib/repositories/crm-neo-customer-snapshots"
import type { LeadRecord } from "@/lib/repositories/leads"

import { createRecordingSupabaseClient, filterValue, type RecordedQuery } from "../../helpers/recording-supabase-client"

const NEO: CustomerRef = { key: "neo:acc-100", name: "가나학원", href: "/admin/crm/customers/accounts?account=acc-100" }
const LEAD: CustomerRef = { key: "lead:lead-200", name: "다라에듀", href: "/admin/crm/customers/leads?lead=lead-200" }

function snapshot(overrides: Partial<CrmNeoCustomerSnapshotOwner> = {}): CrmNeoCustomerSnapshotOwner {
  return {
    accountId: "acc-100",
    accountName: "가나학원",
    ownerId: "owner-1",
    ownerName: "담당자 A",
    uid: "100200",
    isStale: false,
    sourceSyncedAt: "2026-11-25T00:00:00.000Z",
    ...overrides,
  }
}

function readers(options: {
  neo?: CrmNeoCustomerSnapshotOwner | null | Error
  lead?: Partial<LeadRecord> | null | Error
  link?: { targetId: string } | null | Error
} = {}) {
  const settle = <T,>(value: T | Error) => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value))
  return {
    neoOwner: vi.fn(async () => settle(options.neo === undefined ? snapshot() : options.neo)),
    lead: vi.fn(async () => settle((options.lead === undefined ? { assigned_to: "담당자 B" } : options.lead) as LeadRecord | null | Error)),
    leadNeoLink: vi.fn(async () => settle(options.link === undefined ? null : options.link)),
  }
}

describe("loadCustomerHistoryProfile — 고객 키 → 기록 대상·담당 영업", () => {
  afterEach(() => vi.restoreAllMocks())

  it("NEO 고객 — 계정 기록을 읽고 담당 영업·UID 는 NEO 스냅숏에서", async () => {
    const r = readers({ neo: snapshot({ isStale: true }) })
    const profile = await loadCustomerHistoryProfile(NEO, r)
    expect(profile).toEqual({
      targets: [{ targetType: "neo_account", targetId: "acc-100" }],
      owner: { name: "담당자 A", from: "neo", stale: true },
      uid: "100200",
    })
    expect(r.neoOwner).toHaveBeenCalledWith("acc-100")
    expect(r.lead).not.toHaveBeenCalled()
  })

  it("NEO 스냅숏에 없으면 담당 없음 + 안내, 읽지 못하면 ownerFailed(던지지 않는다)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const missing = await loadCustomerHistoryProfile(NEO, readers({ neo: null }))
    expect(missing?.owner).toBeNull()
    expect(missing?.notes?.[0]).toContain("NEO 스냅숏에 이 계정이 없어")
    const failed = await loadCustomerHistoryProfile(NEO, readers({ neo: new Error("down") }))
    expect(failed).toEqual({ targets: [{ targetType: "neo_account", targetId: "acc-100" }], owner: null, ownerFailed: true })
  })

  it("리드 — 리드 기록과 리드 담당. 확정 연결된 NEO 계정이 있으면 그 기록도 읽고 NEO 담당을 먼저 쓴다", async () => {
    const plain = await loadCustomerHistoryProfile(LEAD, readers())
    expect(plain).toEqual({ targets: [{ targetType: "lead", targetId: "lead-200" }], owner: { name: "담당자 B", from: "lead" }, uid: null })

    const linked = await loadCustomerHistoryProfile(LEAD, readers({ link: { targetId: "acc-100" } }))
    expect(linked?.targets).toEqual([
      { targetType: "lead", targetId: "lead-200" },
      { targetType: "neo_account", targetId: "acc-100" },
    ])
    expect(linked?.owner).toEqual({ name: "담당자 A", from: "neo" })
    expect(linked?.notes).toEqual(["리드 담당은 담당자 B입니다."])
  })

  it("리드 연결 조회가 실패하면 리드 기록만 보고 그렇다고 밝힌다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const profile = await loadCustomerHistoryProfile(LEAD, readers({ link: new Error("down") }))
    expect(profile?.targets).toEqual([{ targetType: "lead", targetId: "lead-200" }])
    expect(profile?.notes).toEqual(["연결된 NEO 계정을 확인하지 못해 리드 기록만 봅니다."])
  })

  it("리드·NEO 가 아닌 고객 키는 null(아직 읽지 않는다)", async () => {
    expect(await loadCustomerHistoryProfile({ key: "customer:c-1", name: "가나학원", href: "/admin" }, readers())).toBeNull()
  })
})

async function withRecorder(resolve: (query: RecordedQuery) => { data?: unknown[] | null; error?: { code?: string; message?: string } | null; count?: number | null }) {
  vi.resetModules()
  const recorder = createRecordingSupabaseClient(resolve)
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => recorder.client) }))
  vi.doMock("@/lib/storage/crm-recordings", () => ({ createCrmRecordingSignedUrls: vi.fn(async () => new Map()) }))
  return recorder
}

describe("listCrmCustomerEventsByTags — 태그로 좁힌 최근 기록", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  const row = (id: string, at: string, target: string) => ({
    id,
    target_type: target.startsWith("lead") ? "lead" : "neo_account",
    target_id: target,
    source_type: "manual_note",
    source_id: "gana-billing-2026-11.md",
    occurred_at: at,
    title: `기록 ${id}`,
    summary: null,
    next_actions: [{ title: "다음 할 일", ownerName: null, dueAt: null, done: false }],
    tags: ["billing"],
  })

  it("대상마다 한 번씩(태그 && · 기간 · 최신순 · 상한) 읽어 최신순으로 합치고 건수는 대상별 합이다 — 본문·녹음 칸은 읽지 않는다", async () => {
    const recorder = await withRecorder((query) =>
      filterValue(query, "target_type") === "lead"
        ? { data: [row("a", "2026-11-01T00:00:00Z", "lead-200")], count: 1 }
        : { data: [row("b", "2026-11-20T00:00:00Z", "acc-100"), row("c", "2026-10-01T00:00:00Z", "acc-100")], count: 4 }
    )
    const { listCrmCustomerEventsByTags } = await import("@/lib/repositories/crm-events")
    const result = await listCrmCustomerEventsByTags({
      targets: [
        { targetType: "lead", targetId: "lead-200" },
        { targetType: "neo_account", targetId: "acc-100" },
        { targetType: "neo_account", targetId: "acc-100" },
      ],
      tags: ["billing", "quote", "billing"],
      from: "2026-09-30T15:00:00.000Z",
      limit: 2,
    })
    expect(result.ok).toBe(true)
    expect(result.total).toBe(5)
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a"])
    expect(result.rows[0].nextActions).toEqual([{ title: "다음 할 일", ownerName: null, dueAt: null, done: false }])

    expect(recorder.queries).toHaveLength(2) // 같은 대상은 한 번만
    for (const query of recorder.queries) {
      expect(query.table).toBe("crm_customer_events")
      expect(query.select).not.toMatch(/body|recording|attendees/)
      expect(query.selectOptions?.count).toBe("exact")
      expect(filterValue(query, "tags", "overlaps")).toEqual(["billing", "quote"])
      expect(filterValue(query, "occurred_at", "gte")).toBe("2026-09-30T15:00:00.000Z")
      expect(query.order.map((o) => `${o.column}:${o.ascending}`)).toEqual(["occurred_at:false", "id:false"])
      expect(query.limit).toBe(2)
    }
  })

  it("기록 표가 없으면 ok:false(0건이 '없음'이 아니다), 다른 오류는 던진다", async () => {
    await withRecorder(() => ({ data: null, error: { code: "42P01", message: 'relation "crm_customer_events" does not exist' } }))
    const missing = await (await import("@/lib/repositories/crm-events")).listCrmCustomerEventsByTags({
      targets: [{ targetType: "neo_account", targetId: "acc-100" }],
      tags: ["billing"],
    })
    expect(missing).toMatchObject({ ok: false, total: 0, rows: [] })

    await withRecorder(() => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }))
    const repo = await import("@/lib/repositories/crm-events")
    await expect(repo.listCrmCustomerEventsByTags({ targets: [{ targetType: "neo_account", targetId: "acc-100" }], tags: ["billing"] })).rejects.toThrow(
      /태그 기록 조회 실패/
    )
  })

  it("대상·태그가 없으면 DB 를 부르지 않는다", async () => {
    const recorder = await withRecorder(() => ({ data: [] }))
    const { listCrmCustomerEventsByTags } = await import("@/lib/repositories/crm-events")
    expect(await listCrmCustomerEventsByTags({ targets: [], tags: ["billing"] })).toEqual({ ok: true, message: null, total: 0, rows: [] })
    expect(await listCrmCustomerEventsByTags({ targets: [{ targetType: "lead", targetId: " " }], tags: ["billing"] })).toMatchObject({ total: 0 })
    expect(await listCrmCustomerEventsByTags({ targets: [{ targetType: "lead", targetId: "lead-200" }], tags: [] })).toMatchObject({ total: 0 })
    expect(recorder.queries).toHaveLength(0)
  })
})

describe("getCrmNeoCustomerSnapshotOwner — NEO 계정 담당 한 줄", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("기본키(source_system, account_id)로 한 줄만 읽고 담당·UID·신선도를 준다", async () => {
    const recorder = await withRecorder(() => ({
      data: [
        {
          account_id: "acc-100",
          account_name: "가나학원",
          owner_id: "owner-1",
          owner_name: "담당자 A",
          uid: "100200",
          is_stale: false,
          source_synced_at: "2026-11-25T00:00:00.000Z",
        },
      ],
    }))
    const { getCrmNeoCustomerSnapshotOwner } = await import("@/lib/repositories/crm-neo-customer-snapshots")
    expect(await getCrmNeoCustomerSnapshotOwner("acc-100")).toEqual(snapshot())
    const [query] = recorder.queries
    expect(query.table).toBe("crm_neo_customer_snapshots")
    expect(query.select).not.toContain("phone")
    expect(filterValue(query, "source_system")).toBe("xiaoshouyi")
    expect(filterValue(query, "account_id")).toBe("acc-100")
    expect(query.limit).toBe(1)
  })

  it("없으면 null, 표가 없거나 오류면 던진다('담당 미지정'으로 보이지 않게)", async () => {
    await withRecorder(() => ({ data: [] }))
    expect(await (await import("@/lib/repositories/crm-neo-customer-snapshots")).getCrmNeoCustomerSnapshotOwner("acc-404")).toBeNull()

    await withRecorder(() => ({ data: null, error: { code: "42P01", message: 'relation "crm_neo_customer_snapshots" does not exist' } }))
    await expect((await import("@/lib/repositories/crm-neo-customer-snapshots")).getCrmNeoCustomerSnapshotOwner("acc-100")).rejects.toThrow(
      /마이그레이션/
    )
  })
})
