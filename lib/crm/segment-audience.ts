// 세그먼트 → 메시지 발송 1단계(대상 미리보기, 2026-09-25) — 계약 타입·상수·순수 분류/문구 함수.
//
// 순수 모듈이다(서버·클라이언트·테스트 공용, I/O 없음). 원천 조회·동의 인덱스 로드는
// lib/repositories/crm-segment-audience.ts(server-only)가 하고, 여기는 받은 값을 버킷으로 셀 뿐이다.
// 동의 분류 함수는 호출부가 넘긴다(classifyEmail) — 서버 전용 모듈(lib/messaging/marketing-consent.ts)을
// 런타임 import 하지 않아 클라이언트 번들에 들어가도 안전하다(타입만 가져온다).
//
// 규칙(2026-09-25 결정):
//  - 이메일 발송 가능 = 뉴스레터 구독 active 인 고유 주소만. 로그인 프로필 동의만 있는 사람은 제외(메일 속
//    수신거부 링크가 프로필 동의를 끄지 못한다). 해지가 모든 동의보다 우선. 동의 조회 실패 = 전원 거부(0명).
//  - 문자는 0명 — 공개 폼 동의 문구가 이메일 한정이라 문자 수신 동의 근거가 없다(정책 결정 대기). 전화 보유 수만 센다.
//  - 행마다 정확히 한 버킷 — 버킷 합계 = 분류한 행 수(evaluatedRows).
//  - 응답·화면에는 건수만 싣는다. 이메일·전화 원문·표본·행 키는 싣지 않는다.
//  - 세그먼트 모드 실발송은 열지 않는다 — 서버 email/send 가 400(segment_send_not_enabled), 화면은 CTA 비활성.

import { contactPhoneKey } from "@/lib/crm/last-contact"
import type { EmailConsentClass } from "@/lib/messaging/marketing-consent"

export type { EmailConsentClass }

/** 2단계(세그먼트 이메일 발송)의 1회 상한 — 문자 일괄 발송(/api/admin/sms/send)과 같은 값. */
export const SEGMENT_SEND_MAX_PER_RUN = 500
/** 미리보기가 분류하는 최대 행 수 — 통합 고객 CSV 상한(CRM_UNIFIED_EXPORT_MAX_ROWS)과 같다. */
export const SEGMENT_AUDIENCE_MAX_ROWS = 5_000

/** 서버 email/send 가 세그먼트 요청을 거절할 때의 코드(400). */
export const SEGMENT_SEND_NOT_ENABLED_CODE = "segment_send_not_enabled"
export const SEGMENT_SEND_NOT_ENABLED_MESSAGE = "고객 세그먼트 발송은 아직 열리지 않았습니다(미리보기만)."
/** 발송 센터 세그먼트 모드의 CTA 비활성 사유. */
export const SEGMENT_SEND_DISABLED_REASON = "세그먼트 실발송은 정책 결정 후 열립니다 — 지금은 대상 미리보기와 테스트 발송만"
/** 허브 발송 핸들러가 세그먼트 모드 발송을 거절할 때의 토스트. */
export const SEGMENT_SEND_PREVIEW_ONLY_TOAST = "세그먼트 발송은 미리보기만 가능합니다"
/** 저장 안 된 조건 — 메시지 탭으로 넘길 수 없다. */
export const SEGMENT_HANDOFF_UNSAVED_REASON = "저장하면 메시지 탭으로 넘길 수 있어요"
/** 발송 센터에서 CRM 세그먼트를 부르는 이름 — 허브의 localStorage '저장 세그먼트'(태그 묶음)와 구분한다. */
export const CRM_SEGMENT_AUDIENCE_LABEL = "고객 세그먼트(CRM)"

/** 저장 세그먼트 대상 미리보기 GET 주소. */
export function segmentAudiencePreviewUrl(segmentId: string): string {
  return `/api/admin/crm/segments/${encodeURIComponent(segmentId)}/audience-preview`
}
/** 저장 전 조건 대상 미리보기 POST 주소(본문 { params }). */
export const CUSTOMERS_AUDIENCE_PREVIEW_URL = "/api/admin/crm/customers/audience-preview"
/** 세그먼트 허브에서 그 세그먼트를 여는 주소. */
export function segmentHubHref(segmentId: string): string {
  return `/admin/crm/customers/segments?id=${encodeURIComponent(segmentId)}`
}

export type SegmentAudienceKind = "lead" | "neo_account" | "customer"
export const SEGMENT_AUDIENCE_KINDS: readonly SegmentAudienceKind[] = ["lead", "neo_account", "customer"]

/** 분류 입력 한 행 — 원천 테이블에서 id 로 다시 읽은 연락처(통합 행의 contact 는 전화·이메일을 합친 값이라 못 쓴다). */
export interface SegmentAudienceContact {
  /** null = 행 키를 해석하지 못함 */
  kind: SegmentAudienceKind | null
  email: string | null
  phone: string | null
  /** 원천 조회 실패·원천 행 없음 — 채널을 판정할 수 없다 */
  unresolved?: boolean
}

export interface SegmentAudienceEmailRows {
  /** 구독 active 인 고유 주소(첫 등장 행) */
  eligible: number
  /** 해지(구독 행 중 active 아님이 하나라도) */
  unsubscribed: number
  /** 동의 근거 없음 */
  noConsent: number
  /** 로그인 프로필 동의만 — 이번 라운드 제외 */
  profileOnly: number
  /** 동의 목록을 읽지 못해 판정 못 함(= 거부로 취급) */
  consentUnknown: number
  /** 앞 행과 같은 주소(대소문자 무시) */
  duplicate: number
  /** 이메일 칸은 있으나 형식이 틀림 */
  invalidEmail: number
  /** 이메일 없음 · 전화만 */
  noEmailPhoneOnly: number
  /** 이메일·전화 둘 다 없음 */
  noContact: number
  /** 원천 조회 실패·행 키 해석 실패 */
  unresolved: number
}

export interface SegmentAudienceClassification {
  /** 세그먼트 전체 행 수(상한 밖 포함) */
  totalRows: number
  /** 실제로 분류한 행 수 — 버킷 합계와 같다 */
  evaluatedRows: number
  /** totalRows > 분류 상한 — 전체를 계산하지 못했다(넘김 불가) */
  truncated: boolean
  email: {
    /** 고유 주소 수 — 구독 active 만 */
    eligible: number
    rows: SegmentAudienceEmailRows
    /** eligible > SEGMENT_SEND_MAX_PER_RUN */
    overCap: boolean
    maxPerRun: number
  }
  sms: {
    eligible: 0
    /** 전화 보유 고유 번호 수(정규화 키) */
    withPhone: number
    blockedReason: "sms_consent_policy_pending"
  }
  byKind: Record<SegmentAudienceKind, { rows: number; emailEligible: number }>
  /** unavailable 이면 email.eligible = 0(미확인 = 거부) */
  consent: "ok" | "unavailable"
}

/**
 * GET /api/admin/crm/segments/[id]/audience-preview · POST /api/admin/crm/customers/audience-preview 응답.
 * 건수만 담는다(연락처 원문·표본·행 키 없음).
 */
export interface SegmentAudiencePreview extends SegmentAudienceClassification {
  generatedAt: string
  segment: {
    /** 저장 세그먼트 id — 저장 전 조건이면 null */
    id: string | null
    name: string | null
    /** 조건 문구(캡션용) */
    labels: string[]
    archived: boolean
  }
  /** 발송 채널 준비 — /api/admin/messaging/status 와 같은 판정 */
  channels: { email: "resend" | "webhook" | "none"; smsConfigured: boolean }
  /** 모집단 스냅샷 원천 상태 — incomplete 면 건수가 실제보다 작을 수 있다, unknown 은 판정 정보 없음 */
  sources: "ok" | "incomplete" | "unknown"
  /** 조회자 — 메시지 탭 넘김은 발송 권한(SUPER_ADMIN·ADMIN)이 있을 때만 */
  viewer: { canSend: boolean }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 발송 비교용 이메일 정규화 — 앞뒤 공백 제거 · 소문자 · 형식 검사. 비었거나 형식이 틀리면 null. */
export function normalizeAudienceEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim().toLowerCase()
  if (!value || !EMAIL_PATTERN.test(value)) return null
  return value
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0
}

function emptyRows(): SegmentAudienceEmailRows {
  return {
    eligible: 0,
    unsubscribed: 0,
    noConsent: 0,
    profileOnly: 0,
    consentUnknown: 0,
    duplicate: 0,
    invalidEmail: 0,
    noEmailPhoneOnly: 0,
    noContact: 0,
    unresolved: 0,
  }
}

/**
 * 행별 단일 버킷 분류. classifyEmail 이 null 이면 동의 목록을 못 읽은 것이다(consent: "unavailable" — 발송 가능 0).
 * 같은 주소는 처음 나온 행만 동의 버킷에 넣고 나머지는 duplicate — 분류는 주소로만 정해지므로 행 순서와
 * 무관하게 버킷 합계가 같다.
 */
export function classifySegmentAudience(
  contacts: readonly SegmentAudienceContact[],
  classifyEmail: ((normalizedEmail: string) => EmailConsentClass) | null,
  options: { totalRows: number; truncated: boolean }
): SegmentAudienceClassification {
  const rows = emptyRows()
  const byKind: SegmentAudienceClassification["byKind"] = {
    lead: { rows: 0, emailEligible: 0 },
    neo_account: { rows: 0, emailEligible: 0 },
    customer: { rows: 0, emailEligible: 0 },
  }
  const seenEmails = new Set<string>()
  const phoneKeys = new Set<string>()

  for (const contact of contacts) {
    if (contact.kind) byKind[contact.kind].rows += 1
    if (!contact.kind || contact.unresolved) {
      rows.unresolved += 1
      continue
    }

    const phoneKey = contactPhoneKey(contact.phone)
    if (phoneKey) phoneKeys.add(phoneKey)

    if (hasText(contact.email)) {
      const email = normalizeAudienceEmail(contact.email)
      if (!email) {
        rows.invalidEmail += 1
        continue
      }
      if (seenEmails.has(email)) {
        rows.duplicate += 1
        continue
      }
      seenEmails.add(email)
      if (!classifyEmail) {
        rows.consentUnknown += 1
        continue
      }
      const verdict = classifyEmail(email)
      if (verdict === "subscriber_active") {
        rows.eligible += 1
        byKind[contact.kind].emailEligible += 1
      } else if (verdict === "unsubscribed") rows.unsubscribed += 1
      else if (verdict === "profile_only") rows.profileOnly += 1
      else rows.noConsent += 1
      continue
    }

    // 전화 칸에 글자가 있어도 번호로 볼 수 없으면(9자리 미만) 연락처 없음으로 센다.
    if (phoneKey) rows.noEmailPhoneOnly += 1
    else rows.noContact += 1
  }

  const totalRows = Math.max(options.totalRows, contacts.length)
  return {
    totalRows,
    evaluatedRows: contacts.length,
    truncated: options.truncated || totalRows > contacts.length,
    email: {
      eligible: rows.eligible,
      rows,
      overCap: rows.eligible > SEGMENT_SEND_MAX_PER_RUN,
      maxPerRun: SEGMENT_SEND_MAX_PER_RUN,
    },
    sms: { eligible: 0, withPhone: phoneKeys.size, blockedReason: "sms_consent_policy_pending" },
    byKind,
    consent: classifyEmail ? "ok" : "unavailable",
  }
}

/** 버킷 합계 — 테스트·화면 검산용(= evaluatedRows). */
export function sumAudienceRows(rows: SegmentAudienceEmailRows): number {
  return Object.values(rows).reduce((sum, value) => sum + value, 0)
}

// ── 화면 문구(대화상자·발송 센터 카드 공용) ─────────────────────────────────────

function n(value: number) {
  return value.toLocaleString("ko-KR")
}

function joinParts(parts: Array<[string, number]>) {
  return parts
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${label} ${n(value)}`)
    .join(" · ")
}

export type SegmentAudienceTone = "danger" | "warning" | "info"

export interface SegmentAudienceSummary {
  /** "이메일 발송 가능 N명" */
  headline: string
  eligible: number
  /** "제외 M명(해지 a · 동의 없음 b · …)" — 0명이면 null */
  excluded: string | null
  /** "이메일 없음 K명(전화만 f · 연락처 없음 g)" — 0명이면 null */
  noEmail: string | null
  /** "판정 못 함 U명(원천 조회 실패)" — 0명이면 null */
  unresolved: string | null
  /** "문자 0명 — 문자 수신 동의 정책 결정 대기(전화 보유 P명)" */
  sms: string
  notices: Array<{ tone: SegmentAudienceTone; message: string }>
}

/** 미리보기 → 화면 문구. 0명을 오류처럼 보이지 않게 사유 먼저 — 숫자는 전부 건수. */
export function summarizeSegmentAudience(preview: SegmentAudiencePreview): SegmentAudienceSummary {
  const rows = preview.email.rows
  const excludedCount =
    rows.unsubscribed + rows.noConsent + rows.profileOnly + rows.consentUnknown + rows.duplicate + rows.invalidEmail
  const excludedParts = joinParts([
    ["해지", rows.unsubscribed],
    ["동의 없음", rows.noConsent],
    ["프로필 동의만", rows.profileOnly],
    ["동의 확인 불가", rows.consentUnknown],
    ["중복", rows.duplicate],
    ["형식 오류", rows.invalidEmail],
  ])
  const noEmailCount = rows.noEmailPhoneOnly + rows.noContact
  const noEmailParts = joinParts([
    ["전화만", rows.noEmailPhoneOnly],
    ["연락처 없음", rows.noContact],
  ])

  const notices: SegmentAudienceSummary["notices"] = []
  if (preview.consent === "unavailable") {
    notices.push({
      tone: "danger",
      message: "수신 동의 목록을 읽지 못해 발송 가능 인원을 0명으로 표시합니다(확인 못 한 동의는 거부로 봅니다).",
    })
  }
  if (preview.truncated) {
    notices.push({
      tone: "warning",
      message: `대상이 ${n(preview.totalRows)}명이라 앞 ${n(preview.evaluatedRows)}명만 계산했습니다 — 메시지 탭으로 넘기려면 조건을 좁혀 주세요.`,
    })
  }
  if (preview.sources === "incomplete") {
    notices.push({ tone: "warning", message: "일부 원천(리드·전환 고객·라벨)을 읽지 못해 건수가 실제보다 작을 수 있습니다." })
  }
  if (rows.unresolved > 0) {
    notices.push({ tone: "warning", message: `${n(rows.unresolved)}명은 연락처를 읽지 못해 판정하지 못했습니다(발송 가능에서 뺐습니다).` })
  }
  if (preview.email.overCap) {
    notices.push({
      tone: "warning",
      message: `발송 가능 ${n(preview.email.eligible)}명 — 세그먼트 발송은 한 번에 ${n(preview.email.maxPerRun)}명까지로 계획돼 있어 나눠 보내야 합니다.`,
    })
  }
  if (preview.channels.email === "none") {
    notices.push({ tone: "warning", message: "이메일 발송 공급자가 설정되지 않았습니다 — 테스트 발송도 실패합니다." })
  }
  if (!preview.channels.smsConfigured) {
    notices.push({ tone: "info", message: "SOLAPI 미설정 — 문자·알림톡은 시뮬레이션으로만 기록됩니다." })
  }

  return {
    headline: `이메일 발송 가능 ${n(preview.email.eligible)}명`,
    eligible: preview.email.eligible,
    excluded: excludedCount > 0 ? `제외 ${n(excludedCount)}명${excludedParts ? `(${excludedParts})` : ""}` : null,
    noEmail: noEmailCount > 0 ? `이메일 없음 ${n(noEmailCount)}명${noEmailParts ? `(${noEmailParts})` : ""}` : null,
    unresolved: rows.unresolved > 0 ? `판정 못 함 ${n(rows.unresolved)}명(원천 조회 실패)` : null,
    sms: `문자 0명 — 문자 수신 동의 정책 결정 대기(전화 보유 ${n(preview.sms.withPhone)}명)`,
    notices,
  }
}

/** 원천별 행 수 문구 — "리드 12 · NEO 계정 30 · 전환 고객 2". 0 은 뺀다. */
export function describeAudienceByKind(preview: Pick<SegmentAudiencePreview, "byKind">): string {
  return joinParts([
    ["리드", preview.byKind.lead.rows],
    ["NEO 계정", preview.byKind.neo_account.rows],
    ["전환 고객", preview.byKind.customer.rows],
  ])
}

/**
 * 메시지 탭으로 넘길 수 없는 사유 — 넘길 수 있으면 null. 넘김은 세그먼트 id 만 싣는 이동일 뿐 발송이 아니지만,
 * 발송 권한이 없거나 대상 계산이 불완전하면(동의 조회 실패·상한 초과) 넘기지 않는다.
 */
export function segmentHandoffBlockReason(
  preview: Pick<SegmentAudiencePreview, "segment" | "viewer" | "consent" | "truncated">
): string | null {
  if (!preview.segment.id) return SEGMENT_HANDOFF_UNSAVED_REASON
  if (preview.segment.archived) return "보관된 세그먼트입니다 — 복구한 뒤 넘기세요."
  if (!preview.viewer.canSend) return "메시지 탭으로 넘기기는 발송 권한(SUPER_ADMIN·ADMIN)이 있을 때만 할 수 있습니다."
  if (preview.consent !== "ok") return "수신 동의 목록을 읽지 못해 넘길 수 없습니다 — 잠시 후 다시 확인하세요."
  if (preview.truncated) return `대상이 ${n(SEGMENT_AUDIENCE_MAX_ROWS)}명을 넘어 전체를 계산하지 못했습니다 — 조건을 좁혀 주세요.`
  return null
}
