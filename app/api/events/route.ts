import { NextResponse } from "next/server"
import { listCachedPublicEvents } from "@/lib/repositories/public-events"

// 관리자 행사 변경 시 app/api/admin/events/_revalidate.ts 가 태그를 무효화하므로
// 캐시본을 써도 신선도 손실이 없다. (/events 페이지·sitemap 과 같은 캐시 엔트리를 공유)
export async function GET() {
  try {
    const events = await listCachedPublicEvents()
    return NextResponse.json(events, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 목록 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}
