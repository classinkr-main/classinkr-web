import { beforeEach, describe, expect, it, vi } from "vitest"

// 데모 소스 역조회(2026-09-14, R5 X8·B1). 예전: 우리 리드·NEO 고객 전화 전부를 400개씩 phone_key 로
// 조회. 지금: 데모가 가리키는 Compass 리드 id 로 phone_key 를 PK 조회하고 우리 키와 교집합.
// 브리지 모듈을 목으로 세워, 옛 알고리즘(아래 사본)과 새 구현이 같은 데모 색인을 만드는지 고정한다.

vi.mock("server-only", () => ({}))

const bridge = vi.hoisted(() => ({
  getCompassDemos: vi.fn(),
  getCompassLeadPhoneKeysByIds: vi.fn(),
  getCompassLeadsByPhoneKeys: vi.fn(),
}))
vi.mock("@/lib/compass/bridge", () => bridge)

import { normalizePhoneKey } from "@/lib/compass/normalize"
import { loadCompassDemoSource, phoneKeysForOurLeads } from "@/lib/crm/compass-demo-source"
import { buildCompassDemoIndex, findCompassDemoSignal, type CompassDemoSource } from "@/lib/crm/compass-demo-signal"

// 러너 타임존과 무관하게 같은 달력일을 가리키도록 로컬 정오.
const NOW = new Date(2026, 8, 14, 12, 0, 0)

/** Compass 리드(가짜 compass_leads_v) — id·phone_key. 같은 번호의 리드가 둘인 경우(21, 22)도 둔다. */
const COMPASS_LEADS = [
  { id: 11, phone_key: "01011110000" },
  { id: 12, phone_key: "01022220000" },
  { id: 13, phone_key: null },
  { id: 14, phone_key: "01044440000" }, // 우리 쪽에 없는 번호
  { id: 21, phone_key: "01055550000" },
  { id: 22, phone_key: "01055550000" },
  { id: 30, phone_key: "01066660000" }, // 데모 없는 리드
]

const DEMOS = [
  { id: 1, lead_id: 11, day: "2026-09-14", kind: "demo", status: "booked", owner: "진소망", day_approx: false },
  { id: 2, lead_id: 12, day: "2026-09-20", kind: "demo", status: "booked", owner: "진소망", day_approx: true },
  { id: 3, lead_id: 13, day: "2026-09-10", kind: "demo", status: "done", owner: null, day_approx: false },
  { id: 4, lead_id: 14, day: "2026-09-16", kind: "demo", status: "booked", owner: null, day_approx: false },
  { id: 5, lead_id: 21, day: "2026-09-12", kind: "demo", status: "done", owner: null, day_approx: false },
  { id: 6, lead_id: 22, day: "2026-09-15", kind: "demo", status: "booked", owner: null, day_approx: false },
  { id: 7, lead_id: null, day: "2026-09-15", kind: "demo", status: "booked", owner: null, day_approx: false },
  { id: 8, lead_id: 11, day: "2026-09-18", kind: "demo", status: "booked", owner: null, day_approx: false },
]

/** 우리 리드·NEO 고객 전화(원문 표기 제각각). */
const OUR_PHONES = ["010-1111-0000", "+82 10-2222-0000", "0082-010-5555-0000", "010-6666-0000", null, "", "02-000-0000"]

/** 2026-09-14 이전 loadCompassDemoSource 의 전화 → phone_key 청크 조회 부분 사본(비교 기준). */
function legacyPhoneKeysByCompassLeadId(phones: Array<string | null | undefined>) {
  const keys = [...new Set(phones.map((phone) => normalizePhoneKey(phone)).filter((key): key is string => Boolean(key)))]
  const map = new Map<number, string[]>()
  for (const lead of COMPASS_LEADS.filter((row) => row.phone_key && keys.includes(row.phone_key))) {
    const existing = map.get(lead.id)
    if (existing) {
      if (!existing.includes(lead.phone_key as string)) existing.push(lead.phone_key as string)
    } else {
      map.set(lead.id, [lead.phone_key as string])
    }
  }
  return map
}

beforeEach(() => {
  vi.clearAllMocks()
  bridge.getCompassDemos.mockResolvedValue({ rows: DEMOS, down: false })
  bridge.getCompassLeadPhoneKeysByIds.mockImplementation(async (ids: number[]) => ({
    rows: COMPASS_LEADS.filter((row) => ids.includes(row.id)),
    down: false,
  }))
})

describe("loadCompassDemoSource — 역조회", () => {
  it("데모의 lead_id(중복·null 제외)로만 조회하고, 전화 키로는 조회하지 않는다", async () => {
    await loadCompassDemoSource(OUR_PHONES, NOW)
    expect(bridge.getCompassLeadPhoneKeysByIds).toHaveBeenCalledTimes(1)
    expect([...bridge.getCompassLeadPhoneKeysByIds.mock.calls[0][0]].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 21, 22])
    expect(bridge.getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
  })

  it("옛 알고리즘과 같은 데모 색인을 만든다(신호·unmatched·total)", async () => {
    const source = await loadCompassDemoSource(OUR_PHONES, NOW)
    const legacy: CompassDemoSource = { ...source, phoneKeysByCompassLeadId: legacyPhoneKeysByCompassLeadId(OUR_PHONES) }

    const next = buildCompassDemoIndex(source, NOW)
    const before = buildCompassDemoIndex(legacy, NOW)
    expect(next).toEqual(before)
    // 표본 확인 — 국가번호·국내 0 이 섞인 원문도 붙는다.
    expect(findCompassDemoSignal(next, "+82 010-5555-0000")?.compassLeadId).toBeDefined()
    expect(next.unmatched).toBeGreaterThan(0) // 13(전화 없음)·14(우리 쪽에 없음)·7(lead_id 없음)
  })

  it("데모 리드 항목은 옛 맵과 같고, 데모 없는 리드(30)는 싣지 않는다", async () => {
    const source = await loadCompassDemoSource(OUR_PHONES, NOW)
    const legacy = legacyPhoneKeysByCompassLeadId(OUR_PHONES)
    for (const demo of DEMOS) {
      if (demo.lead_id == null) continue
      expect(source.phoneKeysByCompassLeadId.get(demo.lead_id), String(demo.lead_id)).toEqual(legacy.get(demo.lead_id))
    }
    expect(legacy.has(30)).toBe(true)
    expect(source.phoneKeysByCompassLeadId.has(30)).toBe(false)
    expect(source.phoneKeysByCompassLeadId.has(14)).toBe(false)
  })

  it("데모가 없거나 우리 쪽 전화가 없으면 역조회를 하지 않는다", async () => {
    bridge.getCompassDemos.mockResolvedValueOnce({ rows: [], down: false })
    const empty = await loadCompassDemoSource(OUR_PHONES, NOW)
    expect(empty).toEqual({ demos: [], phoneKeysByCompassLeadId: new Map(), down: false })

    const noPhones = await loadCompassDemoSource([null, "", "없음"], NOW)
    expect(noPhones.demos).toHaveLength(DEMOS.length)
    expect(noPhones.phoneKeysByCompassLeadId.size).toBe(0)
    expect(bridge.getCompassLeadPhoneKeysByIds).not.toHaveBeenCalled()
  })

  it("데모 조회가 끊기면 down, 역조회가 끊기면 데모는 두고 down", async () => {
    bridge.getCompassDemos.mockResolvedValueOnce({ rows: [], down: true })
    expect((await loadCompassDemoSource(OUR_PHONES, NOW)).down).toBe(true)

    bridge.getCompassLeadPhoneKeysByIds.mockResolvedValueOnce({ rows: [], down: true, error: "boom" })
    const lookupDown = await loadCompassDemoSource(OUR_PHONES, NOW)
    expect(lookupDown.down).toBe(true)
    expect(lookupDown.demos).toHaveLength(DEMOS.length)
    expect(lookupDown.phoneKeysByCompassLeadId.size).toBe(0)
  })
})

describe("phoneKeysForOurLeads", () => {
  it("우리 키 집합에 있는 phone_key 만, 리드별 중복 없이 모은다", () => {
    const map = phoneKeysForOurLeads(
      [
        { id: 1, phone_key: "01011110000" },
        { id: 1, phone_key: "01011110000" },
        { id: 2, phone_key: null },
        { id: 3, phone_key: "01099990000" },
      ],
      new Set(["01011110000"])
    )
    expect([...map.entries()]).toEqual([[1, ["01011110000"]]])
  })
})
