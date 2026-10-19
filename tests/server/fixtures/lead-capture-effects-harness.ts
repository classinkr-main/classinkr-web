import { vi } from "vitest"

import { GOLDEN_PAYLOAD_CASES } from "../../meta/fixtures/lead-ads-golden-cases"

// submitLeadCapture 부수효과 호출 순서 녹화기(골든 테스트용).
//
// lib/server/lead-capture.ts 가 부르는 바깥 모듈을 전부 가짜로 바꾸고, 호출을 한 줄짜리 로그에
// 순서대로 쌓는다. 저장 뒤 블록을 runLeadCaptureEffects 로 옮기기 전(설계 META-RECEIVER-FINAL
// §4-2 H3)에 이 녹화로 현재 순서·인자·응답을 잠갔다. 로그는 동기 호출 시점에 쌓이므로
// "void 로 던지는 호출"도 순서가 고정된다.
//
// 값은 모두 합성이다(전화 010-0000-xxxx, 이메일 example.com, URL 은 example.com).

export const GOLDEN_NOW = "2026-09-15T02:00:00.000Z"

export const GOLDEN_URLS = {
  sheet: "https://sheet.example.com/golden",
  leadWebhook: "https://webhook.example.com/golden",
  channelTalk: "https://channel.example.com/golden",
} as const

export type LogEntry = [label: string, args?: unknown]

type Settings = {
  googleSheetWebhookUrl: string
  leadWebhookUrl: string
  channelTalkWebhookUrl: string
  webhookEnabled?: Record<string, boolean>
}

type PostJsonResponse = { ok: boolean; status: number }

export type GoldenScenario = {
  id: string
  raw: Record<string, unknown>
  settings: Settings
  saveLead: { id: string } | Error
  postJson?: Partial<Record<keyof typeof GOLDEN_URLS, PostJsonResponse>>
  upsertSubscriberError?: Error
  useDeferTask: boolean
  context?: {
    requestMeta?: Record<string, unknown> | null
    suppressLeadCreatedNotification?: boolean
  }
}

const ALL_FORWARDS: Settings = {
  googleSheetWebhookUrl: GOLDEN_URLS.sheet,
  leadWebhookUrl: GOLDEN_URLS.leadWebhook,
  channelTalkWebhookUrl: GOLDEN_URLS.channelTalk,
  webhookEnabled: {},
}

const GOLDEN_REQUEST_META = {
  clientIp: "203.0.113.10",
  userAgent: "golden-agent/1.0",
  sourceUrl: "https://classin.kr/contact?from=request-meta",
  anonymousId: "anon-golden-contact",
  gaClientId: "GA1.1.1111111111.1789000000",
  fbp: "fb.1.1789000000000.1111111111",
  fbc: null,
  consent: { analytics: true, marketing: true },
}

const CONTACT_RAW = {
  source: "contact_page",
  name: "골든 문의자",
  org: "골든 테스트학원",
  role: "원장",
  size: "30",
  email: "Golden.Contact@Example.com",
  phone: "010-0000-1001",
  branch: "청주",
  message: "골든 문의 본문",
  marketingConsent: true,
  sourceDetail: "도입 상담",
  utm_source: "google",
  utmMedium: "cpc",
  utmCampaign: "golden-campaign",
  gclid: "golden-gclid",
  landingPage: "https://classin.kr/landing",
  currentPage: "https://classin.kr/contact",
  referrer: "https://search.example.com/",
  anonymousId: "anon-golden-contact",
}

const DEMO_RAW = {
  source: "demo_modal",
  name: "골든 데모",
  org: "골든 데모학원",
  role: "실장",
  size: "100",
  email: "demo.golden@example.com",
  phone: "010-0000-1002",
  eventSlug: "golden-seminar",
  lead_magnet: "Golden Guide PDF",
  marketingConsent: false,
  landing_page: "https://classin.kr/demo",
}

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    id: "contact_page",
    raw: CONTACT_RAW,
    settings: ALL_FORWARDS,
    saveLead: { id: "lead-golden-contact" },
    useDeferTask: true,
    context: { requestMeta: GOLDEN_REQUEST_META },
  },
  {
    id: "demo_modal",
    raw: DEMO_RAW,
    settings: {
      googleSheetWebhookUrl: GOLDEN_URLS.sheet,
      leadWebhookUrl: GOLDEN_URLS.leadWebhook,
      channelTalkWebhookUrl: "",
      webhookEnabled: { leadWebhookUrl: false },
    },
    saveLead: { id: "lead-golden-demo" },
    useDeferTask: false,
  },
  {
    // 웹훅 라우트와 같은 입력: H2 골든 표준 케이스 payload 를 context 없이 넘긴다.
    id: "meta_lead_ads",
    raw: GOLDEN_PAYLOAD_CASES[0].expected,
    settings: {
      googleSheetWebhookUrl: "",
      leadWebhookUrl: GOLDEN_URLS.leadWebhook,
      channelTalkWebhookUrl: GOLDEN_URLS.channelTalk,
    },
    saveLead: { id: "lead-golden-meta" },
    useDeferTask: false,
  },
  {
    id: "contact_page_storage_failure",
    raw: CONTACT_RAW,
    settings: {
      googleSheetWebhookUrl: GOLDEN_URLS.sheet,
      leadWebhookUrl: "",
      channelTalkWebhookUrl: "",
    },
    saveLead: new Error("golden database unavailable"),
    useDeferTask: true,
  },
  {
    id: "contact_page_delivery_failures",
    raw: { ...CONTACT_RAW, anonymousId: undefined },
    settings: ALL_FORWARDS,
    saveLead: { id: "lead-golden-delivery" },
    postJson: { leadWebhook: { ok: false, status: 500 } },
    upsertSubscriberError: new Error("golden subscriber down"),
    useDeferTask: false,
  },
  {
    id: "demo_modal_suppressed_notification",
    raw: { ...DEMO_RAW, eventSlug: undefined },
    settings: {
      googleSheetWebhookUrl: "",
      leadWebhookUrl: "",
      channelTalkWebhookUrl: "",
    },
    saveLead: { id: "lead-golden-suppressed" },
    useDeferTask: true,
    context: { suppressLeadCreatedNotification: true },
  },
]

function urlLabel(url: string) {
  const entry = Object.entries(GOLDEN_URLS).find(([, value]) => value === url)
  return entry ? entry[0] : url
}

/** 녹화는 그대로 하고 반환값만 바꾸고 싶은 호출(대기·거절 시험용). */
export type RecorderOverrides = Partial<
  Record<
    | "postJson"
    | "triggerOnSubmitRules"
    | "sendServerConversion"
    | "emitNotificationEvent"
    | "createCrmCustomerEvent",
    (input: unknown) => Promise<unknown>
  >
>

export async function loadRecordedLeadCapture(
  scenario: GoldenScenario,
  overrides: RecorderOverrides = {}
) {
  vi.resetModules()
  const log: LogEntry[] = []
  const record = (label: string, args?: unknown) => {
    log.push(args === undefined ? [label] : [label, args])
  }

  const postJson = vi.fn((url: string, data: unknown) => {
    const label = urlLabel(url)
    record(`postJson:${label}`, data)
    if (overrides.postJson) return overrides.postJson(data) as Promise<PostJsonResponse>
    const response =
      scenario.postJson?.[label as keyof typeof GOLDEN_URLS] ?? { ok: true, status: 200 }
    return Promise.resolve(response)
  })

  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn(async () => {
      record("getResolvedSettings")
      return scenario.settings
    }),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({
    // 재유입 병합 후보 없음 — 골든 시나리오는 전부 신규 저장 경로다(녹화 로그에 남기지 않는다).
    findLeadsByContacts: vi.fn(async () => []),
    saveLead: vi.fn((input: unknown) => {
      record("saveLead", input)
      return scenario.saveLead instanceof Error
        ? Promise.reject(scenario.saveLead)
        : Promise.resolve(scenario.saveLead)
    }),
  }))
  vi.doMock("@/lib/identity/stitch", () => ({
    stitchIdentity: vi.fn(async (input: unknown) => {
      record("stitchIdentity", input)
      return { warnings: [] }
    }),
  }))
  vi.doMock("@/lib/server/post-json", () => ({ postJson }))
  vi.doMock("@/lib/repositories/marketing", () => ({
    upsertSubscriber: vi.fn((input: unknown) => {
      record("upsertSubscriber", input)
      return scenario.upsertSubscriberError
        ? Promise.reject(scenario.upsertSubscriberError)
        : Promise.resolve(undefined)
    }),
  }))
  vi.doMock("@/lib/automation-engine", () => ({
    triggerOnSubmitRules: vi.fn((input: unknown) => {
      record("triggerOnSubmitRules", input)
      return overrides.triggerOnSubmitRules?.(input) ?? Promise.resolve(undefined)
    }),
  }))
  vi.doMock("@/lib/marketing/server-conversions", () => ({
    sendServerConversion: vi.fn((input: unknown) => {
      record("sendServerConversion", input)
      return overrides.sendServerConversion?.(input) ?? Promise.resolve({})
    }),
  }))
  vi.doMock("@/lib/notifications/emit-event", () => ({
    emitNotificationEvent: vi.fn((input: { eventType: string }) => {
      record(`emitNotificationEvent:${input.eventType}`, input)
      return overrides.emitNotificationEvent?.(input) ?? Promise.resolve(undefined)
    }),
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    createCrmCustomerEvent: vi.fn((input: unknown) => {
      record("createCrmCustomerEvent", input)
      return overrides.createCrmCustomerEvent?.(input) ?? Promise.resolve(undefined)
    }),
  }))

  const leadCapture = await import("@/lib/server/lead-capture")
  return { leadCapture, log, record, postJson }
}

/** 시나리오 한 건을 돌려 로그를 돌려준다. 미뤄진 작업은 응답 뒤에 순서대로 실행한다. */
export async function runGoldenScenario(
  scenario: GoldenScenario,
  overrides: RecorderOverrides = {}
) {
  const { leadCapture, log, record } = await loadRecordedLeadCapture(scenario, overrides)
  const deferred: Array<() => Promise<void>> = []
  const context = {
    ...(scenario.context ?? {}),
    ...(scenario.useDeferTask
      ? {
          deferTask: (task: () => Promise<void>) => {
            record("deferTask")
            deferred.push(task)
          },
        }
      : {}),
  }

  const result = await leadCapture.submitLeadCapture(
    scenario.raw,
    context as Parameters<typeof leadCapture.submitLeadCapture>[1]
  )
  record("returned", result)

  for (const task of deferred) {
    record("deferred:run")
    await task()
  }

  return log
}

export function labelsOf(log: LogEntry[]) {
  return log.map(([label]) => label)
}
