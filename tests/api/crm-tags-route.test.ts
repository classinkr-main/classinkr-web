import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// GET/PATCH /api/admin/crm/tags(T4) — 역할 가드, GET 집계 응답, PATCH 400/성공 계약을 고정한다.
// dryRun은 지정된 PATCH 계약({action, from, to})의 부가 옵션이라 route.ts가 그대로 저장소에
// 넘기는지도 함께 확인한다.

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  listCustomerTagStats: vi.fn(),
  renameCustomerTag: vi.fn(),
  mergeCustomerTags: vi.fn(),
  listTagDefinitions: vi.fn(),
  listTagRules: vi.fn(),
  upsertTagDefinition: vi.fn(),
  setTagRuleEnabled: vi.fn(),
  syncTagDefinitionsOnRename: vi.fn(),
  applyAutoTagRules: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/crm-customer-tags", () => ({
  listCustomerTagStats: mocks.listCustomerTagStats,
  renameCustomerTag: mocks.renameCustomerTag,
  mergeCustomerTags: mocks.mergeCustomerTags,
}))

vi.mock("@/lib/repositories/crm-tag-rules", () => ({
  listTagDefinitions: mocks.listTagDefinitions,
  listTagRules: mocks.listTagRules,
  upsertTagDefinition: mocks.upsertTagDefinition,
  setTagRuleEnabled: mocks.setTagRuleEnabled,
  syncTagDefinitionsOnRename: mocks.syncTagDefinitionsOnRename,
  applyAutoTagRules: mocks.applyAutoTagRules,
}))

function patchRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/tags", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function loadRoute() {
  return import("@/app/api/admin/crm/tags/route")
}

describe("GET /api/admin/crm/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1" })
    mocks.listCustomerTagStats.mockResolvedValue([])
    mocks.listTagDefinitions.mockResolvedValue([])
    mocks.listTagRules.mockResolvedValue([])
  })

  it("인증 실패면 저장소 조회 없이 그대로 응답한다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }))
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/tags"))
    expect(response.status).toBe(401)
    expect(mocks.listCustomerTagStats).not.toHaveBeenCalled()
    expect(mocks.listTagDefinitions).not.toHaveBeenCalled()
    expect(mocks.listTagRules).not.toHaveBeenCalled()
  })

  it("CRM_STAFF_ADMIN_API_ROLES로 requireVerifiedAdminContext를 호출한다", async () => {
    const { GET } = await loadRoute()
    await GET(new NextRequest("https://classin.kr/api/admin/crm/tags"))
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(
      expect.anything(),
      ["SUPER_ADMIN", "ADMIN", "BRANCH"]
    )
  })

  it("{ tags, generatedAt }을 어드민 캐시 헤더와 함께 돌려준다", async () => {
    const tags = [{ tag: "VIP", count: 3, byTargetType: { lead: 2, neo_account: 1, customer: 0 }, lastUsedAt: "2026-09-01T00:00:00Z" }]
    mocks.listCustomerTagStats.mockResolvedValue(tags)
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/tags"))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.tags).toEqual(tags)
    expect(typeof body.generatedAt).toBe("string")
    expect(response.headers.get("Cache-Control")).toContain("private")
  })

  it("definitions·rules를 additive로 함께 돌려준다(T5·T6)", async () => {
    const definitions = [{ tag: "재계약", category: "stage", description: null, isAuto: true, createdAt: "x", updatedAt: "x" }]
    const rules = [
      {
        id: "rule-1",
        tag: "재계약",
        ruleType: "expiring_within_days",
        params: { days: 30 },
        targetTypes: ["neo_account"],
        enabled: true,
        lastRunAt: null,
        lastApplied: null,
        lastRemoved: null,
        createdAt: "x",
        updatedAt: "x",
      },
    ]
    mocks.listTagDefinitions.mockResolvedValue(definitions)
    mocks.listTagRules.mockResolvedValue(rules)
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/tags"))
    const body = await response.json()
    expect(body.definitions).toEqual(definitions)
    expect(body.rules).toEqual(rules)
  })

  it("저장소 조회가 실패하면 500을 돌려준다", async () => {
    mocks.listCustomerTagStats.mockRejectedValue(new Error("boom"))
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/tags"))
    expect(response.status).toBe(500)
  })
})

describe("PATCH /api/admin/crm/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1" })
    mocks.syncTagDefinitionsOnRename.mockResolvedValue(undefined)
  })

  it("인증 실패면 저장소 호출 없이 그대로 응답한다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }))
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ action: "rename", from: "VIP", to: "우수고객" }))
    expect(response.status).toBe(401)
    expect(mocks.renameCustomerTag).not.toHaveBeenCalled()
  })

  it("action이 없거나 알 수 없으면 400을 돌려준다", async () => {
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ from: "VIP", to: "우수고객" }))
    expect(response.status).toBe(400)
    const other = await PATCH(patchRequest({ action: "delete", from: "VIP", to: "우수고객" }))
    expect(other.status).toBe(400)
  })

  it("본문이 JSON이 아니면 400을 돌려준다", async () => {
    const { PATCH } = await loadRoute()
    const request = new NextRequest("https://classin.kr/api/admin/crm/tags", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "not json",
    })
    const response = await PATCH(request)
    expect(response.status).toBe(400)
  })

  it("rename: from이 비어있으면 400이고 저장소를 호출하지 않는다", async () => {
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ action: "rename", from: "   ", to: "우수고객" }))
    expect(response.status).toBe(400)
    expect(mocks.renameCustomerTag).not.toHaveBeenCalled()
  })

  it("rename: 같은 이름이면 400이고 저장소를 호출하지 않는다", async () => {
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ action: "rename", from: "VIP", to: "vip" }))
    expect(response.status).toBe(400)
    expect(mocks.renameCustomerTag).not.toHaveBeenCalled()
  })

  it("rename: 정상 입력이면 정규화된 from/to로 저장소를 호출하고 결과를 돌려준다", async () => {
    mocks.renameCustomerTag.mockResolvedValue({ updated: 3, removedDuplicates: 1 })
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ action: "rename", from: "  VIP  ", to: "우수고객" }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(mocks.renameCustomerTag).toHaveBeenCalledWith("VIP", "우수고객", { dryRun: false })
    expect(body).toMatchObject({ updated: 3, removedDuplicates: 1, dryRun: false, from: "VIP", to: "우수고객" })
  })

  it("rename: 커밋 시 태그 정의 테이블도 함께 동기화한다", async () => {
    mocks.renameCustomerTag.mockResolvedValue({ updated: 3, removedDuplicates: 1 })
    const { PATCH } = await loadRoute()
    await PATCH(patchRequest({ action: "rename", from: "VIP", to: "우수고객" }))
    expect(mocks.syncTagDefinitionsOnRename).toHaveBeenCalledWith(["VIP"], "우수고객")
  })

  it("rename: 정의 동기화가 실패해도 이름 변경 자체는 200을 유지한다(best-effort)", async () => {
    mocks.renameCustomerTag.mockResolvedValue({ updated: 3, removedDuplicates: 1 })
    mocks.syncTagDefinitionsOnRename.mockRejectedValue(new Error("definitions boom"))
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ action: "rename", from: "VIP", to: "우수고객" }))
    expect(response.status).toBe(200)
  })

  it("rename: dryRun:true를 그대로 저장소에 전달하고 정의 동기화는 하지 않는다", async () => {
    mocks.renameCustomerTag.mockResolvedValue({ updated: 3, removedDuplicates: 0 })
    const { PATCH } = await loadRoute()
    await PATCH(patchRequest({ action: "rename", from: "VIP", to: "우수고객", dryRun: true }))
    expect(mocks.renameCustomerTag).toHaveBeenCalledWith("VIP", "우수고객", { dryRun: true })
    expect(mocks.syncTagDefinitionsOnRename).not.toHaveBeenCalled()
  })

  it("rename: 저장소 실패면 500을 돌려준다", async () => {
    mocks.renameCustomerTag.mockRejectedValue(new Error("boom"))
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ action: "rename", from: "VIP", to: "우수고객" }))
    expect(response.status).toBe(500)
  })

  it("merge: from이 배열이 아니거나 비어있으면 400이고 저장소를 호출하지 않는다", async () => {
    const { PATCH } = await loadRoute()
    const response1 = await PATCH(patchRequest({ action: "merge", from: "VIP", to: "우수고객" }))
    expect(response1.status).toBe(400)
    const response2 = await PATCH(patchRequest({ action: "merge", from: [], to: "우수고객" }))
    expect(response2.status).toBe(400)
    expect(mocks.mergeCustomerTags).not.toHaveBeenCalled()
  })

  it("merge: 정상 입력이면 정규화된 from 배열/to로 저장소를 호출한다", async () => {
    mocks.mergeCustomerTags.mockResolvedValue({ updated: 4, removedDuplicates: 2 })
    const { PATCH } = await loadRoute()
    const response = await PATCH(
      patchRequest({ action: "merge", from: [" VIP ", "재계약", "vip"], to: "우수고객" })
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(mocks.mergeCustomerTags).toHaveBeenCalledWith(["VIP", "재계약"], "우수고객", { dryRun: false })
    expect(body).toMatchObject({ updated: 4, removedDuplicates: 2, dryRun: false, from: ["VIP", "재계약"], to: "우수고객" })
  })

  it("merge: 저장소 실패면 500을 돌려준다", async () => {
    mocks.mergeCustomerTags.mockRejectedValue(new Error("boom"))
    const { PATCH } = await loadRoute()
    const response = await PATCH(patchRequest({ action: "merge", from: ["VIP"], to: "우수고객" }))
    expect(response.status).toBe(500)
  })

  it("merge: 커밋 시 태그 정의 테이블도 함께 동기화한다", async () => {
    mocks.mergeCustomerTags.mockResolvedValue({ updated: 2, removedDuplicates: 1 })
    const { PATCH } = await loadRoute()
    await PATCH(patchRequest({ action: "merge", from: ["VIP", "재계약"], to: "우수고객" }))
    expect(mocks.syncTagDefinitionsOnRename).toHaveBeenCalledWith(["VIP", "재계약"], "우수고객")
  })

  // ── T6: set_category ────────────────────────────────────────────────
  describe("set_category", () => {
    it("태그가 없으면 400이고 저장소를 호출하지 않는다", async () => {
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "set_category", tag: "  ", category: "risk" }))
      expect(response.status).toBe(400)
      expect(mocks.upsertTagDefinition).not.toHaveBeenCalled()
    })

    it("범주가 5종 enum 밖이면 400이고 저장소를 호출하지 않는다", async () => {
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "set_category", tag: "VIP", category: "color" }))
      expect(response.status).toBe(400)
      expect(mocks.upsertTagDefinition).not.toHaveBeenCalled()
    })

    it("정상 입력이면 저장소를 호출하고 definition을 돌려준다", async () => {
      const definition = { tag: "VIP", category: "segment", description: null, isAuto: false, createdAt: "x", updatedAt: "x" }
      mocks.upsertTagDefinition.mockResolvedValue(definition)
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "set_category", tag: "VIP", category: "segment" }))
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(mocks.upsertTagDefinition).toHaveBeenCalledWith("VIP", "segment")
      expect(body).toEqual({ definition })
    })

    it("저장소 실패면 500을 돌려준다", async () => {
      mocks.upsertTagDefinition.mockRejectedValue(new Error("boom"))
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "set_category", tag: "VIP", category: "risk" }))
      expect(response.status).toBe(500)
    })
  })

  // ── T5: set_rule_enabled ─────────────────────────────────────────────
  describe("set_rule_enabled", () => {
    it("ruleId나 enabled가 없으면(또는 boolean이 아니면) 400이고 저장소를 호출하지 않는다", async () => {
      const { PATCH } = await loadRoute()
      const response1 = await PATCH(patchRequest({ action: "set_rule_enabled", ruleId: "", enabled: true }))
      expect(response1.status).toBe(400)
      const response2 = await PATCH(patchRequest({ action: "set_rule_enabled", ruleId: "rule-1", enabled: "yes" }))
      expect(response2.status).toBe(400)
      expect(mocks.setTagRuleEnabled).not.toHaveBeenCalled()
    })

    it("정상 입력이면 저장소를 호출하고 rule을 돌려준다", async () => {
      const rule = { id: "rule-1", enabled: false }
      mocks.setTagRuleEnabled.mockResolvedValue(rule)
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "set_rule_enabled", ruleId: "rule-1", enabled: false }))
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(mocks.setTagRuleEnabled).toHaveBeenCalledWith("rule-1", false)
      expect(body).toEqual({ rule })
    })

    it("저장소 실패면 500을 돌려준다", async () => {
      mocks.setTagRuleEnabled.mockRejectedValue(new Error("boom"))
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "set_rule_enabled", ruleId: "rule-1", enabled: true }))
      expect(response.status).toBe(500)
    })
  })

  // ── T5: preview_rules ────────────────────────────────────────────────
  describe("preview_rules", () => {
    it("applyAutoTagRules를 dryRun:true로 호출하고 report를 돌려준다", async () => {
      const report = { generatedAt: "x", dryRun: true, results: [{ ruleId: "rule-1", tag: "재계약", ruleType: "expiring_within_days", matched: 2, applied: 1, removed: 0, skippedManual: 0 }] }
      mocks.applyAutoTagRules.mockResolvedValue(report)
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "preview_rules" }))
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(mocks.applyAutoTagRules).toHaveBeenCalledWith({ dryRun: true })
      expect(body).toEqual({ report })
    })

    it("실패면 500을 돌려준다", async () => {
      mocks.applyAutoTagRules.mockRejectedValue(new Error("boom"))
      const { PATCH } = await loadRoute()
      const response = await PATCH(patchRequest({ action: "preview_rules" }))
      expect(response.status).toBe(500)
    })
  })
})
