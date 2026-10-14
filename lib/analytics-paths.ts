/**
 * analytics-paths — 경로별 공개 크롬·계측 범위.
 *
 * AppChrome 과 픽셀 컴포넌트가 경로 목록을 각자 들고 있어 서로 어긋날 수 있었다
 * (`MetaPixelScript` 가 `/checkout` 을 따로 막고 있었고, 나중에 들어온 `NaverAnalyticsScript`
 * 도 그 목록을 복사해 왔다). 판정을 여기 한 곳에 둔다 — 새 계측 스크립트도 이 함수를 쓴다.
 */

/** 헤더·푸터·챗봇·플로팅 CTA·채널톡을 걷어내는 경로 — 결제·신청 터널과 내부 화면. */
export function hidesPublicChrome(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/receipt")
  )
}

/**
 * 계측(GTM·페이지뷰·동의 게이트 픽셀)과 동의 배너를 끄는 경로.
 *
 * `/checkout` 은 크롬을 걷어낸 터널이지만 공개 유입의 종착지라 여기 넣지 않는다 — 광고
 * 딥링크로 곧장 들어오는 방문자가 많고, 계측을 끄면 퍼널의 마지막 단계가 데이터에서
 * 사라진다. 내부 적재는 분석 동의가 있을 때만 일어나므로(`lib/analytics.ts`) 동의 배너도
 * 함께 띄운다 — 배너가 없으면 직행 방문자는 동의할 기회조차 없다
 * (docs/active/contact-showroom-checkout-develop-round2-2026-09-20.md §8 D11).
 *
 * `/receipt`(결제 영수증)와 `/admin` 은 계측하지 않는다.
 */
export function excludesAnalytics(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/receipt")
}
