import type { ReactNode } from "react"

import AdminShell from "@/components/admin/AdminShell"
import { resolveAdminShellSession } from "@/lib/admin-auth"

// 어드민 셸 세션을 서버에서 확정해 내려보낸다.
//
// 이전에는 이 레이아웃이 클라이언트 컴포넌트라, 이미 프록시(proxy.ts)가 검증해 통과시킨
// 요청인데도 브라우저가 마운트 후 getUser() + admin_profiles를 다시 왕복했다. 그 사이
// 사이드바는 스켈레톤이었다. 지금은 같은 검증(verifySupabaseAuthUser + admin_profiles)을
// 서버에서 한 번 하고 결과를 prop으로 넘긴다 — 첫 페인트부터 사이드바가 완성형이다.
//
// ⚠️ 이 레이아웃은 업무 표면 가드이지 보안 경계가 아니다. 셸 세션이 서버에서 오더라도
// 화면 구성 정보일 뿐이고, 실제 데이터 차단은 각 API의 requireVerifiedAdminContext가 담당한다.
//
// 어드민 경로 전체를 요청 시 렌더로 고정한다. 어드민 페이지는 전부 인증 뒤에 있고 사용자별
// 데이터라 빌드 시점 사전 렌더가 무의미한데, 서버 페이지(예: /admin/blog/new의 getAllPosts)는
// 레이아웃의 cookies()와 같은 렌더 패스에서 먼저 Supabase를 부르므로 빌드가 운영 DB 접근 가능
// 여부에 결합됐다. force-dynamic이면 63개 어드민 페이지가 빌드에서 빠져 빌드가 가벼워지고
// 데이터가 정적 HTML에 박히는 일도 없다. 세션 쿠키가 없으면(/admin/login) 원격 왕복 없이 null이다.
export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const initialSession = await resolveAdminShellSession()

  return <AdminShell initialSession={initialSession}>{children}</AdminShell>
}
