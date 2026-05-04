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

export const META_PIXEL_ID =
  getConfiguredAnalyticsId(process.env.NEXT_PUBLIC_META_PIXEL_ID)

export const KAKAO_PIXEL_ID = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID
)
