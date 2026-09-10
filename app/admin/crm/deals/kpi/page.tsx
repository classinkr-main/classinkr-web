import PartnerWorkspacePageClient from "@/components/admin/partners/PartnerWorkspacePageClient"
import { listPartnerWorkspacesData } from "@/lib/partners-data"

export const dynamic = "force-dynamic"

// next.config.ts의 staleTimes.dynamic(180초) 때문에 이 RSC 응답은 클라이언트 라우터 캐시에서
// 재사용될 수 있다. 이 페이지는 다른 프리페치 페이지와 달리 마운트 시 자체 재페치가 없으므로,
// 데이터가 실제로 만들어진 시각(generatedAt)을 함께 내려 클라이언트가 오래된 재사용 여부를
// 판정하게 한다(lib/admin/prefetch-freshness.ts, PartnerWorkspacePageClient의 router.refresh 참조).
// 렌더 본문이 아니라 로더 함수에서 시각을 찍는다(react-hooks/purity).
async function loadPartnerWorkspacePageData() {
  const data = await listPartnerWorkspacesData()
  return { ...data, generatedAt: Date.now() }
}

export default async function AdminCrmPartnersPage() {
  const { workspaces, source, warning, generatedAt } = await loadPartnerWorkspacePageData()

  return (
    <PartnerWorkspacePageClient
      initialWorkspaces={workspaces}
      initialSource={source}
      initialWarning={warning}
      generatedAt={generatedAt}
    />
  )
}
