import { redirect } from "next/navigation"

// 첫 화면 = Overview.
//
// 2026-07-29 탭 재구성 때는 캘린더였다. Overview가 SUPER_ADMIN 전용(MOON_ONLY_HREFS)이라
// 전원을 보낼 수 없었기 때문이다. 2026-09-10 전면 공개 전환으로 그 제약이 사라졌고
// (components/admin/admin-nav-access.ts), Overview는 사이드바 상시 목록의 첫 항목이다.
// 로그인 리다이렉트(app/admin/login/page.tsx)도 같은 경로를 쓴다 — 두 진입점이 갈리면
// "로그인하면 A, 주소창에 /admin 치면 B"가 되어 첫 화면이 무엇인지 아무도 확신하지 못한다.
//
// 사람별 첫 화면 분기는 여전히 하지 않는다: 이 파일은 세션을 모르는 서버 컴포넌트고,
// 분기를 넣으려면 리다이렉트 전에 세션 조회가 들어가 첫 진입이 느려진다.
export default function AdminRootPage() {
  redirect("/admin/overview")
}
