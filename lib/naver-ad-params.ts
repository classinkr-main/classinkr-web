// lib/naver-ad-params.ts
// 네이버 검색광고 유입 파라미터(n_*) 의 단일 진실원 — 순수 모듈(클라이언트·서버 공용).
//
// 네이버는 프리미엄 로그분석이 연동된 계정의 광고 클릭에 아래 파라미터를 랜딩 URL 로 붙인다.
// gclid·fbclid 처럼 값 하나가 아니라 10종 묶음이고 네이버가 계속 추가하므로,
// leads 에는 컬럼을 늘리지 않고 JSONB 한 칸(naver_ad)에 원본 그대로 담는다.
//
// 수집(lib/marketing-attribution.ts) · 저장(lib/repositories/leads.ts) ·
// 판정(lib/crm/lead-attribution.ts) 이 전부 이 파일 하나를 본다. 목록을 복제하지 않는다.

/** 랜딩 URL 쿼리 키. 순서는 네이버 문서 표기 순 — 표시용으로도 이 순서를 쓴다. */
export const NAVER_AD_PARAMS = [
  "n_media",
  "n_query",
  "n_rank",
  "n_ad_group",
  "n_ad",
  "n_keyword_id",
  "n_keyword",
  "n_campaign_type",
  "n_contract",
  "n_ad_type",
] as const

export type NaverAdParam = (typeof NAVER_AD_PARAMS)[number]
export type NaverAdAttribution = Partial<Record<NaverAdParam, string>>

const PARAM_SET = new Set<string>(NAVER_AD_PARAMS)

/** 한 값의 상한 — utm 수집(lib/marketing-attribution.ts)과 같은 500자 규약. */
const MAX_VALUE_LENGTH = 500

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_VALUE_LENGTH) : undefined
}

/**
 * 키 조회 함수에서 n_* 를 모은다. **하나도 없으면 null** — 빈 객체 {} 를 돌려주면
 * "네이버 유입인데 파라미터가 비었다"와 "네이버 유입이 아니다"가 구분되지 않는다.
 *
 * getter 를 받는 이유: 브라우저(URLSearchParams)와 서버(요청 본문 객체) 양쪽에서 같은
 * 규칙으로 모으기 위해서다.
 */
export function collectNaverAdParams(
  get: (key: NaverAdParam) => string | null | undefined
): NaverAdAttribution | null {
  const out: NaverAdAttribution = {}
  let found = false
  for (const key of NAVER_AD_PARAMS) {
    const value = clean(get(key))
    if (value === undefined) continue
    out[key] = value
    found = true
  }
  return found ? out : null
}

/**
 * DB JSONB · 요청 본문에서 온 값을 타입 있는 형태로 좁힌다.
 * 모르는 키는 버린다 — 저장은 원본 그대로지만 읽을 때 목록 밖 값을 화면에 흘리지 않는다.
 * 유효한 키가 하나도 없으면 null.
 */
export function parseNaverAd(raw: unknown): NaverAdAttribution | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const out: NaverAdAttribution = {}
  let found = false
  for (const [key, value] of Object.entries(source)) {
    if (!PARAM_SET.has(key)) continue
    const cleaned = clean(value)
    if (cleaned === undefined) continue
    out[key as NaverAdParam] = cleaned
    found = true
  }
  return found ? out : null
}

/**
 * 표시용 광고 라벨 — 소재 축(광고 → 광고그룹 → 검색어) 중 있는 것 하나.
 * 없으면 null(“기타”로 뭉뚱그리지 않는다 — lead-attribution 의 롤업 규약).
 */
export function naverAdLabel(naverAd: NaverAdAttribution | null | undefined): string | null {
  if (!naverAd) return null
  return naverAd.n_ad ?? naverAd.n_ad_group ?? naverAd.n_keyword ?? null
}

/**
 * 표시용 캠페인 라벨 — 네이버는 캠페인명을 URL 로 넘기지 않고 **유형**(n_campaign_type)만 준다.
 * 캠페인명이 필요하면 naver_ads_daily 의 campaign_name 을 봐야 한다. 유형을 캠페인명처럼
 * 보여주지 않도록 접두를 붙여 구분한다.
 */
export function naverCampaignTypeLabel(
  naverAd: NaverAdAttribution | null | undefined
): string | null {
  const type = naverAd?.n_campaign_type
  return type ? `네이버 ${type}` : null
}
