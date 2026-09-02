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
// resolveAdminShellSession()이 cookies()를 읽는 순간 이 레이아웃은 동적 렌더로 확정되므로
// `export const dynamic = "force-dynamic"`은 중복이라 두지 않는다. 세션 쿠키가 없으면
// (예: /admin/login) 원격 왕복 없이 즉시 null이라 비용도 사실상 0이다.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const initialSession = await resolveAdminShellSession()

  return <AdminShell initialSession={initialSession}>{children}</AdminShell>
}
