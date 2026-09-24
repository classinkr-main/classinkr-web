import { Suspense } from "react"

import SyncHealthBannerServer from "@/components/admin/SyncHealthBannerServer"
import NeoCrmCustomersClient from "@/components/admin/crm/NeoCrmCustomersClient"

export const metadata = {
  title: "고객 | Admin CRM",
}

export default function AdminCrmPartnerCustomersPage() {
  return (
    <>
      {/* 원천 고객 = NEO CRM 읽기 동기화의 결과다. 자동 동기화가 멈추면(2026-09 실측: env 누락으로
          크론 0회 성공) 목록 위에서 "언제 값인지·누가 풀 수 있는지"를 먼저 말한다. 별도 Suspense라
          목록 스트리밍을 기다리게 하지 않고, 정상이면 아무것도 그리지 않는다. */}
      <Suspense fallback={null}>
        <SyncHealthBannerServer sources={["neo"]} className="mb-4" />
      </Suspense>
      <Suspense fallback={null}>
        <NeoCrmCustomersClient />
      </Suspense>
    </>
  )
}
