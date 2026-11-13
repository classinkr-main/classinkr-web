// 사이드바 접힘 묶음(범주별)의 펼침 규칙 — AdminSidebar 가 쓰는 순수 함수.
//
// 보이는 상태 = 저장 목록(admin_sidebar_fold_open) ∪ 현재 화면이 든 묶음(강제 열림).
// 강제 열림 묶음을 접으면 이 화면에서만 접는다(closedActive). 저장 목록을 뒤집으면 화면은 그대로인데
// 다른 화면으로 가서 그 묶음이 거꾸로 열린다(2026-11-12 점검 — 옛 "기타" 토글부터 있던 문제).
// 저장 목록은 마지막으로 누른 방향을 따른다 — 접기는 빼고, 펴기는 넣는다.

import type { AdminNavCategory } from "./admin-nav"

export interface ClosedActiveFold {
  pathname: string | null
  category: AdminNavCategory
}

export interface FoldState {
  open: ReadonlySet<AdminNavCategory>
  closedActive: ClosedActiveFold | null
}

/** 이 화면에서 사용자가 접은 강제 열림 묶음. 다른 화면으로 가면 다시 강제 열림 규칙을 따른다. */
export function closedActiveCategoryFor(state: FoldState, pathname: string | null): AdminNavCategory | null {
  return state.closedActive?.pathname === pathname ? state.closedActive.category : null
}

export function isFoldGroupExpanded(
  state: FoldState,
  category: AdminNavCategory,
  activeCategory: AdminNavCategory | null,
  pathname: string | null,
): boolean {
  if (state.open.has(category)) return true
  return category === activeCategory && category !== closedActiveCategoryFor(state, pathname)
}

/** 묶음 머리를 눌렀을 때의 다음 상태. expanded 는 누르기 전 화면에 보이던 상태다. */
export function toggleFoldGroup(
  state: FoldState,
  category: AdminNavCategory,
  activeCategory: AdminNavCategory | null,
  pathname: string | null,
): FoldState {
  const expanded = isFoldGroupExpanded(state, category, activeCategory, pathname)
  const open = new Set(state.open)
  if (expanded) open.delete(category)
  else open.add(category)
  const closedActive =
    category === activeCategory ? (expanded ? { pathname, category } : null) : state.closedActive
  return { open, closedActive }
}
