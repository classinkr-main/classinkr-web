import { NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"
import { listHwOutbound, type HwOutbound } from "@/lib/repositories/branch-hw"
import { countPublishedPosts } from "@/lib/repositories/blog"
import { countPublicEvents } from "@/lib/repositories/public-events"

const HW_BOARD_TARGET = 218
const BLOG_TARGET = 48
const EVENTS_TARGET = 12
const HW_BOARD_PATTERN = /86|IFP/i

// 진척(HW) 불변식: boards86은 "실제 판매 출고"만 집계한다 — 배송예정(planned)과
// Sample/Promotion/A-S 출고를 섞으면 타일이 부풀려진다. 아래 규칙은 재고 원장과 동일
// 규약의 사본이다(새 정규식 발명 금지):
//  - planned: lib/repositories/hardware-inventory.ts isPlannedStatus(:244-247)
//  - 샘플성 텍스트: 같은 파일 isSampleLikeText(:226-228, 시트 임포트가 type/remarks/
//    destination/progress에 적용하는 것과 동일 — :1177)
//  - 유형 토큰(Sales/Sample/Promotion/A/S): components/admin/hardware/
//    HardwareInventoryClient.tsx outboundSaleType과 동일 토큰 판정
const HW_PLANNED_PATTERN = /예정|예약|대기|planned/i
const HW_SAMPLE_LIKE_PATTERN = /샘플|대여|데모|demo|sample/i

type OsSummarySourceKey = "renewal" | "matching" | "hw" | "content" | "events"

interface OsSummarySourceHealth {
  status: "ready" | "error"
  error: string | null
}

const OS_SOURCE_ERROR: Record<OsSummarySourceKey, string> = {
  renewal: "리뉴얼 원천을 확인하지 못했습니다.",
  matching: "매칭 원천을 확인하지 못했습니다.",
  hw: "하드웨어 원천을 확인하지 못했습니다.",
  content: "블로그 원천을 확인하지 못했습니다.",
  events: "행사 원천을 확인하지 못했습니다.",
}

function sourceHealth(ok: boolean, key: OsSummarySourceKey): OsSummarySourceHealth {
  return { status: ok ? "ready" : "error", error: ok ? null : OS_SOURCE_ERROR[key] }
}

function isPlannedOutbound(row: HwOutbound) {
  return HW_PLANNED_PATTERN.test(row.progress ?? "")
}

function isSalesOutbound(row: HwOutbound) {
  const token = (row.type ?? "").trim().toLowerCase()
  if (token === "sample" || token === "promotion" || token === "a/s" || token === "as") return false
  if ([row.type, row.remarks, row.destination, row.progress].some((value) => HW_SAMPLE_LIKE_PATTERN.test(value ?? ""))) {
    return false
  }
  return true
}

// 운영 OS 요약 — 기존에 흩어진 운영 신호(리뉴얼/매칭/HW/콘텐츠/행사)를
// 읽기 전용으로 합성해 어드민 Overview 상단 요약 스트립에 노출한다.
// 한 소스가 실패해도 성공 소스는 살리되, 실패 값은 0이 아닌 null+source health로
// 내려 실제 0건과 구분한다. 전체 라우트를 500으로 묶지 않는 부분 격리 계약이다.
async function computeOsSummary() {
  const [renewalResult, matchingResult, hwResult, contentResult, eventsResult] =
    await Promise.allSettled([
      getNeoCrmCustomers(),
      // OS health가 DB 오류를 실제 0건으로 오인하지 않도록 이 소비처만 strict 모드로 읽는다.
      getCrmSourceLinkCoverage({ throwOnError: true }),
      listHwOutbound(),
      // 블로그는 발행 수 하나만 쓰므로 전체 목록 로드 대신 count 전용 쿼리(head:true).
      countPublishedPosts(),
      // 행사도 숫자 하나만 쓰므로 긴 본문을 포함한 전체 행 대신 head count만 조회한다.
      countPublicEvents(),
    ])

  // Neo 조회는 네트워크 실패를 reject 대신 { ok:false }로 돌려줄 수 있으므로 둘 다 실패로 본다.
  const renewalOk = renewalResult.status === "fulfilled" && renewalResult.value.ok
  const matchingOk = matchingResult.status === "fulfilled"
  const hwOk = hwResult.status === "fulfilled"
  const contentOk = contentResult.status === "fulfilled"
  const eventsOk = eventsResult.status === "fulfilled"

  const expiringSoonCount = renewalOk ? renewalResult.value.summary.expiringSoonCount : null

  const matching =
    matchingOk
      ? matchingResult.value
      : { total: null, linked: null, needsReview: null, coveragePct: null }

  // boards86 = 실판매(비-planned) 수량 합, plannedBoards86 = 배송예정 판매 수량 합.
  // 샘플/프로모션/A-S 행은 둘 다에서 제외한다.
  const boardSalesRows =
    hwOk
      ? hwResult.value.filter((row) => HW_BOARD_PATTERN.test(row.product ?? "") && isSalesOutbound(row))
      : []
  const boards86 = hwOk
    ? boardSalesRows
        .filter((row) => !isPlannedOutbound(row))
        .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    : null
  const plannedBoards86 = hwOk
    ? boardSalesRows
        .filter((row) => isPlannedOutbound(row))
        .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    : null

  const blogPublished = contentOk ? contentResult.value : null

  const eventsCount = eventsOk ? eventsResult.value : null

  return {
    sources: {
      renewal: sourceHealth(renewalOk, "renewal"),
      matching: sourceHealth(matchingOk, "matching"),
      hw: sourceHealth(hwOk, "hw"),
      content: sourceHealth(contentOk, "content"),
      events: sourceHealth(eventsOk, "events"),
    },
    renewal: { expiringSoonCount },
    matching: {
      coveragePct: matching.coveragePct,
      linked: matching.linked,
      total: matching.total,
      needsReview: matching.needsReview,
    },
    hw: { boards86, plannedBoards86, target: HW_BOARD_TARGET },
    content: { blogPublished, target: BLOG_TARGET },
    events: { count: eventsCount, target: EVENTS_TARGET },
  }
}

// 서버 메모이제이션(7-23 감사 3-A) — adminCachedJson은 브라우저 프라이빗 캐시 헤더만
// 붙이므로 유저마다·콜드미스마다 위 5개 무거운 repo 집계가 전부 재계산됐다.
// unstable_cache(60초)로 계산 결과(숫자 몇 개)를 요청·유저 간 공유한다.
// - createSupabaseAdminClient는 요청 무관(non-cookie) 서비스 롤 클라이언트라
//   unstable_cache 안에서 안전하다(lib/admin-crm-revenue.ts:1534 동일 논리).
// - allSettled 부분 실패(null+source health)도 최대 60초 캐시된 후 재계산된다.
//   장애 중 오염된 0을 표시하지 않고 UI에서 해당 원천을 재시도할 수 있다.
// - getNeoCrmCustomers의 자체 60초 모듈 캐시와 겹치면 renewal 수치는 최악 ~120초 지연.
const getCachedOsSummary = unstable_cache(computeOsSummary, ["admin-os-summary-v3"], {
  revalidate: 60,
  tags: ["admin-os-summary"],
})

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    return adminCachedJson(await getCachedOsSummary())
  } catch (error) {
    console.error("[GET /api/admin/os-summary]", error)
    return NextResponse.json({ error: "Failed to fetch OS summary" }, { status: 500 })
  }
}
