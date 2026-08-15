const PLACEHOLDER_IDS = new Set([
  "g-xxxxxxxxxx",
  "xxxxxxxxxxxxxxx",
  "your_kakao_pixel_id",
])

function getConfiguredAnalyticsId(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  return PLACEHOLDER_IDS.has(trimmed.toLowerCase()) ? null : trimmed
}

export const GTM_ID =
  getConfiguredAnalyticsId(process.env.NEXT_PUBLIC_GTM_ID)

export const GA4_MEASUREMENT_ID = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ??
    process.env.NEXT_PUBLIC_GA_ID
)

// Google Ads 글로벌 태그 ID (gtag.js). 전 페이지 공통 로드.
export const GOOGLE_ADS_ID = "AW-18252550128"

// GA4 측정 ID는 위 GA4_MEASUREMENT_ID 하나만 쓴다.
// 예전에는 NEXT_PUBLIC_GA_ID만 읽는 GA4_ID 상수가 따로 있었는데, 두 상수를 서로 다른
// 스크립트가 참조하면서 "어느 쪽 env를 설정했느냐"에 따라 GA4가 이중 계측되거나
// 아예 침묵하는 상태가 됐다. 폴백 체인을 가진 GA4_MEASUREMENT_ID로 일원화한다.

// "도입문의 제출" 전환 액션 라벨. Google Ads에서 전환 액션 생성 시 발급되는 값
// (send_to = `${GOOGLE_ADS_ID}/${LABEL}`). 미설정 시 전환 이벤트는 발송되지 않음.
export const GOOGLE_ADS_DEMO_CONVERSION_LABEL = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL
)

export const META_PIXEL_ID =
  getConfiguredAnalyticsId(process.env.NEXT_PUBLIC_META_PIXEL_ID)

export const KAKAO_PIXEL_ID = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID
)
