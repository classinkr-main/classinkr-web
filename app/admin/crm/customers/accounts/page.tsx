import { Suspense } from "react"

import NeoCrmCustomersClient from "@/components/admin/crm/NeoCrmCustomersClient"

export const metadata = {
  title: "고객 | Admin CRM",
}

export default function AdminCrmPartnerCustomersPage() {
  return (
    <Suspense fallback={null}>
      <NeoCrmCustomersClient />
    </Suspense>
  )
}
