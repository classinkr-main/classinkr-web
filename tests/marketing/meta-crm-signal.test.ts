import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 메타 리드 단계 신호 — 판정 규칙(단계·시각·멱등 키), CAPI 본문 모양(lead_id 숫자), 실행(꺼짐·dryRun·발송·원장).

const NOW = new Date("2026-11-04T09:00:00.000Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const DAY = 24

// 17자리 — JS number 로는 끝자리가 깨지는 크기(2^53 초과)
const G1 = "12345678901234567"
const G2 = "1234567890123456"
const G3 = "987654321098765"

type Tables = Record<string, { data?: unknown[]; error?: { code?: string; message: string } }>

/** from(표) 마다 표 데이터를 돌려주는 supabase-js 체인 흉내. range 는 자르고, upsert 는 기록한다. */
function fakeSupabase(tables: Tables) {
  const upserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const reads: string[] = []
  const client = {
    from(table: string) {
      let range: [number, number] | null = null
      const builder = {
        select() {
          reads.push(table)
          return builder
        },
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        range(from: number, to: number) {
          range = [from, to]
          return builder
        },
        upsert(row: Record<string, unknown>) {
          upserts.push({ table, row })
          return Promise.resolve({ error: null })
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const entry = tables[table] ?? { data: [] }
          const rows = entry.data ?? []
          const data = range ? rows.slice(range[0], range[1] + 1) : rows
          return Promise.resolve({ data: entry.error ? null : data, error: entry.error ?? null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { client, upserts, reads }
}

async function load(tables: Tables = {}) {
  vi.resetModules()
  const fake = fakeSupabase(tables)
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
  const signal = await import("@/lib/marketing/meta-crm-signal")
  return { ...signal, fake }
}

beforeEach(() => {
  vi.stubEnv("META_DATASET_ID", "111")
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "token")
  vi.stubEnv("META_APP_SECRET", "")
  vi.stubEnv("META_TEST_EVENT_CODE", "")
  vi.stubEnv("META_CRM_SIGNAL_ENABLED", "")
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

const lead = (id: number, patch: Record<string, unknown> = {}) => ({
  id,
  stage: "new",
  updated_at: null,
  demo_at: null,
  account_at: null,
  bd_paid_at: null,
  ...patch,
})

describe("planMetaCrmSignal — 단계·시각·멱등", () => {
  it("첫 접수는 메타 리드마다, 뒤 단계는 그 시각 직전 메타 리드에 붙고, 7일 창·미래·접수 전·보냄을 가른다", async () => {
    const { planMetaCrmSignal } = await load()
    const plan = planMetaCrmSignal({
      refs: [
        { lead_id: 1, external_id: G1, created_at: hoursAgo(3 * DAY) },
        { lead_id: 1, external_id: G2, created_at: hoursAgo(1 * DAY) }, // 다시 신청
        { lead_id: 2, external_id: G3, created_at: hoursAgo(10 * DAY) }, // 접수는 7일 밖
        { lead_id: 3, external_id: "123", created_at: hoursAgo(1) }, // 형식 오류
      ],
      leads: [
        lead(1, { account_at: hoursAgo(2 * DAY), demo_at: hoursAgo(2) }),
        lead(2, { demo_at: new Date(NOW.getTime() + 3_600_000).toISOString(), stage: "won", updated_at: hoursAgo(5) }),
      ],
      contacts: [
        { lead_id: 1, first_connected_at: hoursAgo(4 * DAY) }, // 첫 메타 리드보다 앞(옛 Compass 리드)
        { lead_id: 2, first_connected_at: hoursAgo(9 * DAY) },
      ],
      sentKeys: new Set(["trial_account:1"]),
      nowMs: NOW.getTime(),
    })

    expect(plan.invalidLeadgenIds).toBe(1)
    expect(plan.leads).toBe(2)
    expect(plan.ready.map((event) => [event.stage, event.leadgenId, event.compassLeadId])).toEqual([
      ["initial_lead", G1, 1],
      ["initial_lead", G2, 1],
      ["paid", G3, 2], // 결제 시각이 비고 단계가 won → updated_at(5시간 전)
      ["demo", G2, 1], // 데모(2시간 전)는 두 번째 신청 뒤 → 최근 신청에
    ])
    expect(plan.counts.initial_lead).toMatchObject({ ready: 2, too_old: 1 })
    expect(plan.counts.contacted).toMatchObject({ before_lead: 1, too_old: 1, ready: 0 })
    expect(plan.counts.trial_account).toMatchObject({ sent: 1, ready: 0 })
    expect(plan.counts.demo).toMatchObject({ ready: 1, not_yet: 1 })
    expect(plan.ready.map((event) => event.dedupeKey)).toEqual([
      `initial_lead:${G1}`,
      `initial_lead:${G2}`,
      "paid:2",
      "demo:1",
    ])
  })

  it("종료(lost)·BD인계는 보내지 않는다", async () => {
    const { planMetaCrmSignal } = await load()
    const plan = planMetaCrmSignal({
      refs: [{ lead_id: 1, external_id: G1, created_at: hoursAgo(5) }],
      leads: [lead(1, { stage: "lost", updated_at: hoursAgo(1) }), lead(2, { stage: "bd", updated_at: hoursAgo(1) })],
      contacts: [],
      sentKeys: new Set([`initial_lead:${G1}`]),
      nowMs: NOW.getTime(),
    })
    expect(plan.ready).toEqual([])
  })
})

describe("CAPI 본문", () => {
  it("lead_id 를 따옴표 없는 숫자로 끝자리까지 싣고, 전화·이메일은 없다", async () => {
    const { toMetaCrmCapiEvent } = await load()
    const { postMetaCapiEvents } = await import("@/lib/marketing/server-conversions")
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await postMetaCapiEvents([
      toMetaCrmCapiEvent({
        dedupeKey: "demo:7",
        stage: "demo",
        leadgenId: G1,
        compassLeadId: 7,
        eventTimeMs: Date.parse("2026-11-03T00:00:00Z"),
      }),
    ])

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toContain("/111/events")
    const raw = String(init.body)
    expect(raw).toContain(`"lead_id":${G1}`)
    expect(raw).not.toMatch(/"(em|ph)"/)
    const event = JSON.parse(raw).data[0]
    expect(event).toMatchObject({
      event_name: "demo",
      event_time: 1793664000,
      event_id: "compass-crm:demo:7",
      action_source: "system_generated",
      custom_data: { event_source: "crm", lead_event_source: "Compass" },
    })
  })
})

describe("runMetaCrmSignal", () => {
  const tables = (extra: Tables = {}): Tables => ({
    compass_lead_refs_v: {
      data: [
        { lead_id: 1, external_id: G1, created_at: hoursAgo(30) },
        { lead_id: 2, external_id: G2, created_at: hoursAgo(20) },
      ],
    },
    compass_leads_v: { data: [lead(1, { account_at: hoursAgo(10) }), lead(2)] },
    compass_lead_contact_v: { data: [{ lead_id: 1, first_connected_at: hoursAgo(25) }] },
    meta_crm_signal_events: { data: [] },
    ...extra,
  })

  it("꺼져 있으면 DB 도 Meta 도 건드리지 않는다", async () => {
    const { runMetaCrmSignal, fake } = await load(tables())
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const report = await runMetaCrmSignal({ now: NOW })
    expect(report.status).toBe("disabled")
    expect(fake.reads).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("dryRun 은 꺼져 있어도 돌고, 원장 표가 없어도 건수만 센다(발송·쓰기 없음)", async () => {
    const { runMetaCrmSignal, fake } = await load(
      tables({ meta_crm_signal_events: { error: { code: "PGRST205", message: "not found" } } })
    )
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const report = await runMetaCrmSignal({ dryRun: true, now: NOW })
    expect(report).toMatchObject({ status: "ok", dryRun: true, enabled: false, ledgerMissing: true, planned: 4, leads: 2 })
    expect(report.stages.initial_lead.ready).toBe(2)
    expect(report.stages.contacted.ready).toBe(1)
    expect(report.stages.trial_account.ready).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fake.upserts).toEqual([])
  })

  it("켜져 있어도 원장 표가 없으면 보내지 않는다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const { runMetaCrmSignal } = await load(
      tables({ meta_crm_signal_events: { error: { code: "42P01", message: "missing" } } })
    )
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const report = await runMetaCrmSignal({ now: NOW })
    expect(report.status).toBe("failed")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("1건씩 보내고 받은 건만 원장에 남긴다 — 거절된 리드의 뒤 단계는 이번 실행에서 보내지 않는다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const { runMetaCrmSignal, fake } = await load(tables({ meta_crm_signal_events: { data: [{ dedupe_key: `initial_lead:${G2}` }] } }))
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) =>
      String(init.body).includes(`"event_name":"initial_lead"`)
        ? new Response('{"error":{"message":"Invalid lead_id"}}', { status: 400 })
        : new Response("{}", { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    const report = await runMetaCrmSignal({ now: NOW })

    // 순서: G1 접수(거절) → G1 컨택·체험 계정은 건너뜀. G2 접수는 이미 보냄.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(report).toMatchObject({ status: "partial", planned: 3, sent: 0, rejected: 1 })
    expect(report.error).toContain("Meta HTTP 400")
    expect(fake.upserts).toEqual([])
  })

  it("받은 건은 원장에 남고, 테스트 이벤트 코드가 있으면 남기지 않는다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
    const live = await load(tables())
    const report = await live.runMetaCrmSignal({ now: NOW, maxEvents: 2 })
    expect(report).toMatchObject({ status: "ok", planned: 2, sent: 2, testMode: false })
    // 시각 순: G1 접수(30시간 전) → 리드 1 컨택(25시간 전) → … 상한 2건
    expect(live.fake.upserts.map((item) => item.row.dedupe_key)).toEqual([`initial_lead:${G1}`, "contacted:1"])
    expect(live.fake.upserts[0].row).toMatchObject({ stage: "initial_lead", leadgen_id: G1, compass_lead_id: 1 })

    vi.stubEnv("META_TEST_EVENT_CODE", "TEST123")
    const test = await load(tables())
    const testReport = await test.runMetaCrmSignal({ now: NOW })
    expect(testReport).toMatchObject({ testMode: true, sent: 4 })
    expect(test.fake.upserts).toEqual([])
  })
})
