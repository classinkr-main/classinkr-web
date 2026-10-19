// 갈매봇(어드민 AI) 시안 노출 스위치 — 켜짐·꺼짐 판정은 이 함수 하나로만 한다.
//
// 기획 결정 D13(docs/active/admin-ai-widget-remote-order-plan-2026-09-28.md §9): 서버 1단계(조회)가
// 붙을 때까지 시안(샘플 데이터) 상태로 운영에 올리지 않는다. 2026-10-19 통합 병합으로 코드는 들어왔지만
// 이 스위치가 꺼져 있으면(기본) 화면 어디에도 드러나지 않는다.
//  - 셸(AdminShell)이 런처(플로팅 버튼·Ctrl/⌘+J)를 올리지 않고, 저장된 "옆에 붙임" 상태로 본문을 밀지도 않는다.
//  - "AI 올인원" 항목이 ADMIN_NAV·DEFAULT_PRIMARY_HREFS 에서 빠진다 — 사이드바·⌘K·사이드바 편집기가 전부
//    그 표에서 파생하므로 거기 한 곳만 거른다.
//  - /admin/ai 는 notFound() 다.
//
// NEXT_PUBLIC_ 값은 next build 때 `process.env.NEXT_PUBLIC_ADMIN_AI_PREVIEW` 글자 그대로를 찾아 값으로
// 바꿔 넣는다. 변수·대괄호 접근으로 바꾸면 브라우저 번들에서는 늘 undefined 가 되어 서버 판정과 갈린다.
// 비밀값이 아니라 노출 스위치라 문자열 비교로 충분하다. "1" 만 켠다("true" 등은 꺼짐).
export const ADMIN_AI_HREF = "/admin/ai"

export function isAdminAiPreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ADMIN_AI_PREVIEW === "1"
}
