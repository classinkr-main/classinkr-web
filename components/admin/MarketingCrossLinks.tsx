"use client"

import Link from "next/link"
import { useState } from "react"
import { ADMIN_NAV, normalizeAdminRole, type AdminNavItem } from "@/components/admin/admin-nav"
import {
  isNavPresetKey,
  normalizeNavOverrides,
  resolveNavPlacement,
  type NavAccessContext,
} from "@/components/admin/admin-nav-access"

// 마케팅 워크스페이스 크로스링크 — 캠페인 허브에서 형제 마케팅 표면으로 한 번에 이동.
// 라우트 목록은 어드민 nav SSOT(ADMIN_NAV, section==="marketing")에서 파생하므로
// 별도 하드코딩이 없고 nav가 바뀌면 자동 반영된다. currentHref는 목록에서 제외한다.
// 사이드바가 이미 같은 그룹을 항상 노출하므로 여기서는 밀도를 낮춘 보조 이동 수단으로만 둔다.
// excludeHrefs: 같은 화면에 이미 전용 진입 버튼이 있는 표면(예: 헤더의 "행사 관리")을
//   중복 노출하지 않도록 호출부에서 제외 목록을 넘긴다(한 목적지·두 라벨 방지).
//
// (2026-08-18) 접근 SSOT 반영 — nav 파생만으로는 캠페인 관리·마케팅 프로젝트처럼 프리셋이
// 차단(deny)한 탭까지 칩으로 노출돼, 비super 팀원이 누르면 layout의 "접근 권한이 없습니다"
// 화면으로 떨어지는 죽은 진입점이 됐다. 사이드바와 같은 세션 소스·같은 해석 함수
// (resolveNavPlacement)로 deny 탭은 칩 자체를 그리지 않는다.

/** 접근 필터를 통과한 마케팅 형제 탭 — ctx가 없으면(SSR·세션 미적재) 레거시(전부 노출)로 둔다.
 *  preset=null도 resolveNavPlacement가 전부 primary를 돌려주므로 두 경로의 결과는 같다. */
export function visibleMarketingSiblings(
  ctx: NavAccessContext | null,
  currentHref: string,
  excludeHrefs: readonly string[] = []
): AdminNavItem[] {
  const excluded = new Set([currentHref, ...excludeHrefs])
  return ADMIN_NAV.filter((item) => {
    if (item.section !== "marketing" || excluded.has(item.href)) return false
    return !ctx || resolveNavPlacement(item.href, ctx) !== "deny"
  })
}

function readSessionNavContext(): NavAccessContext | null {
  if (typeof window === "undefined") return null
  const role = sessionStorage.getItem("admin_role")
  if (!role) return null

  const presetRaw = sessionStorage.getItem("admin_nav_preset") ?? ""
  let overrides: unknown = {}
  try {
    overrides = JSON.parse(sessionStorage.getItem("admin_nav_overrides") ?? "{}")
  } catch {
    overrides = {}
  }

  return {
    role: normalizeAdminRole(role),
    preset: isNavPresetKey(presetRaw) ? presetRaw : null,
    overrides: normalizeNavOverrides(overrides),
  }
}

export function MarketingCrossLinks({
  currentHref,
  excludeHrefs = [],
  className = "",
}: {
  currentHref: string
  excludeHrefs?: string[]
  className?: string
}) {
  // 사이드바와 같은 세션 소스(sessionStorage)에서 마운트 시 1회 동기 초기화 —
  // CsConsoleNav의 lazy-initializer 패턴. 내비 가시성은 권한 경계가 아니다(실제 경계는 각 API).
  const [ctx] = useState(readSessionNavContext)
  const siblings = visibleMarketingSiblings(ctx, currentHref, excludeHrefs)
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
