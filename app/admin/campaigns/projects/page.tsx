import { redirect } from "next/navigation"

import { MANAGE_PROJECTS_HREF } from "@/lib/marketing/manage-view"

// 마케팅 프로젝트는 2026-10 캠페인 관리와 한 화면이 됐다 — 이 주소는 북마크·외부 링크 보호용으로
// 남겨 두고 캠페인 관리의 프로젝트 탭으로 넘긴다.
export default function AdminCampaignProjectsPage() {
  redirect(MANAGE_PROJECTS_HREF)
}
