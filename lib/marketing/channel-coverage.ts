// lib/marketing/channel-coverage.ts
// 채널 커버리지 판정 — 순수 모듈(서버 의존 없음).
//
// 광고 채널 하나가 "연동됐다"고 말하려면 세 가지가 다 있어야 한다:
//   집행 데이터 — 얼마 썼는지 (플랫폼 API → 일자 스냅샷)
//   리드 귀속   — 그 돈이 누구를 데려왔는지 (클릭 식별자 → leads)
//   전환 추적   — 그 사실을 플랫폼에 되돌려주는지 (픽셀/전환 스크립트)
//
// 세 축을 한 표로 보여주는 이유는 "어디가 비었는지"가 개별 화면에 흩어져 있으면 아무도
// 모르기 때문이다. 실제로 Google 은 gclid 를 저장하면서도 전환 라벨이 비어 있어 전환이
// 한 건도 안 돌아가고 있었고, 그 사실이 어느 화면에도 드러나지 않았다.
//
// 판정은 **실제 설정값**에서 나온다 — 문서에 적힌 상태가 아니라 지금 이 배포의 상태다.

import type { AdChannel } from "@/lib/types/event-metrics"

/**
 * live=완전 연동, partial=반쪽, none=빠져 있음(채울 수 있는데 안 채움),
 * manual=수기 입력만(연동 대상이 아님), na=이 채널에 그 축이 존재하지 않음.
 *
 * none 과 na 를 가르는 이유: 오프라인 광고에 전환 스크립트가 없는 것은 "빈칸"이 아니다.
 * 둘을 같게 두면 상단 '빈칸 N' 배지가 고칠 수 없는 항목까지 세어 신뢰를 잃는다.
 */
export type CoverageState = "live" | "partial" | "none" | "manual" | "na"

export interface CoverageCell {
  state: CoverageState
  /** 화면에 그대로 뜨는 한 줄. 상태만으로는 "무엇을 해야 하는지"가 안 보인다. */
  note: string
}

export interface ChannelCoverageRow {
  channel: AdChannel
  spendData: CoverageCell
  leadAttribution: CoverageCell
  conversionTracking: CoverageCell
}

export interface ChannelCoverageInput {
  /** perf 응답의 channelLive 조각 — 연동 여부와 실제 수집 여부를 가른다. */
  live: ReadonlyArray<{
    channel: string
    configured: boolean
    spend: number | null
    dataThrough: string | null
  }>
  /** Google Ads 전환 액션 라벨(NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL) 설정 여부. */
  googleConversionLabelSet: boolean
  /** 네이버 프리미엄 로그분석 공통키(NEXT_PUBLIC_NAVER_WCS_ID) 설정 여부. */
  naverWcsSet: boolean
  /** 네이버 전환 유형(NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE) 설정 여부. */
  naverConversionTypeSet: boolean
  /** Meta 픽셀 ID 설정 여부. */
  metaPixelSet: boolean
  /** 카카오 픽셀 ID 설정 여부. */
  kakaoPixelSet: boolean
}

const MANUAL_ONLY: CoverageCell = {
  state: "manual",
  note: "수기 입력 — channel_budgets · 행사별 광고비",
}

/** 집행 데이터 축: 미연동 → 연동했는데 아직 안 쌓임 → 쌓임. 셋을 구분한다. */
function spendCell(
  entry: ChannelCoverageInput["live"][number] | undefined,
  configHint: string
): CoverageCell {
  if (!entry || !entry.configured) {
    return { state: "none", note: `미연동 — ${configHint}` }
  }
  if (entry.dataThrough == null) {
    // 자격증명은 있는데 스냅샷이 비었다. 크론이 아직 안 돌았거나 마이그레이션 미적용이다.
    return { state: "partial", note: "연동됨 · 스냅샷 없음 — 크론 첫 실행 대기" }
  }
  if (entry.spend == null) {
    // 스냅샷은 있는데 이번 기간 합계를 못 냈다 — 통화 혼재이거나 조회 실패.
    return { state: "partial", note: `수집 중 · 이 기간 집계 불가 (~${entry.dataThrough})` }
  }
  return { state: "live", note: `수집 중 (~${entry.dataThrough})` }
}

/**
 * 현재 배포 기준 커버리지 표. 리드 귀속·전환 추적의 사실관계는 코드에 고정돼 있고
 * (어느 컬럼을 저장하는지 / 어느 스크립트를 마운트하는지), 그 중 설정으로 갈리는 부분만
 * 입력을 본다.
 */
export function buildChannelCoverage(input: ChannelCoverageInput): ChannelCoverageRow[] {
  const byChannel = new Map(input.live.map((entry) => [entry.channel, entry]))

  return [
    {
      channel: "meta",
      spendData: spendCell(byChannel.get("meta"), "META_ACCESS_TOKEN · META_AD_ACCOUNT_ID"),
      leadAttribution: {
        state: "live",
        note: "리드애즈 웹훅 + fbclid — 캠페인·소재까지",
      },
      conversionTracking: input.metaPixelSet
        ? { state: "live", note: "Pixel + 서버 전환(CAPI)" }
        : { state: "partial", note: "CAPI 만 — NEXT_PUBLIC_META_PIXEL_ID 미설정" },
    },
    {
      channel: "google",
      spendData: spendCell(byChannel.get("google"), "GOOGLE_ADS_* 자격증명"),
      leadAttribution: {
        state: "live",
        note: "gclid 저장 + google/cpc 채널 폴백",
      },
      // 라벨이 없으면 gtag 는 로드되는데 전환이 한 건도 안 나간다 —
      // 어느 화면에도 안 드러나던 그 상태가 이 표를 만든 이유다.
      conversionTracking: input.googleConversionLabelSet
        ? { state: "live", note: "gtag 전환 액션 발화" }
        : {
            state: "partial",
            note: "gtag 로드됨 · 전환 미발송 — NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL 미설정",
          },
    },
    {
      channel: "naver",
      spendData: spendCell(byChannel.get("naver"), "NAVER_SEARCHAD_* 자격증명"),
      leadAttribution: {
        state: "live",
        note: "n_* 수집 → leads.naver_ad · naver/cpc 채널 폴백",
      },
      conversionTracking: naverConversionCell(input),
    },
    {
      channel: "kakao",
      spendData: MANUAL_ONLY,
      leadAttribution: { state: "partial", note: "UTM 이 붙어 들어오면 귀속" },
      conversionTracking: input.kakaoPixelSet
        ? { state: "live", note: "카카오 픽셀" }
        : { state: "none", note: "NEXT_PUBLIC_KAKAO_PIXEL_ID 미설정" },
    },
    {
      channel: "youtube",
      spendData: MANUAL_ONLY,
      // YouTube 는 Google Ads 안에서 돌므로 gclid 가 붙는다 — 다만 채널을 갈라 보지는 못한다.
      leadAttribution: { state: "partial", note: "gclid 로 잡히나 Google 과 구분 못 함" },
      conversionTracking: { state: "partial", note: "Google Ads 전환과 공유" },
    },
    {
      channel: "offline",
      spendData: MANUAL_ONLY,
      leadAttribution: { state: "manual", note: "행사 참석자 명단 매칭" },
      // 오프라인에는 되돌려줄 광고 플랫폼이 없다 — 고칠 수 있는 빈칸이 아니다.
      conversionTracking: { state: "na", note: "해당 없음 — 되돌려줄 플랫폼 없음" },
    },
    {
      channel: "other",
      spendData: MANUAL_ONLY,
      leadAttribution: { state: "partial", note: "UTM 이 붙어 들어오면 귀속" },
      // 채널이 특정되지 않아 어느 플랫폼에 되돌려줄지 말할 수 없다.
      conversionTracking: { state: "na", note: "채널 미특정 — 대상 플랫폼 없음" },
    },
  ]
}

/**
 * 네이버 전환은 두 값이 다 있어야 돈다 — 공통키(어디에 쌓을지)와 전환 유형(무엇으로 셀지).
 * 하나만 있으면 스크립트는 붙는데 전환이 안 잡히므로 partial 로 둔다.
 */
function naverConversionCell(input: ChannelCoverageInput): CoverageCell {
  if (input.naverWcsSet && input.naverConversionTypeSet) {
    // ⚠️ 설정이 다 돼 있어도 네이버 검수 전에는 수집이 시작되지 않는다 — 그 사실을 문구에 남긴다.
    return { state: "live", note: "wcs.trans 발화 — 네이버 검수 통과 후 수집 시작" }
  }
  if (input.naverWcsSet) {
    return { state: "partial", note: "로그분석만 — NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE 미설정" }
  }
  return { state: "none", note: "NEXT_PUBLIC_NAVER_WCS_ID 미설정" }
}

/**
 * 세 축 중 몇 개가 완전 연동인지 — 요약 배지용.
 * manual(수기 운영)과 na(해당 없음)는 분모에서 뺀다: 고칠 수 있는 항목만 세야
 * '빈칸 N' 이 실제 할 일의 수와 같아진다.
 */
export function coverageScore(row: ChannelCoverageRow): { live: number; total: number } {
  const cells = [row.spendData, row.leadAttribution, row.conversionTracking]
  const counted = cells.filter((cell) => cell.state !== "manual" && cell.state !== "na")
  return { live: counted.filter((cell) => cell.state === "live").length, total: counted.length }
}
