import { readFileSync } from "fs"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createApplySimulator,
  createFakeMirrorDb,
  fromCalls,
  rpcCalls,
  type FakeError,
  type FromCall,
  type Row,
} from "./fixtures/fake-mirror-supabase"

// 미러 오케스트레이터(설계 META-RECEIVER-FINAL §4-2 H6a·H6d, 설계 B §4-3).
// Supabase 는 메모리 가짜(tests/server/fixtures/fake-mirror-supabase.ts), 부수효과·설정·알림·감사는 목이다.
// 빌더(buildLeadCapturePayload·buildLeadPayload)와 전환 스위치 읽기(leadgen-cutover)는 실제 코드를 통과한다.
// SQL 의미(원장·창·잠금)는 tests/fixtures/meta-leadgen-single-receiver 로컬 PG 시나리오가 검증한다.
// 값은 전부 합성이다(010-0000-xxxx, example.com).

const hoisted = vi.hoisted(() => ({
  client: null as unknown,
  runLeadCaptureEffects: vi.fn(),
  getResolvedSettings: vi.fn(),
  emitNotificationEvent: vi.fn(),
  logAudit: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (!hoisted.client) throw new Error("Supabase env 없음")
    return hoisted.client
  },
}))
vi.mock("@/lib/server/lead-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/lead-capture")>()),
  runLeadCaptureEffects: hoisted.runLeadCaptureEffects,
}))
vi.mock("@/lib/repositories/settings", () => ({ getResolvedSettings: hoisted.getResolvedSettings }))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: hoisted.emitNotificationEvent }))
vi.mock("@/lib/auth/audit", () => ({ logAudit: hoisted.logAudit }))

import { buildLeadCapturePayload } from "@/lib/meta/lead-ads-payload"
import {
  __resetMetaLeadgenCutoverCacheForTests,
  parseMetaLeadgenCutoverRow,
} from "@/lib/meta/leadgen-cutover"
import { buildLeadPayload } from "@/lib/server/lead-capture"
import {
  COMPASS_ADS_VIEW,
  COMPASS_LEAD_REFS_VIEW,
  COMPASS_LEADS_VIEW,
  COMPASS_META_SUBMISSIONS_VIEW,
  META_LEAD_MIRROR_APPLY_RPC,
  META_LEAD_MIRROR_HEALTH_RPC,
  META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC,
  META_LEAD_MIRROR_STATE_TABLE,
  MIRROR_HEALTH_ALERT_METRICS,
  buildMetaLeadMirrorPayload,
  dueMetaLeadMirrorAlerts,
  mirrorLeadCaptureEffectToggles,
  nextMetaLeadMirrorAlertState,
  parseMetaLeadMirrorAlertState,
  readMetaLeadMirrorHealthMetrics,
  resolveMetaLeadMirrorWindow,
  runMetaLeadMirror,
  runMetaLeadMirrorCycle,
  sanitizeMirrorFormAnswers,
  toMetaLeadMirrorApplyRow,
  type MetaLeadMirrorTarget,
} from "@/lib/server/meta-lead-mirror"

const NOW = Date.parse("2026-09-15T03:00:00.000Z")
const MIN = 60_000
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * MIN).toISOString()

const SETTINGS = {
  googleSheetWebhookUrl: undefined,
  leadWebhookUrl: undefined,
  channelTalkWebhookUrl: undefined,
  webhookEnabled: {},
}

const PII_VALUES = ["김합성", "이합성", "01000000001", "01000000002", "owner1@example.com", "owner2@example.com"]

function cutoverRow(overrides: Row = {}): Row {
  return {
    id: "default",
    mode: "compass",
    shadow_since: iso(-7 * 24 * 60),
    mirror_since: iso(-120),
    compass_started_at: iso(-10),
    compass_ended_at: null,
    side_effects: {
      leadCreatedNotification: true,
      subscriberUpsert: true,
      automationOnSubmit: true,
      externalForwards: true,
    },
    fallback_after_minutes: 120,
    updated_at: iso(-10),
    ...overrides,
  }
}

const STANDARD_ANSWERS = [
  { name: "company_name", values: ["합성 학원"] },
  { name: "student_count", values: ["120"] },
  { name: "marketing_consent", values: ["동의"] },
]

function submission(leadgenId: string, leadId: number | null, receivedAt: string, extra: Row = {}): Row {
  return {
    leadgen_id: leadgenId,
    lead_id: leadId,
    outcome: "created",
    via: "webhook",
    ad_id: "ad-1",
    ad_name: "가을 소재 A",
    adset_id: "as-1",
    adset_name: "학원장 타깃",
    campaign_id: "c-1",
    campaign_name: "가을 모집",
    form_id: "form-9",
    page_id: "page-1",
    platform: "fb",
    submitted_at: receivedAt,
    received_at: receivedAt,
    form_answers: STANDARD_ANSWERS,
    ...extra,
  }
}

function compassLead(id: number, extra: Row = {}): Row {
  return {
    id,
    name: "김합성",
    phone_key: "01000000001",
    email_key: "owner1@example.com",
    meta_ad_id: "ad-1",
    campaign_id: "c-1",
    ...extra,
  }
}

function healthRow(overrides: Row = {}): Row {
  return {
    mode: "compass",
    heartbeat_at: iso(-10),
    stale_minutes: 10,
    views: { submissions: true, refs: true, failures: true },
    at_risk: 0,
    admin_only_saved: 0,
    fallback_failed: 0,
    h1_receipts_missing_in_compass_2h: 0,
    h1b_receipts_in_compass_failures_2h: 0,
    h2_mirror_backlog_30m: 0,
    h3_blocked: 0,
    h3b_skipped: 0,
    h4_duplicate_leadgens_with_mirror: 0,
    h5_refs_without_submission: 0,
    h6_side_effects_pending_1h: 0,
    ...overrides,
  }
}

type SetupInput = {
  cutover?: Row
  submissions?: Row[]
  refs?: Row[]
  leads?: Row[]
  ads?: Row[]
  ledger?: Row[]
  alertState?: unknown
  errors?: Record<string, FakeError | ((call: FromCall) => FakeError | null)>
  health?: Row | (() => { data: unknown; error: FakeError | null })
  applyError?: (callIndex: number) => FakeError | null
  blockLeadgens?: string[]
  onSleep?: (now: number) => void
}

function setup(input: SetupInput = {}) {
  let now = NOW
  const sleeps: number[] = []
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      now += ms
      input.onSleep?.(now)
    },
  }
  const ledger = input.ledger ?? []
  const sim = createApplySimulator(ledger, {
    now: () => new Date(now).toISOString(),
    blockLeadgens: new Set(input.blockLeadgens ?? []),
  })
  let applyIndex = 0
  const db = createFakeMirrorDb({
    tables: {
      meta_leadgen_cutover: [cutoverRow(input.cutover)],
      [COMPASS_META_SUBMISSIONS_VIEW]: input.submissions ?? [],
      [COMPASS_LEAD_REFS_VIEW]: input.refs ?? [],
      [COMPASS_LEADS_VIEW]: input.leads ?? [],
      [COMPASS_ADS_VIEW]: input.ads ?? [],
      meta_lead_mirror_ledger: ledger,
      [META_LEAD_MIRROR_STATE_TABLE]: [
        { id: "default", last_run_at: null, last_run_status: null, last_summary: {}, alert_state: input.alertState ?? {} },
      ],
    },
    errors: input.errors,
    rpc: {
      [META_LEAD_MIRROR_APPLY_RPC]: (args) => {
        const error = input.applyError?.(applyIndex)
        applyIndex += 1
        return error ? { data: null, error } : sim.handler(args)
      },
      [META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC]: sim.mark,
      [META_LEAD_MIRROR_HEALTH_RPC]: () =>
        typeof input.health === "function" ? input.health() : { data: input.health ?? healthRow(), error: null },
    },
  })
  hoisted.client = db.client
  return {
    db,
    sim,
    ledger,
    clock,
    sleeps,
    advance: (ms: number) => {
      now += ms
    },
  }
}

function applyRows(calls: ReturnType<typeof setup>["db"]["calls"]) {
  return rpcCalls(calls, META_LEAD_MIRROR_APPLY_RPC).flatMap((call) => (call.args?.p_rows ?? []) as Row[])
}

function effectsCalls() {
  return hoisted.runLeadCaptureEffects.mock.calls as Array<[Record<string, unknown>, Record<string, unknown>]>
}

beforeEach(() => {
  __resetMetaLeadgenCutoverCacheForTests()
  hoisted.client = null
  hoisted.runLeadCaptureEffects.mockReset()
  hoisted.runLeadCaptureEffects.mockImplementation(async (_body: unknown, options: { context?: { deferTask?: (task: () => Promise<void>) => void } }) => {
    options.context?.deferTask?.(async () => undefined)
    return { errors: [] }
  })
  hoisted.getResolvedSettings.mockReset()
  hoisted.getResolvedSettings.mockResolvedValue(SETTINGS)
  hoisted.emitNotificationEvent.mockReset()
  hoisted.emitNotificationEvent.mockResolvedValue({ id: "event-1", deliveryResults: [] })
  hoisted.logAudit.mockReset()
  hoisted.logAudit.mockResolvedValue(undefined)
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

describe("resolveMetaLeadMirrorWindow", () => {
  const parse = (row: Row) => parseMetaLeadgenCutoverRow(cutoverRow(row))

  it("admin + mirror_since 없음 → 창 없음", () => {
    expect(resolveMetaLeadMirrorWindow(parse({ mode: "admin", mirror_since: null }))).toBeNull()
  })

  it("compass → mirror_since 부터 상한 없음", () => {
    expect(resolveMetaLeadMirrorWindow(parse({}))).toEqual({ kind: "compass", from: iso(-120), before: null })
  })

  it("롤백(admin + compass_ended_at) → 끝난 뒤 10분까지 잔여분 창", () => {
    expect(
      resolveMetaLeadMirrorWindow(parse({ mode: "admin", mirror_since: iso(-180), compass_ended_at: iso(-40) }))
    ).toEqual({ kind: "residual", from: iso(-180), before: iso(-30) })
  })

  it("admin + mirror_since 만 있고 끝난 시각이 없거나, 창이 비었으면 없음", () => {
    expect(resolveMetaLeadMirrorWindow(parse({ mode: "admin", mirror_since: iso(-180) }))).toBeNull()
    expect(
      resolveMetaLeadMirrorWindow(parse({ mode: "admin", mirror_since: iso(-5), compass_ended_at: iso(-30) }))
    ).toBeNull()
  })
})

describe("합성 detail → 어드민 웹훅과 같은 빌더", () => {
  const target: MetaLeadMirrorTarget = {
    kind: "submission",
    leadgenId: "111",
    receivedAt: iso(-30),
    compassLeadId: 11,
    pageId: "page-1",
    formId: "form-9",
    ad: {
      adId: "ad-1",
      adName: "가을 소재 A",
      adsetId: "as-1",
      adsetName: "학원장 타깃",
      campaignId: "c-1",
      campaignName: "가을 모집",
    },
    formAnswers: STANDARD_ANSWERS,
  }
  const identity = { name: "김합성", phoneKey: "01000000001", emailKey: "owner1@example.com" }

  it("Graph 가 같은 값을 줬을 때 웹훅이 만드는 payload 와 같다", () => {
    const graphDetail = {
      id: "111",
      form_id: "form-9",
      ad_id: "ad-1",
      ad_name: "가을 소재 A",
      adset_id: "as-1",
      adset_name: "학원장 타깃",
      campaign_id: "c-1",
      campaign_name: "가을 모집",
      field_data: [
        { name: "full_name", values: ["김합성"] },
        { name: "phone_number", values: ["01000000001"] },
        { name: "email", values: ["owner1@example.com"] },
        ...STANDARD_ANSWERS,
      ],
    }
    const webhook = buildLeadPayload(
      buildLeadCapturePayload({ leadgen_id: "111", page_id: "page-1", form_id: "form-9" }, graphDetail)
    )
    const mirrored = buildMetaLeadMirrorPayload(target, identity)
    expect(mirrored).toEqual({ payload: webhook, emailDropped: false })
    expect(mirrored.payload).toMatchObject({
      source: "meta_lead_ads",
      name: "김합성",
      org: "합성 학원",
      size: "120",
      phone: "01000000001",
      email: "owner1@example.com",
      marketingConsent: true,
      sourceDetail: "가을 소재 A",
      utmSource: "meta",
      utmMedium: "lead_ads",
      utmCampaign: "가을 모집",
      utmTerm: "학원장 타깃",
      utmContent: "가을 소재 A",
    })
    expect(mirrored.payload.message).toBe(
      [
        "Meta Lead Ads",
        "leadgen_id=111",
        "page_id=page-1",
        "form_id=form-9",
        "campaign=가을 모집",
        "adset=학원장 타깃",
        "ad=가을 소재 A",
        "fields=full_name: 김합성 / phone_number: 01000000001 / email: owner1@example.com / company_name: 합성 학원 / student_count: 120 / marketing_consent: 동의",
      ].join("\n")
    )
  })

  it("이메일 형식 오류면 이메일만 비우고 다시 조립한다(행을 잃지 않음)", () => {
    const { payload, emailDropped } = buildMetaLeadMirrorPayload(target, { ...identity, emailKey: "not-an-email" })
    expect(emailDropped).toBe(true)
    expect(payload.email).toBeUndefined()
    expect(payload.name).toBe("김합성")
    expect(payload.phone).toBe("01000000001")
    expect(payload.message).not.toContain("not-an-email")
    expect(payload.message).toContain("fields=full_name: 김합성 / phone_number: 01000000001 / company_name")
  })

  it("신원 값이 없으면 그 필드를 넣지 않는다", () => {
    const { payload } = buildMetaLeadMirrorPayload(target, { name: null, phoneKey: "01000000001", emailKey: null })
    expect(payload.name).toBeUndefined()
    expect(payload.message).toContain("fields=phone_number: 01000000001 / company_name: 합성 학원")
  })

  it("광고·폼 id 가 없으면(링크 폴백) 웹훅의 상세 없는 모양과 같은 줄을 쓴다", () => {
    const { payload } = buildMetaLeadMirrorPayload(
      {
        ...target,
        kind: "ref",
        pageId: null,
        formId: null,
        formAnswers: [],
        ad: { adId: "ad-7", adName: null, adsetId: null, adsetName: null, campaignId: "c-7", campaignName: null },
      },
      identity
    )
    expect(payload.message?.split("\n").slice(0, 6)).toEqual([
      "Meta Lead Ads",
      "leadgen_id=111",
      "page_id=-",
      "form_id=-",
      "campaign=c-7",
      "ad=ad-7",
    ])
    expect(payload).toMatchObject({ utmCampaign: "c-7", utmContent: "ad-7", sourceDetail: undefined, size: undefined })
  })
})

describe("sanitizeMirrorFormAnswers", () => {
  it("모양이 틀린 항목·신원 키를 버리고 순서를 지킨다", () => {
    expect(sanitizeMirrorFormAnswers(null)).toEqual([])
    expect(sanitizeMirrorFormAnswers({ name: "company_name" })).toEqual([])
    expect(
      sanitizeMirrorFormAnswers([
        { name: "student_count", values: ["30", 5, null] },
        "junk",
        { values: ["x"] },
        { name: " Full_Name ", values: ["다른 이름"] },
        { name: "이메일", values: ["other@example.com"] },
        { name: "city", values: "서울" },
        { name: "job_title" },
      ])
    ).toEqual([
      { name: "student_count", values: ["30"] },
      { name: "city", values: ["서울"] },
      { name: "job_title", values: [] },
    ])
  })
})

describe("미러 부수효과 토글·적용 행 계약", () => {
  it("DB 토글 4개는 그대로, 서버 전환·site_inflow 는 항상 끈다", () => {
    expect(
      mirrorLeadCaptureEffectToggles({
        leadCreatedNotification: true,
        subscriberUpsert: false,
        automationOnSubmit: true,
        externalForwards: false,
      })
    ).toEqual({
      leadCreatedNotification: true,
      subscriberUpsert: false,
      automationOnSubmit: true,
      externalForwards: false,
      serverConversion: false,
      siteInflow: false,
    })
  })

  it("적용 행 키 ∪ skip_reason = 마이그레이션 meta_lead_mirror_apply 가 읽는 r->>'키' 전부", () => {
    const sql = readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260915_meta_leadgen_single_receiver.sql"),
      "utf8"
    )
    const start = sql.indexOf("create or replace function public.meta_lead_mirror_apply")
    const body = sql.slice(start, sql.indexOf("end $$;", start))
    const sqlKeys = new Set([...body.matchAll(/r->>'([a-z_]+)'/g)].map((match) => match[1]))
    const { payload } = buildMetaLeadMirrorPayload(
      {
        kind: "submission",
        leadgenId: "1",
        receivedAt: iso(0),
        compassLeadId: 1,
        pageId: null,
        formId: null,
        ad: { adId: null, adName: null, adsetId: null, adsetName: null, campaignId: null, campaignName: null },
        formAnswers: [],
      },
      { name: "a", phoneKey: null, emailKey: null }
    )
    const rowKeys = new Set([
      ...Object.keys(
        toMetaLeadMirrorApplyRow(
          {
            kind: "submission",
            leadgenId: "1",
            receivedAt: iso(0),
            compassLeadId: 1,
            pageId: null,
            formId: null,
            ad: { adId: null, adName: null, adsetId: null, adsetName: null, campaignId: null, campaignName: null },
            formAnswers: [],
          },
          payload
        )
      ),
      "skip_reason",
    ])
    expect(sqlKeys.size).toBeGreaterThan(10)
    expect([...rowKeys].sort()).toEqual([...sqlKeys].sort())
  })
})

// ─── 한 번의 미러 ────────────────────────────────────────────────────────────

describe("runMetaLeadMirror — 모드", () => {
  it("admin 이고 mirror_since 가 없으면 skipped — 스위치 말고는 읽지 않는다", async () => {
    const env = setup({ cutover: { mode: "admin", mirror_since: null, compass_started_at: null } })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("skipped")
    expect(env.db.calls.map((call) => (call.kind === "from" ? call.table : call.name))).toEqual(["meta_leadgen_cutover"])
    expect(hoisted.logAudit).not.toHaveBeenCalled()
  })

  it("shadow 는 쓰지 않는다(대조는 H6c) — 뷰·RPC 0회", async () => {
    const env = setup({ cutover: { mode: "shadow", mirror_since: null }, submissions: [submission("1001", 11, iso(-30))] })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report).toMatchObject({ status: "shadow", mode: "shadow" })
    expect(env.db.calls).toHaveLength(1)
  })

  it("스위치를 못 읽으면 failed — 뷰를 읽지 않는다", async () => {
    const env = setup({ errors: { meta_leadgen_cutover: { message: "permission denied", code: "42501" } } })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("failed")
    expect(report.errors[0]).toContain("전환 스위치 읽기 실패")
    expect(fromCalls(env.db.calls, COMPASS_META_SUBMISSIONS_VIEW)).toHaveLength(0)
  })
})

describe("runMetaLeadMirror — 크론 창 스캔", () => {
  function scenario() {
    return setup({
      submissions: [
        submission("1001", 11, iso(-60)),
        submission("1002", 12, iso(-30), { form_answers: null, ad_name: null }),
        submission("1003", 11, iso(-1)), // 2분 커밋 여유 안
        submission("1004", 11, iso(-180)), // mirror_since 전
        submission("1005", 15, iso(-20)), // Compass 에서 지운 리드
        submission("1006", 11, iso(-40)), // 원장 adopted
        submission("1007", 17, iso(-50)), // 원장 blocked → 다시 보냄
        submission("2002", 22, iso(-200)), // 링크 2002 의 제출 행(창 밖)
      ],
      refs: [
        { lead_id: 11, system: "meta_leadgen", external_id: "1001", created_at: iso(-60), matched_by: "leadgen" },
        { lead_id: 21, system: "meta_leadgen", external_id: "2001", created_at: iso(-45), matched_by: "leadgen" },
        { lead_id: 22, system: "meta_leadgen", external_id: "2002", created_at: iso(-45), matched_by: "leadgen" },
        { lead_id: 23, system: "sheet_row", external_id: "9999", created_at: iso(-45), matched_by: "sheet" },
      ],
      leads: [
        compassLead(11),
        compassLead(12, { name: "이합성", phone_key: "01000000002", email_key: "owner2@example.com" }),
        compassLead(17),
        compassLead(21, { meta_ad_id: "ad-7", campaign_id: "c-7" }),
        compassLead(22),
      ],
      ads: [
        { day: "2026-09-13", ad_id: "ad-7", ad_name: "옛 소재명", adset_id: "as-7", adset_name: "옛 세트", campaign_id: "c-7", campaign_name: "옛 캠페인" },
        { day: "2026-09-14", ad_id: "ad-7", ad_name: "최신 소재명", adset_id: "as-7", adset_name: "최신 세트", campaign_id: "c-7", campaign_name: "최신 캠페인" },
      ],
      ledger: [
        { leadgen_id: "1006", origin: "admin_webhook", state: "adopted", public_lead_id: "00000000-0000-4000-8000-00000000a006", side_effects_done_at: null, updated_at: iso(-30) },
        { leadgen_id: "1007", origin: "compass_mirror", state: "blocked", public_lead_id: null, side_effects_done_at: null, updated_at: iso(-30) },
      ],
    })
  }

  it("창·커밋 여유·원장·삭제 리드·링크 폴백을 거쳐 한 번에 적용한다", async () => {
    const env = scenario()
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })

    expect(report.status).toBe("ok")
    const scan = fromCalls(env.db.calls, COMPASS_META_SUBMISSIONS_VIEW)[0]
    expect(scan.count).toBe("exact")
    expect(scan.filters).toEqual([
      ["gte", "received_at", iso(-120)],
      ["lte", "received_at", iso(-2)],
    ])
    expect(scan.orders).toEqual([
      ["received_at", true],
      ["leadgen_id", true],
    ])
    const refsScan = fromCalls(env.db.calls, COMPASS_LEAD_REFS_VIEW)[0]
    expect(refsScan.filters).toEqual([
      ["eq", "system", "meta_leadgen"],
      ["gte", "created_at", iso(-120)],
      ["lte", "created_at", iso(-2)],
    ])
    const identity = fromCalls(env.db.calls, COMPASS_LEADS_VIEW)
    expect(identity).toHaveLength(1)
    expect(identity[0].select).toBe("id,name,phone_key,email_key,meta_ad_id,campaign_id")

    const rows = applyRows(env.db.calls)
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(1)
    expect(rows.map((row) => row.leadgen_id)).toEqual(["1001", "1007", "1002", "1005", "2001"])
    expect(rows[0]).toEqual({
      leadgen_id: "1001",
      received_at: iso(-60),
      compass_lead_id: 11,
      name: "김합성",
      org: "합성 학원",
      role: null,
      size: "120",
      email: "owner1@example.com",
      phone: "01000000001",
      message: expect.stringContaining("leadgen_id=1001\npage_id=page-1\nform_id=form-9"),
      branch: null,
      source_detail: "가을 소재 A",
      lead_magnet: null,
      utm_source: "meta",
      utm_medium: "lead_ads",
      utm_campaign: "가을 모집",
      utm_term: "학원장 타깃",
      utm_content: "가을 소재 A",
    })
    expect(rows[2]).toMatchObject({ leadgen_id: "1002", name: "이합성", org: null, size: null, utm_content: "ad-1", source_detail: null })
    expect(rows[3]).toEqual({ leadgen_id: "1005", received_at: iso(-20), compass_lead_id: 15, skip_reason: "compass_lead_deleted" })
    expect(rows[4]).toMatchObject({
      leadgen_id: "2001",
      received_at: iso(-45),
      compass_lead_id: 21,
      utm_content: "최신 소재명",
      utm_campaign: "최신 캠페인",
      utm_term: "최신 세트",
      size: null,
      message: expect.stringContaining("leadgen_id=2001\npage_id=-\nform_id=-\ncampaign=최신 캠페인"),
    })

    expect(report.targets).toMatchObject({ submissions: 5, refsFallback: 1, inLedger: 1, invalid: 0, truncated: false })
    expect(report.built).toEqual({ rows: 5, skippedDeleted: 1, emailDropped: 0, buildFailed: 0 })
    expect(report.applied).toMatchObject({ batches: 1, inserted: 4, skipped: 1, blocked: 0, existing: 0 })
    expect(report.inserted.map((item) => item.leadgenId)).toEqual(["1001", "1007", "1002", "2001"])
  })

  it("inserted 에만 부수효과(서버 전환·site_inflow 끔) → 끝난 id 를 표시하고 감사에 남긴다", async () => {
    const env = scenario()
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })

    const calls = effectsCalls()
    expect(calls).toHaveLength(4)
    for (const [body, options] of calls) {
      expect(body.source).toBe("meta_lead_ads")
      expect(options).toMatchObject({
        settings: SETTINGS,
        stored: true,
        toggles: {
          externalForwards: true,
          subscriberUpsert: true,
          automationOnSubmit: true,
          leadCreatedNotification: true,
          serverConversion: false,
          siteInflow: false,
        },
      })
      expect(options.conversionEventId).toBe(`lead:${options.savedLeadId}`)
    }
    expect(calls.map(([, options]) => options.savedLeadId)).toEqual(report.inserted.map((item) => item.leadId))
    expect(hoisted.getResolvedSettings).toHaveBeenCalledTimes(1)

    const marks = rpcCalls(env.db.calls, META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC)
    expect(marks).toHaveLength(1)
    expect([...(marks[0].args?.p_leadgen_ids as string[])].sort()).toEqual(["1001", "1002", "1007", "2001"])
    expect(report.sideEffects).toMatchObject({ ran: 4, marked: 4, failed: 0, deferred: 0 })

    expect(hoisted.logAudit).toHaveBeenCalledTimes(1)
    const audit = hoisted.logAudit.mock.calls[0][0]
    expect(audit).toMatchObject({ actorUserId: null, action: "meta_lead_mirror.run", targetType: "meta_lead_mirror" })
    expect(audit.payload.inserted).toEqual(report.inserted)
    const auditText = JSON.stringify(audit)
    for (const value of PII_VALUES) expect(auditText).not.toContain(value)

    // 미러 한 번은 심장박동·건강을 쓰지 않는다(크론 사이클이 한다)
    expect(fromCalls(env.db.calls, META_LEAD_MIRROR_STATE_TABLE)).toHaveLength(0)
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_HEALTH_RPC)).toHaveLength(0)
  })

  it("같은 창을 다시 돌면 원장이 끝낸 leadgen 은 보내지 않고 감사도 남기지 않는다", async () => {
    const env = scenario()
    await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    hoisted.logAudit.mockClear()
    hoisted.runLeadCaptureEffects.mockClear()
    const before = rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC).length

    const again = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(again.status).toBe("ok")
    expect(again.targets.inLedger).toBe(6)
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(before)
    expect(hoisted.runLeadCaptureEffects).not.toHaveBeenCalled()
    expect(hoisted.logAudit).not.toHaveBeenCalled()
  })

  it("cutover.side_effects 토글을 그대로 넘긴다", async () => {
    const env = setup({
      cutover: {
        side_effects: { leadCreatedNotification: true, subscriberUpsert: false, automationOnSubmit: false, externalForwards: false },
      },
      submissions: [submission("1001", 11, iso(-30))],
      leads: [compassLead(11)],
    })
    await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(effectsCalls()[0][1].toggles).toEqual({
      leadCreatedNotification: true,
      subscriberUpsert: false,
      automationOnSubmit: false,
      externalForwards: false,
      serverConversion: false,
      siteInflow: false,
    })
  })

  it("1000행이 넘는 창은 페이지로 나눠 읽고, 적용은 100건씩 보낸다", async () => {
    const submissions = Array.from({ length: 1050 }, (_, index) =>
      submission(String(500000 + index), 11, new Date(NOW - 100 * MIN + index * 1000).toISOString())
    )
    const env = setup({ submissions, leads: [compassLead(11)] })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })

    const scans = fromCalls(env.db.calls, COMPASS_META_SUBMISSIONS_VIEW).filter((call) => call.range)
    expect(scans.map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1049],
    ])
    const batches = rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC).map((call) => (call.args?.p_rows as Row[]).length)
    expect(batches).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50])
    expect(report.applied.inserted).toBe(1050)
    expect(fromCalls(env.db.calls, "meta_lead_mirror_ledger")).toHaveLength(6) // 200개 청크
    expect(report.status).toBe("ok")
  })

  it("신원 이메일 형식 오류는 이메일만 비우고 저장한다", async () => {
    const env = setup({
      submissions: [submission("1001", 11, iso(-30))],
      leads: [compassLead(11, { email_key: "broken@@example" })],
    })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(applyRows(env.db.calls)[0]).toMatchObject({ leadgen_id: "1001", email: null, phone: "01000000001" })
    expect(report.built.emailDropped).toBe(1)
    expect(report.applied.inserted).toBe(1)
  })

  it("롤백 잔여분 창은 compass_ended_at + 10분 전 제출만 본다", async () => {
    const env = setup({
      cutover: { mode: "admin", mirror_since: iso(-180), compass_ended_at: iso(-40) },
      submissions: [submission("1001", 11, iso(-35)), submission("1002", 11, iso(-20))],
      leads: [compassLead(11)],
    })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.window).toEqual({ kind: "residual", from: iso(-180), before: iso(-30) })
    expect(fromCalls(env.db.calls, COMPASS_META_SUBMISSIONS_VIEW)[0].filters).toEqual([
      ["gte", "received_at", iso(-180)],
      ["lte", "received_at", iso(-2)],
      ["lt", "received_at", iso(-30)],
    ])
    expect(applyRows(env.db.calls).map((row) => row.leadgen_id)).toEqual(["1001"])
  })

  it("dryRun 은 조립만 하고 RPC·부수효과·감사를 하지 않는다", async () => {
    const env = scenario()
    const report = await runMetaLeadMirror({ trigger: "admin", dryRun: true, clock: env.clock })
    expect(report).toMatchObject({ status: "ok", dryRun: true })
    expect(report.built.rows).toBe(5)
    expect(env.db.calls.filter((call) => call.kind === "rpc")).toHaveLength(0)
    expect(hoisted.runLeadCaptureEffects).not.toHaveBeenCalled()
    expect(hoisted.logAudit).not.toHaveBeenCalled()
  })
})

describe("runMetaLeadMirror — 장애", () => {
  const base = () => ({
    submissions: [submission("1001", 11, iso(-30)), submission("1002", 11, iso(-25))],
    refs: [{ lead_id: 11, system: "meta_leadgen", external_id: "2001", created_at: iso(-30) }],
    leads: [compassLead(11)],
  })

  it("제출 뷰가 없으면(42P01) bridge_down — 원장·신원·적용 없음", async () => {
    const env = setup({
      ...base(),
      errors: { [COMPASS_META_SUBMISSIONS_VIEW]: { message: 'relation "public.compass_meta_submissions_v" does not exist', code: "42P01" } },
    })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("bridge_down")
    expect(report.errors[0]).toContain("42P01")
    expect(fromCalls(env.db.calls, "meta_lead_mirror_ledger")).toHaveLength(0)
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
  })

  it("신원 뷰를 못 읽으면 bridge_down — 연락처 없는 행을 만들지 않는다", async () => {
    const env = setup({ ...base(), errors: { [COMPASS_LEADS_VIEW]: { message: "permission denied", code: "42501" } } })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("bridge_down")
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
    expect(hoisted.logAudit).not.toHaveBeenCalled()
  })

  it("링크 뷰만 못 읽으면 제출 행은 적용하고 bridge_down 으로 알린다", async () => {
    const env = setup({ ...base(), errors: { [COMPASS_LEAD_REFS_VIEW]: { message: "timeout", code: "57014" } } })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("bridge_down")
    expect(applyRows(env.db.calls).map((row) => row.leadgen_id)).toEqual(["1001", "1002"])
    expect(report.applied.inserted).toBe(2)
  })

  it("광고 뷰를 못 읽으면 링크 폴백 대상만 이번에 빼고 bridge_down", async () => {
    const env = setup({
      ...base(),
      leads: [compassLead(11, { meta_ad_id: "ad-9" })],
      errors: { [COMPASS_ADS_VIEW]: { message: "boom" } },
    })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("bridge_down")
    expect(applyRows(env.db.calls).map((row) => row.leadgen_id)).toEqual(["1001", "1002"])
  })

  it("원장을 못 읽으면 failed", async () => {
    const env = setup({ ...base(), errors: { meta_lead_mirror_ledger: { message: "boom" } } })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("failed")
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
  })

  it("적용 RPC 가 실패하면 그 뒤 배치를 보내지 않고 failed", async () => {
    const submissions = Array.from({ length: 150 }, (_, index) =>
      submission(String(700000 + index), 11, new Date(NOW - 60 * MIN + index * 1000).toISOString())
    )
    const env = setup({ submissions, leads: [compassLead(11)], applyError: () => ({ message: "deadlock detected", code: "40P01" }) })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("failed")
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(1)
    expect(hoisted.runLeadCaptureEffects).not.toHaveBeenCalled()
  })

  it("예산이 끝났으면 적용을 시작하지 않고 timeout", async () => {
    const env = setup(base())
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock, deadlineAt: NOW })
    expect(report.status).toBe("timeout")
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
  })

  it("부수효과가 던진 행은 완료 표시하지 않는다(15분 뒤 다시)", async () => {
    const env = setup(base())
    hoisted.runLeadCaptureEffects.mockImplementationOnce(async () => {
      throw new Error("automation module crashed")
    })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.sideEffects).toMatchObject({ ran: 2, failed: 1, marked: 2 })
    expect((rpcCalls(env.db.calls, META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC)[0].args?.p_leadgen_ids as string[])).toEqual(["1002", "2001"])
    expect(report.status).toBe("ok")
  })

  it("전달 오류는 부수효과 함수가 인시던트를 냈으므로 완료로 표시한다", async () => {
    const env = setup(base())
    hoisted.runLeadCaptureEffects.mockResolvedValue({ errors: ["Google Sheet: 500"] })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.sideEffects).toMatchObject({ ran: 3, deliveryErrors: 3, marked: 3 })
  })

  it("설정을 못 읽으면 부수효과를 미루고 표시하지 않는다", async () => {
    const env = setup(base())
    hoisted.getResolvedSettings.mockRejectedValue(new Error("settings down"))
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })
    expect(report.applied.inserted).toBe(3)
    expect(report.sideEffects).toMatchObject({ ran: 0, failed: 3, marked: 0 })
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC)).toHaveLength(0)
  })
})

describe("runMetaLeadMirror — webhook after() 경로", () => {
  it("요청 id 만 보고, 커밋 여유 없이, 보일 때까지 2초 간격으로 기다린다", async () => {
    const submissions: Row[] = []
    const env = setup({
      leads: [compassLead(11)],
      onSleep: (now) => {
        if (now === NOW + 2000) submissions.push(submission("3001", 11, new Date(now).toISOString()))
      },
    })
    env.db.tables[COMPASS_META_SUBMISSIONS_VIEW] = submissions
    const report = await runMetaLeadMirror({
      trigger: "webhook",
      leadgenIds: ["3001", "3002", "abc"],
      waitForCompassMs: 6000,
      clock: env.clock,
    })

    expect(env.sleeps).toEqual([2000, 2000, 2000])
    expect(report.waitedMs).toBe(6000)
    const polls = fromCalls(env.db.calls, COMPASS_META_SUBMISSIONS_VIEW)
    expect(polls[0].filters).toEqual([
      ["in", "leadgen_id", ["3001", "3002"]],
      ["gte", "received_at", iso(-120)],
    ])
    expect(polls[1].filters[0]).toEqual(["in", "leadgen_id", ["3001", "3002"]])
    expect(polls[2].filters[0]).toEqual(["in", "leadgen_id", ["3002"]])
    expect(fromCalls(env.db.calls, COMPASS_LEAD_REFS_VIEW)[0].filters).toEqual([
      ["eq", "system", "meta_leadgen"],
      ["in", "external_id", ["3002"]],
      ["gte", "created_at", iso(-120)],
    ])
    expect(applyRows(env.db.calls).map((row) => row.leadgen_id)).toEqual(["3001"])
    expect(report.targets).toMatchObject({ submissions: 1, notVisible: 1, invalid: 1 })
    expect(report.status).toBe("ok")
  })

  it("처음부터 다 보이면 기다리지 않는다", async () => {
    const env = setup({ submissions: [submission("3001", 11, iso(0))], leads: [compassLead(11)] })
    const report = await runMetaLeadMirror({ trigger: "webhook", leadgenIds: ["3001"], waitForCompassMs: 20_000, clock: env.clock })
    expect(env.sleeps).toEqual([])
    expect(report.applied.inserted).toBe(1)
  })

  it("기다림은 예산에서 조립 여유(5초)를 뺀 만큼만", async () => {
    const env = setup({ leads: [compassLead(11)] })
    const report = await runMetaLeadMirror({
      trigger: "webhook",
      leadgenIds: ["3001"],
      waitForCompassMs: 20_000,
      deadlineAt: NOW + 10_000,
      clock: env.clock,
    })
    expect(env.sleeps).toEqual([2000, 2000])
    expect(report.targets.notVisible).toBe(1)
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
  })

  it("제출 행 없이 링크만 보이면 링크 폴백으로 만든다", async () => {
    const env = setup({
      refs: [{ lead_id: 11, system: "meta_leadgen", external_id: "3001", created_at: iso(0) }],
      leads: [compassLead(11, { meta_ad_id: null })],
    })
    const report = await runMetaLeadMirror({ trigger: "webhook", leadgenIds: ["3001"], clock: env.clock })
    expect(report.targets).toMatchObject({ submissions: 0, refsFallback: 1, notVisible: 0 })
    expect(applyRows(env.db.calls)[0]).toMatchObject({ leadgen_id: "3001", utm_content: null, utm_campaign: "c-1" })
  })
})

describe("runMetaLeadMirror — 미완 부수효과 재시도", () => {
  it("15분~24시간 미완은 다시 돌리고, 24시간 넘은 것은 포기 표시만, 15분 안은 두고 본다", async () => {
    const env = setup({
      cutover: { mirror_since: iso(-30 * 60) },
      submissions: [
        submission("4001", 11, iso(-30)),
        submission("4002", 11, iso(-10)),
        submission("4003", 11, iso(-26 * 60)),
        submission("4004", 11, iso(-40)),
      ],
      leads: [compassLead(11)],
      ledger: [
        { leadgen_id: "4001", origin: "compass_mirror", state: "inserted", public_lead_id: "00000000-0000-4000-8000-0000000c4001", side_effects_done_at: null, updated_at: iso(-20) },
        { leadgen_id: "4002", origin: "compass_mirror", state: "inserted", public_lead_id: "00000000-0000-4000-8000-0000000c4002", side_effects_done_at: null, updated_at: iso(-5) },
        { leadgen_id: "4003", origin: "compass_mirror", state: "inserted", public_lead_id: "00000000-0000-4000-8000-0000000c4003", side_effects_done_at: null, updated_at: iso(-25 * 60) },
        { leadgen_id: "4004", origin: "compass_mirror", state: "inserted", public_lead_id: "00000000-0000-4000-8000-0000000c4004", side_effects_done_at: iso(-39), updated_at: iso(-39) },
      ],
    })
    const report = await runMetaLeadMirror({ trigger: "cron", clock: env.clock })

    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
    expect(effectsCalls()).toHaveLength(1)
    expect(effectsCalls()[0][1].savedLeadId).toBe("00000000-0000-4000-8000-0000000c4001")
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC).map((call) => call.args?.p_leadgen_ids)).toEqual([
      ["4001"],
      ["4003"],
    ])
    expect(report.targets).toMatchObject({ inLedger: 4, effectsRetry: 1 })
    expect(report.sideEffects).toMatchObject({ ran: 1, marked: 1, abandoned: 1 })
    expect(hoisted.logAudit).toHaveBeenCalledTimes(1)
  })
})

// ─── H6d 건강 경보 ───────────────────────────────────────────────────────────

describe("건강 경보 스로틀(순수)", () => {
  const metrics = (overrides: Row = {}) => readMetaLeadMirrorHealthMetrics(healthRow(overrides))

  it("0 이 아닌 지표를 알리고 at_risk·admin_only_saved 만 critical, h1b 는 알리지 않는다", () => {
    const due = dueMetaLeadMirrorAlerts(
      metrics({ at_risk: 2, admin_only_saved: 1, h2_mirror_backlog_30m: 3, h1b_receipts_in_compass_failures_2h: 9 }),
      {},
      NOW
    )
    expect(due).toEqual([
      { metric: "at_risk", value: 2, severity: "critical" },
      { metric: "admin_only_saved", value: 1, severity: "critical" },
      { metric: "h2_mirror_backlog_30m", value: 3, severity: "warning" },
    ])
    expect(MIRROR_HEALTH_ALERT_METRICS).not.toContain("h1b_receipts_in_compass_failures_2h")
  })

  it("지표별 6시간에 한 번 — 0 으로 돌아가면 풀리고 다시 생기면 바로 알린다", () => {
    const first = metrics({ at_risk: 1, h3_blocked: 2 })
    const due1 = dueMetaLeadMirrorAlerts(first, {}, NOW)
    const state1 = nextMetaLeadMirrorAlertState(first, {}, due1, true, NOW)
    expect(state1).toEqual({
      at_risk: { lastAlertAt: iso(0), lastValue: 1 },
      h3_blocked: { lastAlertAt: iso(0), lastValue: 2 },
    })

    const later = NOW + 6 * 60 * MIN - 1
    expect(dueMetaLeadMirrorAlerts(metrics({ at_risk: 5, h3_blocked: 2 }), state1, later)).toEqual([])
    expect(nextMetaLeadMirrorAlertState(metrics({ at_risk: 5, h3_blocked: 2 }), state1, [], false, later)).toEqual(state1)

    const sixHours = NOW + 6 * 60 * MIN
    expect(dueMetaLeadMirrorAlerts(metrics({ at_risk: 5, h3_blocked: 2 }), state1, sixHours).map((item) => item.metric)).toEqual([
      "at_risk",
      "h3_blocked",
    ])

    const cleared = nextMetaLeadMirrorAlertState(metrics({ at_risk: 0, h3_blocked: 2 }), state1, [], false, NOW + MIN)
    expect(cleared).toEqual({ h3_blocked: state1.h3_blocked })
    expect(dueMetaLeadMirrorAlerts(metrics({ at_risk: 1, h3_blocked: 2 }), cleared, NOW + 2 * MIN)).toEqual([
      { metric: "at_risk", value: 1, severity: "critical" },
    ])
  })

  it("보내지 못하면(sent=false) 상태를 올리지 않아 다음 실행이 다시 알린다", () => {
    const current = metrics({ at_risk: 1 })
    const due = dueMetaLeadMirrorAlerts(current, {}, NOW)
    expect(nextMetaLeadMirrorAlertState(current, {}, due, false, NOW)).toEqual({})
  })

  it("누적 지표 h3b_skipped 는 기준보다 늘었을 때만(6시간 스로틀 포함), 줄면 기준도 내린다", () => {
    const three = metrics({ h3b_skipped: 3 })
    const due = dueMetaLeadMirrorAlerts(three, {}, NOW)
    expect(due.map((item) => item.metric)).toEqual(["h3b_skipped"])
    const state = nextMetaLeadMirrorAlertState(three, {}, due, true, NOW)
    expect(state).toEqual({ h3b_skipped: { baseline: 3, lastAlertAt: iso(0) } })

    expect(dueMetaLeadMirrorAlerts(three, state, NOW + 7 * 60 * MIN)).toEqual([])
    const four = metrics({ h3b_skipped: 4 })
    expect(dueMetaLeadMirrorAlerts(four, state, NOW + 60 * MIN)).toEqual([])
    expect(nextMetaLeadMirrorAlertState(four, state, [], false, NOW + 60 * MIN)).toEqual(state)
    expect(dueMetaLeadMirrorAlerts(four, state, NOW + 6 * 60 * MIN)).toEqual([
      { metric: "h3b_skipped", value: 4, severity: "warning" },
    ])
    expect(nextMetaLeadMirrorAlertState(metrics({ h3b_skipped: 1 }), state, [], false, NOW)).toEqual({
      h3b_skipped: { baseline: 1, lastAlertAt: iso(0) },
    })
  })

  it("값이 없는 지표(뷰 없음)는 알리지 않고 상태를 유지한다, 이상한 상태 값은 버린다", () => {
    const state = parseMetaLeadMirrorAlertState({
      h2_mirror_backlog_30m: { lastAlertAt: iso(-10), lastValue: 4 },
      h5_refs_without_submission: "junk",
      at_risk: { lastAlertAt: "not-a-date", lastValue: "1" },
      unknown_metric: { lastAlertAt: iso(-10) },
    })
    expect(state).toEqual({ h2_mirror_backlog_30m: { lastAlertAt: iso(-10), lastValue: 4 }, at_risk: {} })
    const withoutViews = readMetaLeadMirrorHealthMetrics({ at_risk: 0, mode: "compass" })
    expect(withoutViews.h2_mirror_backlog_30m).toBeNull()
    expect(dueMetaLeadMirrorAlerts(withoutViews, state, NOW)).toEqual([])
    expect(nextMetaLeadMirrorAlertState(withoutViews, state, [], false, NOW)).toEqual({
      h2_mirror_backlog_30m: { lastAlertAt: iso(-10), lastValue: 4 },
    })
  })
})

// ─── 크론·관리 사이클 ────────────────────────────────────────────────────────

function stateUpdates(calls: ReturnType<typeof setup>["db"]["calls"]) {
  return fromCalls(calls, META_LEAD_MIRROR_STATE_TABLE).filter((call) => call.update)
}

describe("runMetaLeadMirrorCycle", () => {
  it("admin + mirror_since 없음 → 심장박동만 쓰고 skipped(건강·경보·감사 없음)", async () => {
    const env = setup({ cutover: { mode: "admin", mirror_since: null } })
    const report = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("skipped")
    const updates = stateUpdates(env.db.calls)
    expect(updates).toHaveLength(1)
    expect(updates[0].update).toEqual({
      last_run_at: iso(0),
      last_run_status: "skipped",
      last_summary: { trigger: "cron", mode: "admin" },
      updated_at: iso(0),
    })
    expect(updates[0].filters).toEqual([["eq", "id", "default"]])
    expect(env.db.calls.filter((call) => call.kind === "rpc")).toHaveLength(0)
    expect(fromCalls(env.db.calls, COMPASS_META_SUBMISSIONS_VIEW)).toHaveLength(0)
    expect(hoisted.emitNotificationEvent).not.toHaveBeenCalled()
    expect(hoisted.logAudit).not.toHaveBeenCalled()
  })

  it("미러 → 폴백 → 건강 경보 → 심장박동 → 감사 순서, 경보에는 건수만", async () => {
    const env = setup({
      submissions: [submission("1001", 11, iso(-30))],
      leads: [compassLead(11)],
      health: healthRow({ at_risk: 1, h2_mirror_backlog_30m: 2 }),
    })
    const order: string[] = []
    const fallback = vi.fn(async (context: { cutover: unknown; dryRun: boolean; deadlineAt: number }) => {
      order.push(`fallback(apply=${rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC).length},health=${rpcCalls(env.db.calls, META_LEAD_MIRROR_HEALTH_RPC).length})`)
      expect(context).toMatchObject({ dryRun: false, deadlineAt: NOW + 40_000, cutover: { mode: "compass" } })
      return { status: "ok" as const, changed: 0, counts: { claimed: 0 } }
    })
    hoisted.emitNotificationEvent.mockImplementation(async () => {
      order.push(`emit(stateUpdates=${stateUpdates(env.db.calls).length})`)
      return { id: "event-1" }
    })
    hoisted.logAudit.mockImplementation(async () => {
      order.push(`audit(stateUpdates=${stateUpdates(env.db.calls).length})`)
    })

    const report = await runMetaLeadMirrorCycle({ trigger: "cron", fallback, clock: env.clock })

    expect(order).toEqual(["fallback(apply=1,health=0)", "emit(stateUpdates=0)", "audit(stateUpdates=1)"])
    expect(report.status).toBe("at_risk")
    expect(report.mirror.applied.inserted).toBe(1)
    expect(report.fallback).toEqual({ status: "ok", changed: 0, counts: { claimed: 0 } })
    expect(report.health).toMatchObject({ ok: true, mode: "compass", due: ["at_risk", "h2_mirror_backlog_30m"], alerted: ["at_risk", "h2_mirror_backlog_30m"] })

    expect(hoisted.emitNotificationEvent).toHaveBeenCalledTimes(1)
    const alert = hoisted.emitNotificationEvent.mock.calls[0][0]
    expect(alert).toMatchObject({
      eventType: "integration.webhook_failed",
      notificationType: "incident",
      categoryTag: "system",
      severity: "critical",
      scopeTag: "critical_control",
      source: "meta_lead_mirror",
      channels: ["wecom_webhook", "email"],
      payload: { mode: "compass", staleMinutes: 10, metrics: { at_risk: 1, h2_mirror_backlog_30m: 2 } },
    })
    expect(alert.message).toContain("1건")
    const updates = stateUpdates(env.db.calls)
    expect(updates).toHaveLength(1)
    expect(updates[0].update).toMatchObject({
      last_run_at: iso(0),
      last_run_status: "at_risk",
      alert_state: {
        at_risk: { lastAlertAt: iso(0), lastValue: 1 },
        h2_mirror_backlog_30m: { lastAlertAt: iso(0), lastValue: 2 },
      },
    })
    expect(report.heartbeat).toEqual({ written: true })
    expect(report.audited).toBe(true)
    const written = JSON.stringify({ alert, updates: updates.map((call) => call.update), audit: hoisted.logAudit.mock.calls })
    for (const value of PII_VALUES) expect(written).not.toContain(value)
  })

  it("6시간 안 두 번째 사이클은 같은 경보를 보내지 않고, 바뀐 것이 없으면 감사하지 않는다(심장박동은 쓴다)", async () => {
    const env = setup({
      submissions: [submission("1001", 11, iso(-30))],
      leads: [compassLead(11)],
      health: healthRow({ at_risk: 1 }),
    })
    await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    hoisted.emitNotificationEvent.mockClear()
    hoisted.logAudit.mockClear()
    env.advance(10 * MIN)

    const second = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    expect(second.health?.due).toEqual([])
    expect(hoisted.emitNotificationEvent).not.toHaveBeenCalled()
    expect(hoisted.logAudit).not.toHaveBeenCalled()
    const updates = stateUpdates(env.db.calls)
    expect(updates).toHaveLength(2)
    expect(updates[1].update).toMatchObject({ last_run_at: iso(10), alert_state: { at_risk: { lastAlertAt: iso(0), lastValue: 1 } } })
  })

  it("경보 전송이 실패하면 스로틀 상태를 올리지 않는다", async () => {
    const env = setup({ health: healthRow({ h5_refs_without_submission: 1 }) })
    hoisted.emitNotificationEvent.mockRejectedValue(new Error("wecom down"))
    const report = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    expect(report.health).toMatchObject({ due: ["h5_refs_without_submission"], alerted: [] })
    expect(report.health?.alertError).toContain("wecom down")
    expect(stateUpdates(env.db.calls)[0].update?.alert_state).toEqual({})
    expect(report.status).toBe("ok")
  })

  it("건강 RPC 가 실패하면 failed — 경보 없이 심장박동은 쓴다(alert_state 는 건드리지 않음)", async () => {
    const env = setup({ health: () => ({ data: null, error: { message: "function does not exist", code: "42883" } }) })
    const report = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("failed")
    expect(report.health?.ok).toBe(false)
    expect(hoisted.emitNotificationEvent).not.toHaveBeenCalled()
    const update = stateUpdates(env.db.calls)[0].update
    expect(update).toMatchObject({ last_run_status: "failed", last_summary: { health: { error: true } } })
    expect(update).not.toHaveProperty("alert_state")
  })

  it("스로틀 상태를 못 읽으면 치명 지표만 알리고 상태는 쓰지 않는다", async () => {
    const env = setup({
      health: healthRow({ at_risk: 1, h3_blocked: 4 }),
      errors: { [META_LEAD_MIRROR_STATE_TABLE]: (call) => (call.update ? null : { message: "boom" }) },
    })
    const report = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    expect(report.health?.due).toEqual(["at_risk"])
    expect(hoisted.emitNotificationEvent.mock.calls[0][0].severity).toBe("critical")
    expect(stateUpdates(env.db.calls)[0].update).not.toHaveProperty("alert_state")
  })

  it("h3_blocked 만 있으면 blocked, warning 경보", async () => {
    const env = setup({ health: healthRow({ h3_blocked: 1 }) })
    const report = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    expect(report.status).toBe("blocked")
    expect(hoisted.emitNotificationEvent.mock.calls[0][0]).toMatchObject({ severity: "warning", title: "Meta 리드 미러 경고" })
  })

  it("dryRun 은 건강을 읽기만 한다 — 경보·심장박동·감사·적용 없음", async () => {
    const env = setup({
      submissions: [submission("1001", 11, iso(-30))],
      leads: [compassLead(11)],
      health: healthRow({ at_risk: 1 }),
    })
    const report = await runMetaLeadMirrorCycle({ trigger: "admin", dryRun: true, clock: env.clock })
    expect(report).toMatchObject({ status: "at_risk", dryRun: true, heartbeat: { written: false }, audited: false })
    expect(report.health?.due).toEqual(["at_risk"])
    expect(stateUpdates(env.db.calls)).toHaveLength(0)
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
    expect(hoisted.emitNotificationEvent).not.toHaveBeenCalled()
    expect(hoisted.logAudit).not.toHaveBeenCalled()
  })

  it("폴백 훅이 던지면 failed, 폴백이 바꾼 것만 있어도 감사한다", async () => {
    const failing = setup({})
    const failed = await runMetaLeadMirrorCycle({
      trigger: "cron",
      clock: failing.clock,
      fallback: async () => {
        throw new Error("graph token revoked")
      },
    })
    expect(failed.status).toBe("failed")
    expect(failed.fallback).toMatchObject({ status: "failed", changed: 0 })

    hoisted.logAudit.mockClear()
    const changed = setup({})
    const report = await runMetaLeadMirrorCycle({
      trigger: "cron",
      clock: changed.clock,
      fallback: async () => ({ status: "ok", changed: 2, counts: { inserted: 2 } }),
    })
    expect(report.status).toBe("ok")
    expect(hoisted.logAudit).toHaveBeenCalledTimes(1)
    expect(hoisted.logAudit.mock.calls[0][0].payload.fallback).toEqual({ status: "ok", changed: 2, counts: { inserted: 2 } })
  })

  it("스위치를 못 읽어도 폴백·건강·심장박동은 돈다(미러는 failed)", async () => {
    const env = setup({ errors: { meta_leadgen_cutover: { message: "boom" } } })
    const fallback = vi.fn(async () => ({ status: "ok" as const, changed: 0, counts: {} }))
    const report = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock, fallback })
    expect(report.mirror.status).toBe("failed")
    expect(report.status).toBe("failed")
    expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ cutover: null }))
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_HEALTH_RPC)).toHaveLength(1)
    expect(stateUpdates(env.db.calls)).toHaveLength(1)
  })

  it("shadow 사이클은 미러를 쓰지 않고 건강·심장박동만(상태 ok)", async () => {
    const env = setup({ cutover: { mode: "shadow", mirror_since: null }, submissions: [submission("1001", 11, iso(-30))], health: healthRow({ mode: "shadow" }) })
    const report = await runMetaLeadMirrorCycle({ trigger: "cron", clock: env.clock })
    expect(report).toMatchObject({ status: "ok", mode: "shadow", mirror: { status: "shadow" } })
    expect(rpcCalls(env.db.calls, META_LEAD_MIRROR_APPLY_RPC)).toHaveLength(0)
    expect(stateUpdates(env.db.calls)[0].update).toMatchObject({ last_run_status: "ok" })
  })
})
