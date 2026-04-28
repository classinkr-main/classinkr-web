import type { ReactNode } from "react"

import CrmSubnav from "@/components/admin/crm/CrmSubnav"

export default function AdminCrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <CrmSubnav />
      {children}
    </div>
  )
}
