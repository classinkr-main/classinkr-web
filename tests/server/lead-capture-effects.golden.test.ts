import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GOLDEN_EFFECT_LOGS } from "./fixtures/lead-capture-effects-golden.expected"
import {
  GOLDEN_NOW,
  GOLDEN_SCENARIOS,
  labelsOf,
  loadRecordedLeadCapture,
  runGoldenScenario,
  type GoldenScenario,
} from "./fixtures/lead-capture-effects-harness"

// 골든 테스트 — submitLeadCapture 저장 뒤 부수효과의 호출 순서·인자·응답을 잠근다
// (설계 META-RECEIVER-FINAL §4-2 H3). 저장 뒤 블록을 runLeadCaptureEffects 로 옮기기 **전에**
// 커밋했고, 옮긴 뒤에도 이 파일과 fixtures 는 바뀌지 않아야 한다.
//
// 순서 라벨은 여기 인라인으로 두어 리뷰에서 바로 읽히게 하고, 인자 전체는
// fixtures/lead-capture-effects-golden.expected.ts 와 비교한다.

const EXPECTED_ORDER: Record<string, string[]> = {
  // 홈페이지 문의: 세 전달 모두 켜짐, 동의+이메일, anonymousId, deferTask 있음.
  contact_page: [
    "getResolvedSettings",
    "saveLead",
    "deferTask", // 신원 결합(stitch)
    "postJson:sheet",
    "postJson:leadWebhook",
    "postJson:channelTalk",
    "upsertSubscriber",
    "triggerOnSubmitRules",
    "sendServerConversion",
    "deferTask", // lead.created
    "createCrmCustomerEvent",
    "returned",
    "deferred:run",
    "stitchIdentity",
    "deferred:run",
    "emitNotificationEvent:lead.created",
  ],
  // 데모 신청: 시트만 켜짐(리드 웹훅은 꺼짐), 동의 없음, 행사 슬러그, deferTask 없음.
  demo_modal: [
    "getResolvedSettings",
    "saveLead",
    "postJson:sheet",
    "triggerOnSubmitRules",
    "sendServerConversion",
    "emitNotificationEvent:lead.created",
    "createCrmCustomerEvent",
    "returned",
  ],
  // Meta 리드애즈: 웹훅 라우트와 같이 context 없이. site_inflow 없음.
  meta_lead_ads: [
    "getResolvedSettings",
    "saveLead",
    "postJson:leadWebhook",
    "postJson:channelTalk",
    "upsertSubscriber",
    "triggerOnSubmitRules",
    "sendServerConversion",
    "emitNotificationEvent:lead.created",
    "returned",
  ],
  // 저장 실패: 전달·구독자·자동화는 그대로, 전환·lead.created·site_inflow 없음, critical 인시던트, 502.
  contact_page_storage_failure: [
    "getResolvedSettings",
    "saveLead",
    "postJson:sheet",
    "upsertSubscriber",
    "triggerOnSubmitRules",
    "emitNotificationEvent:integration.webhook_failed",
    "returned",
  ],
  // 전달 실패(리드 웹훅 500 + 구독자 거절): 저장 성공, warning 인시던트가 마지막, 200 + warnings.
  contact_page_delivery_failures: [
    "getResolvedSettings",
    "saveLead",
    "postJson:sheet",
    "postJson:leadWebhook",
    "postJson:channelTalk",
    "upsertSubscriber",
    "triggerOnSubmitRules",
    "sendServerConversion",
    "emitNotificationEvent:lead.created",
    "createCrmCustomerEvent",
    "emitNotificationEvent:integration.webhook_failed",
    "returned",
  ],
  // 상위 플로우가 알림을 소유: lead.created 없음(deferTask 도 등록 안 함).
  demo_modal_suppressed_notification: [
    "getResolvedSettings",
    "saveLead",
    "triggerOnSubmitRules",
    "sendServerConversion",
    "createCrmCustomerEvent",
    "returned",
  ],
}

function scenario(id: string): GoldenScenario {
  const found = GOLDEN_SCENARIOS.find((item) => item.id === id)
  if (!found) throw new Error(`unknown scenario ${id}`)
  return found
}

async function flushMicrotasks() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

describe("submitLeadCapture 부수효과 골든", () => {
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

  it("시나리오 목록이 기대 순서 표와 같다", () => {
    expect(GOLDEN_SCENARIOS.map((item) => item.id)).toEqual(Object.keys(EXPECTED_ORDER))
    expect(Object.keys(GOLDEN_EFFECT_LOGS)).toEqual(Object.keys(EXPECTED_ORDER))
  })

  for (const goldenScenario of GOLDEN_SCENARIOS) {
    it(`호출 순서·인자·응답: ${goldenScenario.id}`, async () => {
      const log = await runGoldenScenario(goldenScenario)

      expect(labelsOf(log)).toEqual(EXPECTED_ORDER[goldenScenario.id])
      expect(log).toEqual(GOLDEN_EFFECT_LOGS[goldenScenario.id])
    })
  }

  it("외부 전달·구독자 upsert 가 모두 끝난 뒤에야 자동화·전환·알림으로 넘어간다", async () => {
    const pending: Array<() => void> = []
    const { leadCapture, log } = await loadRecordedLeadCapture(scenario("contact_page"), {
      postJson: () =>
        new Promise((resolve) => {
          pending.push(() => resolve({ ok: true, status: 200 }))
        }),
    })

    let settled = false
    // anonymousId 가 있으면 deferTask 없는 신원 결합이 동적 import 뒤에 끼어들어 순서가 흔들린다.
    const raw = { ...scenario("contact_page").raw, anonymousId: undefined }
    const resultPromise = leadCapture.submitLeadCapture(raw).then((result) => {
      settled = true
      return result
    })
    await flushMicrotasks()

    expect(labelsOf(log)).toEqual([
      "getResolvedSettings",
      "saveLead",
      "postJson:sheet",
      "postJson:leadWebhook",
      "postJson:channelTalk",
      "upsertSubscriber",
    ])
    expect(settled).toBe(false)
    expect(pending).toHaveLength(3)

    pending.splice(0, 2).forEach((resolve) => resolve())
    await flushMicrotasks()
    expect(labelsOf(log)).not.toContain("triggerOnSubmitRules")
    expect(settled).toBe(false)

    pending.splice(0).forEach((resolve) => resolve())
    const result = await resultPromise
    expect(result.status).toBe(200)
    expect(labelsOf(log).slice(6)).toEqual([
      "triggerOnSubmitRules",
      "sendServerConversion",
      "emitNotificationEvent:lead.created",
      "createCrmCustomerEvent",
    ])
  })

  it("던져 두는 호출(자동화·전환·알림·site_inflow·인시던트)은 응답을 막지 않는다", async () => {
    const never = () => new Promise<unknown>(() => {})
    const { leadCapture, log } = await loadRecordedLeadCapture(
      scenario("contact_page_delivery_failures"),
      {
        triggerOnSubmitRules: never,
        sendServerConversion: never,
        emitNotificationEvent: never,
        createCrmCustomerEvent: never,
      }
    )

    const result = await leadCapture.submitLeadCapture(scenario("contact_page_delivery_failures").raw)

    expect(result.status).toBe(200)
    expect(labelsOf(log)).toEqual(EXPECTED_ORDER.contact_page_delivery_failures.slice(0, -1))
  })

  it("던져 두는 호출이 거절돼도 응답은 같고 거절은 삼킨다", async () => {
    const reject = () => Promise.reject(new Error("golden fire-and-forget failure"))
    const { leadCapture } = await loadRecordedLeadCapture(scenario("contact_page_delivery_failures"), {
      triggerOnSubmitRules: reject,
      sendServerConversion: reject,
      emitNotificationEvent: reject,
      createCrmCustomerEvent: reject,
    })

    const result = await leadCapture.submitLeadCapture(scenario("contact_page_delivery_failures").raw)
    await flushMicrotasks()

    expect(result).toEqual(
      (GOLDEN_EFFECT_LOGS.contact_page_delivery_failures.at(-1) as [string, unknown])[1]
    )
    expect(console.error).toHaveBeenCalledWith(
      "[lead-capture] triggerOnSubmitRules error:",
      expect.any(Error)
    )
    expect(console.warn).toHaveBeenCalledWith(
      "[lead-capture] server conversion failed:",
      expect.any(Error)
    )
    expect(console.error).toHaveBeenCalledWith(
      "[lead-capture] notification emit failed:",
      expect.any(Error)
    )
    expect(console.error).toHaveBeenCalledWith(
      "[lead-capture] site_inflow event insert failed:",
      expect.any(Error)
    )
    expect(console.error).toHaveBeenCalledWith(
      "[lead-capture] incident notification emit failed:",
      expect.any(Error)
    )
  })
})
