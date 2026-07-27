import type { ReactNode } from "react"

import CrmSubnav from "@/components/admin/crm/CrmSubnav"
import CrmCommandPaletteLauncher from "@/components/admin/crm/CrmCommandPaletteLauncher"

export default function AdminCrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <CrmSubnav />
      {children}
      {/* ⌘K 커맨드 팔레트 — CRM 전 화면 공통 내비·고객검색 (순수 프론트).
          초기 번들에는 단축키 리스너(런처)만 남기고 본체 청크는 첫 오픈 시 지연 로드(감사 #12). */}
      <CrmCommandPaletteLauncher />
    </div>
  )
}
