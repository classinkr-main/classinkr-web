import { Suspense } from "react"

import LeadsBoardClient from "@/components/admin/crm/leads/LeadsBoardClient"

export const metadata = {
  title: "리드 | Admin CRM",
}

export default function AdminCrmLeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsBoardClient />
    </Suspense>
  )
}
