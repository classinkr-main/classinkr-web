// 어드민 사이드바 접근·배치 SSOT — 스펙 docs/active/admin-tab-restructure-2026-07-29.md §5.
// 순수 데이터/함수만 둔다(React·브라우저 API 없음). 사이드바·커맨드 팔레트·권한 설정
// 미리보기가 전부 이 모듈의 resolveNavAccess를 호출해야 세 화면이 어긋나지 않는다.
import {
  ADMIN_NAV,
  ADMIN_NAV_CATEGORIES,
  type AdminNavCategory,
  type AdminNavItem,
} from "./admin-nav"

export type NavPlacement = "primary" | "folded" | "deny"
export type NavPresetKey = "staff" | "sales" | "marketing" | "cs" | "lead" | "branch" | "super"

/** 문준혁(SUPER_ADMIN) 전용 — 다른 프리셋에는 열리지 않는다(사람별 오버라이드로만 예외 부여). */
export const MOON_ONLY_HREFS: readonly string[] = [
  "/admin/overview",
  "/admin/chatbot",
  "/admin/ops",
  "/admin/settings",
  "/admin/dev",
  "/admin/campaigns/manage",
  "/admin/campaigns/projects",
]

/** 프리셋 화이트리스트가 있는 항목 — 목록에 없는 프리셋은 차단. */
export const RESTRICTED_HREFS: Record<string, readonly NavPresetKey[]> = {
  "/admin/branch/ledger": ["lead", "branch", "super"],
  "/admin/analytics": ["lead", "super"],
}

export interface NavPreset {
  label: string
  /** 상시 노출 href. 접근 가능하지만 여기 없는 항목은 자동으로 기타로 간다. */
  primary: readonly string[]
}

const STAFF_PRIMARY = ["/admin/calendar", "/admin/docs"] as const

export const NAV_PRESETS: Record<NavPresetKey, NavPreset> = {
  staff: { label: "기본", primary: STAFF_PRIMARY },
  sales: { label: "영업", primary: [...STAFF_PRIMARY, "/admin/quotes", "/admin/hardware"] },
  marketing: { label: "마케팅", primary: [...STAFF_PRIMARY, "/admin/campaigns", "/admin/blog"] },
  cs: { label: "고객 지원", primary: [...STAFF_PRIMARY, "/admin/quotes", "/admin/cs-chatbot"] },
  lead: {
    label: "총괄",
    primary: [...STAFF_PRIMARY, "/admin/quotes", "/admin/hardware", "/admin/campaigns", "/admin/blog"],
  },
  branch: {
    label: "지사장",
    primary: [...STAFF_PRIMARY, "/admin/quotes", "/admin/branch", "/admin/branch/ledger"],
  },
  super: {
    label: "최고 관리자",
    primary: [
      "/admin/calendar",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/campaigns",
      "/admin/blog",
      "/admin/docs",
      "/admin/cs-chatbot",
    ],
  },
}

export function isNavPresetKey(value: unknown): value is NavPresetKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(NAV_PRESETS, value)
}

export function isNavPlacement(value: unknown): value is NavPlacement {
  return value === "primary" || value === "folded" || value === "deny"
}

/** DB의 nav_overrides(JSONB)를 신뢰하지 않고 정규화한다 — 모르는 키·값은 버린다. */
export function normalizeNavOverrides(value: unknown): Record<string, NavPlacement> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const known = new Set(ADMIN_NAV.map((item) => item.href))
  const result: Record<string, NavPlacement> = {}

  for (const [href, placement] of Object.entries(value as Record<string, unknown>)) {
    if (known.has(href) && isNavPlacement(placement)) result[href] = placement
  }

  return result
}

export interface NavAccessContext {
  /** normalizeAdminRole을 통과한 값. SUPER_ADMIN은 어떤 규칙으로도 차단되지 않는다. */
  role: string
  /** null이면 레거시(roles 기반) 동작으로 폴백한다. */
  preset: NavPresetKey | null
  overrides: Record<string, NavPlacement>
}

export function resolveNavPlacement(href: string, ctx: NavAccessContext): NavPlacement {
  // 프리셋 미배정 = 오늘과 동일. 롤 필터는 호출부(사이드바)가 이미 걸었으므로 전부 상시.
  // 이 한 줄이 "배포해도 아무 화면도 안 바뀐다"를 보장한다.
  if (!ctx.preset) return "primary"

  // 프리셋이 정한 배치. 접근이 허용되면 이 값을 그대로 쓴다.
  const placement: NavPlacement = NAV_PRESETS[ctx.preset].primary.includes(href)
    ? "primary"
    : "folded"

  // 슈퍼 관리자는 어떤 규칙으로도 차단되지 않는다 — 자기 설정 화면을 잠그면 복구 경로가 없다.
  // 단 배치까지 무시하지는 않는다: 문준혁도 접힌 사이드바를 봐야 이 기능을 실제로 검증할 수 있다.
  if (ctx.role === "SUPER_ADMIN") return placement

  // 사람별 예외가 최우선 — 아래 두 차단 묶음도 뚫는다. 지정 권한은 API가 슈퍼 관리자로 제한한다.
  const override = ctx.overrides[href]
  if (override) return override

  if (MOON_ONLY_HREFS.includes(href)) return "deny"

  const allowed = RESTRICTED_HREFS[href]
  if (allowed) return allowed.includes(ctx.preset) ? placement : "deny"

  return placement
}

export interface FoldedNavGroup {
  category: AdminNavCategory
  items: AdminNavItem[]
}

export interface ResolvedNavAccess {
  primary: AdminNavItem[]
  folded: FoldedNavGroup[]
}

/**
 * 롤 필터를 통과한 항목들을 상시/기타로 나눈다.
 * 상시 순서는 ADMIN_NAV 선언 순서를 그대로 따르고(렌더에서 재정렬하지 않는다),
 * 기타는 범주 선언 순서(고객·매출 → 마케팅·분석 → 시스템)로 묶는다. 빈 범주는 사라진다.
 */
export function resolveNavAccess(
  ctx: NavAccessContext,
  items: readonly AdminNavItem[] = ADMIN_NAV
): ResolvedNavAccess {
  const primary: AdminNavItem[] = []
  const byCategory = new Map<AdminNavCategory, AdminNavItem[]>()

  for (const item of items) {
    const placement = resolveNavPlacement(item.href, ctx)
    if (placement === "deny") continue
    if (placement === "primary") {
      primary.push(item)
      continue
    }

    const category = item.category ?? "system"
    const bucket = byCategory.get(category)
    if (bucket) bucket.push(item)
    else byCategory.set(category, [item])
  }

  const folded = ADMIN_NAV_CATEGORIES.flatMap((category) => {
    const group = byCategory.get(category)
    return group && group.length > 0 ? [{ category, items: group }] : []
  })

  return { primary, folded }
}
