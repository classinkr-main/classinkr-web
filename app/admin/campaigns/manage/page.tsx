import type { Metadata } from "next"

import CampaignManageClient from "@/components/admin/campaigns/manage/CampaignManageClient"
import { parseManageView } from "@/lib/marketing/manage-view"

// 캠페인 관리(D1-5) — 얇은 서버 페이지. 인증 게이트는 형제 어드민 페이지와 동일하게
// AdminLayout(app/admin/layout.tsx)이 담당한다(비인증 → /admin/login 리다이렉트).
// 데이터 조회·CRUD 는 클라이언트에서 verifyAdmin API(/api/admin/marketing-campaigns ·
// /api/admin/marketing-projects)로 수행.
// 2026-10 캠페인·프로젝트 통합 — ?view=projects 면 프로젝트 탭으로 연다(예전 프로젝트 주소가 여기로 온다).
export const metadata: Metadata = {
  title: "캠페인 관리 | Classin Admin",
  robots: { index: false, follow: false },
}

export default async function AdminCampaignManagePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { view } = await searchParams
  return <CampaignManageClient initialView={parseManageView(view)} />
}
