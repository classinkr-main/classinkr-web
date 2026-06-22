import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"
import { listHwOutbound } from "@/lib/repositories/branch-hw"
import { getAllPosts } from "@/lib/repositories/blog"
import { listPublicEvents } from "@/lib/repositories/public-events"

const HW_BOARD_TARGET = 218
const BLOG_TARGET = 48
const EVENTS_TARGET = 12
const HW_BOARD_PATTERN = /86|IFP/i

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

    const boards86 =
      hwResult.status === "fulfilled"
        ? hwResult.value
            .filter((row) => HW_BOARD_PATTERN.test(row.product ?? ""))
            .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
        : 0

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
      hw: { boards86, target: HW_BOARD_TARGET },
      content: { blogPublished, target: BLOG_TARGET },
      events: { count: eventsCount, target: EVENTS_TARGET },
    })
  } catch (error) {
    console.error("[GET /api/admin/os-summary]", error)
    return NextResponse.json({ error: "Failed to fetch OS summary" }, { status: 500 })
  }
}
