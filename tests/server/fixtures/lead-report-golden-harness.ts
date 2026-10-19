import { vi } from "vitest"

import type { MarketingPerfResponse, PerfKpi, PerfScoreboardRow } from "@/lib/marketing/perf"
import type { WeeklyAdLeadRecentIntake } from "@/lib/marketing/weekly-report"
import type { LeadRecord } from "@/lib/repositories/leads"

// 광고 리드 보고 3종(주간 보고서·아침 카드·주간/월간 다이제스트)의 녹화 하네스.
//
// 설계 META-RECEIVER-FINAL §4-2 H9 "미측정" 가드를 넣기 **전** 출력을 lead-report-golden-recording.json 에
// 기록했다. 가드를 넣은 뒤에도 admin 모드(= 기본, 스위치 행이 없거나 못 읽음)에서는 이 녹화본과
// 한 글자도 같아야 한다(tests/server/lead-report-golden.test.ts).
//
// 저장소·설정·알림 저장소·위컴 전송(postJson)만 목이다. 보고서 빌더·emitNotificationEvent·위컴 카드 조립은
// 실제 코드를 통과한다. Supabase 는 표·RPC 별 결과를 돌려주는 가짜이고, 모르는 표는 42P01(마이그레이션 미적용)이다.
// 값은 전부 합성이다.

export type FakeResult = { data: unknown; error: unknown; count?: number | null }

export interface LeadReportEnv {
  leads: Array<Partial<LeadRecord> & Pick<LeadRecord, "id" | "source" | "timestamp" | "status">>
  /** from(table) 결과. 없으면 42P01 */
  tables?: Record<string, FakeResult>
  /** rpc(name) 결과. 없으면 PGRST202 */
  rpcs?: Record<string, FakeResult>
  perf?: MarketingPerfResponse
  kstToday?: string
  /** 스위치 env 비상 스위치 등 추가 env */
  env?: Record<string, string>
}

export interface LeadReportCapture {
  events: unknown[]
  posts: Array<{ url: string; body: unknown }>
  supabase: string[]
}

function missingRelation(table: string): FakeResult {
  return { data: null, error: { code: "42P01", message: `relation "public.${table}" does not exist` } }
}

function missingFunction(name: string): FakeResult {
  return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } }
}

/** PostgREST 빌더 흉내 — 체인 메서드는 자기 자신, await·maybeSingle·single 은 결과 */
function fakeBuilder(result: FakeResult) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  for (const method of ["select", "eq", "neq", "gte", "gt", "lt", "lte", "in", "order", "limit", "range", "abortSignal", "is", "not"]) {
    builder[method] = self
  }
  builder.maybeSingle = () => Promise.resolve(result)
  builder.single = () => Promise.resolve(result)
  builder.then = (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

export function createFakeSupabase(env: LeadReportEnv, capture: LeadReportCapture) {
  return {
    from(table: string) {
      capture.supabase.push(`from:${table}`)
      return fakeBuilder(env.tables?.[table] ?? missingRelation(table))
    },
    rpc(name: string) {
      capture.supabase.push(`rpc:${name}`)
      return fakeBuilder(env.rpcs?.[name] ?? missingFunction(name))
    },
  }
}

export const REPORT_SETTINGS = {
  wecomLeadReportWebhookUrl: "https://example.invalid/wecom/lead-report",
  webhookEnabled: {},
  notificationAppearance: {},
  notificationDigestEmailList: [],
}

/**
 * 모듈을 새로 불러온다(vi.resetModules). 전환 스위치 30초 메모도 새로 시작한다.
 * 부른 쪽은 끝나고 vi.unstubAllEnvs()·vi.useRealTimers() 를 한다.
 */
export async function loadLeadReportModules(env: LeadReportEnv) {
  vi.resetModules()
  const capture: LeadReportCapture = { events: [], posts: [], supabase: [] }

  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.invalid")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret")
  vi.stubEnv("META_LEADGEN_FORCE_ADMIN", "")
  for (const [key, value] of Object.entries(env.env ?? {})) vi.stubEnv(key, value)

  let eventSeq = 0
  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue(REPORT_SETTINGS),
  }))
  vi.doMock("@/lib/server/post-json", () => ({
    postJson: vi.fn(async (url: string, body: unknown) => {
      capture.posts.push({ url, body })
      return { ok: true, status: 200 }
    }),
  }))
  vi.doMock("@/lib/email", () => ({
    sendInternalNotification: vi.fn(),
    wrapNotificationHtml: vi.fn(),
  }))
  vi.doMock("@/lib/notifications/presentation", () => ({
    resolveNotificationPresentation: vi.fn().mockReturnValue({ iconKey: "user-round-plus", tone: "emerald" }),
  }))
  vi.doMock("@/lib/notifications/repository", () => ({
    createDeliveryLog: vi.fn().mockResolvedValue(undefined),
    createInAppNotifications: vi.fn().mockResolvedValue(undefined),
    createNotificationEvent: vi.fn(async (input: unknown) => {
      capture.events.push(input)
      eventSeq += 1
      return { id: `event-${eventSeq}` }
    }),
  }))
  vi.doMock("@/lib/repositories/lead-digest-runs", () => ({
    claimLeadDigestRun: vi.fn(async ({ reportType }: { reportType: string }) => ({
      claimed: true,
      run: { id: `run-${reportType}`, reportType, status: "pending" },
    })),
    markLeadDigestRunSent: vi.fn().mockResolvedValue(undefined),
    markLeadDigestRunFailed: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue(env.leads),
  }))
  vi.doMock("@/lib/repositories/channel-conversations", () => ({
    getConversations: vi.fn().mockReturnValue([]),
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => createFakeSupabase(env, capture),
  }))
  vi.doMock("@/lib/marketing/perf-assemble", () => ({
    assembleMarketingPerf: vi.fn().mockResolvedValue(env.perf ?? makeWeeklyPerf()),
    kstToday: vi.fn().mockReturnValue(env.kstToday ?? "2026-08-17"),
  }))

  const morning = await import("@/lib/server/lead-morning-brief")
  const digest = await import("@/lib/server/lead-digest-alerts")
  const weeklyBuilder = await import("@/lib/marketing/weekly-report-builder")
  const weekly = await import("@/lib/marketing/weekly-report")
  return { morning, digest, weeklyBuilder, weekly, capture }
}

// ─── 주간 보고서 입력 ─────────────────────────────────────────────────────────

const kpi = (value: number | null, previous: number | null, deltaPct: number | null, currency?: "USD" | "KRW"): PerfKpi => ({
  value,
  previous,
  deltaPct,
  ...(currency ? { currency } : {}),
})

const campaign = (over: Partial<PerfScoreboardRow> & { campaignId: string; name: string }): PerfScoreboardRow => ({
  status: "active",
  pacing: { elapsedPct: 100, executionPct: null },
  pacingCurrency: null,
  leads: 0,
  spendUsd: null,
  cpl: null,
  sparkline: [],
  latestUpdate: null,
  anomalies: [],
  channels: [],
  channelSpend: [],
  ...over,
})

export function makeWeeklyPerf(overrides: Partial<MarketingPerfResponse> = {}): MarketingPerfResponse {
  return {
    period: {
      key: "7d",
      since: "2026-08-10",
      until: "2026-08-16",
      prevSince: "2026-08-03",
      prevUntil: "2026-08-09",
      prevBasis: "trailing",
    },
    snapshotAt: "2026-08-17T00:10:00.000Z",
    metaDataThrough: "2026-08-16",
    kpis: {
      spendUsd: kpi(210, 140, 50, "USD"),
      leads: kpi(18, 14, 29),
      adLeads: kpi(10, 8, 25),
      cplUsd: kpi(21, 17.5, 20, "USD"),
      leadConversionRate: kpi(20, 12.5, 60),
      budgetExecutionPct: kpi(null, null, null, "KRW"),
    },
    daily: [],
    scoreboard: [
      campaign({ campaignId: "b", name: "리타겟팅", leads: 4, spendUsd: 90, cpl: 22.5 }),
      campaign({ campaignId: "a", name: "신규 원장 | 리드젠", leads: 6, spendUsd: 120, cpl: 20, anomalies: ["cpl_spike"] }),
      campaign({ campaignId: "empty", name: "미집행", leads: 0, spendUsd: 0 }),
    ],
    funnel: { impressions: 10_000, clicks: 200, adLeads: 10, contacted: 6, convertedLeads: 2 },
    leadDailyBySource: [
      { date: "2026-08-10", meta: 1 },
      { date: "2026-08-11", meta: 2 },
      { date: "2026-08-15", meta: 3 },
      { date: "2026-08-16", meta: 4 },
    ],
    channelMix: [],
    channelLive: [],
    attributionFunnel: { stages: [], byChannel: [], endToEndPct: null },
    updatesFeed: [],
    ...overrides,
  }
}

/** 광고 리드 0건 주 — 지금 보고서가 "0건 원인 점검" 액션을 내는 입력 */
export function makeZeroAdLeadsPerf(): MarketingPerfResponse {
  const base = makeWeeklyPerf()
  return {
    ...base,
    kpis: { ...base.kpis, adLeads: kpi(0, 8, -100), cplUsd: kpi(null, 17.5, null, "USD"), leadConversionRate: kpi(null, 12.5, null) },
    scoreboard: [campaign({ campaignId: "a", name: "신규 원장 | 리드젠", leads: 0, spendUsd: 120, cpl: null })],
    funnel: { impressions: 10_000, clicks: 200, adLeads: 0, contacted: 0, convertedLeads: 0 },
    leadDailyBySource: [],
  }
}

export const WEEKEND_INTAKE: WeeklyAdLeadRecentIntake = {
  since: "2026-08-14T01:10:00.000Z",
  until: "2026-08-17T00:30:00.000Z",
  label: "08.14 10:10 - 08.17 09:30",
  spansWeekend: true,
  totalLeads: 5,
  metaLeadAdsLeadCount: 3,
  homepageLeadCount: 2,
  unrespondedCount: 4,
}

export const ZERO_META_INTAKE: WeeklyAdLeadRecentIntake = {
  ...WEEKEND_INTAKE,
  totalLeads: 2,
  metaLeadAdsLeadCount: 0,
  unrespondedCount: 2,
}

export interface WeeklyPureScenario {
  id: string
  note: string
  perf: () => MarketingPerfResponse
  recentIntake: WeeklyAdLeadRecentIntake | null
}

export const WEEKLY_PURE_SCENARIOS: WeeklyPureScenario[] = [
  { id: "weekly-normal", note: "광고 리드 10건·주말 유입", perf: () => makeWeeklyPerf(), recentIntake: WEEKEND_INTAKE },
  { id: "weekly-zero", note: "광고 리드 0건 — 0건 원인 점검 액션", perf: makeZeroAdLeadsPerf, recentIntake: ZERO_META_INTAKE },
  {
    id: "weekly-crm-failed",
    note: "CRM 리드 조회 실패(null)·유입 미측정",
    perf: () => {
      const base = makeWeeklyPerf()
      return {
        ...base,
        kpis: { ...base.kpis, adLeads: kpi(null, null, null), leadConversionRate: kpi(null, null, null) },
        leadDailyBySource: [],
      }
    },
    recentIntake: null,
  },
  {
    id: "weekly-zero-provisional",
    note: "0건 + 잠정 + CPL 급등 + 이상 캠페인(액션 3개 상한)",
    perf: () => {
      const base = makeZeroAdLeadsPerf()
      return {
        ...base,
        metaDataThrough: "2026-08-15",
        kpis: { ...base.kpis, cplUsd: kpi(30, 17.5, 71, "USD") },
        scoreboard: [campaign({ campaignId: "a", name: "신규 원장 | 리드젠", leads: 0, spendUsd: 120, anomalies: ["spend_no_leads"] })],
      }
    },
    recentIntake: WEEKEND_INTAKE,
  },
]

// ─── 아침 카드·다이제스트 입력 ────────────────────────────────────────────────

/** 금요일 10:15 KST 아침 카드 창(08.06 10:10 ~ 08.07 10:10) 안팎의 리드 */
export const MORNING_LEADS: LeadReportEnv["leads"] = [
  { id: "meta-1", source: "meta_lead_ads", timestamp: "2026-08-06T02:00:00.000Z", status: "new", utm_campaign: "여름 캠페인", utm_content: "보드 광고" },
  { id: "meta-2", source: "meta_lead_ads", timestamp: "2026-08-06T03:00:00.000Z", status: "contacted", utm_campaign: "여름 캠페인", utm_content: "보드 광고" },
  { id: "meta-3", source: "meta_lead_ads", timestamp: "2026-08-06T09:00:00.000Z", status: "new", message: "Meta Lead Ads\nleadgen_id=900000000000003\ncampaign=가을 캠페인" },
  { id: "meta-test", source: "meta_lead_ads", timestamp: "2026-08-06T04:00:00.000Z", status: "new", name: "<test lead: dummy data>" },
  { id: "meta-previous", source: "meta_lead_ads", timestamp: "2026-08-05T02:00:00.000Z", status: "new" },
  { id: "contact-1", source: "contact_page", timestamp: "2026-08-06T05:00:00.000Z", status: "new", fbclid: "meta-click" },
  { id: "demo-1", source: "demo_modal", timestamp: "2026-08-06T06:00:00.000Z", status: "converted", assigned_to: "담당자" },
  { id: "contact-previous", source: "contact_page", timestamp: "2026-08-05T05:00:00.000Z", status: "new" },
]

export const MORNING_LEADS_NO_META: LeadReportEnv["leads"] = MORNING_LEADS.filter((lead) => lead.source !== "meta_lead_ads")

export interface MorningScenario {
  id: string
  note: string
  now: string
  leads: LeadReportEnv["leads"]
}

export const MORNING_SCENARIOS: MorningScenario[] = [
  { id: "morning-weekday", note: "금 10:15 — Meta 3·홈페이지 2", now: "2026-08-07T01:15:00.000Z", leads: MORNING_LEADS },
  { id: "morning-no-meta", note: "Meta 0건 창", now: "2026-08-07T01:15:00.000Z", leads: MORNING_LEADS_NO_META },
  { id: "morning-weekend", note: "토요일 — 발송 없음", now: "2026-08-08T01:15:00.000Z", leads: MORNING_LEADS },
]

/** 주간 다이제스트(목 13:00 KST) — 지난주 08.03(월)~08.09(일) KST, 전주 07.27~08.02 */
export const DIGEST_LEADS: LeadReportEnv["leads"] = [
  { id: "d-meta-1", source: "meta_lead_ads", timestamp: "2026-08-03T01:00:00.000Z", status: "new" },
  { id: "d-meta-2", source: "meta_lead_ads", timestamp: "2026-08-05T01:00:00.000Z", status: "contacted", assigned_to: "담당자" },
  { id: "d-meta-3", source: "meta_lead_ads", timestamp: "2026-08-09T10:00:00.000Z", status: "closed" },
  { id: "d-contact-1", source: "contact_page", timestamp: "2026-08-04T02:00:00.000Z", status: "new" },
  { id: "d-demo-1", source: "demo_modal", timestamp: "2026-08-06T02:00:00.000Z", status: "converted", assigned_to: "담당자" },
  { id: "d-meta-prev", source: "meta_lead_ads", timestamp: "2026-07-29T01:00:00.000Z", status: "new" },
  { id: "d-contact-prev", source: "contact_page", timestamp: "2026-07-30T01:00:00.000Z", status: "new" },
  { id: "d-test", source: "meta_lead_ads", timestamp: "2026-08-04T03:00:00.000Z", status: "new", email: "test+e2e@example.com" },
  { id: "d-aug-late", source: "meta_lead_ads", timestamp: "2026-08-28T03:00:00.000Z", status: "new" },
  { id: "d-jul", source: "contact_page", timestamp: "2026-07-10T03:00:00.000Z", status: "new" },
]

export const DIGEST_LEADS_NO_META: LeadReportEnv["leads"] = DIGEST_LEADS.filter((lead) => lead.source !== "meta_lead_ads")

export const HANDOFF_ROWS = [{ status: "sent" }, { status: "sent" }, { status: "failed" }]

export interface DigestScenario {
  id: string
  note: string
  period: "weekly" | "monthly"
  now: string
  leads: LeadReportEnv["leads"]
}

export const DIGEST_SCENARIOS: DigestScenario[] = [
  { id: "digest-weekly", note: "주간 — Meta 3·전주 대비", period: "weekly", now: "2026-08-13T04:00:00.000Z", leads: DIGEST_LEADS },
  { id: "digest-weekly-no-meta", note: "주간 — Meta 0건", period: "weekly", now: "2026-08-13T04:00:00.000Z", leads: DIGEST_LEADS_NO_META },
  { id: "digest-monthly", note: "월간 — 8월", period: "monthly", now: "2026-09-01T00:00:00.000Z", leads: DIGEST_LEADS },
]

/** 주간 보고서 서버 조립(assembleWeeklyAdLeadReport) — 월 09:30 KST */
export const WEEKLY_ASSEMBLE_NOW = "2026-08-17T00:30:00.000Z"
export const WEEKLY_ASSEMBLE_LEADS: LeadReportEnv["leads"] = [
  { id: "w-meta-fri", source: "meta_lead_ads", timestamp: "2026-08-14T05:00:00.000Z", status: "new" },
  { id: "w-meta-sun", source: "meta_lead_ads", timestamp: "2026-08-16T05:00:00.000Z", status: "contacted" },
  { id: "w-contact-sat", source: "contact_page", timestamp: "2026-08-15T05:00:00.000Z", status: "new" },
  { id: "w-old", source: "meta_lead_ads", timestamp: "2026-08-13T05:00:00.000Z", status: "new" },
]

export interface WeeklyAssembleScenario {
  id: string
  note: string
  perf: () => MarketingPerfResponse
  leads: LeadReportEnv["leads"]
}

export const WEEKLY_ASSEMBLE_SCENARIOS: WeeklyAssembleScenario[] = [
  { id: "weekly-assemble-normal", note: "조립 — 광고 리드 10건", perf: () => makeWeeklyPerf(), leads: WEEKLY_ASSEMBLE_LEADS },
  { id: "weekly-assemble-zero", note: "조립 — 광고 리드 0건", perf: makeZeroAdLeadsPerf, leads: WEEKLY_ASSEMBLE_LEADS.filter((lead) => lead.source !== "meta_lead_ads") },
]

// ─── 실행 ─────────────────────────────────────────────────────────────────────

export type LeadReportTranscript = Record<string, unknown>

type Modules = Awaited<ReturnType<typeof loadLeadReportModules>>

export async function runWeeklyPure(modules: Modules, scenario: WeeklyPureScenario): Promise<LeadReportTranscript> {
  const report = modules.weekly.buildWeeklyAdLeadReport(scenario.perf(), {
    generatedAt: "2026-08-17T00:30:00.000Z",
    recentIntake: scenario.recentIntake,
  })
  return { report }
}

export async function runWeeklyAssemble(modules: Modules): Promise<LeadReportTranscript> {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(WEEKLY_ASSEMBLE_NOW))
  try {
    const report = await modules.weeklyBuilder.assembleWeeklyAdLeadReport()
    return { report }
  } finally {
    vi.useRealTimers()
  }
}

export async function runMorning(modules: Modules, scenario: MorningScenario): Promise<LeadReportTranscript> {
  const result = await modules.morning.sendLeadMorningBrief(new Date(scenario.now))
  return { result, events: modules.capture.events, posts: modules.capture.posts }
}

export async function runDigest(modules: Modules, scenario: DigestScenario): Promise<LeadReportTranscript> {
  const result = await modules.digest.sendLeadDigestAlert(scenario.period, new Date(scenario.now))
  return { result, events: modules.capture.events, posts: modules.capture.posts }
}

/** 녹화 id 순서 — 녹화본 키 순서와 같다 */
export const GOLDEN_SCENARIO_IDS = [
  ...WEEKLY_PURE_SCENARIOS.map((scenario) => scenario.id),
  ...WEEKLY_ASSEMBLE_SCENARIOS.map((scenario) => scenario.id),
  ...MORNING_SCENARIOS.map((scenario) => scenario.id),
  ...DIGEST_SCENARIOS.map((scenario) => scenario.id),
]

/** 한 시나리오를 새 모듈로 돌린다. env 로 스위치·건강 가짜를 바꿔 끼운다. */
export async function runGoldenScenario(id: string, extraEnv: Partial<LeadReportEnv> = {}): Promise<LeadReportTranscript> {
  const weeklyPure = WEEKLY_PURE_SCENARIOS.find((scenario) => scenario.id === id)
  if (weeklyPure) {
    return runWeeklyPure(await loadLeadReportModules({ leads: [], ...extraEnv }), weeklyPure)
  }
  const assemble = WEEKLY_ASSEMBLE_SCENARIOS.find((scenario) => scenario.id === id)
  if (assemble) {
    const modules = await loadLeadReportModules({ leads: assemble.leads, perf: assemble.perf(), ...extraEnv })
    return runWeeklyAssemble(modules)
  }
  const morning = MORNING_SCENARIOS.find((scenario) => scenario.id === id)
  if (morning) {
    return runMorning(await loadLeadReportModules({ leads: morning.leads, ...extraEnv }), morning)
  }
  const digest = DIGEST_SCENARIOS.find((scenario) => scenario.id === id)
  if (digest) {
    const tables = { chatbot_channel_handoffs: { data: HANDOFF_ROWS, error: null }, ...(extraEnv.tables ?? {}) }
    return runDigest(await loadLeadReportModules({ leads: digest.leads, ...extraEnv, tables }), digest)
  }
  throw new Error(`unknown golden scenario ${id}`)
}
