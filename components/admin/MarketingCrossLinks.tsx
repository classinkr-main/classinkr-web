import Link from "next/link"
import { ADMIN_NAV } from "@/components/admin/admin-nav"

// 마케팅 워크스페이스 크로스링크 — 캠페인 허브에서 형제 마케팅 표면으로 한 번에 이동.
// 라우트 목록은 어드민 nav SSOT(ADMIN_NAV, section==="marketing")에서 파생하므로
// 별도 하드코딩이 없고 nav가 바뀌면 자동 반영된다. currentHref는 목록에서 제외한다.
// 사이드바가 이미 같은 그룹을 항상 노출하므로 여기서는 밀도를 낮춘 보조 이동 수단으로만 둔다.
// excludeHrefs: 같은 화면에 이미 전용 진입 버튼이 있는 표면(예: 헤더의 "행사 관리")을
//   중복 노출하지 않도록 호출부에서 제외 목록을 넘긴다(한 목적지·두 라벨 방지).
export function MarketingCrossLinks({
  currentHref,
  excludeHrefs = [],
  className = "",
}: {
  currentHref: string
  excludeHrefs?: string[]
  className?: string
}) {
  const excluded = new Set([currentHref, ...excludeHrefs])
  const siblings = ADMIN_NAV.filter(
    (item) => item.section === "marketing" && !excluded.has(item.href)
  )
  if (siblings.length === 0) return null

  return (
    <nav
      aria-label="마케팅 워크스페이스"
      className={`flex flex-wrap items-center gap-x-1 gap-y-1.5 ${className}`}
    >
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
        마케팅 워크스페이스
      </span>
      {siblings.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-[12px] font-medium text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
