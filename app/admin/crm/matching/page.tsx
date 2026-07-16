import { Suspense } from "react"
import Link from "next/link"

import CrmDataCheckPanel from "@/components/admin/crm/CrmDataCheckPanel"
import CrmMatchingWorkspace from "@/components/admin/crm/matching/CrmMatchingWorkspace"
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

export default async function AdminCrmMatchingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // rev-sheet '연결하기'/커버리지 칩 등에서 ?name=고객명 으로 진입하면 인박스를 그 계정으로 프리필(CRM-1).
  const params = await searchParams
  const rawName = params.name
  const initialNameFilter = (Array.isArray(rawName) ? rawName[0] : rawName)?.trim() || undefined

  return (
    <>
      {/* 역할 배너 — 매칭 인박스 = 링크 확정 액션 허브, 분석·검수 읽기는 매출시트(CRM-1 역할 확정) */}
      <p className="mb-4 border-b border-[#f0f0ec] pb-3 text-[12px] text-[#1a1a1a]/45">
        <span className="font-semibold text-[#111110]">여기서 링크 확정</span> — REV 시트·Neo CRM·리드를 고객으로
        접합하는 액션 허브입니다. 분석·검수 읽기는{" "}
        <Link href="/admin/crm/deals/rev-sheet" className="font-semibold text-[#084734] underline-offset-2 hover:underline">
          매출시트 ↗
        </Link>
        에서 합니다.
      </p>
      <Suspense fallback={<CrmDataCheckPanel overview={null} loading />}>
        <DataCheckPanelAsync />
      </Suspense>
      <CrmMatchingWorkspace initialNameFilter={initialNameFilter} />
    </>
  )
}
