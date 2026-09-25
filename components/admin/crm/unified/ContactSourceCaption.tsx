// 통합 고객 목록 위 원천 상태 캡션 — Compass·Home 연락 세부가 끊겼을 때 "없음"과 구분해 알린다.
//
// 외부 원천(Compass) 실패는 0 이 아니라 "연결 끊김"이다(공통 규약). 저장소는 Compass 를 두 번 따로 읽는다.
//  - 활동(meta.compass): 마지막 연락 계산용. down 이면 마지막 연락은 Home 기록만.
//  - 리드 참조(meta.compassRefs): 행의 "Compass에서 열기" 링크용. down 이면 모든 행에서 링크가 빠진다 —
//    활동이 ok 여도 참조만 끊길 수 있어(청크 하나만 실패해도 전체 null) 따로 알려야 "Compass 매칭 없음"과
//    구분된다(2026-09-25 리뷰 P2).
// 둘 다 스냅샷 완성 판정 밖의 보조 원천이라 경고 배너가 아닌 한 줄 캡션(role=status)으로만 알린다.
// 여러 사정이 겹치면 줄을 나눠 전부 보인다 — 하나가 다른 하나를 가리지 않는다.

import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { CrmUnifiedCustomersClientMeta } from "./shared"

export const CAPTION_COMPASS_ACTIVITY_DOWN = "Compass 연결 끊김 — 마지막 연락은 Home 기록만 반영"
export const CAPTION_COMPASS_REFS_DOWN = "Compass 연결 끊김 — Compass 링크를 표시하지 못함"
export const CAPTION_COMPASS_BOTH_DOWN = "Compass 연결 끊김 — 마지막 연락은 Home 기록만 반영, Compass 링크를 표시하지 못함"
export const CAPTION_COMPASS_PARTIAL =
  "Compass 활동 일부만 반영(조회 상한) — 마지막 연락이 실제보다 오래돼 보일 수 있습니다"
export const CAPTION_HOME_CONTACT_DETAIL_DOWN = "연락 기록 세부를 불러오지 못해 마지막 연락은 시각만 표시"

/** 메타 → 캡션 줄(순수). 모르거나(메타·필드 없음) 정상이면 빈 배열. */
export function contactSourceCaptionLines(meta: Partial<CrmUnifiedCustomersClientMeta> | null | undefined): string[] {
  if (!meta) return []
  const lines: string[] = []
  const activityDown = meta.compass === "down"
  const refsDown = meta.compassRefs === "down"
  if (activityDown && refsDown) lines.push(CAPTION_COMPASS_BOTH_DOWN)
  else if (activityDown) lines.push(CAPTION_COMPASS_ACTIVITY_DOWN)
  else if (refsDown) lines.push(CAPTION_COMPASS_REFS_DOWN)
  if (meta.compass === "partial") lines.push(CAPTION_COMPASS_PARTIAL)
  if (meta.homeContactDetail === "down") lines.push(CAPTION_HOME_CONTACT_DETAIL_DOWN)
  return lines
}

export default function ContactSourceCaption({
  meta,
  className = "",
}: {
  meta: Partial<CrmUnifiedCustomersClientMeta> | null | undefined
  className?: string
}) {
  const lines = contactSourceCaptionLines(meta)
  if (lines.length === 0) return null
  return (
    <p
      className={`text-[11px] font-semibold ${STATUS_TONE_TEXT_CLASS.warning} ${className}`}
      role="status"
      data-testid="unified-contact-source-caption"
    >
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </p>
  )
}
