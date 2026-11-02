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

// Google Ads 글로벌 태그 ID (gtag.js). 공개 페이지 공통 로드(components/GoogleAdsScript.tsx가
// /admin 경로를 걸러 로드한다 — app/layout.tsx에는 두지 않는다. 그 파일의 주석 참조).
// 운영 계정 395-174-3288(classinkorea@gmail.com)의 태그. 2026-11-02 이전 값 AW-18252550128 은
// 캠페인이 없는 다른 계정이라 전환이 운영 계정에 쌓이지 않았다. 아래 라벨들은 이 ID 의 계정에서
// 발급된 값이어야 한다 — ID 를 바꾸면 라벨 env 도 함께 바꾼다.
export const GOOGLE_ADS_ID = "AW-18551599540"

// 과거 GA4_ID(NEXT_PUBLIC_GA_ID만 읽음)는 app/layout.tsx의 중복 gtag 인라인 스크립트 전용
// export였다 — 그 스크립트를 지우며(어드민에 새던 gtag 차단) 유일한 소비처가 사라져 함께
// 제거했다. GA4 config는 GA4_MEASUREMENT_ID(NEXT_PUBLIC_GA4_MEASUREMENT_ID 우선)로 일원화됨
// — components/GoogleAdsScript.tsx 참조.

// 전환 액션 라벨(send_to = `${GOOGLE_ADS_ID}/${LABEL}`). 미설정이면 그 전환은 발송되지 않는다.
// 어느 폼이 어느 라벨로 가는지는 lib/analytics.ts adsConversionLabel 참조.
// "도입 상담 신청" — 데모 모달 + /contact 문의 유형 '도입 상담'.
export const GOOGLE_ADS_DEMO_CONVERSION_LABEL = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL
)
// "쇼룸 예약 완료" — /showroom 예약.
export const GOOGLE_ADS_SHOWROOM_CONVERSION_LABEL = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_GOOGLE_ADS_SHOWROOM_CONVERSION_LABEL
)

export const META_PIXEL_ID =
  getConfiguredAnalyticsId(process.env.NEXT_PUBLIC_META_PIXEL_ID)

export const KAKAO_PIXEL_ID = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID
)

// 네이버 프리미엄 로그분석 사이트 식별자(공통키). 미설정이면 wcs 스크립트를 아예 마운트하지 않는다.
// ⚠️ 값이 있어도 네이버 **검수 신청**을 통과하기 전에는 수집이 시작되지 않는다 —
//    그 구간의 0 은 "성과 없음"이 아니라 "아직 안 켜짐"이다.
export const NAVER_WCS_ID = getConfiguredAnalyticsId(process.env.NEXT_PUBLIC_NAVER_WCS_ID)

/**
 * 네이버 전환 유형 문자열(wcs.trans 의 type). 네이버 광고 관리에서 정의한 값과 정확히 같아야 한다.
 * 테스트 중에는 `test_` 접두를 붙여 돌리고 확정 시 제거한다(네이버 가이드 권장).
 * 미설정이면 전환을 보내지 않는다 — 유형을 지어내면 네이버 쪽 집계가 오염된다.
 */
export const NAVER_LEAD_CONVERSION_TYPE = getConfiguredAnalyticsId(
  process.env.NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE
)
