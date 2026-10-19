import { readFileSync } from "fs"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GOLDEN_NOW,
  GOLDEN_SCENARIOS,
  labelsOf,
  loadRecordedLeadCapture,
  type GoldenScenario,
} from "./fixtures/lead-capture-effects-harness"

// runLeadCaptureEffects 직접 호출 — 토글별로 정확히 그 부수효과만 빠지는지 본다.
// 전부 켠 경우의 순서·인자는 골든(lead-capture-effects.golden.test.ts)이 submitLeadCapture 로 잠근다.

// 녹화기 설정은 URL 3개 + 켜짐 맵만 가진 최소 모양이다.
type EffectsSettings = Parameters<
  Awaited<ReturnType<typeof loadRecordedLeadCapture>>["leadCapture"]["runLeadCaptureEffects"]
>[1]["settings"]

type Toggles = {
  externalForwards: boolean
  subscriberUpsert: boolean
  automationOnSubmit: boolean
  leadCreatedNotification: boolean
  serverConversion: boolean
  siteInflow: boolean
}

function scenario(id: string): GoldenScenario {
  const found = GOLDEN_SCENARIOS.find((item) => item.id === id)
  if (!found) throw new Error(`unknown scenario ${id}`)
  return found
}

async function runEffects(
  scenarioId: string,
  toggles: (all: Toggles) => Toggles,
  extra: { suppressLeadCreatedNotification?: boolean } = {}
) {
  const goldenScenario = scenario(scenarioId)
  const { leadCapture, log } = await loadRecordedLeadCapture(goldenScenario)
  const body = leadCapture.buildLeadPayload(goldenScenario.raw)
  const leadId = "lead-effects-direct"
  const result = await leadCapture.runLeadCaptureEffects(body, {
    settings: goldenScenario.settings as EffectsSettings,
    stored: true,
    savedLeadId: leadId,
    conversionEventId: `lead:${leadId}`,
    toggles: toggles({ ...leadCapture.ALL_LEAD_CAPTURE_EFFECTS }),
    context: extra,
  })
  return { log, result, leadCapture }
}

const ALL_ON_DELIVERY_FAILURES = [
  "postJson:sheet",
  "postJson:leadWebhook",
  "postJson:channelTalk",
  "upsertSubscriber",
  "triggerOnSubmitRules",
  "sendServerConversion",
  "emitNotificationEvent:lead.created",
  "createCrmCustomerEvent",
  "emitNotificationEvent:integration.webhook_failed",
]

describe("runLeadCaptureEffects 토글", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(GOLDEN_NOW))
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("전부 켜면 submitLeadCapture 의 저장 뒤 순서와 같고, 기다린 전달 오류를 돌려준다", async () => {
    const { log, result } = await runEffects("contact_page_delivery_failures", (all) => all)
    expect(labelsOf(log)).toEqual(ALL_ON_DELIVERY_FAILURES)
    expect(result).toEqual({ errors: ["Webhook: 500", "golden subscriber down"] })
  })

  it("ALL_LEAD_CAPTURE_EFFECTS 는 전부 true 이고 얼려 있다", async () => {
    const { leadCapture } = await loadRecordedLeadCapture(scenario("contact_page"))
    expect(leadCapture.ALL_LEAD_CAPTURE_EFFECTS).toEqual({
      externalForwards: true,
      subscriberUpsert: true,
      automationOnSubmit: true,
      leadCreatedNotification: true,
      serverConversion: true,
      siteInflow: true,
    })
    expect(Object.isFrozen(leadCapture.ALL_LEAD_CAPTURE_EFFECTS)).toBe(true)
  })

  const SINGLE_OFF: Array<[keyof Toggles, string[]]> = [
    ["externalForwards", ["postJson:sheet", "postJson:leadWebhook", "postJson:channelTalk"]],
    ["subscriberUpsert", ["upsertSubscriber"]],
    ["automationOnSubmit", ["triggerOnSubmitRules"]],
    ["serverConversion", ["sendServerConversion"]],
    ["leadCreatedNotification", ["emitNotificationEvent:lead.created"]],
    ["siteInflow", ["createCrmCustomerEvent"]],
  ]

  for (const [key, removed] of SINGLE_OFF) {
    it(`${key}=false 는 그 호출만 뺀다`, async () => {
      const { log } = await runEffects("contact_page", (all) => ({ ...all, [key]: false }))
      const allOn = await runEffects("contact_page", (all) => all)
      expect(labelsOf(log)).toEqual(
        labelsOf(allOn.log).filter((label) => !removed.includes(label))
      )
      expect(labelsOf(allOn.log)).toEqual(expect.arrayContaining(removed))
    })
  }

  it("전달을 끄면 전달 오류도 없어 인시던트를 내지 않는다", async () => {
    const { log, result } = await runEffects("contact_page_delivery_failures", (all) => ({
      ...all,
      externalForwards: false,
      subscriberUpsert: false,
    }))
    expect(result).toEqual({ errors: [] })
    expect(labelsOf(log)).not.toContain("emitNotificationEvent:integration.webhook_failed")
  })

  it("저장 실패 인시던트는 토글과 무관하게 낸다", async () => {
    const goldenScenario = scenario("contact_page_storage_failure")
    const { leadCapture, log } = await loadRecordedLeadCapture(goldenScenario)
    const none = Object.fromEntries(
      Object.keys(leadCapture.ALL_LEAD_CAPTURE_EFFECTS).map((key) => [key, false])
    ) as unknown as Toggles

    const result = await leadCapture.runLeadCaptureEffects(
      leadCapture.buildLeadPayload(goldenScenario.raw),
      {
        settings: goldenScenario.settings as EffectsSettings,
        stored: false,
        storageError: "Failed to store the lead record.",
        toggles: none,
        context: {},
      }
    )

    expect(result).toEqual({ errors: [] })
    expect(labelsOf(log)).toEqual(["emitNotificationEvent:integration.webhook_failed"])
  })

  it("suppressLeadCreatedNotification 은 토글이 켜져 있어도 계속 따른다", async () => {
    const { log } = await runEffects("contact_page", (all) => all, {
      suppressLeadCreatedNotification: true,
    })
    expect(labelsOf(log)).not.toContain("emitNotificationEvent:lead.created")
  })

  it("미러 모양(전달·자동화·전환·site_inflow 끔)은 구독자 upsert 와 lead.created 만 부른다", async () => {
    const { log } = await runEffects("meta_lead_ads", () => ({
      externalForwards: false,
      subscriberUpsert: true,
      automationOnSubmit: false,
      leadCreatedNotification: true,
      serverConversion: false,
      siteInflow: false,
    }))
    expect(labelsOf(log)).toEqual(["upsertSubscriber", "emitNotificationEvent:lead.created"])
  })

  it("DB 토글 네 키는 마이그레이션 side_effects 기본값의 키와 같다", async () => {
    const sql = readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260915_meta_leadgen_single_receiver.sql"),
      "utf8"
    )
    const match = sql.match(/side_effects\s+jsonb not null default\s+'(\{[^']+\})'::jsonb/)
    expect(match).not.toBeNull()
    const dbKeys = Object.keys(JSON.parse(match![1]) as Record<string, boolean>).sort()

    const { leadCapture } = await loadRecordedLeadCapture(scenario("contact_page"))
    const codeKeys = Object.keys(leadCapture.ALL_LEAD_CAPTURE_EFFECTS)
    expect(dbKeys).toEqual(
      ["automationOnSubmit", "externalForwards", "leadCreatedNotification", "subscriberUpsert"]
    )
    expect(codeKeys).toEqual(expect.arrayContaining(dbKeys))
  })
})
