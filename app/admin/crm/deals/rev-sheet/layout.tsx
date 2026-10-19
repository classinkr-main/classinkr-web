import { Suspense, type ReactNode } from "react"

import SyncHealthBannerServer from "@/components/admin/SyncHealthBannerServer"

// 매출시트(REV) 화면의 서버 층 — page.tsx는 클라이언트 컴포넌트라 서버에서 읽는 동기화 건강 띠를
// 여기서 얹는다(page.tsx 본문·모바일 계약은 그대로 둔다).
//
// 이 화면의 모든 수치는 KR Team 시트(REV·DSH·KPI) 동기화본이다. 동기화가 멈추면(2026-09 실측: 08-18 이후
// 시트 권한 오류) 화면 위에서 "언제 값인지·누가 풀 수 있는지"를 먼저 말한다. 별도 Suspense(fallback 없음)라
// 본문을 기다리게 하지 않고, 정상이면 아무것도 그리지 않는다.
export default function AdminCrmRevenueSheetLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <SyncHealthBannerServer sources={["sheets"]} className="mb-4" />
      </Suspense>
      {children}
    </>
  )
}
