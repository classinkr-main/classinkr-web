import { redirect } from "next/navigation"

import { FULL_NAV_LANDING_HREF, resolveAdminLandingHref } from "@/components/admin/admin-nav-access"
import { resolveAdminShellSession } from "@/lib/admin-auth"

// 첫 화면 = 그 계정의 착지 화면.
//
// 2026-11-20 부터 계정에 따라 갈린다 — 전체 사이드바 계정은 Overview, 간소 사이드바 계정은 매출
// 장부(docs/active/sales-workspace-simplification-plan-2026-11-20.md W1). 어디로 보낼지는 이 파일이
// 정하지 않는다: components/admin/admin-nav-access.ts 의 resolveAdminLandingHref 하나가 정하고,
// 로그인(app/admin/login/page.tsx)도 같은 함수를 부른다. 두 진입점이 갈리면 "로그인하면 A, 주소창에
// /admin 치면 B"가 되고, 착지와 숨김 목록이 다른 파일에 있으면 2026-09-10 의 사고(로그인 직후
// 사이드바에 없는·막힌 화면)가 다시 난다.
//
// 세션 조회 비용 — resolveAdminShellSession 은 레이아웃(app/admin/layout.tsx)이 같은 요청에서 이미
// 부르고, 쿠키 단위 60초 캐시가 진행 중인 조회까지 나눠 쓴다(lib/admin-auth.ts). 여기서 한 번 더
// 불러도 원격 왕복이 늘지 않는다.
//
// 세션을 못 읽으면(미인증 · dev 바이패스 · 부트스트랩 실패) 예전처럼 Overview 로 보낸다. 미인증은
// proxy 가 로그인으로 돌리고, 그 밖의 경우에도 Overview 는 누구에게나 주소로 열린다 — 숨김은 메뉴
// 정리일 뿐 차단이 아니다.
export default async function AdminRootPage() {
  const session = await resolveAdminShellSession()

  redirect(
    session
      ? resolveAdminLandingHref({ role: session.role, preset: session.navPreset })
      : FULL_NAV_LANDING_HREF
  )
}
