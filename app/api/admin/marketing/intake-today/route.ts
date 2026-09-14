// GET /api/admin/marketing/intake-today[?fresh=1]
// "오늘 유입" 라이브 인테이크 — 어드민 public.leads + Compass 리드를 전화 키로 접어 센다.
// 창 계산·중복 접기는 순수 모듈(lib/marketing/intake-feed)에 있고, 이 라우트는 조회·격리만 한다.
//
// 원천별 실패는 격리한다 — 한쪽이 죽어도 남은 쪽 숫자를 보여주되 "무엇이 빠졌는지" 함께 돌려준다
// (adminMeasured/compassMeasured). 실패를 0 으로 포장하지 않는다.

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag, unstable_cache } from "next/cache"

import { verifyAdmin } from "@/lib/admin-auth"
import { shareInFlight } from "@/lib/server/share-in-flight"
import { getCompassAdsDaily, getCompassLeadsByInflowRange } from "@/lib/compass/bridge"
import {
  buildIntakeFeed,
  resolveIntakeWindows,
  type CompassIntakeLead,
  type IntakeFeedResult,
} from "@/lib/marketing/intake-feed"
import { getMarketingLeads, type LeadRecord } from "@/lib/repositories/leads"

/** 피드에 이름을 띄울 최대 행수 — 카드가 스크롤 없이 담는 높이. */
const MAX_ITEMS = 8

/**
 * 브리지 getCompassLeadsByInflowRange 의 .limit() 값 사본. PostgREST 는 상한 초과분을 오류
 * 없이 잘라 주므로(플레이북 "전량 조회" 규칙) 정확히 이 수만큼 왔으면 잘렸다고 본다.
 * 브리지는 last_inflow_at 내림차순이라 잘리면 어제 이른 시각부터 사라지고, 그러면 어제
 * 카운트가 과소집계돼 델타가 부풀려진다 — 카드가 그 사실을 표시할 수 있게 넘긴다.
 */
const COMPASS_LEAD_ROW_LIMIT = 500

async function loadIntakeToday(): Promise<IntakeFeedResult> {
  const windows = resolveIntakeWindows()

  const [adminLeads, compass, adNames] = await Promise.all([
    getMarketingLeads().catch((): LeadRecord[] | null => null),
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
    compassTruncated: !compass.down && compass.rows.length >= COMPASS_LEAD_ROW_LIMIT,
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
const INTAKE_TODAY_CACHE_TAG = "marketing-intake-today"

const getCachedIntakeToday = unstable_cache(
  // 인자가 없는 조회이므로 shareInFlight(콜드 인스턴스의 동시 미스를 한 번만 계산 + dev·test
  // JSON 안전성 검사)만으로 충분하다.
  () => shareInFlight("marketing-intake-today-v1", loadIntakeToday),
  ["marketing-intake-today-v1"],
  { revalidate: 20, tags: [INTAKE_TODAY_CACHE_TAG] }
)

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1"
    // fresh=1: 태그를 먼저 하드 만료시킨 뒤(perf/compass-ads 라우트와 동일 패턴) 캐시된
    // 함수를 불러 재계산 + 재적재한다.
    if (fresh) revalidateTag(INTAKE_TODAY_CACHE_TAG, { expire: 0 })
    // JSON 안전성 검사는 shareInFlight 내부에서 이미 수행한다(중복 검사 불필요).
    return NextResponse.json(await getCachedIntakeToday())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "오늘 유입 집계 실패" },
      { status: 500 }
    )
  }
}
