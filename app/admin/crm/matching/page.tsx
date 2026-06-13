import CrmDataCheckPanel from "@/components/admin/crm/CrmDataCheckPanel"
import MatchingInboxClient from "@/components/admin/crm/matching/MatchingInboxClient"
import { getAdminCrmOverview } from "@/lib/admin-crm-overview"

export const metadata = {
  title: "데이터 매칭 | Admin CRM",
}

export const dynamic = "force-dynamic"

export default async function AdminCrmMatchingPage() {
  let overview = null
  let error: string | null = null
  try {
    overview = await getAdminCrmOverview()
  } catch (e) {
    error = e instanceof Error ? e.message : "정합성 데이터를 불러오지 못했습니다."
  }

  return (
    <>
      <CrmDataCheckPanel overview={overview} error={error} />
      <MatchingInboxClient />
    </>
  )
}
