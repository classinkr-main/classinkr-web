/**
 * 세그먼트 → 메시지 발송 1단계(대상 미리보기, 2026-09-25) — lib/crm/segment-audience.ts 순수 분류·문구.
 *  - 행마다 한 버킷(합계 = 분류 행 수), 해지 우선, 프로필 동의만 제외, 대소문자 무시 중복, NEO 는 전화만,
 *    동의 조회 실패면 발송 가능 0, 문자는 늘 0(전화 보유 수만).
 *  - 화면 문구·메시지 탭 넘김 차단 사유.
 */
import { describe, expect, it } from "vitest"

import {
  SEGMENT_HANDOFF_UNSAVED_REASON,
  SEGMENT_SEND_MAX_PER_RUN,
  classifySegmentAudience,
  describeAudienceByKind,
  normalizeAudienceEmail,
  segmentHandoffBlockReason,
  sumAudienceRows,
  summarizeSegmentAudience,
  type EmailConsentClass,
  type SegmentAudienceContact,
  type SegmentAudiencePreview,
} from "@/lib/crm/segment-audience"

const CONSENT: Record<string, EmailConsentClass> = {
  "active@x.com": "subscriber_active",
  "active2@x.com": "subscriber_active",
  "gone@x.com": "unsubscribed",
  "profile@x.com": "profile_only",
}
const classify = (email: string): EmailConsentClass => CONSENT[email] ?? "none"

function lead(email: string | null, phone: string | null = null): SegmentAudienceContact {
  return { kind: "lead", email, phone }
}

describe("normalizeAudienceEmail", () => {
  it("공백 제거·소문자·형식 검사 — 비었거나 틀리면 null", () => {
    expect(normalizeAudienceEmail("  Active@X.com ")).toBe("active@x.com")
    expect(normalizeAudienceEmail("no-at-sign")).toBeNull()
    expect(normalizeAudienceEmail("a b@x.com")).toBeNull()
    expect(normalizeAudienceEmail("")).toBeNull()
    expect(normalizeAudienceEmail(null)).toBeNull()
  })
})

describe("classifySegmentAudience", () => {
  const contacts: SegmentAudienceContact[] = [
    lead("Active@X.com", "010-1111-2222"),
    lead("active@x.com"), // 대소문자만 다른 중복
    lead("gone@x.com"),
    lead("profile@x.com"),
    lead("stranger@x.com"),
    lead("broken-email", "010-3333-4444"),
    lead(null, "010-5555-6666"),
    lead(null, null),
    { kind: "neo_account", email: null, phone: "010-7777-8888" },
    { kind: "neo_account", email: null, phone: "010-1111-2222" }, // 같은 전화 — 고유 번호로 한 번
    { kind: "customer", email: "active2@x.com", phone: null },
    { kind: "customer", email: null, phone: null, unresolved: true },
    { kind: null, email: null, phone: null, unresolved: true },
  ]

  it("행마다 정확히 한 버킷 — 합계 = 분류 행 수, 구독 active 고유 주소만 발송 가능", () => {
    const result = classifySegmentAudience(contacts, classify, { totalRows: contacts.length, truncated: false })
    expect(sumAudienceRows(result.email.rows)).toBe(contacts.length)
    expect(result.evaluatedRows).toBe(contacts.length)
    expect(result.email.rows).toEqual({
      eligible: 2,
      unsubscribed: 1,
      noConsent: 1,
      profileOnly: 1,
      consentUnknown: 0,
      duplicate: 1,
      invalidEmail: 1,
      noEmailPhoneOnly: 3,
      noContact: 1,
      unresolved: 2,
    })
    expect(result.email.eligible).toBe(2)
    expect(result.consent).toBe("ok")
    expect(result.truncated).toBe(false)
  })

  it("원천별 행 수와 발송 가능 수 — NEO 계정은 이메일이 없어 발송 가능 0", () => {
    const result = classifySegmentAudience(contacts, classify, { totalRows: contacts.length, truncated: false })
    expect(result.byKind.lead).toEqual({ rows: 8, emailEligible: 1 })
    expect(result.byKind.neo_account).toEqual({ rows: 2, emailEligible: 0 })
    expect(result.byKind.customer).toEqual({ rows: 2, emailEligible: 1 })
  })

  it("문자는 늘 0명(정책 결정 대기) — 전화 보유는 정규화 고유 번호 수", () => {
    const result = classifySegmentAudience(contacts, classify, { totalRows: contacts.length, truncated: false })
    expect(result.sms).toEqual({ eligible: 0, withPhone: 4, blockedReason: "sms_consent_policy_pending" })
  })

  it("해지는 로그인 프로필 동의보다 우선 — 분류 함수의 판정을 그대로 따른다, 프로필 동의만은 발송 가능이 아니다", () => {
    const result = classifySegmentAudience([lead("gone@x.com"), lead("profile@x.com")], classify, {
      totalRows: 2,
      truncated: false,
    })
    expect(result.email.eligible).toBe(0)
    expect(result.email.rows.unsubscribed).toBe(1)
    expect(result.email.rows.profileOnly).toBe(1)
  })

  it("동의 목록 조회 실패(null) — 발송 가능 0, 이메일 행은 동의 확인 불가로 센다", () => {
    const result = classifySegmentAudience([lead("active@x.com"), lead("x@y.com"), lead(null, "01012345678")], null, {
      totalRows: 3,
      truncated: false,
    })
    expect(result.consent).toBe("unavailable")
    expect(result.email.eligible).toBe(0)
    expect(result.email.rows.consentUnknown).toBe(2)
    expect(result.email.rows.noEmailPhoneOnly).toBe(1)
  })

  it("번호로 볼 수 없는 전화(9자리 미만)는 연락처 없음", () => {
    const result = classifySegmentAudience([lead(null, "123")], classify, { totalRows: 1, truncated: false })
    expect(result.email.rows.noContact).toBe(1)
    expect(result.sms.withPhone).toBe(0)
  })

  it("상한 절단 — 전체 행 수는 유지하고 truncated", () => {
    const result = classifySegmentAudience([lead("active@x.com")], classify, { totalRows: 7_000, truncated: true })
    expect(result.totalRows).toBe(7_000)
    expect(result.evaluatedRows).toBe(1)
    expect(result.truncated).toBe(true)
  })

  it("발송 가능이 1회 상한을 넘으면 overCap", () => {
    const many = Array.from({ length: SEGMENT_SEND_MAX_PER_RUN + 1 }, (_, index) => lead(`u${index}@x.com`))
    const result = classifySegmentAudience(many, () => "subscriber_active", { totalRows: many.length, truncated: false })
    expect(result.email.eligible).toBe(SEGMENT_SEND_MAX_PER_RUN + 1)
    expect(result.email.overCap).toBe(true)
  })
})

function preview(partial: Partial<SegmentAudiencePreview> = {}): SegmentAudiencePreview {
  const base = classifySegmentAudience(
    [lead("active@x.com"), lead("gone@x.com"), lead(null, "01012345678"), lead(null, null)],
    classify,
    { totalRows: 4, truncated: false }
  )
  return {
    ...base,
    generatedAt: "2026-09-25T00:00:00.000Z",
    segment: { id: "11111111-1111-4111-8111-111111111111", name: "만료 60일", labels: ["만료 60일 이내"], archived: false },
    channels: { email: "resend", smsConfigured: false },
    sources: "ok",
    viewer: { canSend: true },
    ...partial,
  }
}

describe("summarizeSegmentAudience", () => {
  it("발송 가능 · 제외(0 인 사유는 뺀다) · 이메일 없음 · 문자 정책 문구", () => {
    const summary = summarizeSegmentAudience(preview())
    expect(summary.headline).toBe("이메일 발송 가능 1명")
    expect(summary.excluded).toBe("제외 1명(해지 1)")
    expect(summary.noEmail).toBe("이메일 없음 2명(전화만 1 · 연락처 없음 1)")
    expect(summary.unresolved).toBeNull()
    expect(summary.sms).toBe("문자 0명 — 문자 수신 동의 정책 결정 대기(전화 보유 1명)")
    expect(summary.notices.map((notice) => notice.message)).toEqual([
      "SOLAPI 미설정 — 문자·알림톡은 시뮬레이션으로만 기록됩니다.",
    ])
  })

  it("동의 조회 실패·절단·원천 미완성·공급자 없음을 안내한다", () => {
    const summary = summarizeSegmentAudience(
      preview({
        consent: "unavailable",
        truncated: true,
        totalRows: 6_000,
        evaluatedRows: 5_000,
        sources: "incomplete",
        channels: { email: "none", smsConfigured: true },
      })
    )
    const messages = summary.notices.map((notice) => notice.message).join("\n")
    expect(summary.notices[0].tone).toBe("danger")
    expect(messages).toContain("수신 동의 목록을 읽지 못해")
    expect(messages).toContain("대상이 6,000명이라 앞 5,000명만 계산했습니다")
    expect(messages).toContain("일부 원천")
    expect(messages).toContain("이메일 발송 공급자가 설정되지 않았습니다")
    expect(messages).not.toContain("SOLAPI 미설정")
  })

  it("원천별 행 수 문구 — 0 은 뺀다", () => {
    expect(describeAudienceByKind(preview())).toBe("리드 4")
  })
})

describe("segmentHandoffBlockReason", () => {
  it("저장 세그먼트 · 발송 권한 · 동의 조회 성공 · 상한 안이면 넘길 수 있다", () => {
    expect(segmentHandoffBlockReason(preview())).toBeNull()
  })

  it("저장 전 · 보관 · 권한 없음 · 동의 조회 실패 · 절단이면 사유를 준다", () => {
    const base = preview()
    expect(segmentHandoffBlockReason({ ...base, segment: { ...base.segment, id: null } })).toBe(SEGMENT_HANDOFF_UNSAVED_REASON)
    expect(segmentHandoffBlockReason({ ...base, segment: { ...base.segment, archived: true } })).toContain("보관된")
    expect(segmentHandoffBlockReason({ ...base, viewer: { canSend: false } })).toContain("SUPER_ADMIN·ADMIN")
    expect(segmentHandoffBlockReason({ ...base, consent: "unavailable" })).toContain("수신 동의 목록")
    expect(segmentHandoffBlockReason({ ...base, truncated: true })).toContain("5,000명")
  })
})
