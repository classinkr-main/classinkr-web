import Link from "next/link"

import CrmDataCheckPanelLoader from "@/components/admin/crm/CrmDataCheckPanelLoader"
import CrmMatchingWorkspace from "@/components/admin/crm/matching/CrmMatchingWorkspace"

export const metadata = {
  title: "데이터 매칭 | Admin CRM",
}

export const dynamic = "force-dynamic"

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
      <CrmMatchingWorkspace initialNameFilter={initialNameFilter} />
      {/* 링크 확정 인박스가 이 화면의 주 작업이다. 정합성 진단은 하단 참조 표면으로 내려
          첫 화면과 서버 스트리밍을 막지 않는다. */}
      <CrmDataCheckPanelLoader />
    </>
  )
}
