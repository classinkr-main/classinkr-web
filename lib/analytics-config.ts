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

// Google Ads 글로벌 태그 ID (gtag.js). 전 페이지 공통 로드.
export const GOOGLE_ADS_ID = "AW-18252550128"

// GA4 측정 ID. gtag.js는 Google Ads용으로 이미 로드되므로 config만 추가하면 된다.
// 발화 여부는 Consent Mode v2(analytics_storage) 상태가 결정한다.
export const GA4_ID = getConfiguredAnalyticsId(process.env.NEXT_PUBLIC_GA_ID)

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
