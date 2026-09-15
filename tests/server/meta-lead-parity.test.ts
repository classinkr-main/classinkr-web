import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

import { createFakeMirrorDb, fromCalls, type FakeError, type Row } from "./fixtures/fake-mirror-supabase"

// 그림자 대조 보고(설계 META-RECEIVER-FINAL §4-2 H6c, §6 설명 분류, §7 P5 게이트 G2–G5).
// Supabase 는 메모리 가짜. 어드민 행은 실제 웹훅 빌더(buildLeadCapturePayload → buildLeadPayload)로 만들고,
// 미러 행은 보고서가 미러와 같은 조립(buildMetaLeadMirrorPayload)으로 만든다.
// 값은 전부 합성이다(010-0000-xxxx, example.com).

const hoisted = vi.hoisted(() => ({ client: null as unknown }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (!hoisted.client) throw new Error("Supabase env 없음")
    return hoisted.client
  },
}))
vi.mock("@/lib/repositories/settings", () => ({ getResolvedSettings: vi.fn() }))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: vi.fn() }))
vi.mock("@/lib/auth/audit", () => ({ logAudit: vi.fn() }))

import { buildLeadCapturePayload, type MetaLeadDetail } from "@/lib/meta/lead-ads-payload"
import { __resetMetaLeadgenCutoverCacheForTests } from "@/lib/meta/leadgen-cutover"
import { buildLeadPayload } from "@/lib/server/lead-capture"
import {
  COMPASS_META_LEADGEN_FAILURES_VIEW,
  PARITY_COLUMNS,
  PARITY_EXPLANATIONS,
  accumulateParityCreatedAt,
  buildMetaLeadParityReport,
  classifyParityDifference,
  emptyMetaLeadParityReport,
  parseLeadgenIdFromMessage,
  parseMessageFieldKeys,
  type ParityRowContext,
} from "@/lib/server/meta-lead-parity"

const NOW = Date.parse("2026-09-15T03:00:00.000Z")
const MIN = 60_000
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * MIN).toISOString()
const SHADOW_SINCE = iso(-3 * 24 * 60)

const PII_VALUES = [
  "김합성",
  "이합성",
  "박합성",
  "01000000001",
  "01000000002",
  "01000000003",
  "+82 10-0000-0002",
  "owner1@example.com",
  "합성 학원",
  "다른 학원",
  "서울시 합성구",
]

type Field = { name: string; values: string[] }

const AD = {
  ad_id: "ad-1",
  ad_name: "가을 소재 A",
  adset_id: "as-1",
  adset_name: "학원장 타깃",
  campaign_id: "c-1",
  campaign_name: "가을 모집",
}

let sequence = 0

/** 어드민 웹훅이 만들었을 public.leads 행 — 실제 빌더를 통과한다. fieldData 가 null 이면 Graph 실패 껍데기 */
function adminRow(leadgenId: string, fieldData: Field[] | null, createdAt: string): Row {
  sequence += 1
  const detail: MetaLeadDetail | undefined = fieldData ? { id: leadgenId, form_id: "form-9", ...AD, field_data: fieldData } : undefined
  const payload = buildLeadPayload(buildLeadCapturePayload({ leadgen_id: leadgenId, page_id: "page-1", form_id: "form-9" }, detail))
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    source: "meta_lead_ads",
    created_at: createdAt,
    message: payload.message ?? null,
    name: payload.name ?? null,
    org: payload.org ?? null,
    role: payload.role ?? null,
    size: payload.size ?? null,
    branch: payload.branch ?? null,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    source_detail: payload.sourceDetail ?? null,
    lead_magnet: payload.leadMagnet ?? null,
    utm_source: payload.utmSource ?? null,
    utm_medium: payload.utmMedium ?? null,
    utm_campaign: payload.utmCampaign ?? null,
    utm_term: payload.utmTerm ?? null,
    utm_content: payload.utmContent ?? null,
  }
}

function submission(leadgenId: string, leadId: number | null, receivedAt: string, extra: Row = {}): Row {
  return {
    leadgen_id: leadgenId,
    lead_id: leadId,
    outcome: "created",
    via: "webhook",
    ...AD,
    form_id: "form-9",
    page_id: "page-1",
    platform: "fb",
    submitted_at: receivedAt,
    received_at: receivedAt,
    form_answers: [{ name: "company_name", values: ["합성 학원"] }],
    ...extra,
  }
}

const identity = (name: string | null, phone: string | null, email: string | null): Field[] => [
  ...(name ? [{ name: "full_name", values: [name] }] : []),
  ...(phone ? [{ name: "phone_number", values: [phone] }] : []),
  ...(email ? [{ name: "email", values: [email] }] : []),
]
const ORG: Field = { name: "company_name", values: ["합성 학원"] }

function cutoverRow(overrides: Row = {}): Row {
  return {
    id: "default",
    mode: "shadow",
    shadow_since: SHADOW_SINCE,
    mirror_since: null,
    compass_started_at: null,
    compass_ended_at: null,
    side_effects: {},
    fallback_after_minutes: 120,
    updated_at: SHADOW_SINCE,
    ...overrides,
  }
}

function receipt(leadgenId: string, at: string): Row {
  return { leadgen_id: leadgenId, page_id: "page-1", form_id: "form-9", first_received_at: at, mode_at_receipt: "shadow" }
}

beforeEach(() => {
  __resetMetaLeadgenCutoverCacheForTests()
  hoisted.client = null
  sequence = 0
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── 분류 표 ─────────────────────────────────────────────────────────────────

describe("classifyParityDifference — 설명 분류 표", () => {
  const base: ParityRowContext = { adminShell: false, adminFieldKeys: new Set(["full_name", "phone_number", "email", "company_name"]), outcome: "created" }
  const cases: Array<{
    title: string
    column: (typeof PARITY_COLUMNS)[number]
    admin: string | null
    mirror: string | null
    context?: Partial<ParityRowContext>
    expected: string
  }> = [
    { title: "같은 값", column: "org", admin: "합성 학원", mirror: "합성 학원", expected: "same" },
    { title: "앞뒤 공백·빈 값은 같다", column: "role", admin: "  ", mirror: null, expected: "same" },
    { title: "이메일 대소문자는 같다", column: "email", admin: "Owner1@Example.com", mirror: "owner1@example.com", expected: "same" },
    { title: "Graph 실패 껍데기 — 어떤 컬럼이든", column: "utm_campaign", admin: null, mirror: "가을 모집", context: { adminShell: true }, expected: "graph_shell" },
    { title: "껍데기가 신원보다 먼저", column: "name", admin: null, mirror: "김합성", context: { adminShell: true }, expected: "graph_shell" },
    { title: "전화 원문 vs 정규화(키 같음)", column: "phone", admin: "+82 10-0000-0002", mirror: "01000000002", expected: "phone_format" },
    { title: "전화 하이픈만 다름", column: "phone", admin: "010-0000-0002", mirror: "01000000002", expected: "phone_format" },
    { title: "전화 — 어드민이 비었고 미러가 채움", column: "phone", admin: null, mirror: "01000000003", expected: "admin_missing_identity" },
    { title: "이름 — 어드민이 비었고 미러가 채움", column: "name", admin: null, mirror: "박합성", expected: "admin_missing_identity" },
    { title: "이메일 — 어드민이 비었고 미러가 채움", column: "email", admin: null, mirror: "owner1@example.com", expected: "admin_missing_identity" },
    { title: "재제출 — Compass 기존 이름", column: "name", admin: "김합성", mirror: "이합성", context: { outcome: "reinflow" }, expected: "reinflow_identity" },
    { title: "원본 유지 — Compass 기존 전화", column: "phone", admin: "01000000001", mirror: "01000000009", context: { outcome: "original" }, expected: "reinflow_identity" },
    { title: "새 리드인데 이름이 다름", column: "name", admin: "김합성", mirror: "이합성", expected: "unexplained" },
    { title: "미러만 신원이 빔", column: "email", admin: "owner1@example.com", mirror: null, expected: "unexplained" },
    { title: "재제출이어도 미러가 비면 설명 안 됨", column: "name", admin: "김합성", mirror: null, context: { outcome: "reinflow" }, expected: "unexplained" },
    {
      title: "주소만 있는 폼 → branch 빔",
      column: "branch",
      admin: "서울시 합성구",
      mirror: null,
      context: { adminFieldKeys: new Set(["full_name", "address"]) },
      expected: "address_excluded",
    },
    {
      title: "한국어 주소 키",
      column: "branch",
      admin: "서울시 합성구",
      mirror: null,
      context: { adminFieldKeys: new Set(["주소"]) },
      expected: "address_excluded",
    },
    {
      title: "지역 키가 있는데 branch 가 다르면 설명 안 됨",
      column: "branch",
      admin: "서울",
      mirror: null,
      context: { adminFieldKeys: new Set(["city", "address"]) },
      expected: "unexplained",
    },
    {
      title: "message 는 fields= 줄만 다르면 허용 키 차이",
      column: "message",
      admin: "Meta Lead Ads\nleadgen_id=1\npage_id=p\nform_id=f\nfields=full_name: 김합성 / 주소: 서울시 합성구",
      mirror: "Meta Lead Ads\nleadgen_id=1\npage_id=p\nform_id=f\nfields=full_name: 김합성",
      expected: "fields_line_allowlist",
    },
    {
      title: "message 의 다른 줄이 다르면 설명 안 됨",
      column: "message",
      admin: "Meta Lead Ads\nleadgen_id=1\npage_id=p\nform_id=f\nad=A\nfields=x: 1",
      mirror: "Meta Lead Ads\nleadgen_id=1\npage_id=p\nform_id=f\nad=B\nfields=x: 1",
      expected: "unexplained",
    },
    { title: "기관명 차이는 설명 분류 없음", column: "org", admin: "합성 학원", mirror: "다른 학원", expected: "unexplained" },
    { title: "광고 계층 차이는 껍데기가 아니면 설명 없음", column: "source_detail", admin: "소재 A", mirror: "소재 B", expected: "unexplained" },
  ]

  for (const item of cases) {
    it(item.title, () => {
      expect(classifyParityDifference(item.column, item.admin, item.mirror, { ...base, ...item.context })).toBe(item.expected)
    })
  }

  it("설명 분류는 설계 §4-2 H6c 의 여섯 개다", () => {
    expect([...PARITY_EXPLANATIONS]).toEqual([
      "phone_format",
      "admin_missing_identity",
      "reinflow_identity",
      "graph_shell",
      "address_excluded",
      "fields_line_allowlist",
    ])
  })
})

describe("message 파싱", () => {
  it("leadgen_id 줄", () => {
    expect(parseLeadgenIdFromMessage("Meta Lead Ads\nleadgen_id=123\npage_id=p")).toBe("123")
    expect(parseLeadgenIdFromMessage("Meta Lead Ads\nleadgen_id=-\npage_id=p")).toBeNull()
    expect(parseLeadgenIdFromMessage(null)).toBeNull()
  })

  it("fields= 줄의 키만(값은 담지 않는다)", () => {
    const parsed = parseMessageFieldKeys("Meta Lead Ads\nleadgen_id=1\nfields=Full_Name: 김합성 / 주소: 서울시 합성구")
    expect(parsed.hasFieldsLine).toBe(true)
    expect([...parsed.keys]).toEqual(["full_name", "주소"])
    expect(parseMessageFieldKeys("Meta Lead Ads\nleadgen_id=1").hasFieldsLine).toBe(false)
  })
})

describe("created_at 구간", () => {
  it("초 차이 구간과 재처리 설명", () => {
    const createdAt = emptyMetaLeadParityReport(iso(0)).fields.createdAt
    accumulateParityCreatedAt(createdAt, iso(0), new Date(NOW + 5_000).toISOString(), "webhook")
    accumulateParityCreatedAt(createdAt, iso(0), iso(3), "webhook")
    accumulateParityCreatedAt(createdAt, iso(0), iso(30), "webhook")
    accumulateParityCreatedAt(createdAt, iso(0), iso(120), "replay")
    accumulateParityCreatedAt(createdAt, "bad", iso(0), "webhook")
    expect(createdAt).toEqual({
      compared: 4,
      withinMinute: 1,
      within5Minutes: 1,
      withinHour: 1,
      overHour: 1,
      replayOverMinute: 1,
      maxAbsSeconds: 7200,
    })
  })
})

// ─── 보고서 ──────────────────────────────────────────────────────────────────

function scenario() {
  const t = (offsetMinutes: number) => iso(-24 * 60 + offsetMinutes)
  const leads: Row[] = [
    adminRow("4001", [...identity("김합성", "01000000001", "owner1@example.com"), ORG], t(0)),
    adminRow("4002", [...identity("김합성", "+82 10-0000-0002", "owner1@example.com"), ORG], t(1)),
    adminRow("4003", [{ name: "성함", values: ["박합성"] }, { name: "연락처", values: ["010-0000-0003"] }, ORG], t(2)),
    adminRow("4004", null, t(3)),
    adminRow("4005", [...identity("김합성", "01000000001", "owner1@example.com"), ORG, { name: "address", values: ["서울시 합성구"] }], t(4)),
    adminRow("4006", [...identity("김합성", "01000000001", "owner1@example.com"), ORG], t(5)),
    adminRow("4007", [...identity("김합성", "01000000001", "owner1@example.com"), ORG], t(6)),
    adminRow("4008", [...identity("김합성", "01000000001", null)], t(7)),
    adminRow("4009", [...identity("김합성", "01000000001", null)], t(8)),
    adminRow("4011", [...identity("김합성", "01000000001", null), ORG], t(9)),
    adminRow("5002", [...identity("김합성", "01000000001", null)], t(10)),
    // 재시도 중복 행(대표는 앞 행)
    adminRow("4001", [...identity("김합성", "01000000001", "owner1@example.com"), ORG], t(11)),
    // leadgen 없는 행
    { ...adminRow("0", null, t(12)), message: "Meta Lead Ads\nleadgen_id=-\npage_id=page-1\nform_id=-" },
    // 창 시작 30분 전 어드민 행 — 제출은 창 안(경계). 거짓 compass_only 가 되면 안 된다
    adminRow("6001", [...identity("김합성", "01000000001", null)], new Date(Date.parse(SHADOW_SINCE) - 30 * MIN).toISOString()),
    // 다른 source 는 보지 않는다
    { ...adminRow("7001", null, t(13)), source: "contact_page" },
  ]
  const submissions: Row[] = [
    submission("4001", 11, new Date(Date.parse(t(0)) + 5_000).toISOString()),
    submission("4002", 12, t(1)),
    submission("4003", 13, t(2)),
    submission("4004", 14, t(3)),
    submission("4005", 15, t(4)),
    submission("4006", 16, t(125), { outcome: "reinflow", via: "replay" }),
    submission("4007", 17, t(6), { form_answers: [{ name: "company_name", values: ["다른 학원"] }] }),
    submission("4011", null, t(9)),
    submission("5001", 21, t(20)),
    submission("6001", 31, new Date(Date.parse(SHADOW_SINCE) + MIN).toISOString()),
  ]
  const refs: Row[] = [
    { lead_id: 22, system: "meta_leadgen", external_id: "5002", matched_by: "meta", created_at: t(10) },
    { lead_id: 11, system: "meta_leadgen", external_id: "4001", matched_by: "meta", created_at: t(0) },
    { lead_id: 99, system: "home_lead", external_id: "4009", matched_by: "phone", created_at: t(8) },
  ]
  const compassLeads: Row[] = [
    { id: 11, name: "김합성", phone_key: "01000000001", email_key: "owner1@example.com" },
    { id: 12, name: "김합성", phone_key: "01000000002", email_key: "owner1@example.com" },
    { id: 13, name: "박합성", phone_key: "01000000003", email_key: null },
    { id: 14, name: "김합성", phone_key: "01000000001", email_key: "owner1@example.com" },
    { id: 15, name: "김합성", phone_key: "01000000001", email_key: "owner1@example.com" },
    { id: 16, name: "이합성", phone_key: "01000000001", email_key: "owner1@example.com" },
    { id: 17, name: "김합성", phone_key: "01000000001", email_key: "owner1@example.com" },
  ]
  const receipts: Row[] = ["4001", "4002", "4003", "4004", "4005", "4006", "4011", "5001", "5002", "5003", "6001"].map((id, index) =>
    receipt(id, t(index))
  )
  const failures: Row[] = [{ leadgen_id: "4008", lead_specific: true, first_seen_at: t(7), last_seen_at: t(8), attempts: 3 }]
  return { leads, submissions, refs, compassLeads, receipts, failures }
}

function setupDb(overrides: { cutover?: Row; errors?: Record<string, FakeError> } = {}) {
  const data = scenario()
  const db = createFakeMirrorDb({
    tables: {
      meta_leadgen_cutover: [cutoverRow(overrides.cutover)],
      leads: data.leads,
      compass_meta_submissions_v: data.submissions,
      compass_lead_refs_v: data.refs,
      compass_leads_v: data.compassLeads,
      meta_leadgen_receipts: data.receipts,
      [COMPASS_META_LEADGEN_FAILURES_VIEW]: data.failures,
    },
    errors: overrides.errors,
  })
  hoisted.client = db.client
  return db
}

describe("buildMetaLeadParityReport", () => {
  it("분류 건수·컬럼별 불일치·설명 분류 — 값은 싣지 않는다", async () => {
    const db = setupDb()
    const report = await buildMetaLeadParityReport()

    expect(report.mode).toBe("shadow")
    expect(report.window).toEqual({ from: SHADOW_SINCE, to: iso(-15), days: 7, settleMinutes: 15, shadowSince: SHADOW_SINCE })
    expect(report.complete).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.sources).toEqual({ adminLeads: true, submissions: true, refs: true, receipts: true, failures: true, compassLeads: true })

    expect(report.totals).toEqual({ adminLeadgens: 11, adminRows: 12, compassLeadgens: 11, receipts: 11 })
    expect(report.categories).toEqual({
      both: 9,
      compass_only: 1, // 5001
      admin_only: 2, // 4008, 4009(home_lead 링크는 meta_leadgen 이 아니다)
      admin_only_in_compass_failures: 1, // 4008
      receipts_not_in_compass: 1, // 5003
      compass_not_in_receipts: 1, // 4007
      admin_retry_duplicate_rows: 1, // 4001
      admin_contactless_shells: 2, // 4003(키 목록 밖), 4004(Graph 실패)
      admin_rows_without_leadgen: 1,
    })

    const fields = report.fields
    expect(fields.compared).toBe(7)
    expect(fields.notComparable).toEqual({ refOnly: 1, compassLeadDeleted: 1, buildFailed: 0 })
    expect(fields.explained).toEqual({
      phone_format: 1, // 4002
      admin_missing_identity: 2, // 4003 name·phone
      reinflow_identity: 1, // 4006 name
      graph_shell: 9, // 4004 name·phone·email·org·source_detail·utm_campaign·utm_term·utm_content·message
      address_excluded: 1, // 4005
      fields_line_allowlist: 5, // 4002·4003·4005·4006·4007
    })
    expect(fields.unexplained).toBe(1) // 4007 org
    expect(fields.leadgensWithUnexplained).toBe(1)
    expect(fields.columns.org).toEqual({ mismatched: 2, explained: { graph_shell: 1 }, unexplained: 1 })
    expect(fields.columns.phone).toEqual({
      mismatched: 3,
      explained: { phone_format: 1, admin_missing_identity: 1, graph_shell: 1 },
      unexplained: 0,
    })
    expect(fields.columns.branch).toEqual({ mismatched: 1, explained: { address_excluded: 1 }, unexplained: 0 })
    expect(fields.columns.utm_source).toEqual({ mismatched: 0, explained: {}, unexplained: 0 })
    expect(fields.columns.lead_magnet).toEqual({ mismatched: 0, explained: {}, unexplained: 0 })
    for (const column of PARITY_COLUMNS) {
      const counts = fields.columns[column]
      const explained = Object.values(counts.explained).reduce((sum, value) => sum + (value ?? 0), 0)
      expect(counts.mismatched).toBe(explained + counts.unexplained)
    }
    expect(fields.createdAt).toMatchObject({ compared: 7, withinMinute: 6, overHour: 1, replayOverMinute: 1, maxAbsSeconds: 7200 })

    const serialized = JSON.stringify(report)
    for (const value of PII_VALUES) expect(serialized).not.toContain(value)

    // 쓰기 없음
    expect(db.calls.filter((call) => call.kind === "rpc")).toHaveLength(0)
    expect(db.calls.some((call) => call.kind === "from" && call.update)).toBe(false)
    // 어드민 행은 meta_lead_ads 만, 창보다 하루 앞부터
    const leadScan = fromCalls(db.calls, "leads")[0]
    expect(leadScan.filters).toEqual([
      ["eq", "source", "meta_lead_ads"],
      ["gte", "created_at", new Date(Date.parse(SHADOW_SINCE) - 24 * 60 * MIN).toISOString()],
    ])
  })

  it("shadow_since 가 없으면 days 창(1–45 로 자름)", async () => {
    setupDb({ cutover: { mode: "admin", shadow_since: null } })
    const report = await buildMetaLeadParityReport({ days: 400 })
    expect(report.window).toMatchObject({ days: 45, from: iso(-45 * 24 * 60), shadowSince: null })
    const short = await buildMetaLeadParityReport({ days: 0 })
    expect(short.window).toMatchObject({ days: 1, from: iso(-24 * 60) })
  })

  it("days 창이 shadow_since 보다 짧으면 days 창", async () => {
    setupDb()
    const report = await buildMetaLeadParityReport({ days: 1 })
    expect(report.window?.from).toBe(iso(-24 * 60))
  })

  it("Compass 제출 뷰가 없으면 던지지 않고 complete=false, 출처 표시", async () => {
    setupDb({ errors: { compass_meta_submissions_v: { message: "relation does not exist", code: "42P01" } } })
    const report = await buildMetaLeadParityReport()
    expect(report.complete).toBe(false)
    expect(report.sources.submissions).toBe(false)
    expect(report.errors.some((message) => message.includes("compass_meta_submissions_v 읽기 실패"))).toBe(true)
    // 제출 행이 없으니 링크만 있는 4001·5002 만 both(필드 비교 불가)
    expect(report.categories.both).toBe(2)
    expect(report.fields.compared).toBe(0)
    expect(report.fields.notComparable.refOnly).toBe(2)
  })

  it("신원 뷰를 못 읽으면 필드 비교를 생략한다", async () => {
    setupDb({ errors: { compass_leads_v: { message: "permission denied", code: "42501" } } })
    const report = await buildMetaLeadParityReport()
    expect(report.complete).toBe(false)
    expect(report.sources.compassLeads).toBe(false)
    expect(report.fields.compared).toBe(0)
    expect(report.categories.both).toBe(9)
  })

  it("스위치를 못 읽어도 days 창으로 보고한다(complete=false)", async () => {
    setupDb({ errors: { meta_leadgen_cutover: { message: "boom" } } })
    const report = await buildMetaLeadParityReport({ days: 2 })
    expect(report.mode).toBeNull()
    expect(report.complete).toBe(false)
    expect(report.window?.from).toBe(iso(-2 * 24 * 60))
  })

  it("Supabase 클라이언트가 없어도 던지지 않는다", async () => {
    hoisted.client = null
    const report = await buildMetaLeadParityReport()
    expect(report.complete).toBe(false)
    expect(report.errors.length).toBeGreaterThan(0)
  })
})
