// GET /api/admin/marketing/intake-today[?fresh=1]
// "오늘 유입" 라이브 인테이크 — 어드민 public.leads + Compass 리드를 전화 키로 접어 센다.
// 창 계산·중복 접기는 순수 모듈(lib/marketing/intake-feed)에 있고, 이 라우트는 조회·격리만 한다.
//
// 원천별 실패는 격리한다 — 한쪽이 죽어도 남은 쪽 숫자를 보여주되 "무엇이 빠졌는지" 함께 돌려준다
// (adminMeasured/compassMeasured). 실패를 0 으로 포장하지 않는다.

import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
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

// 라이브 카드라 메모는 짧게 — perf(45초)와 달리 "지금 들어온 리드"가 핵심이다.
const MEMO_TTL_MS = 20_000
let memo: { at: number; promise: Promise<IntakeFeedResult> } | null = null

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

function getIntakeToday(fresh: boolean): Promise<IntakeFeedResult> {
  if (!fresh && memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.promise
  const promise = loadIntakeToday()
  memo = { at: Date.now(), promise }
  promise.catch(() => {
    if (memo?.promise === promise) memo = null
  })
  return promise
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1"
    return NextResponse.json(await getIntakeToday(fresh))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "오늘 유입 집계 실패" },
      { status: 500 }
    )
  }
}
