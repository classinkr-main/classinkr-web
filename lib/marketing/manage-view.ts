// lib/marketing/manage-view.ts
// 캠페인 관리 화면(/admin/campaigns/manage)의 탭 — 캠페인 · 프로젝트(2026-10 통합).
// 서버 페이지(searchParams 해석)와 클라이언트(탭 전환 시 URL 동기화)가 함께 쓰는 순수 모듈이다.
// 예전 마케팅 프로젝트 주소(/admin/campaigns/projects)는 MANAGE_PROJECTS_HREF 로 넘긴다.

export type ManageView = "campaigns" | "projects"

export const MANAGE_BASE_HREF = "/admin/campaigns/manage"
export const MANAGE_PROJECTS_HREF = `${MANAGE_BASE_HREF}?view=projects`

/** ?view= 값 → 탭. 모르는 값·배열·없음은 기본 탭(캠페인)으로 본다. */
export function parseManageView(value: unknown): ManageView {
  return value === "projects" ? "projects" : "campaigns"
}

/** 탭 → 주소의 search 부분. 기본 탭은 파라미터 없이 깨끗한 주소를 쓴다. */
export function manageViewSearch(view: ManageView): string {
  return view === "projects" ? "?view=projects" : ""
}
