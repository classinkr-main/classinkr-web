import type { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"

// GA4 리드 품질 신호 — 쿠키 파서, 상태→신호 표, 발송(선점·건너뜀·실패 처리)·MP 본문 모양.

type Filter = [op: string, column: string, value: unknown]
type Call = { table: string; update?: Record<string, unknown>; select?: string; filters: Filter[] }
type Result = { data?: unknown[] | null; error?: { message: string } | null }

/** from() 마다 결과를 하나씩 꺼내 주는 supabase-js 체인 흉내. update 값과 필터를 기록한다. */
function fakeSupabase(results: Result[]) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] }
      calls.push(call)
      const result = results.shift() ?? { data: [] }
      const builder = {
        update(values: Record<string, unknown>) {
          call.update = values
          return builder
        },
        select(columns: string) {
          call.select = columns
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push(["eq", column, value])
          return builder
        },
        is(column: string, value: unknown) {
          call.filters.push(["is", column, value])
          return builder
        },
        not(column: string, op: string, value: unknown) {
          call.filters.push([`not.${op}`, column, value])
          return builder
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { client, calls }
}

async function loadSignal(results: Result[]) {
  vi.resetModules()
  const fake = fakeSupabase(results)
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
  const signal = await import("@/lib/marketing/lead-quality-signal")
  return { ...signal, calls: fake.calls }
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.stubEnv("GA4_MEASUREMENT_ID", "G-6MWTJ8C0L2")
  vi.stubEnv("GA4_API_SECRET", "test-secret")
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("GA 쿠키 파서", () => {
  it("_ga_<ID> 세션 ID — GS1·GS2 모두 접두 뒤 첫 숫자열", async () => {
    const { parseGaSessionId } = await import("@/lib/marketing/server-conversions")
    expect(parseGaSessionId("GS1.1.1700000000.3.1.1700000100.0.0.0")).toBe("1700000000")
    expect(parseGaSessionId("GS2.1.s1730000000$o12$g1$t1730000600$j60$l0$h0")).toBe("1730000000")
    expect(parseGaSessionId("GS2.1.s1730000000%24o12%24g1")).toBe("1730000000")
    expect(parseGaSessionId("GA1.1.123.456")).toBeNull()
    expect(parseGaSessionId("GS2.1.abc$o1")).toBeNull()
    expect(parseGaSessionId(undefined)).toBeNull()
  })

  it("_ga client_id — 뒤 두 칸, 모양이 다르면 원문 대신 null", async () => {
    const { parseGaClientId } = await import("@/lib/marketing/server-conversions")
    expect(parseGaClientId("GA1.1.1234567890.1700000000")).toBe("1234567890.1700000000")
    expect(parseGaClientId("GA1.2.1234567890.1700000000")).toBe("1234567890.1700000000")
    expect(parseGaClientId("anon-uuid")).toBeNull()
    expect(parseGaClientId("")).toBeNull()
  })

  it("요청에서 _ga·_ga_<측정 ID> 를 읽고, _ga 가 없으면 익명 ID 로 대신 채우지 않는다", async () => {
    const { getMarketingRequestMeta } = await import("@/lib/marketing/server-conversions")
    const request = (cookies: Record<string, string>) =>
      ({
        cookies: { get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined) },
        headers: { get: () => null },
        nextUrl: { origin: "https://classin.co.kr" },
      }) as unknown as NextRequest
    const consent = JSON.stringify({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: false, ts: 1 })

    const meta = getMarketingRequestMeta(
      request({
        cln_consent: consent,
        cln_aid: "anon-1",
        _ga: "GA1.1.1234567890.1700000000",
        _ga_6MWTJ8C0L2: "GS2.1.s1730000000$o12$g1$t1730000600$j60$l0$h0",
      })
    )
    expect(meta).toMatchObject({
      gaClientId: "1234567890.1700000000",
      gaSessionId: "1730000000",
      consent: { analytics: true, marketing: false },
    })
    expect(getMarketingRequestMeta(request({ cln_consent: consent, cln_aid: "anon-1" })).gaClientId).toBeNull()
  })
})

describe("상태 → 신호 표(보수적 정본)", () => {
  it("리드는 전환(converted)만 qualify — 연락중·종료·신규는 신호 없음", async () => {
    const { leadQualitySignalForLeadStatus } = await loadSignal([])
    expect(leadQualitySignalForLeadStatus("converted")).toBe("qualify")
    for (const status of ["new", "contacted", "closed", "toString"]) {
      expect(leadQualitySignalForLeadStatus(status), status).toBeNull()
    }
  })

  it("딜은 확정(오더 승인) 이후만 close — 계약서 초안(contract)·취소는 신호 없음", async () => {
    const { leadQualitySignalForDealStage } = await loadSignal([])
    for (const stage of ["confirmed", "installation", "payment", "closed"]) {
      expect(leadQualitySignalForDealStage(stage), stage).toBe("close")
    }
    for (const stage of ["contact", "quote", "contract", "cancelled"]) {
      expect(leadQualitySignalForDealStage(stage), stage).toBeNull()
    }
  })
})

describe("sendLeadQualitySignal", () => {
  it("GA4 MP 설정이 없으면 DB·네트워크를 건드리지 않는다", async () => {
    vi.stubEnv("GA4_API_SECRET", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { sendLeadQualitySignal, calls } = await loadSignal([])

    expect(await sendLeadQualitySignal("lead-1", "qualify")).toBe("not_configured")
    expect(calls).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("선점 UPDATE 가 0행이면(client_id 없음·이미 보냄) 보내지 않는다", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { sendLeadQualitySignal, calls } = await loadSignal([{ data: [] }])

    expect(await sendLeadQualitySignal("lead-1", "qualify")).toBe("not_eligible")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(calls[0]).toMatchObject({
      table: "leads",
      update: { ga_qualify_sent_at: expect.any(String) },
      filters: [
        ["eq", "id", "lead-1"],
        ["is", "ga_qualify_sent_at", null],
        ["not.is", "ga_client_id", null],
      ],
    })
  })

  it("선점하면 저장된 client_id·세션·광고 동의로 qualify_lead 를 보낸다", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const { sendLeadQualitySignal, calls } = await loadSignal([
      { data: [{ ga_client_id: "1234567890.1700000000", ga_session_id: "1730000000", ga_ad_consent: true }] },
    ])

    expect(await sendLeadQualitySignal("lead-1", "qualify")).toBe("sent")
    expect(calls).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.origin + url.pathname).toBe("https://www.google-analytics.com/mp/collect")
    expect(url.searchParams.get("measurement_id")).toBe("G-6MWTJ8C0L2")
    expect(url.searchParams.get("api_secret")).toBe("test-secret")
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: "1234567890.1700000000",
      consent: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" },
      events: [{ name: "qualify_lead", params: { session_id: "1730000000", engagement_time_msec: 1 } }],
    })
  })

  it("GA 가 2xx 가 아니면 자기 선점만 풀어 다음 전이에서 다시 보낼 수 있게 한다", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 500 }))
    vi.stubGlobal("fetch", fetchMock)
    const { sendLeadQualitySignal, calls } = await loadSignal([
      { data: [{ ga_client_id: "111.222", ga_session_id: null, ga_ad_consent: false }] },
      { data: [] },
    ])

    expect(await sendLeadQualitySignal("lead-2", "close")).toBe("rejected")
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].body))
    expect(body.consent).toEqual({ ad_user_data: "DENIED", ad_personalization: "DENIED" })
    expect(body.events).toEqual([{ name: "close_convert_lead", params: { engagement_time_msec: 1 } }])

    const claimedAt = calls[0].update?.ga_close_sent_at
    expect(calls[1]).toMatchObject({
      table: "leads",
      update: { ga_close_sent_at: null },
      filters: [
        ["eq", "id", "lead-2"],
        ["eq", "ga_close_sent_at", claimedAt],
      ],
    })
  })

  it("네트워크 오류·시간 초과는 받았는지 몰라 선점을 유지한다(최대 한 번)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))))
    const { sendLeadQualitySignal, calls } = await loadSignal([
      { data: [{ ga_client_id: "111.222", ga_session_id: null, ga_ad_consent: true }] },
    ])

    expect(await sendLeadQualitySignal("lead-3", "close")).toBe("failed")
    expect(calls).toHaveLength(1)
  })
})
