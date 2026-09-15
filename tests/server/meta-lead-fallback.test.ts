import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeMirrorDb, fromCalls, rpcCalls, type FakeError, type Row } from "./fixtures/fake-mirror-supabase"

// 어드민 폴백(설계 META-RECEIVER-FINAL §4-2 H6b, 이식 G2).
// Supabase 는 메모리 가짜(선점·finish RPC 는 테스트 처리기), Graph 상세·submitLeadCapture·알림은 목이다.
// 빌더(buildLeadCapturePayload·buildLeadPayload)는 실제 코드를 통과한다.
// SQL 의미(선점 조건·지수 대기·adopt 치유)는 tests/fixtures/meta-leadgen-single-receiver 로컬 PG F4–F6·F9 가 검증한다.
// 값은 전부 합성이다(010-0000-xxxx, example.com).

const hoisted = vi.hoisted(() => ({
  client: null as unknown,
  fetchMetaLeadDetail: vi.fn(),
  submitLeadCapture: vi.fn(),
  emitNotificationEvent: vi.fn(),
  getResolvedSettings: vi.fn(),
  logAudit: vi.fn(),
  runLeadCaptureEffects: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (!hoisted.client) throw new Error("Supabase env 없음")
    return hoisted.client
  },
}))
vi.mock("@/lib/meta/lead-ads-graph", () => ({ fetchMetaLeadDetail: hoisted.fetchMetaLeadDetail }))
vi.mock("@/lib/server/lead-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/lead-capture")>()),
  submitLeadCapture: hoisted.submitLeadCapture,
  runLeadCaptureEffects: hoisted.runLeadCaptureEffects,
}))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: hoisted.emitNotificationEvent }))
vi.mock("@/lib/repositories/settings", () => ({ getResolvedSettings: hoisted.getResolvedSettings }))
vi.mock("@/lib/auth/audit", () => ({ logAudit: hoisted.logAudit }))

import { __resetMetaLeadgenCutoverCacheForTests } from "@/lib/meta/leadgen-cutover"
import {
  FALLBACK_CLAIM_LIMIT,
  META_LEAD_FALLBACK_CLAIM_RPC,
  META_LEAD_FALLBACK_FINISH_RPC,
  classifyMetaLeadFallbackCapture,
  isEmailOnlyRejection,
  isUsableMetaLeadDetail,
  metaLeadFallbackStep,
  parseMetaLeadFallbackClaims,
  runMetaLeadFallback,
} from "@/lib/server/meta-lead-fallback"
import { META_LEAD_MIRROR_HEALTH_RPC, runMetaLeadMirrorCycle } from "@/lib/server/meta-lead-mirror"

const NOW = Date.parse("2026-09-15T03:00:00.000Z")
const PII_VALUES = ["김합성", "010-0000-0001", "01000000001", "owner1@example.com", "합성 학원"]

function claimRow(leadgenId: string, extra: Row = {}): Row {
  return { out_leadgen_id: leadgenId, out_page_id: "page-1", out_form_id: "form-9", out_ad_id: "ad-1", out_attempt: 1, ...extra }
}

function detail(leadgenId: string, extra: Record<string, unknown> = {}) {
  return {
    id: leadgenId,
    form_id: "form-9",
    ad_id: "ad-1",
    ad_name: "가을 소재 A",
    adset_id: "as-1",
    adset_name: "학원장 타깃",
    campaign_id: "c-1",
    campaign_name: "가을 모집",
    field_data: [
      { name: "full_name", values: ["김합성"] },
      { name: "phone_number", values: ["010-0000-0001"] },
      { name: "email", values: ["owner1@example.com"] },
      { name: "company_name", values: ["합성 학원"] },
    ],
    ...extra,
  }
}

function stored(leadId: string) {
  return { status: 200, body: { ok: true, stored: true, leadId, conversionEventId: `lead:${leadId}`, warnings: [] } }
}

type SetupInput = {
  claims?: Row[]
  claimError?: FakeError
  finish?: (args: Record<string, unknown>) => { data: unknown; error: FakeError | null }
  ledger?: Row[]
  tables?: Record<string, Row[]>
  rpc?: Record<string, (args: Record<string, unknown> | undefined) => { data: unknown; error: FakeError | null }>
}

function setup(input: SetupInput = {}) {
  const db = createFakeMirrorDb({
    tables: { meta_lead_mirror_ledger: input.ledger ?? [], ...(input.tables ?? {}) },
    rpc: {
      [META_LEAD_FALLBACK_CLAIM_RPC]: () =>
        input.claimError ? { data: null, error: input.claimError } : { data: input.claims ?? [], error: null },
      [META_LEAD_FALLBACK_FINISH_RPC]: (args) =>
        input.finish
          ? input.finish(args ?? {})
          : {
              data: args?.p_result === "inserted" ? "inserted" : args?.p_result === "deduped" ? "skipped" : "fallback_failed",
              error: null,
            },
      ...(input.rpc ?? {}),
    },
  })
  hoisted.client = db.client
  return db
}

function finishArgs(db: ReturnType<typeof setup>) {
  return rpcCalls(db.calls, META_LEAD_FALLBACK_FINISH_RPC).map((call) => call.args ?? {})
}

beforeEach(() => {
  __resetMetaLeadgenCutoverCacheForTests()
  hoisted.client = null
  hoisted.fetchMetaLeadDetail.mockReset()
  hoisted.fetchMetaLeadDetail.mockImplementation(async (leadgenId: string) => detail(leadgenId))
  hoisted.submitLeadCapture.mockReset()
  hoisted.submitLeadCapture.mockResolvedValue(stored("00000000-0000-4000-8000-000000000001"))
  hoisted.emitNotificationEvent.mockReset()
  hoisted.emitNotificationEvent.mockResolvedValue({ id: "event-1" })
  hoisted.getResolvedSettings.mockReset()
  hoisted.getResolvedSettings.mockResolvedValue({ webhookEnabled: {} })
  hoisted.logAudit.mockReset()
  hoisted.logAudit.mockResolvedValue(undefined)
  hoisted.runLeadCaptureEffects.mockReset()
  hoisted.runLeadCaptureEffects.mockResolvedValue({ errors: [] })
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(NOW))
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── 순수 함수 ───────────────────────────────────────────────────────────────

describe("순수 판정", () => {
  it("선점 행 파싱 — 숫자 id 만, 중복 제거, 순서 유지", () => {
    expect(
      parseMetaLeadFallbackClaims([
        claimRow("2001"),
        claimRow("abc"),
        claimRow("2001"),
        { out_leadgen_id: "2002", out_page_id: null, out_form_id: "", out_ad_id: null, out_attempt: "3" },
      ])
    ).toEqual([
      { leadgenId: "2001", pageId: "page-1", formId: "form-9", adId: "ad-1", attempt: 1 },
      { leadgenId: "2002", pageId: null, formId: null, adId: null, attempt: 3 },
    ])
    expect(parseMetaLeadFallbackClaims(null)).toEqual([])
  })

  it("쓸 수 있는 상세 — field_data 에 값이 있어야 하고 id 가 다르면 안 된다", () => {
    expect(isUsableMetaLeadDetail(detail("2001"), "2001")).toBe(true)
    expect(isUsableMetaLeadDetail({ ...detail("2001"), id: undefined }, "2001")).toBe(true)
    expect(isUsableMetaLeadDetail(detail("9999"), "2001")).toBe(false)
    expect(isUsableMetaLeadDetail({ id: "2001" }, "2001")).toBe(false)
    expect(isUsableMetaLeadDetail({ id: "2001", field_data: [] }, "2001")).toBe(false)
    expect(isUsableMetaLeadDetail({ id: "2001", field_data: [{ name: "full_name", values: ["  "] }] }, "2001")).toBe(false)
    expect(isUsableMetaLeadDetail(undefined, "2001")).toBe(false)
    expect(isUsableMetaLeadDetail([], "2001")).toBe(false)
  })

  it("이메일 형식 때문에만 거절되는지", () => {
    expect(isEmailOnlyRejection({ source: "meta_lead_ads", email: "not-an-email" })).toBe(true)
    expect(isEmailOnlyRejection({ source: "meta_lead_ads", email: "owner1@example.com" })).toBe(false)
    expect(isEmailOnlyRejection({ source: "meta_lead_ads" })).toBe(false)
    expect(isEmailOnlyRejection({ source: "unknown_source", email: "not-an-email" })).toBe(false)
  })

  it("submitLeadCapture 결과 → inserted·deduped·failed", () => {
    expect(classifyMetaLeadFallbackCapture(stored("lead-1") as never)).toEqual({ outcome: "inserted", leadId: "lead-1" })
    expect(classifyMetaLeadFallbackCapture({ status: 200, body: { ok: true, stored: false, warnings: [] } })).toEqual({ outcome: "deduped" })
    expect(classifyMetaLeadFallbackCapture({ status: 502, body: { ok: false, error: "저장 실패" } })).toMatchObject({
      outcome: "failed",
      reason: "capture_not_stored",
    })
    expect(classifyMetaLeadFallbackCapture({ status: 409, body: { ok: false, error: "접수 중" } })).toMatchObject({
      outcome: "failed",
      reason: "capture_rejected",
    })
    expect(classifyMetaLeadFallbackCapture({ status: 200, body: { ok: true, stored: true, warnings: [] } })).toMatchObject({
      outcome: "failed",
      reason: "capture_error",
    })
  })
})

// ─── 한 번의 폴백 ────────────────────────────────────────────────────────────

describe("runMetaLeadFallback", () => {
  it("선점 0건이면 Graph·저장·finish 0회", async () => {
    const db = setup({ claims: [] })
    const report = await runMetaLeadFallback()
    expect(report).toMatchObject({ status: "ok", claimed: 0, inserted: 0, failed: 0 })
    expect(rpcCalls(db.calls, META_LEAD_FALLBACK_CLAIM_RPC)).toEqual([
      { kind: "rpc", name: META_LEAD_FALLBACK_CLAIM_RPC, args: { p_limit: FALLBACK_CLAIM_LIMIT } },
    ])
    expect(hoisted.fetchMetaLeadDetail).not.toHaveBeenCalled()
    expect(hoisted.submitLeadCapture).not.toHaveBeenCalled()
    expect(rpcCalls(db.calls, META_LEAD_FALLBACK_FINISH_RPC)).toHaveLength(0)
  })

  it("결과 3종 — 저장 inserted(leadId), 60초 중복 deduped, 저장 실패 failed", async () => {
    const db = setup({ claims: [claimRow("2001"), claimRow("2002"), claimRow("2003")] })
    hoisted.submitLeadCapture.mockImplementation(async (payload: { message?: string }) => {
      if (payload.message?.includes("leadgen_id=2001")) return stored("00000000-0000-4000-8000-000000002001")
      if (payload.message?.includes("leadgen_id=2002")) return { status: 200, body: { ok: true, stored: false, warnings: [] } }
      return { status: 502, body: { ok: false, error: "상담 요청을 어드민에 저장하지 못했습니다.", details: ["Failed to store the lead record."] } }
    })

    const report = await runMetaLeadFallback()

    expect(report).toMatchObject({
      status: "ok",
      claimed: 3,
      inserted: 1,
      deduped: 1,
      failed: 1,
      failureReasons: { capture_not_stored: 1 },
      insertedRows: [{ leadgenId: "2001", leadId: "00000000-0000-4000-8000-000000002001" }],
      notPending: 0,
      alerted: false,
    })
    const finishes = finishArgs(db).sort((a, b) => String(a.p_leadgen_id).localeCompare(String(b.p_leadgen_id)))
    expect(finishes).toEqual([
      { p_leadgen_id: "2001", p_result: "inserted", p_public_lead_id: "00000000-0000-4000-8000-000000002001", p_error: null },
      { p_leadgen_id: "2002", p_result: "deduped", p_public_lead_id: null, p_error: null },
      {
        p_leadgen_id: "2003",
        p_result: "failed",
        p_public_lead_id: null,
        p_error: "capture_not_stored: submitLeadCapture 502: 상담 요청을 어드민에 저장하지 못했습니다.",
      },
    ])
    expect(hoisted.emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("저장 payload 는 어드민 웹훅과 같은 빌더(증인 value + Graph 상세)", async () => {
    setup({ claims: [claimRow("2001")] })
    await runMetaLeadFallback()
    expect(hoisted.fetchMetaLeadDetail).toHaveBeenCalledWith("2001")
    const payload = hoisted.submitLeadCapture.mock.calls[0][0]
    expect(payload).toMatchObject({
      source: "meta_lead_ads",
      name: "김합성",
      phone: "010-0000-0001",
      email: "owner1@example.com",
      org: "합성 학원",
      sourceDetail: "가을 소재 A",
      utmSource: "meta",
      utmMedium: "lead_ads",
      utmCampaign: "가을 모집",
      utmTerm: "학원장 타깃",
      utmContent: "가을 소재 A",
    })
    expect(payload.message.split("\n").slice(0, 4)).toEqual(["Meta Lead Ads", "leadgen_id=2001", "page_id=page-1", "form_id=form-9"])
    expect(hoisted.submitLeadCapture.mock.calls[0]).toHaveLength(1)
  })

  it("상세 조회 실패·빈 상세는 failed — 저장하지 않는다(빈 껍데기 없음)", async () => {
    const db = setup({ claims: [claimRow("2001"), claimRow("2002"), claimRow("2003")] })
    hoisted.fetchMetaLeadDetail.mockImplementation(async (leadgenId: string) => {
      if (leadgenId === "2001") throw new Error("Meta lead fetch failed: 400 {\"error\":{\"code\":100}}")
      if (leadgenId === "2002") return { id: "2002" }
      return { id: "2003", field_data: [] }
    })

    const report = await runMetaLeadFallback()

    expect(report).toMatchObject({ claimed: 3, inserted: 0, failed: 3, failureReasons: { detail_fetch_failed: 1, detail_empty: 2 } })
    expect(hoisted.submitLeadCapture).not.toHaveBeenCalled()
    const finishes = finishArgs(db)
    expect(finishes.map((args) => args.p_result)).toEqual(["failed", "failed", "failed"])
    expect(finishes.find((args) => args.p_leadgen_id === "2001")?.p_error).toMatch(/^detail_fetch_failed: Meta lead fetch failed: 400/)
    expect(finishes.find((args) => args.p_leadgen_id === "2002")?.p_error).toMatch(/^detail_empty: /)
  })

  it("Graph 상세가 상한을 넘기면 failed(늦은 응답으로 저장하지 않음)", async () => {
    vi.useRealTimers()
    const db = setup({ claims: [claimRow("2001")] })
    hoisted.fetchMetaLeadDetail.mockImplementation(() => new Promise(() => {}))
    const started = Date.now()
    // 선점까지는 예산이 충분하고, 처리 시작 때는 0.9초만 남았다 → 상세 상한은 최소값 1초
    let reads = 0
    const clock = { now: () => (++reads <= 2 ? started : started + 9_100) }
    const report = await runMetaLeadFallback({ deadlineAt: started + 10_000, clock })
    expect(report).toMatchObject({ failed: 1, failureReasons: { detail_fetch_failed: 1 } })
    expect(hoisted.submitLeadCapture).not.toHaveBeenCalled()
    expect(finishArgs(db)[0]).toMatchObject({ p_result: "failed" })
  }, 5_000)

  it("400 이 이메일 형식 때문이면 이메일을 비워 한 번 더 — inserted, emailDropped", async () => {
    const db = setup({ claims: [claimRow("2001")] })
    hoisted.fetchMetaLeadDetail.mockResolvedValue(
      detail("2001", {
        field_data: [
          { name: "full_name", values: ["김합성"] },
          { name: "phone_number", values: ["010-0000-0001"] },
          { name: "email", values: ["owner1-at-example"] },
        ],
      })
    )
    hoisted.submitLeadCapture
      .mockResolvedValueOnce({ status: 400, body: { ok: false, error: "이메일 형식을 다시 확인해 주세요." } })
      .mockResolvedValueOnce(stored("00000000-0000-4000-8000-000000002001"))

    const report = await runMetaLeadFallback()

    expect(report).toMatchObject({ inserted: 1, emailDropped: 1, failed: 0 })
    expect(hoisted.submitLeadCapture).toHaveBeenCalledTimes(2)
    expect(hoisted.submitLeadCapture.mock.calls[0][0].email).toBe("owner1-at-example")
    expect(hoisted.submitLeadCapture.mock.calls[1][0].email).toBeUndefined()
    expect(hoisted.submitLeadCapture.mock.calls[1][0].phone).toBe("010-0000-0001")
    expect(finishArgs(db)).toEqual([
      { p_leadgen_id: "2001", p_result: "inserted", p_public_lead_id: "00000000-0000-4000-8000-000000002001", p_error: null },
    ])
  })

  it("이메일이 멀쩡한데 400(설정 읽기 실패 등)이면 다시 부르지 않고 failed — 이메일을 버리지 않는다", async () => {
    const db = setup({ claims: [claimRow("2001")] })
    hoisted.submitLeadCapture.mockResolvedValue({ status: 400, body: { ok: false, error: "settings unavailable" } })
    const report = await runMetaLeadFallback()
    expect(report).toMatchObject({ failed: 1, emailDropped: 0, failureReasons: { capture_rejected: 1 } })
    expect(hoisted.submitLeadCapture).toHaveBeenCalledTimes(1)
    expect(finishArgs(db)[0]).toMatchObject({ p_result: "failed", p_error: "capture_rejected: submitLeadCapture 400: settings unavailable" })
  })

  it("이메일을 비워도 400 이면 failed", async () => {
    setup({ claims: [claimRow("2001")] })
    hoisted.fetchMetaLeadDetail.mockResolvedValue(detail("2001", { field_data: [{ name: "email", values: ["broken"] }] }))
    hoisted.submitLeadCapture.mockResolvedValue({ status: 400, body: { ok: false, error: "이메일 형식을 다시 확인해 주세요." } })
    const report = await runMetaLeadFallback()
    // emailDropped 는 "이메일을 비우고 저장한 수" — 저장하지 못했으니 0
    expect(report).toMatchObject({ failed: 1, inserted: 0, emailDropped: 0, failureReasons: { capture_rejected: 1 } })
    expect(hoisted.submitLeadCapture).toHaveBeenCalledTimes(2)
  })

  it("submitLeadCapture 가 던지면 failed(capture_error)", async () => {
    const db = setup({ claims: [claimRow("2001")] })
    hoisted.submitLeadCapture.mockRejectedValue(new Error("boom"))
    const report = await runMetaLeadFallback()
    expect(report).toMatchObject({ status: "ok", failed: 1, failureReasons: { capture_error: 1 } })
    expect(finishArgs(db)[0]).toMatchObject({ p_result: "failed", p_error: "capture_error: submitLeadCapture 예외: boom" })
  })

  it("not_pending — 행을 만들었는데 원장이 다른 행을 가리키면 중복 경보(식별자·건수만)", async () => {
    const db = setup({
      claims: [claimRow("2001"), claimRow("2002")],
      ledger: [
        { leadgen_id: "2001", origin: "compass_mirror", state: "inserted", public_lead_id: "00000000-0000-4000-8000-00000000aaaa" },
        { leadgen_id: "2002", origin: "admin_fallback", state: "inserted", public_lead_id: "00000000-0000-4000-8000-000000002002" },
      ],
      finish: () => ({ data: "not_pending", error: null }),
    })
    hoisted.submitLeadCapture.mockImplementation(async (payload: { message?: string }) =>
      payload.message?.includes("leadgen_id=2001")
        ? stored("00000000-0000-4000-8000-000000002001")
        : stored("00000000-0000-4000-8000-000000002002")
    )

    const report = await runMetaLeadFallback()

    // 2002 는 동시에 돈 선점의 adopt 가 같은 행을 들였다 → 중복 아님
    expect(report).toMatchObject({ inserted: 2, notPending: 2, notPendingDuplicate: 1, alerted: true, status: "ok" })
    expect(fromCalls(db.calls, "meta_lead_mirror_ledger").map((call) => call.filters)).toEqual(
      expect.arrayContaining([[["eq", "leadgen_id", "2001"]], [["eq", "leadgen_id", "2002"]]])
    )
    expect(hoisted.emitNotificationEvent).toHaveBeenCalledTimes(1)
    const alert = hoisted.emitNotificationEvent.mock.calls[0][0]
    expect(alert).toMatchObject({
      eventType: "integration.webhook_failed",
      notificationType: "incident",
      severity: "warning",
      channels: ["wecom_webhook", "email"],
      payload: { count: 1, leadgenIds: ["2001"], leadIds: ["00000000-0000-4000-8000-000000002001"] },
    })
    const serialized = JSON.stringify(alert)
    for (const value of PII_VALUES) expect(serialized).not.toContain(value)
  })

  it("not_pending 이어도 행을 만들지 않았으면(failed·deduped) 경보하지 않는다", async () => {
    setup({ claims: [claimRow("2001"), claimRow("2002")], finish: () => ({ data: "not_pending", error: null }) })
    hoisted.submitLeadCapture.mockImplementation(async (payload: { message?: string }) =>
      payload.message?.includes("leadgen_id=2001")
        ? { status: 200, body: { ok: true, stored: false, warnings: [] } }
        : { status: 502, body: { ok: false, error: "x" } }
    )
    const report = await runMetaLeadFallback()
    expect(report).toMatchObject({ notPending: 2, notPendingDuplicate: 0, alerted: false })
    expect(hoisted.emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("not_pending 뒤 원장을 못 읽으면 중복으로 보고 경보한다(안전 쪽)", async () => {
    hoisted.client = createFakeMirrorDb({
      errors: { meta_lead_mirror_ledger: { message: "permission denied", code: "42501" } },
      rpc: {
        [META_LEAD_FALLBACK_CLAIM_RPC]: () => ({ data: [claimRow("2001")], error: null }),
        [META_LEAD_FALLBACK_FINISH_RPC]: () => ({ data: "not_pending", error: null }),
      },
    }).client
    const report = await runMetaLeadFallback()
    expect(report).toMatchObject({ notPendingDuplicate: 1, alerted: true })
  })

  it("경보 전송이 실패해도 던지지 않고 오류만 남긴다", async () => {
    setup({ claims: [claimRow("2001")], finish: () => ({ data: "not_pending", error: null }) })
    hoisted.emitNotificationEvent.mockRejectedValue(new Error("wecom down"))
    const report = await runMetaLeadFallback()
    expect(report.alerted).toBe(false)
    expect(report.errors.some((message) => message.includes("wecom down"))).toBe(true)
  })

  it("선점 RPC 실패 → failed, Graph 0회", async () => {
    setup({ claimError: { message: "function missing", code: "PGRST202" } })
    const report = await runMetaLeadFallback()
    expect(report.status).toBe("failed")
    expect(report.errors[0]).toContain("meta_lead_fallback_claim 실패: function missing (PGRST202)")
    expect(hoisted.fetchMetaLeadDetail).not.toHaveBeenCalled()
  })

  it("finish RPC 실패 → failed(행은 다음 선점의 adopt·15분 재선점이 바로잡는다)", async () => {
    setup({ claims: [claimRow("2001")], finish: () => ({ data: null, error: { message: "timeout" } }) })
    const report = await runMetaLeadFallback()
    expect(report).toMatchObject({ status: "failed", inserted: 1, finishErrors: 1 })
  })

  it("Supabase 클라이언트를 못 만들면 failed, 던지지 않는다", async () => {
    hoisted.client = null
    const report = await runMetaLeadFallback()
    expect(report.status).toBe("failed")
    expect(hoisted.fetchMetaLeadDetail).not.toHaveBeenCalled()
  })

  it("dryRun 은 선점하지 않는다", async () => {
    const db = setup({ claims: [claimRow("2001")] })
    const report = await runMetaLeadFallback({ dryRun: true })
    expect(report).toMatchObject({ status: "ok", dryRun: true, claimed: 0 })
    expect(db.calls).toHaveLength(0)
  })

  it("예산이 적으면 선점하지 않고 timeout", async () => {
    const db = setup({ claims: [claimRow("2001")] })
    const report = await runMetaLeadFallback({ deadlineAt: NOW + 5_000 })
    expect(report.status).toBe("timeout")
    expect(db.calls).toHaveLength(0)
  })

  it("처리 중 예산이 끝나면 남은 선점은 시작하지 않고 fallback_pending 으로 둔다(finish 없음)", async () => {
    let now = NOW
    const claims = Array.from({ length: 6 }, (_, index) => claimRow(String(3001 + index)))
    const db = setup({ claims })
    hoisted.submitLeadCapture.mockImplementation(async () => {
      now += 6_000
      return stored(`00000000-0000-4000-8000-${String(now).slice(-12)}`)
    })
    const report = await runMetaLeadFallback({ deadlineAt: NOW + 10_000, clock: { now: () => now } })
    expect(report.claimed).toBe(6)
    expect(report.inserted + report.deferred).toBe(6)
    expect(report.deferred).toBeGreaterThan(0)
    expect(report.status).toBe("timeout")
    expect(rpcCalls(db.calls, META_LEAD_FALLBACK_FINISH_RPC)).toHaveLength(report.inserted)
  })

  it("오류 문구·finish p_error 에 신원 값이 없다", async () => {
    const db = setup({ claims: [claimRow("2001"), claimRow("2002")] })
    hoisted.submitLeadCapture.mockResolvedValue({ status: 502, body: { ok: false, error: "상담 요청을 어드민에 저장하지 못했습니다.", details: ["김합성"] } })
    const report = await runMetaLeadFallback()
    const serialized = JSON.stringify({ report, finishes: finishArgs(db) })
    for (const value of PII_VALUES) expect(serialized).not.toContain(value)
  })
})

// ─── 사이클 훅 — 모드와 무관 ─────────────────────────────────────────────────

describe("metaLeadFallbackStep · 모드와 무관하게 돈다", () => {
  function cutoverRow(overrides: Row): Row {
    return {
      id: "default",
      mode: "compass",
      shadow_since: "2026-09-01T00:00:00.000Z",
      mirror_since: "2026-09-14T00:00:00.000Z",
      compass_started_at: "2026-09-14T02:00:00.000Z",
      compass_ended_at: null,
      side_effects: {},
      fallback_after_minutes: 120,
      updated_at: "2026-09-14T02:00:00.000Z",
      ...overrides,
    }
  }

  it("훅은 스위치를 읽지 않는다 — 컨텍스트 cutover 가 없거나 admin·shadow 여도 선점한다", async () => {
    for (const cutover of [null, { mode: "admin" }, { mode: "shadow" }, { mode: "compass" }]) {
      const db = setup({ claims: [claimRow("2001")] })
      const step = await metaLeadFallbackStep({
        cutover: cutover as never,
        dryRun: false,
        deadlineAt: NOW + 40_000,
      })
      expect(step).toMatchObject({ status: "ok", changed: 1, counts: { claimed: 1, inserted: 1 } })
      expect(fromCalls(db.calls, "meta_leadgen_cutover")).toHaveLength(0)
      expect(rpcCalls(db.calls, META_LEAD_FALLBACK_CLAIM_RPC)).toHaveLength(1)
    }
  })

  it("훅 요약은 건수만(식별자·오류 문구는 error 한 줄로만)", async () => {
    setup({ claims: [claimRow("2001")] })
    hoisted.fetchMetaLeadDetail.mockRejectedValue(new Error("token revoked"))
    const step = await metaLeadFallbackStep({ cutover: null, dryRun: false, deadlineAt: NOW + 40_000 })
    expect(step).toEqual({
      status: "ok",
      changed: 1,
      counts: {
        claimed: 1,
        inserted: 0,
        deduped: 0,
        failed: 1,
        emailDropped: 0,
        deferred: 0,
        notPending: 0,
        notPendingDuplicate: 0,
        finishErrors: 0,
        failed_detail_fetch_failed: 1,
      },
    })
  })

  it("롤백 뒤(admin + mirror_since) 크론 사이클에서도 폴백이 compass 구간 증인을 저장한다(F9)", async () => {
    const db = createFakeMirrorDb({
      tables: {
        meta_leadgen_cutover: [cutoverRow({ mode: "admin", compass_ended_at: "2026-09-14T20:00:00.000Z" })],
        meta_lead_mirror_ledger: [],
        meta_lead_mirror_state: [{ id: "default", alert_state: {} }],
      },
      rpc: {
        [META_LEAD_FALLBACK_CLAIM_RPC]: () => ({ data: [claimRow("2001")], error: null }),
        [META_LEAD_FALLBACK_FINISH_RPC]: () => ({ data: "inserted", error: null }),
        [META_LEAD_MIRROR_HEALTH_RPC]: () => ({
          data: { mode: "admin", stale_minutes: 10, views: { submissions: true, refs: true, failures: true }, at_risk: 0, admin_only_saved: 1 },
          error: null,
        }),
      },
    })
    hoisted.client = db.client

    const report = await runMetaLeadMirrorCycle({ trigger: "cron", fallback: metaLeadFallbackStep })

    expect(report.mode).toBe("admin")
    expect(report.mirror.applied.inserted).toBe(0)
    expect(report.fallback).toMatchObject({ status: "ok", changed: 1, counts: { claimed: 1, inserted: 1 } })
    expect(hoisted.submitLeadCapture).toHaveBeenCalledTimes(1)
    // 어드민에만 저장된 리드의 치명 경보는 같은 사이클의 건강 단계가 낸다
    expect(report.health?.alerted).toContain("admin_only_saved")
    expect(hoisted.logAudit).toHaveBeenCalledTimes(1)
  })
})
