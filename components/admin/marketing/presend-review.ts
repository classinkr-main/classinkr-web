/**
 * presend-review.ts — 단체 발송 센터 우측 레일 "최종 확인"의 순수 함수(상태·I/O 없음, 테스트가 문구를 고정한다).
 *
 * - buildVariableCheck: 변수 치환 체크. 태그 모드는 MarketingHub.evaluateDraft 가 대상 구독자를 넘겨 빈 값 수까지
 *   세고, 고객 세그먼트(CRM) 모드는 recipients=null 로 불러 빈 값 수를 세지 않는다(미리보기는 건수만 — 표본이 없다).
 * - segmentModeSendReview: 고객 세그먼트(CRM) 모드(발송 1단계, 2026-09-25)에서 태그 대상 기준 체크를
 *   미리보기 기준으로 바꾼다. evaluateDraft 는 draft.targetTags 로 대상을 세므로 세그먼트 모드(targetTags=[])에선
 *   "전체 active 구독자 N명"·"수신거부 N명은 자동 제외"·"{org} 빈 값 N명"을 태그 대상 기준으로 내고, 준비도도
 *   "발송 가능"으로 판정해 레일 헤더("이메일 발송 가능 N명 · 발송 안 함")와 어긋났다.
 *   바꾸는 것: 대상(audience) · 수신거부(unsubscribe) · 변수 치환(variables) · 준비도(readiness → "미리보기 전용").
 *   그대로 두는 것: 제목 · 본문 · CTA · 중복 제목(초안만 보는 체크 — 테스트 발송에도 쓸모 있다).
 */

import type { EmailDraft, Subscriber } from "@/lib/marketing-types"
import {
  CRM_SEGMENT_AUDIENCE_LABEL,
  SEGMENT_SEND_DISABLED_REASON,
  summarizeSegmentAudience,
  type SegmentAudiencePreview,
} from "@/lib/crm/segment-audience"
import type { PreSendCheck, SegmentPreviewStatus, SendReadiness } from "./send-center-types"

/** 발송 백엔드(replacePlaceholders)가 실제로 치환하는 변수 — 그 밖의 {token} 은 글자 그대로 나간다. */
export const KNOWN_VARIABLE_KEYS = ["name", "org", "role"] as const

type KnownVariableKey = (typeof KNOWN_VARIABLE_KEYS)[number]

/**
 * 변수 치환 체크. recipients 가 배열이면 {org}/{role} 빈 값 수를 그 대상 기준으로 알린다(빈 값은 공백으로 발송).
 * recipients 가 null 이면(고객 세그먼트 모드) 빈 값 수를 세지 않는다고 적는다 — 태그 대상 수를 섞지 않는다.
 */
export function buildVariableCheck(
  draft: Pick<EmailDraft, "subject" | "body">,
  recipients: ReadonlyArray<Pick<Subscriber, "org" | "role">> | null
): PreSendCheck {
  const draftText = `${draft.subject} ${draft.body}`
  const tokenKeys = Array.from(draftText.matchAll(/\{([a-zA-Z_]+)\}/g)).map((m) => m[1])
  const usedKnown = KNOWN_VARIABLE_KEYS.filter((key) => tokenKeys.includes(key))
  const unknownTokens = Array.from(
    new Set(tokenKeys.filter((key) => !KNOWN_VARIABLE_KEYS.includes(key as KnownVariableKey)))
  )
  const hasAiBlock = /\{ai:/i.test(draftText)
  const emptyValueNotes: string[] = []
  if (recipients) {
    if (usedKnown.includes("org")) {
      const empties = recipients.filter((s) => !(s.org ?? "").trim()).length
      if (empties > 0) emptyValueNotes.push(`{org} 빈 값 ${empties}명`)
    }
    if (usedKnown.includes("role")) {
      const empties = recipients.filter((s) => !(s.role ?? "").trim()).length
      if (empties > 0) emptyValueNotes.push(`{role} 빈 값 ${empties}명`)
    }
  }
  return {
    key: "variables",
    label: "변수 치환",
    status: unknownTokens.length > 0 || hasAiBlock ? "warning" : usedKnown.length === 0 ? "info" : "ok",
    detail:
      unknownTokens.length > 0
        ? `치환되지 않는 변수 ${unknownTokens.map((t) => `{${t}}`).join(", ")} — 글자 그대로 발송됩니다.`
        : hasAiBlock
          ? "AI 블록({ai:})은 이 발송 경로에서 치환되지 않습니다."
          : usedKnown.length === 0
            ? "변수 미사용 — 모든 수신자에게 동일한 내용이 발송됩니다."
            : !recipients
              ? `사용한 변수 ${usedKnown.length}종 모두 치환 가능한 이름입니다 — 세그먼트 대상의 빈 값 수는 미리보기에서 세지 않습니다.`
              : emptyValueNotes.length > 0
                ? `변수 ${usedKnown.length}종 치환 가능 · ${emptyValueNotes.join(" · ")} — 빈 값은 공백으로 발송됩니다.`
                : `사용한 변수 ${usedKnown.length}종 모두 치환 가능합니다.`,
  }
}

/** 세그먼트 모드 준비도 — 실발송을 열지 않으므로 "발송 가능/발송 불가" 판정 대신 미리보기 전용으로 덮는다. */
export const SEGMENT_PREVIEW_ONLY_READINESS: SendReadiness = {
  status: "warning",
  label: "미리보기 전용",
  detail: SEGMENT_SEND_DISABLED_REASON,
}

function n(value: number) {
  return value.toLocaleString("ko-KR")
}

/** 세그먼트 모드 "대상" 체크 — 미리보기(건수만) 기준. 로드 중·실패는 0 과 구분한다. */
function segmentAudienceCheck(preview: SegmentAudiencePreview | null, status: SegmentPreviewStatus): PreSendCheck {
  const base = { key: "audience", label: "대상" }
  if (!preview) {
    return status === "error"
      ? {
          ...base,
          status: "warning",
          detail: `${CRM_SEGMENT_AUDIENCE_LABEL} 대상을 불러오지 못했습니다 — 받는 사람 카드에서 다시 계산하세요.`,
        }
      : { ...base, status: "info", detail: `${CRM_SEGMENT_AUDIENCE_LABEL} 대상과 수신 동의를 확인하는 중입니다.` }
  }
  const eligible = preview.email.eligible
  const head = `${CRM_SEGMENT_AUDIENCE_LABEL} · 이메일 발송 가능 ${n(eligible)}명(대상 ${n(preview.totalRows)}명) · 발송 안 함`
  if (preview.consent !== "ok") {
    return { ...base, status: "warning", detail: `${head} — 수신 동의 목록을 읽지 못해 0명으로 봅니다.` }
  }
  if (preview.truncated) {
    return { ...base, status: "warning", detail: `${head} — 앞 ${n(preview.evaluatedRows)}명만 계산했습니다.` }
  }
  if (eligible === 0) {
    return { ...base, status: "warning", detail: `${head} — 받는 사람 카드에서 제외 사유를 확인하세요.` }
  }
  return { ...base, status: "ok", detail: head }
}

/** 세그먼트 모드 "수신거부" 체크 — 해지·미동의 등은 발송 가능 수에서 이미 뺐다. 미리보기가 없으면 체크를 뺀다. */
function segmentUnsubscribeCheck(preview: SegmentAudiencePreview): PreSendCheck {
  const excluded = summarizeSegmentAudience(preview).excluded
  return {
    key: "unsubscribe",
    label: "수신거부",
    status: excluded ? "info" : "ok",
    detail: excluded
      ? `${excluded} — 발송 가능 수에서 이미 뺐습니다(구독 중인 주소만 셉니다).`
      : "해지·미동의로 뺄 주소가 없습니다 — 구독 중인 주소만 셉니다.",
  }
}

export interface SegmentModeSendReviewInput {
  /** MarketingHub.evaluateDraft 의 체크(태그 대상 기준) */
  checks: readonly PreSendCheck[]
  draft: Pick<EmailDraft, "subject" | "body">
  /** SegmentAudienceCard 미리보기 — 로드 중·실패면 null */
  preview: SegmentAudiencePreview | null
  status: SegmentPreviewStatus
}

/**
 * 세그먼트 모드 최종 확인 — 태그 대상 기준 항목(대상·수신거부·변수 빈 값)을 미리보기 기준으로 바꾸고,
 * 준비도는 "미리보기 전용"으로 덮는다. 체크 순서는 원래 순서를 지킨다.
 */
export function segmentModeSendReview({
  checks,
  draft,
  preview,
  status,
}: SegmentModeSendReviewInput): { checks: PreSendCheck[]; readiness: SendReadiness } {
  const next: PreSendCheck[] = []
  for (const check of checks) {
    if (check.key === "audience") next.push(segmentAudienceCheck(preview, status))
    else if (check.key === "unsubscribe") {
      if (preview) next.push(segmentUnsubscribeCheck(preview))
    } else if (check.key === "variables") next.push(buildVariableCheck(draft, null))
    else next.push(check)
  }
  return { checks: next, readiness: SEGMENT_PREVIEW_ONLY_READINESS }
}
