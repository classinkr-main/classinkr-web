import { Suspense } from "react"

import CrmNaverMapSourceClient from "@/components/admin/crm/CrmNaverMapSourceClient"

export const metadata = {
  title: "지도 원천 | Admin CRM",
}

export default function AdminCrmCustomersMapPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-7xl animate-pulse rounded-xl bg-[#F6F5F4]" />}>
      <CrmNaverMapSourceClient />
    </Suspense>
  )
}
