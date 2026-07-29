import { redirect } from "next/navigation"

// 2026-07-29 탭 재구성 — 첫 화면이 Overview에서 캘린더로 바뀌었다.
// 사람별 분기는 하지 않는다: 이 파일은 세션을 모르는 서버 컴포넌트고,
// 분기를 넣으려면 리다이렉트 전에 세션 조회가 들어가 첫 진입이 느려진다.
// Overview는 사이드바 "기타 › 시스템"에서 접근한다(SUPER_ADMIN 전용).
export default function AdminRootPage() {
  redirect("/admin/calendar")
}
