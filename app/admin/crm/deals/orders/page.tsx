import { PortalHome } from "@/components/portal/home/PortalHome"

export default async function AdminCrmPartnerPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // ?deal={id} 딥링크(개요 고객로그·매출 문서/리스크·인사이트·하드웨어 출고연결) → 딜 포커스
  const sp = await searchParams
  const focusDealId = typeof sp.deal === "string" ? sp.deal : undefined
  return (
    <PortalHome
      overviewEndpoint="/api/portal/overview?shape=partner"
      allowCreate={false}
      adminView
      embedded
      focusDealId={focusDealId}
      linkTargets={{
        calendar: "/admin/calendar",
        documents: "/admin/quotes",
        workspace: "/admin/crm/deals/kpi",
      }}
    />
  )
}
