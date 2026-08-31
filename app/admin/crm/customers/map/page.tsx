import { Suspense } from "react"

import CrmNaverMapSourceClient from "@/components/admin/crm/CrmNaverMapSourceClient"
import CrmRegionAssignmentPanel from "@/components/admin/crm/map/CrmRegionAssignmentPanel"
import CrmRegionMapPanel from "@/components/admin/crm/map/CrmRegionMapPanel"

export const metadata = {
  title: "지도 | Admin CRM",
}

/**
 * CRM 지도 탭.
 *
 * 위에서 아래로 세 층이다.
 *  1) 시도 분포 지도 — 거래·타깃·리드·고객 레이어, 레이어마다 커버리지(분모)를 함께 표기
 *  2) 지역 분배 — 시도별 담당자. 리드가 있는데 담당이 없는 줄이 이 층의 결론이다
 *  3) 원천 검수 — 네이버 공유지도 가져오기와 매칭
 *
 * 원래 이 화면은 3)뿐이었다. 같은 지역 데이터를 놓고 "어디에 얼마나 있나"와
 * "거기 누가 있나"를 볼 표면이 없어, 지도 값이 검수 대기열로만 쓰였다.
 */
export default function AdminCrmCustomersMapPage() {
  return (
    <div>
      <CrmRegionMapPanel />
      <CrmRegionAssignmentPanel />
      <div className="mb-3 border-t border-[#e8e8e4] pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">Source</p>
        <h2 className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] text-[#111110]">원천 검수</h2>
        <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
          네이버 공유지도에서 가져온 장소를 기존 CRM 레코드와 연결한다.
        </p>
      </div>
      <Suspense fallback={<div className="mx-auto h-96 max-w-7xl animate-pulse rounded-xl bg-[#F6F5F4]" />}>
        <CrmNaverMapSourceClient />
      </Suspense>
    </div>
  )
}
