// 홈 공유 카드(app/opengraph-image.tsx) 문구.
// 카드 아래 글자(og:title·description)가 범주어를 이미 말하므로, 그림은 홈 히어로 메시지를 싣는다.
// 제목은 CLASSIN_POSITIONING.heroHeadline 을 수동 개행한 두 줄이다(typography §2-1: 2줄 상한·수동 개행).
// 헤드라인이 바뀌면 tests/seo/og-image.test.ts 가 이 두 줄을 다시 맞추라고 알린다.
export const HOME_OG_KICKER = "학원 전자칠판·수업 녹화·운영 플랫폼"
export const HOME_OG_TITLE_LINES = ["좋은 수업을, 강사의 개인기에서", "학원의 시스템으로"] as const
export const HOME_OG_ALT = `클래스인 Classin — ${HOME_OG_TITLE_LINES.join(" ")}`
