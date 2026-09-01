// /admin/traffic 전환 지표의 모집단 — 순수 모듈.
//
// 이 탭의 "데모 신청 / 뉴스레터 구독" 숫자는 client_events 의 submit_* 이벤트를 셌다.
// 그런데 client_events 적재는 분석 쿠키 동의가 있어야만 일어난다(lib/analytics.ts 의
// trackEvent → consent.analytics). 동의하지 않은 방문자의 제출은 리드로는 저장되지만
// 이벤트로는 한 줄도 안 남는다. 그 결과 2026-09-01 실측 기준 submit_demo_request 는
// 평생 3건(2026-06-24 이후 0건)인 반면 홈페이지 폼 리드는 계속 들어오고 있었다.
//
// 전환은 동의 여부와 무관한 사실이므로 leads 테이블에서 센다. CTA 클릭·자료 다운로드처럼
// 리드가 남지 않는 행동은 여전히 client_events 가 유일한 출처라 그대로 두되, 화면에서
// "동의 방문자 기준"임을 밝힌다.

import { getSourceGroup } from "@/lib/crm/lead-attribution"

const DAY_MS = 24 * 60 * 60 * 1000

/** 집계에 필요한 최소 리드 필드. 라우트가 이 두 컬럼만 조회한다. */
export interface LeadConversionRow {
  source: string | null
  created_at: string | null
}

export interface LeadConversions {
  rangeDays: number
  /** 홈페이지 그룹(문의 폼·데모 모달·홈 CTA·리드마그넷) 유입 리드 수. */
  homepage: number
  /** 뉴스레터 그룹 유입 리드 수(자료실 PDF 신청 포함 — 그 폼이 newsletter source 로 저장된다). */
  newsletter: number
  /** 윈도우 안의 전체 리드 수. 위 두 값의 분모. */
  total: number
}

export function buildLeadConversions(
  rows: readonly LeadConversionRow[],
  rangeDays: number,
  now: Date = new Date()
): LeadConversions {
  const sinceMs = now.getTime() - rangeDays * DAY_MS
  let homepage = 0
  let newsletter = 0
  let total = 0

  for (const row of rows) {
    if (!row.created_at) continue
    const ms = new Date(row.created_at).getTime()
    // 파싱 실패한 타임스탬프를 통과시키면 NaN 비교가 전부 false 라 조용히 빠지는데,
    // 그러면 total 만 부풀어 비율이 틀어진다. 명시적으로 버린다.
    if (Number.isNaN(ms) || ms < sinceMs) continue
    total++
    const group = getSourceGroup(row.source)
    if (group === "homepage") homepage++
    else if (group === "newsletter") newsletter++
  }

  return { rangeDays, homepage, newsletter, total }
}
