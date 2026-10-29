// 총판 정산 화면 공용(견적 상세 섹션 · 총판 미수금 탭).

export const DISTRIBUTOR_SETTLEMENT_API = (quoteId: string) => `/api/admin/quotes/${quoteId}/distributor-settlement`
export const DISTRIBUTOR_RECEIVABLES_API = "/api/admin/distributor-receivables"
export const DISTRIBUTOR_PRICE_TEMPLATES_API = "/api/admin/distributor-price-templates"

export const GHOST_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12.5px] font-semibold text-[#31302E] transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
export const SOLID_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-60"
export const INPUT =
  "h-9 w-full rounded-md border border-[#e8e8e4] bg-white px-2.5 text-[13px] text-[#111110] outline-none focus:border-[#084734]"
export const LABEL = "mb-1 block text-[11.5px] font-semibold text-[#78736D]"

export function formatWon(value: number | null | undefined) {
  if (value == null) return "—"
  return `${value.toLocaleString("ko-KR")}원`
}

export function formatDateLabel(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric", year: "numeric" })
}

/** 브라우저 현지(운영 = KST) 날짜 YYYY-MM-DD. */
export function todayValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/** 숫자 입력 문자열 → 원 단위 정수(쉼표 허용). 비었으면 null. */
export function parseWonInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return null
  return Number(digits)
}
