/**
 * lib/messaging/marketing-consent.ts — 동의 분류(세그먼트 대상 미리보기)·해지 판정(이메일 직접 입력 발송).
 * 로더·자동화 게이트(isLeadMarketingEligible)는 tests/messaging/automation-lead-consent-gate.test.ts 가 고정한다
 * (automation-engine 에서 다시 내보낸 같은 함수).
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("이 테스트는 DB 를 읽지 않는다")
  },
}))

import {
  classifyEmailConsent,
  isEmailUnsubscribed,
  isLeadMarketingEligible,
  type LeadMarketingConsentIndex,
} from "@/lib/messaging/marketing-consent"
import * as automation from "@/lib/automation-engine"

vi.mock("@/lib/repositories/automation", () => ({
  getActiveRulesByTrigger: vi.fn(),
  getRuleById: vi.fn(),
  createLog: vi.fn(),
  updateLogStatus: vi.fn(),
}))
vi.mock("@/lib/repositories/automation-delay", () => ({ createDelayQueueItem: vi.fn() }))
vi.mock("@/lib/email", () => ({ sendBatchEmail: vi.fn(), wrapCampaignHtml: vi.fn() }))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: vi.fn() }))
vi.mock("@/lib/server/security-tokens", () => ({ createUnsubscribeUrl: vi.fn() }))

const index: LeadMarketingConsentIndex = {
  subscriberStatusByEmail: new Map<string, "active" | "blocked">([
    ["active@x.com", "active"],
    ["gone@x.com", "blocked"],
  ]),
  profileConsentEmails: new Set(["profile@x.com", "gone@x.com", "active@x.com"]),
}

describe("classifyEmailConsent", () => {
  it("해지 우선 → 구독 active → 프로필 동의만 → 근거 없음(대소문자·공백 무시)", () => {
    expect(classifyEmailConsent(" Gone@X.com", index)).toBe("unsubscribed")
    expect(classifyEmailConsent("ACTIVE@x.com", index)).toBe("subscriber_active")
    expect(classifyEmailConsent("profile@x.com", index)).toBe("profile_only")
    expect(classifyEmailConsent("stranger@x.com", index)).toBe("none")
    expect(classifyEmailConsent("   ", index)).toBe("none")
  })
})

describe("isEmailUnsubscribed", () => {
  it("구독 행 중 active 아님이 하나라도 있으면 해지 — 동의 근거 유무는 보지 않는다", () => {
    expect(isEmailUnsubscribed("GONE@x.com", index)).toBe(true)
    expect(isEmailUnsubscribed("active@x.com", index)).toBe(false)
    expect(isEmailUnsubscribed("stranger@x.com", index)).toBe(false)
    expect(isEmailUnsubscribed("", index)).toBe(false)
  })
})

describe("automation-engine 재수출", () => {
  it("자동화 게이트는 같은 함수를 다시 내보낸다(동작·import 경로 불변)", () => {
    expect(automation.isLeadMarketingEligible).toBe(isLeadMarketingEligible)
    expect(isLeadMarketingEligible("profile@x.com", index)).toBe(true) // CT11 게이트는 프로필 동의를 계속 허용
    expect(isLeadMarketingEligible("gone@x.com", index)).toBe(false)
  })
})
