import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeMirrorDb, rpcCalls, type Row } from "./fixtures/fake-mirror-supabase"

// 어드민 폴백 × 실제 submitLeadCapture 의 60초 중복 키(리뷰 H-5 P2).
// 폴백 안에서 60초 키(source·ad_name·이메일)가 부딪히는 상대는 늘 다른 leadgen(같은 사람의 다른 제출)이다.
// 그 제출을 deduped → 원장 skipped 로 닫으면 Compass 에도 public.leads 에도 없는데 경보에도 안 잡힌다.
// 그래서 failed(capture_deduped)로 두고, 60초 창이 지난 뒤 재선점에서 저장되는지까지 본다.
// submitLeadCapture·buildLeadPayload 는 실제 코드이고 저장소·설정·부수효과만 목이다. 값은 전부 합성이다.
// (lead-capture 의 중복 키 Map 은 모듈 상태라 이 파일을 따로 둔다 — 다른 폴백 테스트와 섞이지 않게.)

const hoisted = vi.hoisted(() => ({
  client: null as unknown,
  saveLead: vi.fn(),
  fetchMetaLeadDetail: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => hoisted.client }))
vi.mock("@/lib/meta/lead-ads-graph", () => ({ fetchMetaLeadDetail: hoisted.fetchMetaLeadDetail }))
vi.mock("@/lib/repositories/leads", () => ({ saveLead: hoisted.saveLead }))
vi.mock("@/lib/repositories/settings", () => ({ getResolvedSettings: async () => ({ webhookEnabled: {} }) }))
vi.mock("@/lib/automation-engine", () => ({ triggerOnSubmitRules: async () => {} }))
vi.mock("@/lib/marketing/server-conversions", () => ({ sendServerConversion: async () => ({}) }))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: async () => ({}) }))
vi.mock("@/lib/repositories/crm-events", () => ({ createCrmCustomerEvent: async () => ({}) }))
vi.mock("@/lib/repositories/marketing", () => ({ upsertSubscriber: async () => ({}) }))
vi.mock("@/lib/server/post-json", () => ({ postJson: async () => ({ ok: true }) }))

import { META_LEAD_FALLBACK_CLAIM_RPC, META_LEAD_FALLBACK_FINISH_RPC, runMetaLeadFallback } from "@/lib/server/meta-lead-fallback"

const NOW = Date.parse("2026-09-15T03:10:00.000Z")
const SAME_PERSON = new Set(["3001", "3005"])

function claimRow(leadgenId: string): Row {
  return { out_leadgen_id: leadgenId, out_page_id: "page-1", out_form_id: "form-9", out_ad_id: "ad-1", out_attempt: 1 }
}

function detail(leadgenId: string) {
  return {
    id: leadgenId,
    form_id: "form-9",
    ad_id: "ad-1",
    ad_name: "가을 소재 A",
    campaign_name: "가을 모집",
    field_data: [
      { name: "full_name", values: ["김합성"] },
      { name: "email", values: [SAME_PERSON.has(leadgenId) ? "same1@example.com" : `owner${leadgenId}@example.com`] },
      // 같은 사람의 두 번째 제출은 내용이 다르다(규모)
      { name: "student_count", values: [leadgenId === "3005" ? "200" : "50"] },
    ],
  }
}

/** 선점 RPC 는 호출마다 다음 목록을, finish 는 SQL 과 같은 매핑(deduped → skipped)을 돌려준다 */
function setup(claimsPerRun: string[][]) {
  let run = 0
  const db = createFakeMirrorDb({
    tables: { meta_lead_mirror_ledger: [] },
    rpc: {
      [META_LEAD_FALLBACK_CLAIM_RPC]: () => ({ data: (claimsPerRun[run++] ?? []).map(claimRow), error: null }),
      [META_LEAD_FALLBACK_FINISH_RPC]: (args) => ({
        data: args?.p_result === "inserted" ? "inserted" : args?.p_result === "deduped" ? "skipped" : "fallback_failed",
        error: null,
      }),
    },
  })
  hoisted.client = db.client
  return db
}

beforeEach(() => {
  let n = 0
  hoisted.saveLead.mockReset()
  hoisted.saveLead.mockImplementation(async () => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` }))
  hoisted.fetchMetaLeadDetail.mockReset()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(NOW))
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("어드민 폴백 × 60초 중복 키 — 다른 leadgen 을 skipped 로 닫지 않는다", () => {
  it("같은 사람·같은 소재의 두 leadgen 을 한 워커가 잇달아 처리 → 뒤 것은 failed(capture_deduped), 창이 지난 재선점에서 저장", async () => {
    // 3002–3004 는 3005 가 시작될 때까지 붙잡아 둔다 → 3001 을 끝낸 워커가 3005 를 이어 받는다(결정적).
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    hoisted.fetchMetaLeadDetail.mockImplementation(async (leadgenId: string) => {
      if (leadgenId === "3005") release()
      else if (leadgenId !== "3001") await gate
      return detail(leadgenId)
    })
    const db = setup([["3001", "3002", "3003", "3004", "3005"], ["3005"]])

    const first = await runMetaLeadFallback({ deadlineAt: NOW + 40_000 })

    expect(first).toMatchObject({ status: "ok", claimed: 5, inserted: 4, failed: 1, failureReasons: { capture_deduped: 1 } })
    const firstFinishes = rpcCalls(db.calls, META_LEAD_FALLBACK_FINISH_RPC).map((call) => call.args ?? {})
    expect(firstFinishes.find((args) => args.p_leadgen_id === "3005")).toEqual({
      p_leadgen_id: "3005",
      p_result: "failed",
      p_public_lead_id: null,
      p_error: "capture_deduped: 60초 중복 키 충돌(다른 leadgen) — 창이 지난 뒤 재시도",
    })
    expect(firstFinishes.some((args) => args.p_result === "deduped")).toBe(false)
    expect(hoisted.saveLead).toHaveBeenCalledTimes(4)
    expect(hoisted.saveLead.mock.calls.some(([lead]) => lead.message.includes("leadgen_id=3005"))).toBe(false)

    // finish(failed) 의 첫 대기 10분이 지나 다시 선점 — 60초 창 밖이므로 저장된다(leadgen 당 1행)
    vi.setSystemTime(new Date(NOW + 11 * 60_000))
    const second = await runMetaLeadFallback({ deadlineAt: NOW + 11 * 60_000 + 40_000 })

    expect(second).toMatchObject({ status: "ok", claimed: 1, inserted: 1, failed: 0 })
    expect(rpcCalls(db.calls, META_LEAD_FALLBACK_FINISH_RPC).at(-1)?.args).toMatchObject({ p_leadgen_id: "3005", p_result: "inserted" })
    expect(hoisted.saveLead).toHaveBeenCalledTimes(5)
    const saved3005 = hoisted.saveLead.mock.calls[4][0]
    expect(saved3005.message).toContain("leadgen_id=3005")
    expect(saved3005).toMatchObject({ email: "same1@example.com", size: "200", source_detail: "가을 소재 A" })
  })
})
