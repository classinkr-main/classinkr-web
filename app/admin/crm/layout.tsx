import type { ReactNode } from "react"

import CrmSubnav from "@/components/admin/crm/CrmSubnav"
import CrmCommandPaletteLauncher from "@/components/admin/crm/CrmCommandPaletteLauncher"

export default function AdminCrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      {/* CRM 하위 내비게이션은 전부 이 밴드가 책임진다(사이드바는 평평한 단일 링크).
          바깥 패딩을 상쇄해 좌우 전폭으로 깔고, 아래 헤어라인으로 본문과 층을 나눈다. */}
      <div className="-mx-4 mb-5 border-b border-[#e8e8e4] bg-white px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <CrmSubnav />
      </div>
      {children}
      {/* ⌘K 커맨드 팔레트 — CRM 전 화면 공통 내비·고객검색 (순수 프론트).
          초기 번들에는 단축키 리스너(런처)만 남기고 본체 청크는 첫 오픈 시 지연 로드(감사 #12). */}
      <CrmCommandPaletteLauncher />
    </div>
  )
}
