// lib/marketing/intake-today.ts
// "오늘 유입" 라이브 인테이크 조회 — 라우트(/api/admin/marketing/intake-today)와 한눈에 층 서버
// 프리페치(lib/admin/marketing/glance-prefetch)가 같은 함수를 부른다. 조립은 순수 모듈
// (lib/marketing/intake-feed)에 있고 여기서는 조회·격리·캐시만 한다.
//
// 원천별 실패는 격리한다 — 한쪽이 죽어도 남은 쪽 숫자를 보여주되 "무엇이 빠졌는지" 함께 돌려준다
// (adminMeasured/compassMeasured). 실패를 0 으로 포장하지 않는다.

import "server-only"

import { unstable_cache } from "next/cache"

import { getCompassAdsDaily, getCompassLeadsByInflowRange } from "@/lib/compass/bridge"
import {
  buildIntakeFeed,
  resolveIntakeWindows,
  type CompassIntakeLead,
  type IntakeFeedResult,
} from "@/lib/marketing/intake-feed"
import { getMarketingLeads, type LeadRecord } from "@/lib/repositories/leads"
import { shareInFlight } from "@/lib/server/share-in-flight"

/** 피드에 이름을 띄울 최대 행수 — 카드가 스크롤 없이 담는 높이. */
const MAX_ITEMS = 8

async function loadIntakeToday(): Promise<IntakeFeedResult> {
  const windows = resolveIntakeWindows()

  const [adminLeads, compass, adNames] = await Promise.all([
    // 마케팅 스코프는 last_inflow_at 을 싣는다 — 재문의 병합 리드를 오늘 재유입으로 세는 근거다.
    getMarketingLeads().catch((): LeadRecord[] | null => null),
    // 어제 00:00 이후 생성 또는 재유입한 Compass 리드(브리지가 created_at·last_inflow_at 을 OR 로 읽는다).
    getCompassLeadsByInflowRange(windows.yesterdayStartIso, windows.nowIso),
    // 광고명 매핑은 어제~오늘 2일치만 읽는다 — 지금 유입되는 리드의 광고는 지금 집행 중이다.
    // 여기서 넓게 읽으면 라이브 카드 한 장 때문에 소재 뷰를 통째로 훑게 된다.
    getCompassAdsDaily(windows.yesterdayKst, windows.todayKst),
  ])

  const adNameById = new Map<string, string>()
  for (const row of adNames.rows) {
    const name = row.ad_name?.trim()
    if (row.ad_id && name && !adNameById.has(row.ad_id)) adNameById.set(row.ad_id, name)
  }

  return buildIntakeFeed({
    adminLeads,
    // 브리지 다운은 빈 배열이 아니라 미측정(null) — 0 건과 구분해야 카드가 정직해진다.
    compassLeads: compass.down ? null : (compass.rows as CompassIntakeLead[]),
    windows,
    adNameById,
    // 브리지가 페이지네이션 후 count > 받은 행으로 판정한다(예전 .limit(500) 사본 비교는 없앴다).
    compassTruncated: !compass.down && compass.truncated === true,
    maxItems: MAX_ITEMS,
  })
}

// admin-performance-round3-2026-09-10.md §3.2 — route-local Map(memo)은 Vercel Fluid 콜드
// 인스턴스마다 비어 있어 "재방문인데도 1.8초"가 됐다(하루 수십 방문 = 인스턴스가 거의 항상
// 콜드). unstable_cache(Data Cache)로 옮겨 인스턴스 간 공유한다.
//
// 라이브 카드라 TTL은 옛 MEMO_TTL_MS와 같은 20초로 그대로 둔다 — perf(60초)와 달리 "지금
// 들어온 리드"가 핵심이라 짧게 유지해야 한다. 무효화 배선은 없다: 원천은 leads 테이블(공개
// 폼 제출)과 Compass 브리지(외부 시스템)인데, 리드 생성은 공개 웹사이트에서 초 단위로
// 일어나는 고빈도 쓰기라 여기에 revalidateTag를 걸면 캐시가 사실상 항상 미스로 돌아간다
// (lib/admin-homepage-flow.ts의 client_events와 같은 이유). 그래서 TTL만이 신선도 수단이고,
// Phase 4 원칙(무효화 없으면 TTL을 올리지 않는다)에 따라 20초를 유지한다.
//
// fresh=1 의 하드 만료(revalidateTag)는 라우트가 한다 — 이 모듈은 한눈에 층 서버 프리페치의
// 렌더 경로에서도 불리므로 여기서 revalidateTag 를 부르지 않는다(perf-assemble 과 같은 분담).
export const INTAKE_TODAY_CACHE_TAG = "marketing-intake-today"

export const getCachedIntakeToday = unstable_cache(
  // 인자가 없는 조회이므로 shareInFlight(콜드 인스턴스의 동시 미스를 한 번만 계산 + dev·test
  // JSON 안전성 검사)만으로 충분하다.
  // v2(2026-09-14): 응답에 reinflow·todayReinflowCount 가 붙고 Compass 신규가 들어온다 — 옛 모양 캐시를 재사용하지 않게.
  // v3(2026-09-21): 어드민 리드도 유입 축(생성 또는 재문의 last_inflow_at)으로 세고 재유입을 표시한다 — 같은 모양이지만
  // 옛 값은 재문의가 빠진 건수라 섞이지 않게 키를 올린다.
  () => shareInFlight("marketing-intake-today-v3", loadIntakeToday),
  ["marketing-intake-today-v3"],
  { revalidate: 20, tags: [INTAKE_TODAY_CACHE_TAG] }
)
