// 확도 신호 색 토큰 SSOT — DESIGN.md "확도 신호 토큰 (Confidence scale)" 절과 1:1.
// REV 3단 확도(확정/고확도/예정)의 색·라벨·틴트 메타는 이 맵이 유일한 정본이다.
// 소비처(SalesLedgerWorkbench·SalesLedgerCharts·ledger/*)는 여기서 import만 하고
// 확도 맥락에서 색 리터럴(#084734·#1E5DA8·#A8741A)을 재정의하지 않는다.
//
// 고확도 파랑 #1E5DA8은 냉색 금지 원칙(DESIGN.md §7-2)의 유일한 예외 토큰 —
// 2026-07-10 운영자 결정으로 '확도 신호 전용'으로 공식화됐다(교체 아님).
// 비확도 맥락(파이프라인 stage·캠페인 태그·KPI 실적 등)에서 파랑 차용은 여전히 팔레트 위반.
//
// Tailwind 클래스 필드는 정적 추출을 위해 반드시 완성된 리터럴 문자열로 둔다(문자열 조립 금지).

/** ledger/shared.tsx의 DraftConfidence와 동일한 유니온 — 구조적으로 호환된다. */
export type ConfidenceKey = "expected" | "high-confidence" | "confirmed"

export interface ConfidenceToken {
  key: ConfidenceKey
  /** 확도 버킷의 정식 라벨 — 표면 간 라벨 드리프트 방지용 단일 어휘. */
  label: string
  /** 기본 신호색(hex) — 차트 fill/stroke, inline style, SVG에 사용. */
  color: string
  /** 저대비 밀도 표(소형 숫자)용 강조 변형(hex). 예정만 Warning 강조 #7A520F를 쓴다. */
  strongColor: string
  /** 글자색 유틸 — color와 동일 값. */
  textClass: string
  /** strongColor의 글자색 유틸. */
  textStrongClass: string
  /** 채움 유틸 — 스택 바/도트 등 solid fill. */
  bgClass: string
  /** 틴트 배경(hex) — 뱃지·칩 배경 메타. */
  tintBg: string
  /** 틴트 보더(hex) — 뱃지·칩 보더 메타. */
  tintBorder: string
  /** 틴트 칩(보더+배경+글자) 완성 클래스 — 확도 잔여 칩 등 뱃지 소비용. */
  chipClass: string
}

export const CONFIDENCE_TOKENS: Record<ConfidenceKey, ConfidenceToken> = {
  confirmed: {
    key: "confirmed",
    label: "확정",
    color: "#084734", // Classin Green — Success·Info 상태 축과 동일
    strongColor: "#084734",
    textClass: "text-[#084734]",
    textStrongClass: "text-[#084734]",
    bgClass: "bg-[#084734]",
    tintBg: "#ECFDF5",
    tintBorder: "#BDEFD8",
    chipClass: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
  },
  "high-confidence": {
    key: "high-confidence",
    label: "고확도",
    color: "#1E5DA8", // 확도 신호 전용 예외 파랑 — 이 맥락 밖 사용 금지
    strongColor: "#1E5DA8",
    textClass: "text-[#1E5DA8]",
    textStrongClass: "text-[#1E5DA8]",
    bgClass: "bg-[#1E5DA8]",
    // 틴트는 기존 '예정/고확도 남음' 검수 칩의 값을 그대로 승계(예외 토큰 전용 틴트).
    tintBg: "#EFF6FF",
    tintBorder: "#BFDBFE",
    chipClass: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1E5DA8]",
  },
  expected: {
    key: "expected",
    label: "예정",
    color: "#A8741A", // Warning 상태 축과 동일
    strongColor: "#7A520F", // Warning 강조 — 밀도 표의 소형 숫자용
    textClass: "text-[#A8741A]",
    textStrongClass: "text-[#7A520F]",
    bgClass: "bg-[#A8741A]",
    tintBg: "#FBF1E0",
    tintBorder: "#ECD29C",
    chipClass: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  },
}
