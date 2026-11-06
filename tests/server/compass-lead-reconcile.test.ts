import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CompassPushCandidateRow } from "@/lib/repositories/leads"

// Compass 전달 대조(lib/server/compass-lead-reconcile.ts) — 실시간 전달이 놓친 홈페이지 폼 리드를 매시 다시 민다.
// 대상 판정(소스·링크) · 링크를 못 읽으면 안 보냄 · 미리보기 · event_id·본문 · 실패 문구 · 상한 · 기간.

const getCompassPushCandidateLeads = vi.fn()
const getCompassHomeLeadRefs = vi.fn()
const pushLeadToCompass = vi.fn()
const compassLeadPushTarget = vi.fn()

vi.mock("@/lib/repositories/leads", () => ({ getCompassPushCandidateLeads }))
vi.mock("@/lib/compass/bridge", () => ({ getCompassHomeLeadRefs }))
vi.mock("@/lib/server/compass-lead-push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/compass-lead-push")>()
  return { ...actual, compassLeadPushTarget, pushLeadToCompass }
})

const NOW = new Date("2026-11-06T09:00:00.000Z")

function row(id: string, overrides: Partial<CompassPushCandidateRow> = {}): CompassPushCandidateRow {
  return {
    id,
    source: "contact_page",
    created_at: "2026-11-06T05:00:00.000Z",
    name: "홍원장",
    org: "세담학원",
    role: "원장",
    size: "30",
    email: "owner@example.com",
    phone: "010-0000-1001",
    branch: "청주",
    message: "칠판 두 대",
    notes: null,
    source_detail: "도입 상담",
    lead_magnet: null,
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: null,
    landing_page: "https://classin.co.kr/landing",
    current_page: "https://classin.co.kr/contact",
    ...overrides,
  }
}

async function load() {
  return import("@/lib/server/compass-lead-reconcile")
}

beforeEach(() => {
  compassLeadPushTarget.mockReturnValue({ url: "https://mkt.example.test/api/webhook/home-lead", token: "tok" })
  getCompassHomeLeadRefs.mockResolvedValue({ rows: [], down: false })
  pushLeadToCompass.mockResolvedValue(undefined)
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("reconcileCompassLeadPush", () => {
  it("env 가 없으면 아무것도 읽지 않고 skipped", async () => {
    compassLeadPushTarget.mockReturnValue(null)
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(report).toMatchObject({ status: "skipped", reason: "not_configured" })
    expect(getCompassPushCandidateLeads).not.toHaveBeenCalled()
    expect(pushLeadToCompass).not.toHaveBeenCalled()
  })

  it("기간은 72시간 전 ~ 10분 전, 홈페이지 폼 소스와 뉴스레터를 읽는다", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([])
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(report.status).toBe("in_sync")
    const [query] = getCompassPushCandidateLeads.mock.calls[0]
    expect(query.since).toBe("2026-11-03T09:00:00.000Z")
    expect(query.until).toBe("2026-11-06T08:50:00.000Z")
    expect([...query.sources].sort()).toEqual(
      ["checkout_request", "contact_page", "demo_modal", "newsletter", "showroom_booking"].sort()
    )
  })

  it("링크가 없는 리드만 실시간 전달과 같은 event_id·본문으로 다시 민다", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([
      row("lead-linked"),
      row("lead-missing", { notes: "[event:busan-forum]\n메모", source_detail: "행사 신청" }),
    ])
    getCompassHomeLeadRefs.mockResolvedValue({ rows: [{ lead_id: 10, external_id: "lead-linked" }], down: false })
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(report).toMatchObject({ status: "sent", candidates: 2, linked: 1, missing: 1, sent: 1, failed: 0, deferred: 0 })
    expect(getCompassHomeLeadRefs).toHaveBeenCalledWith(["lead-linked", "lead-missing"])
    expect(pushLeadToCompass).toHaveBeenCalledTimes(1)
    const [payload, options] = pushLeadToCompass.mock.calls[0]
    expect(options).toEqual({ leadId: "lead-missing", kind: "created", eventId: "lead:lead-missing" })
    expect(payload).toMatchObject({
      source: "contact_page",
      name: "홍원장",
      phone: "010-0000-1001",
      email: "owner@example.com",
      branch: "청주",
      sourceDetail: "행사 신청",
      eventSlug: "busan-forum",
      utmSource: "google",
      currentPage: "https://classin.co.kr/contact",
    })
    expect(report.leads).toEqual([{ leadId: "lead-missing", createdAt: "2026-11-06T05:00:00.000Z", result: "sent" }])
  })

  it("자료 없는 뉴스레터 구독은 대상이 아니다 — 자료 신청(leadMagnet)만", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([
      row("plain-newsletter", { source: "newsletter", lead_magnet: null }),
      row("lead-magnet", { source: "newsletter", lead_magnet: "academy-system-checklist" }),
    ])
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(report.candidates).toBe(1)
    expect(getCompassHomeLeadRefs).toHaveBeenCalledWith(["lead-magnet"])
    expect(pushLeadToCompass.mock.calls[0][0]).toMatchObject({ source: "newsletter", leadMagnet: "academy-system-checklist" })
  })

  it("Compass 링크를 못 읽으면 아무것도 보내지 않고 failed", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([row("a")])
    getCompassHomeLeadRefs.mockResolvedValue({ rows: [], down: true, error: "bridge down" })
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(report).toMatchObject({ status: "failed", reason: "compass_links_unavailable", sent: 0 })
    expect(pushLeadToCompass).not.toHaveBeenCalled()
  })

  it("리드 조회가 던지면 failed(lead_read_failed)", async () => {
    getCompassPushCandidateLeads.mockRejectedValue(new Error("db down"))
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(report).toMatchObject({ status: "failed", reason: "lead_read_failed" })
    expect(pushLeadToCompass).not.toHaveBeenCalled()
  })

  it("dryRun 은 보내지 않고 다시 밀 대상만 싣는다", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([row("a"), row("b")])
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW, dryRun: true })

    expect(report).toMatchObject({ status: "preview", dryRun: true, missing: 2, sent: 0 })
    expect(report.leads.map((lead) => [lead.leadId, lead.result])).toEqual([["a", "pending"], ["b", "pending"]])
    expect(pushLeadToCompass).not.toHaveBeenCalled()
  })

  it("실패는 닫힌 문구만 — Compass 상태는 그대로, 그 밖의 오류는 이름만(주소·토큰이 새지 않게)", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([row("a"), row("b"), row("c")])
    pushLeadToCompass
      .mockRejectedValueOnce(new Error("Compass: 503"))
      .mockRejectedValueOnce(Object.assign(new Error("connect ECONNREFUSED https://mkt.example.test?token=tok"), { name: "FetchError" }))
      .mockResolvedValueOnce(undefined)
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(report).toMatchObject({ status: "partial", sent: 1, failed: 2 })
    expect(report.leads.filter((lead) => lead.result === "failed").map((lead) => lead.error)).toEqual(["Compass: 503", "FetchError"])
    expect(JSON.stringify(report)).not.toMatch(/tok|ECONNREFUSED|010-|owner@/)
  })

  it("모두 실패하면 failed", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([row("a")])
    pushLeadToCompass.mockRejectedValue(new Error("Compass: 500"))
    const { reconcileCompassLeadPush } = await load()

    expect((await reconcileCompassLeadPush({ now: NOW })).status).toBe("failed")
  })

  it("한 번에 5건까지 — 나머지는 다음 실행으로 넘긴다(deferred)", async () => {
    const { reconcileCompassLeadPush, COMPASS_RECONCILE_MAX_PUSHES } = await load()
    getCompassPushCandidateLeads.mockResolvedValue(
      Array.from({ length: COMPASS_RECONCILE_MAX_PUSHES + 2 }, (_, index) => row(`lead-${index}`))
    )

    const report = await reconcileCompassLeadPush({ now: NOW })

    expect(pushLeadToCompass).toHaveBeenCalledTimes(COMPASS_RECONCILE_MAX_PUSHES)
    expect(report).toMatchObject({ status: "sent", sent: COMPASS_RECONCILE_MAX_PUSHES, deferred: 2 })
  })

  it("남은 시간 예산이 한 건 몫보다 적으면 보내지 않고 넘긴다", async () => {
    getCompassPushCandidateLeads.mockResolvedValue([row("a")])
    const { reconcileCompassLeadPush } = await load()

    const report = await reconcileCompassLeadPush({ now: NOW, timeBudgetMs: 1_000 })

    expect(pushLeadToCompass).not.toHaveBeenCalled()
    expect(report).toMatchObject({ status: "partial", deferred: 1, sent: 0 })
  })
})
