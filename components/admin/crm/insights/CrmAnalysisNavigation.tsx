import Link from "next/link"

export default function CrmAnalysisNavigation({ active }: { active: "overview" | "region" }) {
  return (
    <nav aria-label="CRM 분석 메뉴" className="mb-5 flex flex-wrap items-center gap-4 border-b border-[#e8e8e4]">
      {[{ key: "overview", href: "/admin/crm/insights", label: "전체 분석" }, { key: "region", href: "/admin/crm/customers/map", label: "지역 분석" }].map(item => (
        <Link key={item.key} href={item.href} aria-current={item.key === active ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-1 text-[14px] font-semibold ${item.key === active ? "border-[#084734] text-[#084734]" : "border-transparent text-[#615D59] hover:text-[#111110]"}`}>{item.label}</Link>
      ))}
      <a href="https://mkt.classin.co.kr" target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-h-11 items-center text-[12px] font-medium text-[#615D59] hover:text-[#084734]">Compass 열기 ↗</a>
    </nav>
  )
}
