import { createHmac } from "crypto"
import { NextRequest } from "next/server"
import { vi, type Mock } from "vitest"

// Meta 리드애즈 웹훅 라우트 녹화 하네스(설계 META-RECEIVER-FINAL §4-2 H5).
//
// 모드 분기를 넣기 **전의** app/api/meta/webhook/route.ts 를 시나리오마다 불러
// 응답(상태·본문)과 호출 순서(Graph 상세 조회 → submitLeadCapture), console.error 를
// 한 줄 기록(transcript)으로 남긴다. 녹화본은 meta-webhook-route-recording.json 이다.
//
// - tests/api/meta-webhook-route-recording.test.ts: 라우트가 녹화본과 같은지(분기 전·후 모두)
// - tests/api/meta-webhook-mode.test.ts: admin 모드(모드 읽기 실패·env 비상 스위치 포함)와
//   shadow 모드가 같은 녹화본을 내는지
//
// 시크릿·토큰·연락처는 전부 합성 값이다(010-0000-xxxx, example.com).

export const HARNESS_APP_SECRET = "recording-fake-app-secret"
export const HARNESS_PAGE_TOKEN = "recording-fake-page-token"
export const HARNESS_VERIFY_TOKEN = "recording-fake-verify-token"

type GraphReply =
  | { kind: "ok"; json: Record<string, unknown> }
  | { kind: "http_error"; status: number; text: string }
  | { kind: "network_error"; message: string }

type CaptureReply =
  | { kind: "result"; status: number; body: Record<string, unknown> }
  | { kind: "throw"; message: string }

export type RouteRecordingScenario = {
  id: string
  note: string
  request:
    | { method: "GET"; query: Record<string, string> }
    | {
        method: "POST"
        /** 문자열이면 원문 그대로, 객체면 JSON.stringify */
        body: unknown
        signature: "valid" | "invalid" | "missing"
      }
  /** leadgen id → Graph 응답. 없으면 기본 성공(합성 상세) */
  graph?: Record<string, GraphReply>
  /** leadgen id(message 의 leadgen_id=) → submitLeadCapture 응답. 없으면 기본 200 */
  capture?: Record<string, CaptureReply>
  /** 이 시나리오에서만 바꾸는 env(토큰 없음 등) */
  env?: Record<string, string>
}

export type RouteTranscript = {
  status: number
  contentType: string | null
  body: unknown
  events: string[]
  graphUrls: string[]
  capturePayloads: unknown[]
  consoleErrors: string[][]
}

function detailFor(leadgenId: string, suffix: string) {
  return {
    id: leadgenId,
    created_time: "2026-09-15T01:00:00+0000",
    ad_id: `ad-${suffix}`,
    ad_name: `합성 광고 ${suffix}`,
    adset_id: `adset-${suffix}`,
    adset_name: `합성 세트 ${suffix}`,
    campaign_id: `campaign-${suffix}`,
    campaign_name: `합성 캠페인 ${suffix}`,
    form_id: `form-${suffix}`,
    field_data: [
      { name: "full_name", values: [`합성 원장 ${suffix}`] },
      { name: "phone_number", values: [`010-0000-${suffix.padStart(4, "0").slice(-4)}`] },
      { name: "email", values: [`lead-${suffix}@example.com`] },
      { name: "company_name", values: [`합성 학원 ${suffix}`] },
      { name: "marketing_consent", values: ["yes"] },
    ],
  }
}

function leadValue(leadgenId: string, extra: Record<string, unknown> = {}) {
  return {
    leadgen_id: leadgenId,
    page_id: "100000000000001",
    form_id: `form-${leadgenId.slice(-2)}`,
    ad_id: `ad-${leadgenId.slice(-2)}`,
    created_time: 1789000000,
    ...extra,
  }
}

function pagePayload(changes: unknown[], entries = 1) {
  return {
    object: "page",
    entry: Array.from({ length: entries }, (_, index) => ({
      id: "100000000000001",
      time: 1789000000 + index,
      changes: index === 0 ? changes : [],
    })),
  }
}

export const ROUTE_RECORDING_SCENARIOS: RouteRecordingScenario[] = [
  {
    id: "single-lead-ok",
    note: "leadgen 1건, Graph 성공, 저장 200",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000011") }]),
      signature: "valid",
    },
    graph: { "9100000000000011": { kind: "ok", json: detailFor("9100000000000011", "11") } },
  },
  {
    id: "two-leads-one-capture-400",
    note: "2건 중 1건 저장 400 → failed 1, 응답은 200",
    request: {
      method: "POST",
      body: pagePayload([
        { field: "leadgen", value: leadValue("9100000000000021") },
        { field: "leadgen", value: leadValue("9100000000000022") },
      ]),
      signature: "valid",
    },
    graph: {
      "9100000000000021": { kind: "ok", json: detailFor("9100000000000021", "21") },
      "9100000000000022": { kind: "ok", json: detailFor("9100000000000022", "22") },
    },
    capture: {
      "9100000000000022": {
        kind: "result",
        status: 400,
        body: { ok: false, error: "합성 검증 오류" },
      },
    },
  },
  {
    id: "graph-500-still-captures",
    note: "Graph 500 → console.error 후 상세 없이 저장",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000031") }]),
      signature: "valid",
    },
    graph: { "9100000000000031": { kind: "http_error", status: 500, text: "합성 upstream down" } },
  },
  {
    id: "graph-network-error-still-captures",
    note: "Graph fetch 자체 실패 → 상세 없이 저장",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000032") }]),
      signature: "valid",
    },
    graph: { "9100000000000032": { kind: "network_error", message: "합성 socket hang up" } },
  },
  {
    id: "capture-throws",
    note: "submitLeadCapture 가 throw → failed 1",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000041") }]),
      signature: "valid",
    },
    graph: { "9100000000000041": { kind: "ok", json: detailFor("9100000000000041", "41") } },
    capture: { "9100000000000041": { kind: "throw", message: "합성 저장 예외" } },
  },
  {
    id: "capture-502-not-stored",
    note: "저장 실패 502 → failed 1",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000042") }]),
      signature: "valid",
    },
    graph: { "9100000000000042": { kind: "ok", json: detailFor("9100000000000042", "42") } },
    capture: {
      "9100000000000042": {
        kind: "result",
        status: 502,
        body: { ok: false, error: "합성 저장 실패", details: ["Failed to store the lead record."] },
      },
    },
  },
  {
    id: "no-token-captures-without-detail",
    note: "토큰 env 없음 → Graph 호출 없이 throw → 상세 없이 저장",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000051") }]),
      signature: "valid",
    },
    env: { META_PAGE_ACCESS_TOKEN: "", META_ACCESS_TOKEN: "", META_CAPI_ACCESS_TOKEN: "" },
  },
  {
    id: "mixed-changes-and-entries",
    note: "leadgen 아닌 필드·leadgen_id 없는 값은 거르고, 여러 entry 의 leadgen 을 순서대로",
    request: {
      method: "POST",
      body: {
        object: "page",
        entry: [
          {
            id: "100000000000001",
            time: 1789000000,
            changes: [
              { field: "feed", value: { item: "status" } },
              { field: "leadgen", value: { page_id: "100000000000001", form_id: "form-x" } },
              { field: "leadgen", value: leadValue("9100000000000061") },
            ],
          },
          {
            id: "100000000000002",
            time: 1789000001,
            changes: [{ field: "leadgen", value: leadValue("9100000000000062", { page_id: "100000000000002" }) }],
          },
          { id: "100000000000003" },
        ],
      },
      signature: "valid",
    },
    graph: {
      "9100000000000061": { kind: "ok", json: detailFor("9100000000000061", "61") },
      "9100000000000062": { kind: "ok", json: detailFor("9100000000000062", "62") },
    },
  },
  {
    id: "duplicate-leadgen-in-one-payload",
    note: "같은 leadgen 이 한 payload 에 두 번 → 둘 다 처리(현재 동작)",
    request: {
      method: "POST",
      body: pagePayload([
        { field: "leadgen", value: leadValue("9100000000000071") },
        { field: "leadgen", value: leadValue("9100000000000071") },
      ]),
      signature: "valid",
    },
    graph: { "9100000000000071": { kind: "ok", json: detailFor("9100000000000071", "71") } },
  },
  {
    id: "page-without-leadgen",
    note: "object=page 이지만 leadgen 없음 → received 0",
    request: {
      method: "POST",
      body: pagePayload([{ field: "feed", value: { item: "comment" } }]),
      signature: "valid",
    },
  },
  {
    id: "page-empty-entry",
    note: "entry 없음 → received 0",
    request: { method: "POST", body: { object: "page" }, signature: "valid" },
  },
  {
    id: "object-not-page",
    note: "object=user → ignored",
    request: {
      method: "POST",
      body: { object: "user", entry: [{ changes: [{ field: "leadgen", value: leadValue("9100000000000081") }] }] },
      signature: "valid",
    },
  },
  {
    id: "object-missing",
    note: "object 없음 → ignored unknown",
    request: { method: "POST", body: { entry: [] }, signature: "valid" },
  },
  {
    id: "invalid-signature",
    note: "서명 불일치 → 403",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000091") }]),
      signature: "invalid",
    },
  },
  {
    id: "missing-signature",
    note: "서명 헤더 없음 → 403",
    request: {
      method: "POST",
      body: pagePayload([{ field: "leadgen", value: leadValue("9100000000000092") }]),
      signature: "missing",
    },
  },
  {
    id: "invalid-json",
    note: "서명은 맞고 JSON 이 깨짐 → 400",
    request: { method: "POST", body: "{\"object\":\"page\",", signature: "valid" },
  },
  {
    id: "get-verify-ok",
    note: "GET 구독 검증 성공 → challenge 원문",
    request: {
      method: "GET",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": HARNESS_VERIFY_TOKEN,
        "hub.challenge": "recording-challenge-123",
      },
    },
  },
  {
    id: "get-verify-fail",
    note: "GET 토큰 불일치 → 403",
    request: {
      method: "GET",
      query: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "x" },
    },
  },
]

/** env 기본값(시나리오 env 가 덮는다) — 모드 스위치 env 는 여기 넣지 않는다(모드 테스트가 정한다). */
export function stubHarnessEnv(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    META_APP_SECRET: HARNESS_APP_SECRET,
    META_PAGE_ACCESS_TOKEN: HARNESS_PAGE_TOKEN,
    META_ACCESS_TOKEN: "",
    META_CAPI_ACCESS_TOKEN: "",
    META_GRAPH_API_VERSION: "",
    META_WEBHOOK_VERIFY_TOKEN: HARNESS_VERIFY_TOKEN,
  }
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    vi.stubEnv(key, value)
  }
}

/** 녹화본은 JSON 이라 undefined 키가 없다 — 비교 전에 같은 규칙으로 맞춘다. */
export function normalizeTranscript(transcript: RouteTranscript) {
  return JSON.parse(JSON.stringify(transcript)) as RouteTranscript
}

function leadgenIdFromMessage(payload: unknown) {
  const message = String((payload as { message?: unknown })?.message ?? "")
  return message.match(/leadgen_id=([^\n]+)/)?.[1] ?? "-"
}

function buildRequest(scenario: RouteRecordingScenario) {
  const request = scenario.request
  if (request.method === "GET") {
    const url = new URL("https://classin.kr/api/meta/webhook")
    for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value)
    return new NextRequest(url, { method: "GET" })
  }

  const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body)
  const headers: Record<string, string> = {}
  if (request.signature === "valid") {
    headers["x-hub-signature-256"] = `sha256=${createHmac("sha256", HARNESS_APP_SECRET).update(rawBody).digest("hex")}`
  } else if (request.signature === "invalid") {
    headers["x-hub-signature-256"] = `sha256=${"0".repeat(64)}`
  }
  return new NextRequest("https://classin.kr/api/meta/webhook", {
    method: "POST",
    body: rawBody,
    headers,
  })
}

type RouteModule = {
  GET: (req: NextRequest) => Promise<Response>
  POST: (req: NextRequest) => Promise<Response>
}

/**
 * 시나리오 하나를 라우트에 넣고 transcript 를 만든다.
 * submitLeadCapture 는 호출부가 vi.mock 으로 만든 mock 을 넘긴다(mockReset 은 여기서 한다).
 */
export async function runRouteScenario(
  route: RouteModule,
  scenario: RouteRecordingScenario,
  submitLeadCapture: Mock
): Promise<RouteTranscript> {
  const events: string[] = []
  const graphUrls: string[] = []
  const capturePayloads: unknown[] = []

  stubHarnessEnv(scenario.env)

  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(String(input))
    const leadgenId = url.pathname.split("/").pop() ?? ""
    events.push(`graph:${leadgenId}`)
    graphUrls.push(url.toString())
    const reply =
      scenario.graph?.[leadgenId] ?? ({ kind: "ok", json: detailFor(leadgenId, leadgenId.slice(-2)) } as GraphReply)
    if (reply.kind === "network_error") throw new Error(reply.message)
    return {
      ok: reply.kind === "ok",
      status: reply.kind === "ok" ? 200 : reply.status,
      json: async () => (reply.kind === "ok" ? reply.json : {}),
      text: async () => (reply.kind === "http_error" ? reply.text : ""),
    }
  })
  vi.stubGlobal("fetch", fetchMock)

  submitLeadCapture.mockReset()
  submitLeadCapture.mockImplementation(async (payload: unknown) => {
    const leadgenId = leadgenIdFromMessage(payload)
    events.push(`capture:${leadgenId}`)
    capturePayloads.push(payload)
    const reply = scenario.capture?.[leadgenId]
    if (reply?.kind === "throw") throw new Error(reply.message)
    if (reply?.kind === "result") return { status: reply.status, body: reply.body }
    return {
      status: 200,
      body: { ok: true, stored: true, warnings: [], leadId: `lead-${leadgenId.slice(-2)}` },
    }
  })

  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

  const request = buildRequest(scenario)
  const response = scenario.request.method === "GET" ? await route.GET(request) : await route.POST(request)
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // challenge 원문 등 JSON 이 아닌 응답은 문자열로 둔다
  }

  // 거르지 않고 전부 기록한다 — admin 경로에 console.error 가 한 줄이라도 늘면 녹화본과 달라진다.
  const consoleErrors = consoleError.mock.calls.map((call) =>
    call.map((arg) => (arg instanceof Error ? `Error: ${arg.message}` : String(arg)))
  )
  consoleError.mockRestore()

  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body,
    events,
    graphUrls,
    capturePayloads,
    consoleErrors,
  }
}
