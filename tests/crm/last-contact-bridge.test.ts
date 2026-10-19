// getCompassLatestActivityByPhoneKeys(lib/compass/bridge.ts, CT8) — 전화 키 → 키별 최신 사람 활동.
// @/lib/supabase/admin 만 가짜 PostgREST 로 세우고 브리지 구현을 그대로 통과시킨다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakePostgrest, type FakeQueryLog } from "./unified-fake-postgrest"

const KINDS = ["call", "sms", "meeting", "note", "memo", "stage_change"] as const
const EXCLUDED = ["BD시트", "시트"]

let datasets: Record<string, Array<Record<string, unknown>>>
let failTables: Set<string>
let logs: FakeQueryLog[]

async function loadBridge() {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => {
      const fake = createFakePostgrest(datasets, { failTables })
      // 매 호출이 같은 로그에 쌓이게 한다.
      return {
        from: (table: string) => {
          const builder = fake.client.from(table)
          logs.push(fake.logs[fake.logs.length - 1])
          return builder
        },
      }
    },
  }))
  const bridge = await import("@/lib/compass/bridge")
  bridge.__resetCompassBridgeMemoForTests()
  return bridge
}

beforeEach(() => {
  failTables = new Set()
  logs = []
  // 우리와 무관한 Compass 리드 1,400건 + 우리 키 3건(1,000행 페이지 두 번에 걸친다).
  const leads: Array<Record<string, unknown>> = Array.from({ length: 1400 }, (_, index) => ({
    id: index + 1,
    phone_key: `0109999${String(index).padStart(4, "0")}`,
  }))
  leads.push({ id: 5001, phone_key: "01011112002" })
  leads.push({ id: 5002, phone_key: "01011112002" }) // 같은 전화의 두 번째 Compass 리드
  leads.push({ id: 5003, phone_key: "01033334004" })
  leads.push({ id: 5004, phone_key: null })
  datasets = {
    compass_leads_v: leads,
    compass_activities_v: [
      { id: 1, lead_id: 5001, kind: "call", actor: "진소망", created_at: "2026-09-20T01:00:00.000Z" },
      { id: 2, lead_id: 5002, kind: "sms", actor: "김담당", created_at: "2026-09-22T01:00:00.000Z" },
      { id: 3, lead_id: 5002, kind: "note", actor: "BD시트", created_at: "2026-09-24T01:00:00.000Z" }, // 자동 — 제외
      { id: 4, lead_id: 5003, kind: "alimtalk", actor: null, created_at: "2026-09-24T02:00:00.000Z" }, // kind 밖 — 제외
      { id: 5, lead_id: 5003, kind: "meeting", actor: null, created_at: "2026-09-10T02:00:00.000Z" },
      { id: 6, lead_id: 7, kind: "call", actor: "누군가", created_at: "2026-09-24T02:00:00.000Z" }, // 우리 키 아님
    ],
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("getCompassLatestActivityByPhoneKeys", () => {
  it("키별 최신 사람 활동 — 같은 전화의 여러 Compass 리드를 접고 자동 작성자·다른 kind 는 뺀다", async () => {
    const { getCompassLatestActivityByPhoneKeys } = await loadBridge()
    const result = await getCompassLatestActivityByPhoneKeys(["01011112002", "01033334004", "01055556006"], {
      kinds: KINDS,
      excludeActors: EXCLUDED,
    })

    expect(result.down).toBe(false)
    expect(result.truncated).toBe(false)
    expect(result.rows).toEqual([
      { phone_key: "01011112002", lead_id: 5002, occurred_at: "2026-09-22T01:00:00.000Z", kind: "sms", actor: "김담당" },
      { phone_key: "01033334004", lead_id: 5003, occurred_at: "2026-09-10T02:00:00.000Z", kind: "meeting", actor: null },
    ])
  })

  it("필요한 컬럼만 range 페이지네이션으로 읽는다(리드 스캔은 count 로 끝까지, 본문 없음)", async () => {
    const { getCompassLatestActivityByPhoneKeys } = await loadBridge()
    await getCompassLatestActivityByPhoneKeys(["01011112002"], { kinds: KINDS, excludeActors: EXCLUDED })

    const leadPages = logs.filter((log) => log.table === "compass_leads_v")
    expect(leadPages.map((log) => log.range?.from)).toEqual([0, 1000])
    expect(leadPages.every((log) => log.select === "id, phone_key")).toBe(true)
    expect(leadPages[0].selectOptions).toEqual({ count: "exact" })
    expect(leadPages[0].orders.map((order) => order.column)).toEqual(["id"])

    const activityPages = logs.filter((log) => log.table === "compass_activities_v")
    expect(activityPages.length).toBeGreaterThan(0)
    expect(activityPages.every((log) => log.select === "id, lead_id, kind, actor, created_at")).toBe(true)
    expect(activityPages[0].filters).toContainEqual({ op: "in", column: "lead_id", value: [5001, 5002] })
    expect(activityPages.every((log) => !log.select.includes("body"))).toBe(true)
  })

  it("조회가 실패하면 throw 하지 않고 down(행 없음)", async () => {
    failTables.add("compass_activities_v")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getCompassLatestActivityByPhoneKeys } = await loadBridge()
    const result = await getCompassLatestActivityByPhoneKeys(["01011112002"], { kinds: KINDS })

    expect(result.down).toBe(true)
    expect(result.rows).toEqual([])
    errorSpy.mockRestore()
  })

  it("키가 없으면 원격 조회를 하지 않는다", async () => {
    const { getCompassLatestActivityByPhoneKeys } = await loadBridge()
    const result = await getCompassLatestActivityByPhoneKeys(["", "  "], { kinds: KINDS })
    expect(result).toEqual({ rows: [], down: false })
    expect(logs).toHaveLength(0)
  })

  it("자리표시·더미 번호 키(010-0000-0000·010-1234-5678 류)는 조인하지 않는다 — 같은 더미를 친 남의 Compass 리드 활동이다", async () => {
    datasets.compass_leads_v.push({ id: 6001, phone_key: "01000000000" }, { id: 6002, phone_key: "01012345678" })
    datasets.compass_activities_v.push(
      { id: 21, lead_id: 6001, kind: "call", actor: "남담당", created_at: "2026-09-24T05:00:00.000Z" },
      { id: 22, lead_id: 6002, kind: "call", actor: "남담당", created_at: "2026-09-24T05:00:00.000Z" }
    )
    const { getCompassLatestActivityByPhoneKeys } = await loadBridge()

    // 자리표시 키만이면 원격 조회를 하지 않는다.
    expect(await getCompassLatestActivityByPhoneKeys(["01000000000", " 01012345678 "], { kinds: KINDS })).toEqual({
      rows: [],
      down: false,
    })
    expect(logs).toHaveLength(0)

    // 섞여 있으면 붙여도 되는 키만 — Compass 에 같은 더미 키 리드·활동이 있어도 싣지 않는다.
    const result = await getCompassLatestActivityByPhoneKeys(["01000000000", "01012345678", "01011112002"], {
      kinds: KINDS,
      excludeActors: EXCLUDED,
    })
    expect(result.down).toBe(false)
    expect(result.rows.map((row) => row.phone_key)).toEqual(["01011112002"])
    const activityPages = logs.filter((log) => log.table === "compass_activities_v")
    expect(activityPages[0].filters).toContainEqual({ op: "in", column: "lead_id", value: [5001, 5002] })
  })

  it("같은 키 집합은 60초 메모를 탄다(순서 무관)", async () => {
    const { getCompassLatestActivityByPhoneKeys } = await loadBridge()
    await getCompassLatestActivityByPhoneKeys(["01033334004", "01011112002"], { kinds: KINDS, excludeActors: EXCLUDED })
    const before = logs.length
    await getCompassLatestActivityByPhoneKeys(["01011112002", "01033334004"], { kinds: KINDS, excludeActors: EXCLUDED })
    expect(logs.length).toBe(before)
  })
})
