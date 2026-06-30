import { Suspense } from "react"

import CrmDataCheckPanel from "@/components/admin/crm/CrmDataCheckPanel"
import MatchingInboxClient from "@/components/admin/crm/matching/MatchingInboxClient"
import { getAdminCrmOverview } from "@/lib/admin-crm-overview"

export const metadata = {
  title: "데이터 매칭 | Admin CRM",
}

export const dynamic = "force-dynamic"

// 정합성 패널은 overview 집계를 기다린다 — Suspense로 분리해 인박스가 먼저 뜨고
// 패널은 데이터가 준비되면 스트리밍으로 채워진다(기존엔 패널 대기 동안 인박스도 막혔음).
async function DataCheckPanelAsync() {
  let overview = null
  let error: string | null = null
  try {
    overview = await getAdminCrmOverview()
  } catch (e) {
    error = e instanceof Error ? e.message : "정합성 데이터를 불러오지 못했습니다."
  }
  return <CrmDataCheckPanel overview={overview} error={error} />
}

export default function AdminCrmMatchingPage() {
  return (
    <>
      <Suspense fallback={<CrmDataCheckPanel overview={null} loading />}>
        <DataCheckPanelAsync />
      </Suspense>
      <MatchingInboxClient />
    </>
  )
}
