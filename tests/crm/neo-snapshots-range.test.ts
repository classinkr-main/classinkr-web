// F5 — 전량 조회는 range 페이지네이션(1,000행)으로 끝까지, 전진 간격은 실제 받은 행 수, 정렬 끝에 유일 키.
// listCrmNeoCustomerSnapshots(예전: 단일 .range(0, 9_999) — PostgREST max-rows 1000 에서 조용히 절단)와
// dispatchRenewalAlerts(예전: 단일 .limit(5000)·쿨다운 이력 .limit(1000))를 가짜 PostgREST 로 고정한다.
import { afterEach, describe, expect, it, vi } from "vitest"

import { createFakePostgrest, type FakeQueryLog } from "./unified-fake-postgrest"

function snapshot(index: number, extra: Record<string, unknown> = {}) {
  return {
    source_system: "xiaoshouyi",
    account_id: `acc-${String(index).padStart(5, "0")}`,
    account_name: `학원 ${index}`,
    owner_id: "owner-1",
    owner_name: "박담당",
    phone: null,
    uid: null,
    region_label: null,
    billing_mode: index % 2 === 0 ? "consumption" : "subscription",
    balance: 100,
    daily_burn: null,
    depletion_in_days: null,
    burn_event_count: 0,
    burn_confidence: "none",
    expire_at: null,
    last_class_at: null,
    order_amount: 0,
    order_count: 0,
    has_eeo: true,
    // 같은 위험·만료·동기화 시각 — 타이브레이커(account_id)가 없으면 페이지 경계가 흔들린다.
    risk_level: "normal",
    risk_reasons: [],
    expire_in_days: null,
    risk_confidence: "high",
    freshness_label: null,
    account_synced_at: null,
    shroff_synced_at: null,
    opportunity_synced_at: null,
    source_synced_at: "2026-09-20T00:00:00.000Z",
    source_run_ids: {},
    source_refs: {},
    is_partial: false,
    partial_reason: null,
    is_stale: false,
    stale_at: null,
    calculated_at: "2026-09-20T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...extra,
  }
}

let logs: FakeQueryLog[] = []

async function withFakeDb(datasets: Record<string, Array<Record<string, unknown>>>, maxRows = 1000) {
  vi.resetModules()
  const fake = createFakePostgrest(datasets, { maxRows })
  logs = fake.logs
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("listCrmNeoCustomerSnapshots — 1,000행 페이지로 끝까지", () => {
  it("2,500곳이면 세 페이지를 받아 전부 돌려주고, count 는 첫 페이지에서만, 마지막 정렬 키는 account_id", async () => {
    const rows = Array.from({ length: 2500 }, (_, index) => snapshot(index))
    await withFakeDb({ crm_neo_customer_snapshots: rows })
    const { listCrmNeoCustomerSnapshots } = await import("@/lib/repositories/crm-neo-customer-snapshots")

    const result = await listCrmNeoCustomerSnapshots()

    const pages = logs.filter((log) => log.table === "crm_neo_customer_snapshots")
    expect(pages.map((log) => log.range)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2499 },
    ])
    expect(pages.map((log) => log.selectOptions?.count)).toEqual(["exact", undefined, undefined])
    expect(pages[0].orders.map((order) => order.column)).toEqual(["risk_level", "expire_at", "source_synced_at", "account_id"])
    expect(pages[0].filters).toContainEqual({ op: "eq", column: "is_stale", value: false })
    expect(result.rows).toHaveLength(2500)
    expect(new Set(result.rows.map((row) => row.accountId)).size).toBe(2500)
    expect(result.summary.totalCount).toBe(2500)
  })

  it("서버가 요청보다 적게 잘라 줘도(max-rows 500) 받은 행 수만큼 전진해 빠짐없이 모은다", async () => {
    const rows = Array.from({ length: 1200 }, (_, index) => snapshot(index))
    await withFakeDb({ crm_neo_customer_snapshots: rows }, 500)
    const { listCrmNeoCustomerSnapshots } = await import("@/lib/repositories/crm-neo-customer-snapshots")

    const result = await listCrmNeoCustomerSnapshots()
    const froms = logs.filter((log) => log.table === "crm_neo_customer_snapshots").map((log) => log.range?.from)
    expect(froms).toEqual([0, 500, 1000])
    expect(result.rows).toHaveLength(1200)
  })

  it("과금 유형(billing_mode)을 레코드에 싣는다 — 통합 목록 세그먼트 조건의 원천", async () => {
    await withFakeDb({ crm_neo_customer_snapshots: [snapshot(0), snapshot(1)] })
    const { listCrmNeoCustomerSnapshots } = await import("@/lib/repositories/crm-neo-customer-snapshots")
    const result = await listCrmNeoCustomerSnapshots()
    expect(result.rows.map((row) => row.billingMode)).toEqual(["consumption", "subscription"])
  })

  it("원천 화면 '60일 내 만료' 요약은 오늘~60일(지난 만료 제외) — NEO_SOURCE_EXPIRING_WINDOW_DAYS", async () => {
    const day = 86_400_000
    const now = Date.now()
    await withFakeDb({
      crm_neo_customer_snapshots: [
        snapshot(0, { expire_at: new Date(now + 10 * day).toISOString() }),
        snapshot(1, { expire_at: new Date(now + 59 * day).toISOString() }),
        snapshot(2, { expire_at: new Date(now + 61 * day).toISOString() }),
        snapshot(3, { expire_at: new Date(now - 2 * day).toISOString() }),
      ],
    })
    const { listCrmNeoCustomerSnapshots } = await import("@/lib/repositories/crm-neo-customer-snapshots")
    const result = await listCrmNeoCustomerSnapshots()
    expect(result.summary.expiringSoonCount).toBe(2)
  })
})

describe("dispatchRenewalAlerts — 스냅샷·쿨다운 이력도 끝까지 읽는다", () => {
  it("1,500곳 스냅샷을 페이지로 모두 읽고(최신만·PK 정렬), 만료 임박 알림 대상을 빠짐없이 센다", async () => {
    const snapshots = Array.from({ length: 1500 }, (_, index) =>
      snapshot(index, { expire_in_days: 10, owner_id: "owner-1", owner_name: "박담당" })
    )
    snapshots.push(snapshot(9999, { expire_in_days: 5, is_stale: true }))
    await withFakeDb({
      crm_neo_customer_snapshots: snapshots,
      notification_events: [],
      admin_profiles: [],
    })
    const { dispatchRenewalAlerts } = await import("@/lib/crm/renewal-alert-dispatch")

    const result = await dispatchRenewalAlerts({ dryRun: true, now: new Date("2026-09-25T00:00:00.000Z") })

    const pages = logs.filter((log) => log.table === "crm_neo_customer_snapshots")
    expect(pages.map((log) => log.range?.from)).toEqual([0, 1000])
    expect(pages[0].filters).toContainEqual({ op: "eq", column: "is_stale", value: false })
    expect(pages[0].orders.map((order) => order.column)).toEqual(["source_system", "account_id"])
    expect(result.skipped).toBe("dryRun")
    expect(result.ownersNotified).toBe(1)
    expect(result.truncated).toBeUndefined()

    const history = logs.filter((log) => log.table === "notification_events")
    expect(history[0].range).toEqual({ from: 0, to: 999 })
    expect(history[0].orders.map((order) => order.column)).toEqual(["created_at", "id"])
  })

  it("스냅샷 조회가 실패하면 알림을 만들지 않고 사유를 돌려준다", async () => {
    vi.resetModules()
    const fake = createFakePostgrest({}, { failTables: new Set(["crm_neo_customer_snapshots"]) })
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
    const { dispatchRenewalAlerts } = await import("@/lib/crm/renewal-alert-dispatch")

    const result = await dispatchRenewalAlerts({ dryRun: true })
    expect(result).toMatchObject({ ownersNotified: 0, itemsNotified: 0, skipped: "crm_neo_customer_snapshots failed" })
  })
})
