import { afterEach, describe, expect, it, vi } from "vitest"

// 어드민 리드 ↔ Compass 리드 매칭 한 자리(lib/compass/admin-lead-links) — 링크(home_lead) 우선, 전화 키 폴백, 합집합, down 전파.

const getCompassHomeLeadRefs = vi.fn()
const getCompassLeadsByIds = vi.fn()
const getCompassLeadsByPhoneKeys = vi.fn()

vi.mock("@/lib/compass/bridge", () => ({ getCompassHomeLeadRefs, getCompassLeadsByIds, getCompassLeadsByPhoneKeys }))

async function load() {
  vi.resetModules()
  return import("@/lib/compass/admin-lead-links")
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("getCompassLinksForAdminLeads", () => {
  it("빈 입력은 조회 없이 빈 맵 · 중복 id 는 한 번만 묻고 링크는 id 별로 모아 정렬한다", async () => {
    const { getCompassLinksForAdminLeads } = await load()
    expect(await getCompassLinksForAdminLeads([])).toEqual({ links: new Map(), down: false })
    expect(getCompassHomeLeadRefs).not.toHaveBeenCalled()

    getCompassHomeLeadRefs.mockResolvedValue({
      rows: [
        { lead_id: 11, external_id: "g" },
        { lead_id: 9, external_id: "g" },
        { lead_id: 9, external_id: "g" },
        { lead_id: 3, external_id: "h" },
      ],
      down: false,
    })
    const result = await getCompassLinksForAdminLeads(["g", " h ", "g", ""])
    expect(getCompassHomeLeadRefs).toHaveBeenCalledWith(["g", "h"])
    expect(result.down).toBe(false)
    expect([...result.links.entries()]).toEqual([
      ["g", [9, 11]],
      ["h", [3]],
    ])
  })

  it("링크 조회가 끊기면 down — 빈 맵을 '링크 없음'으로 위장하지 않는다", async () => {
    const { getCompassLinksForAdminLeads } = await load()
    getCompassHomeLeadRefs.mockResolvedValue({ rows: [], down: true, error: "refs view missing" })
    expect(await getCompassLinksForAdminLeads(["g"])).toEqual({ links: new Map(), down: true, error: "refs view missing" })
  })
})

describe("getCompassLeadsForAdminLead", () => {
  it("링크도 전화도 없으면 조회하지 않는다 · 숫자 없는 전화는 키가 아니다", async () => {
    const { getCompassLeadsForAdminLead } = await load()
    expect(await getCompassLeadsForAdminLead({ leadId: null, phone: "없음" })).toEqual({ rows: [], down: false, linkedIds: [] })
    expect(await getCompassLeadsForAdminLead({ leadId: "  ", phone: null })).toEqual({ rows: [], down: false, linkedIds: [] })
    expect(getCompassHomeLeadRefs).not.toHaveBeenCalled()
    expect(getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
  })

  it("링크 행 ∪ 전화 키 행 — 같은 Compass 리드는 한 번, linkedIds 는 링크로 붙은 것만", async () => {
    const { getCompassLeadsForAdminLead } = await load()
    getCompassHomeLeadRefs.mockResolvedValue({ rows: [{ lead_id: 9, external_id: "g" }, { lead_id: 1, external_id: "g" }], down: false })
    getCompassLeadsByIds.mockResolvedValue({ rows: [{ id: 9, phone_key: null }, { id: 1, phone_key: "01020417731" }], down: false })
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [{ id: 1, phone_key: "01020417731" }, { id: 2, phone_key: "01020417731" }], down: false })

    const result = await getCompassLeadsForAdminLead({ leadId: "g", phone: "+82 10-2041-7731" })

    expect(getCompassLeadsByIds).toHaveBeenCalledWith([1, 9])
    expect(getCompassLeadsByPhoneKeys).toHaveBeenCalledWith(["01020417731"])
    expect(result.down).toBe(false)
    expect(result.linkedIds).toEqual([1, 9])
    expect(result.rows.map((row) => row.id)).toEqual([1, 2, 9])
  })

  it("전화 없는 리드는 링크로만 — 전화 키 조회는 하지 않는다", async () => {
    const { getCompassLeadsForAdminLead } = await load()
    getCompassHomeLeadRefs.mockResolvedValue({ rows: [{ lead_id: 9, external_id: "g" }], down: false })
    getCompassLeadsByIds.mockResolvedValue({ rows: [{ id: 9, phone_key: null }], down: false })
    const result = await getCompassLeadsForAdminLead({ leadId: "g", phone: null })
    expect(getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
    expect(result.rows.map((row) => row.id)).toEqual([9])
  })

  it("어느 조회든 끊기면 전체 down", async () => {
    const { getCompassLeadsForAdminLead } = await load()
    getCompassHomeLeadRefs.mockResolvedValue({ rows: [{ lead_id: 9, external_id: "g" }], down: false })
    getCompassLeadsByIds.mockResolvedValue({ rows: [], down: true, error: "leads view missing" })
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [{ id: 1, phone_key: "01020417731" }], down: false })
    expect(await getCompassLeadsForAdminLead({ leadId: "g", phone: "010-2041-7731" })).toMatchObject({ rows: [], down: true, error: "leads view missing" })

    getCompassHomeLeadRefs.mockResolvedValue({ rows: [], down: true, error: "refs view missing" })
    expect(await getCompassLeadsForAdminLead({ leadId: "g", phone: "010-2041-7731" })).toMatchObject({ rows: [], down: true, error: "refs view missing" })
  })
})
