import { redirect } from "next/navigation"

// 구경로 → Deals(KPI)로 이동. 북마크/외부 링크 보존용 redirect 스텁.
export default function AdminCrmPartnersRedirect() {
  redirect("/admin/crm/deals/kpi")
}
