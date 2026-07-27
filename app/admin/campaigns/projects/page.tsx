import type { Metadata } from "next"

import ProjectsClient from "@/components/admin/campaigns/projects/ProjectsClient"

// 마케팅 프로젝트(D3-3) — 얇은 서버 페이지. 인증 게이트는 형제 어드민 페이지와 동일하게
// AdminLayout(app/admin/layout.tsx)이 담당한다(비인증 → /admin/login 리다이렉트).
// 데이터 조회·CRUD 는 클라이언트에서 verifyAdmin API(/api/admin/marketing-projects)로 수행.
export const metadata: Metadata = {
  title: "마케팅 프로젝트 | Classin Admin",
  robots: { index: false, follow: false },
}

export default function AdminMarketingProjectsPage() {
  return <ProjectsClient />
}
