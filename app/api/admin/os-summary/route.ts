import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"
import { listHwOutbound, type HwOutbound } from "@/lib/repositories/branch-hw"
import { getAllPosts } from "@/lib/repositories/blog"
import { listPublicEvents } from "@/lib/repositories/public-events"

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
// 한 소스가 실패해도 해당 필드만 0으로 떨어지고 전체 라우트는 살아남는다.
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const [renewalResult, matchingResult, hwResult, contentResult, eventsResult] =
      await Promise.allSettled([
        getNeoCrmCustomers(),
        getCrmSourceLinkCoverage(),
        listHwOutbound(),
        getAllPosts(),
        listPublicEvents(),
      ])

    const expiringSoonCount =
      renewalResult.status === "fulfilled" ? renewalResult.value.summary.expiringSoonCount : 0

    const matching =
      matchingResult.status === "fulfilled"
        ? matchingResult.value
        : { total: 0, linked: 0, needsReview: 0, coveragePct: 0 }

    // boards86 = 실판매(비-planned) 수량 합, plannedBoards86 = 배송예정 판매 수량 합.
    // 샘플/프로모션/A-S 행은 둘 다에서 제외한다.
    const boardSalesRows =
      hwResult.status === "fulfilled"
        ? hwResult.value.filter((row) => HW_BOARD_PATTERN.test(row.product ?? "") && isSalesOutbound(row))
        : []
    const boards86 = boardSalesRows
      .filter((row) => !isPlannedOutbound(row))
      .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    const plannedBoards86 = boardSalesRows
      .filter((row) => isPlannedOutbound(row))
      .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)

    const blogPublished =
      contentResult.status === "fulfilled"
        ? contentResult.value.filter((post) => post.status === "published").length
        : 0

    const eventsCount = eventsResult.status === "fulfilled" ? eventsResult.value.length : 0

    return adminCachedJson({
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
    })
  } catch (error) {
    console.error("[GET /api/admin/os-summary]", error)
    return NextResponse.json({ error: "Failed to fetch OS summary" }, { status: 500 })
  }
}
