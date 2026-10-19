/**
 * send-center-types.ts — 단체 발송 센터(캠페인 메시지 탭) UI 조각들이 공유하는 타입.
 *
 * MarketingHub가 만들던 발송 전 체크(PreSendCheck)를 헤더/레일/카드 조각들이
 * 나눠 쓰게 되면서, 허브 로컬 타입을 여기로 승격했다. 발송 로직·API 계약 타입은
 * lib/(marketing-types|messaging-client-types)가 소유하고, 이 파일은 UI 표시용만 담는다.
 */

export type PreSendCheckStatus = "ok" | "warning" | "error" | "info"

export interface PreSendCheck {
  key: string
  label: string
  detail: string
  status: PreSendCheckStatus
}

export interface SendReadiness {
  status: "ok" | "warning" | "error"
  label: string
  detail: string
}

/**
 * 변수 블록 트레이 카드 1장 — 시안 1a의 "변수명 + 소스 필드 + 예시값" 구조.
 * example은 가능하면 실제 대상 표본(첫 수신자)의 값, 없으면 정적 예시로 채운다.
 * emptyCount는 현재 대상 중 해당 필드가 빈 수신자 수 — 빈 값은 백엔드에서
 * 공백("")으로 치환되므로 정직하게 미리 알려준다.
 */
export interface VariableBlockDef {
  token: string
  label: string
  source: string
  example: string
  emptyCount?: number
}

/**
 * 받는 사람 모드 — 태그 필터 · 직접 입력 · 고객 세그먼트(CRM, 발송 1단계).
 * segment 는 CRM 세그먼트 허브에서 넘겨받았을 때(?segment=<uuid>)만 나타나고, 대상 미리보기와 테스트 발송만 된다 —
 * 캠페인 실발송 CTA 는 비활성이고 서버 email/send 도 세그먼트 요청을 400 으로 거절한다.
 */
export type AudienceMode = "tags" | "direct" | "segment"

/**
 * 고객 세그먼트(CRM) 대상 미리보기 상태 — SegmentAudienceCard 가 발송 센터에 알린다.
 * 로드 중과 실패를 구분해 최종 확인 레일이 "0명"과 "모름"을 섞지 않게 한다(presend-review.ts).
 */
export type SegmentPreviewStatus = "loading" | "ready" | "error"
