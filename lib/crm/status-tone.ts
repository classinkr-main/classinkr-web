/**
 * 어드민 운영 상태 스케일(DESIGN.md "운영 상태 스케일") SSOT.
 *
 * 색 리터럴은 Account360Lens.tsx가 쓰던 값을 정본으로 옮긴 것이다. CRM 화면의 상태 표시
 * (배너·토스트·인라인 캡션·뱃지)는 여기 토큰만 쓰고 `#B85C33` 같은 별도 리터럴을 새로 만들지
 * 않는다. 신호색은 상태 의미가 있을 때만 쓰고(장식·카테고리 구분 금지), 채움 버튼의 포화색은
 * Classin Green(주요)과 Danger(파괴적 확인)만 허용한다.
 *
 * 사용:
 *   // Tailwind 클래스 문자열(정적 스캔 가능) — 배경 틴트·텍스트·보더 색 3종
 *   <div className={`rounded-xl border px-3 py-2 ${STATUS_TONE_CLASS.danger}`}>…</div>
 *   // 인라인 style 이나 SVG 색이 필요할 때
 *   <span style={{ color: STATUS_TONE.warning.textStrong }}>…</span>
 *
 * `ok` 는 DESIGN.md 의 Success·Info 행 — 성공과 참고 안내가 같은 녹색 계열을 공유한다.
 */

export type StatusTone = "danger" | "warning" | "ok"

export interface StatusToneColors {
  /** 기본 텍스트 색. 틴트 배경 위 본문·라벨. */
  text: string
  /** 강조 텍스트 색(제목·굵은 수치). `ok` 는 기본색과 같다. */
  textStrong: string
  /** 배경 틴트. */
  bg: string
  /** 보더 색. 1px solid 로만 쓴다. */
  border: string
}

export const STATUS_TONE: Record<StatusTone, StatusToneColors> = {
  danger: { text: "#B43E3E", textStrong: "#8F2C2C", bg: "#FCE9E9", border: "#F2B8B8" },
  warning: { text: "#A8741A", textStrong: "#7A520F", bg: "#FBF1E0", border: "#ECD29C" },
  ok: { text: "#084734", textStrong: "#084734", bg: "#ECFDF5", border: "#BDEFD8" },
}

/**
 * `text-[…] bg-[…] border-[…]` 3종을 묶은 Tailwind 클래스 문자열.
 * 보더 두께(`border`)와 여백은 소비처가 붙인다 — 여기서는 색만 정한다.
 * 문자열을 템플릿으로 조립하지 않고 리터럴로 두어 Tailwind 정적 스캔이 그대로 잡게 한다.
 */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  danger: "text-[#B43E3E] bg-[#FCE9E9] border-[#F2B8B8]",
  warning: "text-[#A8741A] bg-[#FBF1E0] border-[#ECD29C]",
  ok: "text-[#084734] bg-[#ECFDF5] border-[#BDEFD8]",
}

/** 텍스트 색만 필요한 자리(인라인 캡션·작은 라벨)용. */
export const STATUS_TONE_TEXT_CLASS: Record<StatusTone, string> = {
  danger: "text-[#B43E3E]",
  warning: "text-[#A8741A]",
  ok: "text-[#084734]",
}

/** 강조 텍스트 색(제목·굵은 수치)용. */
export const STATUS_TONE_TEXT_STRONG_CLASS: Record<StatusTone, string> = {
  danger: "text-[#8F2C2C]",
  warning: "text-[#7A520F]",
  ok: "text-[#084734]",
}

/** 보더 색만 필요한 자리(흰 배경 버튼 등)용. */
export const STATUS_TONE_BORDER_CLASS: Record<StatusTone, string> = {
  danger: "border-[#F2B8B8]",
  warning: "border-[#ECD29C]",
  ok: "border-[#BDEFD8]",
}
