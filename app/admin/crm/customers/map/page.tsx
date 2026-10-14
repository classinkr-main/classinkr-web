import { Suspense } from "react"
import CrmRegionWorkspace from "@/components/admin/crm/map/CrmRegionWorkspace"

export const metadata = { title: "지역 분석 | Admin CRM" }

export default function AdminCrmCustomersMapPage() {
  return <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-[#F6F5F4]" />}><CrmRegionWorkspace /></Suspense>
}
