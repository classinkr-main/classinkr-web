// 장부 머리줄의 렌즈 탭과 장부 안 보기(2026-11-23, 기획 L7·L8) — 순수 함수만.
//
// 탭 줄은 [DSH | 장부] 순서지만 메뉴로 들어오면 장부가 먼저 열린다(기본 렌즈는 ledger 그대로).
// 보드·콕핏은 전체 사이드바 계정에게만 보인다. 숨김은 탭 줄에서만이다 — ?lens= 주소로는 누구에게나 열리고,
// 그때는 현재 위치가 탭 줄에서 사라지지 않게 그 탭을 줄에 남긴다(견적·문서 탭, CRM 탭 줄과 같은 규칙).

export type LensTabId = "dsh" | "ledger" | "board" | "cockpit"

/** 탭 줄 순서. REV(주차 검수)는 탭이 아니라 장부 탭 안의 보기다. */
export const LENS_TAB_ORDER: readonly LensTabId[] = ["dsh", "ledger", "board", "cockpit"]

/** 전체 사이드바 계정에게만 탭으로 보이는 렌즈. */
export const FULL_NAV_ONLY_LENSES: ReadonlySet<LensTabId> = new Set<LensTabId>(["board", "cockpit"])

/** 렌즈 값 → 탭 줄에서 선택돼 보일 탭(rev 는 장부 탭). */
export function lensTabOf(lens: string): LensTabId {
  return lens === "dsh" || lens === "board" || lens === "cockpit" ? lens : "ledger"
}

export function visibleLensTabIds({ fullNav, activeLens }: { fullNav: boolean; activeLens: string }): LensTabId[] {
  const active = lensTabOf(activeLens)
  return LENS_TAB_ORDER.filter((id) => fullNav || !FULL_NAV_ONLY_LENSES.has(id) || id === active)
}

/** 장부 탭 안 보기 — 건별(시트, 기본) · 기관별(고객 합산) · 매니저별(담당자 합계). 둘은 조회용이다. */
export type LedgerTableView = "deals" | "accounts" | "managers"

export const LEDGER_TABLE_VIEWS: Array<{ id: LedgerTableView; label: string; description: string }> = [
  { id: "deals", label: "건별", description: "시트처럼 건별 한 줄 · 주차 칸 — 칸에 숫자를 치고 Enter" },
  { id: "accounts", label: "기관별", description: "고객 한 줄로 합산 · 월 칸(예전 월 요약)" },
  { id: "managers", label: "매니저별", description: "담당자별 목표·확정·고확도·예정 합계" },
]

/** URL `view` → 보기. 생략·모르는 값은 건별. */
export function ledgerTableViewFromParam(value: string | null): LedgerTableView {
  return value === "accounts" || value === "managers" ? value : "deals"
}
