"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useState } from "react"

// 무거운 지도와 고객 집계는 사용자가 펼칠 때만 로드한다. 기존 Overview 프리페치와 독립적이다.
const BranchRegionHeatmap = dynamic(() => import("@/components/admin/branch/sections/BranchRegionHeatmap"), { ssr: false })
const CrmHealthDonut = dynamic(() => import("@/components/admin/crm/home/CrmHealthDonut"), { ssr: false })

const groups = [
  { title: "고객·활동", links: [
    { href: "/admin/crm", label: "CRM 홈" },
    { href: "/admin/crm/customers/unified", label: "통합 고객" },
    { href: "/admin/crm/customers/leads", label: "리드" },
    { href: "/admin/crm/activity", label: "활동 기록" },
    { href: "/admin/crm/capture", label: "참석자 입력" },
  ] },
  { title: "매출·운영", links: [
    { href: "/admin/crm/deals", label: "견적·매출" },
    { href: "/admin/crm/deals/orders", label: "오더·설치" },
    { href: "/admin/crm/deals/rev-sheet", label: "매출시트" },
    { href: "/admin/branch", label: "KR Team 지사" },
    { href: "/admin/branch/ledger", label: "매출 장부" },
  ] },
  { title: "분석·점검", links: [
    { href: "/admin/crm/insights", label: "인사이트 분석" },
    { href: "/admin/crm/matching", label: "데이터 매칭" },
  ] },
] as const

export default function OverviewCrmWorkspace() {
  const [open, setOpen] = useState(false)
  return (
    <details className="relative mb-6 rounded-2xl border border-[#e8e8e4] bg-white" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-[#111110] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]">
        CRM 바로가기와 내 담당 현황
      </summary>
      {open && <div className="space-y-5 border-t border-[#e8e8e4] p-5">
        <div className="grid gap-4 md:grid-cols-3">
          {groups.map((group) => <section key={group.title}>
            <h2 className="mb-2 text-xs font-bold text-[#615D59]">{group.title}</h2>
            <div className="flex flex-wrap gap-2">{group.links.map((link) => <Link key={link.href} href={link.href} className="rounded-lg border border-[#e8e8e4] px-3 py-2 text-xs font-medium text-[#111110] hover:border-[#084734] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]">{link.label}</Link>)}</div>
          </section>)}
        </div>
        <p className="text-xs text-[#615D59]">아래 지표는 로그인한 사용자의 담당 고객과 매출만 표시합니다. 데이터 접근은 각 API 권한에 따릅니다.</p>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section aria-label="내 담당 지사 지역별 매출 히트맵" className="min-w-0 overflow-x-auto">
            <BranchRegionHeatmap team="ALL" period="Y" selectedMonth="" refreshKey={0} manager="__me" includeMapSource={false} syncSelectionToUrl={false} noStore />
          </section>
          <CrmHealthDonut scope="personal" />
        </div>
      </div>}
    </details>
  )
}
