import type { ReactNode } from "react"

import CrmSubnav from "@/components/admin/crm/CrmSubnav"
import CrmCommandPalette from "@/components/admin/crm/CrmCommandPalette"

export default function AdminCrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <CrmSubnav />
      {children}
      {/* ⌘K 커맨드 팔레트 — CRM 전 화면 공통 내비·고객검색 (순수 프론트) */}
      <CrmCommandPalette />
    </div>
  )
}
