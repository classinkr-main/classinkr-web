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

/**
 * 문준혁(SUPER_ADMIN) 전용 — 다른 프리셋에는 열리지 않는다(사람별 오버라이드로만 예외 부여).
 * /admin/chatbot(CS 콘솔)은 2026-08-18 CS 진입점 단일화로 이 목록에서 빠졌다 — 가이드 문서·
 * 내부 CS의 nav 항목이 콘솔 가로 메뉴로 흡수되면서 콘솔이 전 프리셋의 유일한 CS 진입점이 됐고,
 * 진입점을 차단하면 팀원의 CS 표면 전체가 사라진다.
 */
export const MOON_ONLY_HREFS: readonly string[] = [
  "/admin/overview",
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

// 전원 상시 바닥 — 캘린더는 첫 화면, CS 콘솔은 유일한 CS 진입점(가이드 문서·내부 CS를 품는다).
// 가이드 문서가 차지하던 "전원 상시" 자리를 콘솔이 승계했다(2026-08-18 CS 진입점 단일화).
// CRM 은 전 프리셋 상시다 — 사이드바가 평평해지면서(드릴인 제거) CRM 이 접힌 '기타' 안에만
// 있으면 영업 핵심 화면을 메뉴에서 찾을 수 없다. 드릴인이 그동안 이 결함을 가려주고 있었다.
const STAFF_PRIMARY = ["/admin/calendar", "/admin/chatbot", "/admin/crm"] as const

export const NAV_PRESETS: Record<NavPresetKey, NavPreset> = {
  staff: { label: "기본", primary: STAFF_PRIMARY },
  sales: { label: "영업", primary: [...STAFF_PRIMARY, "/admin/quotes", "/admin/hardware"] },
  marketing: { label: "마케팅", primary: [...STAFF_PRIMARY, "/admin/campaigns", "/admin/blog"] },
  // 내부 CS 별도 상시는 콘솔(STAFF_PRIMARY의 /admin/chatbot)로 흡수됐다 — 콘솔 내부 축이 그 화면이다.
  cs: { label: "고객 지원", primary: [...STAFF_PRIMARY, "/admin/quotes"] },
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
      "/admin/crm",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/campaigns",
      "/admin/blog",
      "/admin/chatbot",
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
  /** 상시 항목 — ADMIN_NAV 선언 순서 그대로(렌더에서 재정렬하지 않는다). */
  primary: AdminNavItem[]
  /**
   * primary를 기타와 같은 3범주로 묶은 것 — 상시 범주 소제목 렌더용(2026-08-18).
   * ADMIN_NAV 선언이 범주 연속 블록이라 이 묶음은 재정렬 없는 분할이며,
   * 항목을 이어 붙이면 primary와 순서가 완전히 같다.
   */
  primaryGroups: FoldedNavGroup[]
  /**
   * 상시 목록에 범주 소제목을 렌더할지 — 2범주 이상 + 4항목 이상일 때만.
   * 소형 프리셋에서 항목보다 헤더가 많아지는 문제(스펙 §4.1이 섹션 헤더를 없앤 이유)를 피한다.
   * 사이드바·권한 미리보기가 각자 판단하면 어긋나므로 여기서 한 번만 계산한다.
   */
  showPrimaryHeaders: boolean
  folded: FoldedNavGroup[]
}

/** 항목들을 범주 선언 순서(고객·매출 → 마케팅·분석 → 시스템)로 묶는다. 빈 범주는 사라진다. */
function groupNavByCategory(items: readonly AdminNavItem[]): FoldedNavGroup[] {
  const byCategory = new Map<AdminNavCategory, AdminNavItem[]>()

  for (const item of items) {
    const category = item.category ?? "system"
    const bucket = byCategory.get(category)
    if (bucket) bucket.push(item)
    else byCategory.set(category, [item])
  }

  return ADMIN_NAV_CATEGORIES.flatMap((category) => {
    const group = byCategory.get(category)
    return group && group.length > 0 ? [{ category, items: group }] : []
  })
}

/**
 * 롤 필터를 통과한 항목들을 상시/기타로 나눈다.
 * 상시 순서는 ADMIN_NAV 선언 순서를 그대로 따르고(렌더에서 재정렬하지 않는다),
 * 상시·기타 모두 같은 3범주로 묶는다(2026-08-18 — "순서를 더 쓰고 범주화" 결정).
 */
export function resolveNavAccess(
  ctx: NavAccessContext,
  items: readonly AdminNavItem[] = ADMIN_NAV
): ResolvedNavAccess {
  const primary: AdminNavItem[] = []
  const foldedItems: AdminNavItem[] = []

  for (const item of items) {
    const placement = resolveNavPlacement(item.href, ctx)
    if (placement === "deny") continue
    if (placement === "primary") primary.push(item)
    else foldedItems.push(item)
  }

  const primaryGroups = groupNavByCategory(primary)

  return {
    primary,
    primaryGroups,
    showPrimaryHeaders: primary.length >= 4 && primaryGroups.length >= 2,
    folded: groupNavByCategory(foldedItems),
  }
}
