import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 메타 리드 단계 신호 — 판정 규칙(단계·시각·멱등 키), CAPI 본문 모양(lead_id 숫자),
// 실행(꺼짐·dryRun·예약→발송→기록·재실행·차단기·테스트 모드).

const NOW = new Date("2026-11-04T09:00:00.000Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const DAY = 24

// 17자리 — JS number 로는 끝자리가 깨지는 크기(2^53 초과)
const G1 = "12345678901234567"
const G2 = "1234567890123456"
const G3 = "987654321098765"

type Row = Record<string, unknown>
type Tables = Record<string, { data?: Row[]; error?: { code?: string; message: string } }>

/**
 * supabase-js 체인 흉내 — 읽기(select·eq·in·order·range), 원장 쓰기(upsert ignoreDuplicates + select, delete, update)를
 * 표 상태에 반영한다. failOn 으로 특정 쓰기만 실패시킨다.
 */
function fakeSupabase(tables: Tables, failOn: { upsert?: boolean; update?: boolean } = {}) {
  const reads: string[] = []
  const writes: Array<{ op: string; table: string; row?: Row }> = []
  const client = {
    from(table: string) {
      let op: "select" | "upsert" | "delete" | "update" = "select"
      let payload: Row = {}
      let range: [number, number] | null = null
      const filters: Array<(row: Row) => boolean> = []
      const builder = {
        select() {
          if (op === "select") reads.push(table)
          return builder
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value)
          return builder
        },
        is(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value)
          return builder
        },
        match(values: Row) {
          for (const [column, value] of Object.entries(values)) filters.push((row) => row[column] === value)
          return builder
        },
        in: () => builder,
        order: () => builder,
        range(from: number, to: number) {
          range = [from, to]
          return builder
        },
        upsert(row: Row) {
          op = "upsert"
          payload = row
          return builder
        },
        delete() {
          op = "delete"
          return builder
        },
        update(values: Row) {
          op = "update"
          payload = values
          return builder
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const entry = (tables[table] ??= { data: [] })
          const rows = (entry.data ??= [])
          let result: { data: unknown; error: unknown }
          if (op === "select") {
            result = entry.error
              ? { data: null, error: entry.error }
              : { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null }
          } else if (op === "upsert") {
            writes.push({ op, table, row: payload })
            if (failOn.upsert) result = { data: null, error: { message: "permission denied" } }
            else if (rows.some((row) => row.leadgen_id === payload.leadgen_id && row.stage === payload.stage)) {
              result = { data: [], error: null }
            } else {
              rows.push({ ...payload, sent_at: null })
              result = { data: [{ leadgen_id: payload.leadgen_id }], error: null }
            }
          } else if (op === "delete") {
            writes.push({ op, table })
            entry.data = rows.filter((row) => !filters.every((filter) => filter(row)))
            result = { data: null, error: null }
          } else {
            writes.push({ op, table, row: payload })
            if (failOn.update) result = { data: null, error: { message: "timeout" } }
            else {
              for (const row of rows) if (filters.every((filter) => filter(row))) Object.assign(row, payload)
              result = { data: null, error: null }
            }
          }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { client, reads, writes }
}

async function load(tables: Tables = {}, failOn: { upsert?: boolean; update?: boolean } = {}) {
  vi.resetModules()
  const fake = fakeSupabase(tables, failOn)
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
  const signal = await import("@/lib/marketing/meta-crm-signal")
  return { ...signal, fake }
}

const ok = () => new Response("{}", { status: 200 })
const rejected = (status = 400) => new Response('{"error":{"message":"Invalid parameter"}}', { status })

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

const lead = (id: number, patch: Partial<Record<"demo_at" | "account_at" | "bd_paid_at", string>> = {}) => ({
  id,
  demo_at: null as string | null,
  account_at: null as string | null,
  bd_paid_at: null as string | null,
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
        lead(2, { demo_at: new Date(NOW.getTime() + 3_600_000).toISOString(), bd_paid_at: hoursAgo(5) }),
      ],
      contacts: [
        { lead_id: 1, first_connected_at: hoursAgo(4 * DAY) }, // 첫 메타 리드보다 앞(옛 Compass 리드)
        { lead_id: 2, first_connected_at: hoursAgo(9 * DAY) },
      ],
      sentKeys: new Set([`trial_account:${G1}`]),
      nowMs: NOW.getTime(),
    })

    expect(plan.invalidLeadgenIds).toBe(1)
    expect(plan.leads).toBe(2)
    expect(plan.ready.map((event) => [event.stage, event.leadgenId])).toEqual([
      ["initial_lead", G1],
      ["initial_lead", G2],
      ["paid", G3], // 5시간 전
      ["demo", G2], // 2시간 전 — 두 번째 신청 뒤라 최근 신청에
    ])
    expect(plan.counts.initial_lead).toMatchObject({ ready: 2, too_old: 1 })
    expect(plan.counts.contacted).toMatchObject({ before_lead: 1, too_old: 1, ready: 0 })
    expect(plan.counts.trial_account).toMatchObject({ sent: 1, ready: 0 })
    expect(plan.counts.demo).toMatchObject({ ready: 1, not_yet: 1 })
  })

  it("뒤 단계는 사람마다 한 번 — Compass 병합으로 메타 리드가 합쳐져 붙는 신청이 바뀌어도 다시 보내지 않는다", async () => {
    const { planMetaCrmSignal } = await load()
    const plan = planMetaCrmSignal({
      // 병합 전: G1 으로 컨택을 보냄. 병합 후: 리드 9 에 G1·G2 가 함께 붙고, 컨택 시각은 G2 뒤.
      refs: [
        { lead_id: 9, external_id: G1, created_at: hoursAgo(5 * DAY) },
        { lead_id: 9, external_id: G2, created_at: hoursAgo(3 * DAY) },
      ],
      leads: [lead(9)],
      contacts: [{ lead_id: 9, first_connected_at: hoursAgo(2 * DAY) }],
      sentKeys: new Set([`contacted:${G1}`, `initial_lead:${G1}`, `initial_lead:${G2}`]),
      nowMs: NOW.getTime(),
    })
    expect(plan.ready).toEqual([])
    expect(plan.counts.contacted.sent).toBe(1)
  })

  it("단계 시각 칸만 본다 — 시각 없는 결제·데모(재유입으로 updated_at 만 바뀐 NEO 고객 등)는 보내지 않는다", async () => {
    const { planMetaCrmSignal } = await load()
    const neoCustomer = { ...lead(1), stage: "won", updated_at: hoursAgo(1) } // 뷰에는 있지만 판정은 읽지 않는 칸
    const plan = planMetaCrmSignal({
      refs: [{ lead_id: 1, external_id: G1, created_at: hoursAgo(1) }],
      leads: [neoCustomer],
      contacts: [],
      sentKeys: new Set([`initial_lead:${G1}`]),
      nowMs: NOW.getTime(),
    })
    expect(plan.ready).toEqual([])
  })
})

describe("CAPI 본문", () => {
  it("user_data.lead_id 를 따옴표 없는 숫자로 끝자리까지 싣고, 전화·이메일은 없다", async () => {
    const { toMetaCrmCapiEvent } = await load()
    const { postMetaCapiEvents } = await import("@/lib/marketing/server-conversions")
    const fetchMock = vi.fn<typeof fetch>(async () => ok())
    vi.stubGlobal("fetch", fetchMock)

    await postMetaCapiEvents([
      toMetaCrmCapiEvent({ stage: "demo", leadgenId: G1, eventTimeMs: Date.parse("2026-11-03T00:00:00Z") }),
    ])

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toContain("/111/events")
    const raw = String(init.body)
    expect(raw).toContain(`"user_data":{"lead_id":${G1}}`)
    expect(raw).not.toMatch(/"(em|ph)"/)
    expect(JSON.parse(raw).data[0]).toMatchObject({
      event_name: "demo",
      event_time: 1793664000,
      event_id: `compass-crm:demo:${G1}`,
      action_source: "system_generated",
      custom_data: { event_source: "crm", lead_event_source: "Compass" },
    })
  })

  it("웹사이트 전송의 custom_data.lead_id 는 숫자 문자열이어도 그대로 문자열이다", async () => {
    const { postMetaCapiEvents } = await import("@/lib/marketing/server-conversions")
    const fetchMock = vi.fn<typeof fetch>(async () => ok())
    vi.stubGlobal("fetch", fetchMock)
    await postMetaCapiEvents([{ event_name: "Lead", user_data: { external_id: ["x"] }, custom_data: { lead_id: G1 } }])
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [URL, RequestInit])[1].body))
    expect(body.data[0].custom_data.lead_id).toBe(G1)
  })
})

describe("runMetaCrmSignal", () => {
  // 준비된 이벤트(시각 순): G1 접수(30h) → 리드 1 컨택(25h) → G2 접수(20h) → 리드 1 체험 계정(10h)
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
  const ledgerOf = (state: Tables) =>
    (state.meta_crm_signal_events.data ?? []).map((row) => `${row.stage}:${row.leadgen_id}:${row.sent_at ? "sent" : "reserved"}`)

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
    expect(fake.writes).toEqual([])
  })

  it("켜져 있어도 원장 표가 없으면 보내지 않는다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const { runMetaCrmSignal } = await load(tables({ meta_crm_signal_events: { error: { code: "42P01", message: "missing" } } }))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect((await runMetaCrmSignal({ now: NOW })).status).toBe("failed")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("예약 → 발송 → 기록, 상한에서 멈추고 다음 실행은 남은 것만 보낸다(이미 보낸 건 다시 안 보냄)", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const fetchMock = vi.fn<typeof fetch>(async () => ok())
    vi.stubGlobal("fetch", fetchMock)
    const state = tables()

    const first = await (await load(state)).runMetaCrmSignal({ now: NOW, maxEvents: 2 })
    expect(first).toMatchObject({ status: "ok", planned: 2, sent: 2 })
    expect(ledgerOf(state)).toEqual([`initial_lead:${G1}:sent`, `contacted:${G1}:sent`])

    const second = await (await load(state)).runMetaCrmSignal({ now: NOW })
    expect(second).toMatchObject({ status: "ok", planned: 2, sent: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(ledgerOf(state)).toEqual([
      `initial_lead:${G1}:sent`,
      `contacted:${G1}:sent`,
      `initial_lead:${G2}:sent`,
      `trial_account:${G1}:sent`,
    ])
  })

  it("다른 실행이 먼저 예약한 건은 보내지 않는다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const fetchMock = vi.fn<typeof fetch>(async () => ok())
    vi.stubGlobal("fetch", fetchMock)
    const state = tables()
    const run = await load(state)
    // 읽기가 끝난 뒤·예약 전에 다른 실행이 G1 접수를 예약했다 — upsert 가 충돌로 빈 결과를 낸다.
    const original = run.fake.client.from.bind(run.fake.client)
    let injected = false
    run.fake.client.from = (table: string) => {
      if (table === "meta_crm_signal_events" && !injected && run.fake.reads.includes("compass_lead_contact_v")) {
        injected = true
        state.meta_crm_signal_events.data!.push({ leadgen_id: G1, stage: "initial_lead", sent_at: null })
      }
      return original(table)
    }
    const report = await run.runMetaCrmSignal({ now: NOW })
    expect(report).toMatchObject({ claimedElsewhere: 1, sent: 3 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("예약이 실패하면 아무것도 보내지 않고 멈춘다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const report = await (await load(tables(), { upsert: true })).runMetaCrmSignal({ now: NOW })
    expect(report.status).toBe("failed")
    expect(report.error).toContain("예약 실패")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("거절은 예약을 풀고 그 리드의 뒤 단계를 보류한다 — 다른 리드는 계속 간다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) =>
      String(init?.body).includes(`"lead_id":${G1}`) ? rejected() : ok()
    )
    vi.stubGlobal("fetch", fetchMock)
    const state = tables()
    const report = await (await load(state)).runMetaCrmSignal({ now: NOW })

    // G1 접수(거절) → G1 컨택·체험 계정 보류, G2 접수는 나감
    expect(report).toMatchObject({ status: "partial", planned: 4, sent: 1, rejected: 1 })
    expect(report.error).toContain("Meta HTTP 400")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(ledgerOf(state)).toEqual([`initial_lead:${G2}:sent`])
  })

  it("차단기 — 401·5xx 는 바로, 거절은 3건이면 멈춘다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => rejected(401)))
    const auth = await (await load(tables())).runMetaCrmSignal({ now: NOW })
    expect(auth).toMatchObject({ status: "partial", rejected: 1, stopped: "Meta HTTP 401" })

    const fetchMock = vi.fn<typeof fetch>(async () => rejected(400))
    vi.stubGlobal("fetch", fetchMock)
    const refs = Array.from({ length: 5 }, (_, index) => ({
      lead_id: 10 + index,
      external_id: `55555555555555${index}`,
      created_at: hoursAgo(10 - index),
    }))
    const many = await (await load(tables({ compass_lead_refs_v: { data: refs } }))).runMetaCrmSignal({ now: NOW })
    expect(many).toMatchObject({ rejected: 3, stopped: "거절 3건" })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("응답 불명(시간 초과)은 예약을 남기고(다시 안 보냄) 멈춘다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new DOMException("timeout", "TimeoutError")
    })
    vi.stubGlobal("fetch", fetchMock)
    const state = tables()
    const report = await (await load(state)).runMetaCrmSignal({ now: NOW })
    expect(report).toMatchObject({ status: "partial", unknown: 1, sent: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(ledgerOf(state)).toEqual([`initial_lead:${G1}:reserved`])
  })

  it("결과 기록이 실패해도 예약이 남아 다시 보내지 않는다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => ok()))
    const state = tables()
    const report = await (await load(state, { update: true })).runMetaCrmSignal({ now: NOW, maxEvents: 1 })
    expect(report).toMatchObject({ status: "partial", sent: 1, ledgerWriteFailed: 1 })
    expect(ledgerOf(state)).toEqual([`initial_lead:${G1}:reserved`])
  })

  it("테스트 이벤트 코드가 있으면 원장을 쓰지 않는다", async () => {
    vi.stubEnv("META_CRM_SIGNAL_ENABLED", "true")
    vi.stubEnv("META_TEST_EVENT_CODE", "TEST123")
    const fetchMock = vi.fn<typeof fetch>(async () => ok())
    vi.stubGlobal("fetch", fetchMock)
    const run = await load(tables())
    const report = await run.runMetaCrmSignal({ now: NOW })
    expect(report).toMatchObject({ testMode: true, sent: 4 })
    expect(run.fake.writes).toEqual([])
    expect(String((fetchMock.mock.calls[0] as [URL, RequestInit])[1].body)).toContain('"test_event_code":"TEST123"')
  })
})
