// 어드민 사이드바 배치 SSOT — 순수 데이터/함수만 둔다(React·브라우저 API 없음).
// 사이드바·모바일·커맨드 팔레트·권한 미리보기는 전부 이 모듈의 resolveAdminNavAccess를 거쳐야
// 서로 어긋나지 않는다.
//
// ── 2026-09-10 전면 공개 전환 ────────────────────────────────────────────────
// 프리셋별 차등 노출(NAV_PRESETS·MOON_ONLY_HREFS·RESTRICTED_HREFS)과 "차단(deny)" 배치를
// 걷어냈다. 이제 **모든 매니저가 같은 사이드바를 본다**. 근거:
//
//  1. nav 는 보안 경계가 아니다. 이 파일 위쪽에 있던 경고문 그대로 — 실제 데이터 접근은 각
//     API 의 verifyAdmin()/requireVerifiedAdminContext() 역할 검사와 capability 가 강제한다
//     (docs/active/admin-guidance-map.md §2). 사이드바에서 숨기는 것은 접근 통제가 아니라
//     화면 정리였고, 그 대가로 업무 표면만 좁아졌다.
//  2. 차등 노출이 만든 실제 사고: 로그인(app/admin/login/page.tsx)은 전원을 /admin/overview 로
//     보내는데 그 경로가 MOON_ONLY_HREFS 라, 비 SUPER_ADMIN 은 로그인 직후 "접근 권한이
//     없습니다" 차단 화면부터 봤다. 두 SSOT 가 서로를 모른 채 반대로 움직인 것이다.
//  3. "저 사람 화면엔 왜 그 탭이 있지"를 매번 설명하는 비용이 숨겨서 얻는 이득보다 컸다.
//
// 남는 축은 **배치 하나뿐**이다: 자주 쓰는 표면은 상시(상단), 나머지는 범주별로 묶인 "기타".
// 사람별 예외(nav_overrides)는 그 두 자리를 옮기는 개인 취향 설정으로만 남는다 — 더 이상
// 누구의 접근도 막지 못한다.
import {
  ADMIN_NAV,
  ADMIN_NAV_CATEGORIES,
  normalizeAdminRole,
  type AdminNavCategory,
  type AdminNavItem,
} from "./admin-nav"

/**
 * 배치는 두 자리뿐이다. "deny" 는 2026-09-10 전면 공개 전환으로 제거됐다 —
 * 타입에서 지워야 "차단을 다시 넣는" 변경이 컴파일 단계에서 드러난다.
 */
export type NavPlacement = "primary" | "folded"

/**
 * 레거시 프리셋 키. 배치에는 더 이상 영향을 주지 않지만 두 가지 이유로 타입을 남긴다.
 *  - admin_profiles.nav_preset 컬럼과 20260729 마이그레이션의 CHECK 제약이 이 값들을 그대로
 *    허용한다. 타입을 지우면 기존 행(sales·branch 등)을 읽는 API 가 400 을 내기 시작한다.
 *  - 컬럼 자체를 드롭하는 마이그레이션은 되돌리기 어려워 별도 결정으로 미룬다.
 * 새 코드에서 이 키로 화면을 갈라서는 안 된다.
 */
export type NavPresetKey = "staff" | "sales" | "marketing" | "cs" | "lead" | "branch" | "super"

const NAV_PRESET_KEYS: readonly NavPresetKey[] = [
  "staff",
  "sales",
  "marketing",
  "cs",
  "lead",
  "branch",
  "super",
]

/**
 * 전원 공통 상시 목록 — "자주 쓰는 것만 위로, 나머지는 기타".
 *
 * ADMIN_NAV 선언 순서가 이미 범주 연속 블록(home → customer → growth → system)이라,
 * 이 목록은 앞의 두 범주(홈 + 고객·매출)를 그대로 집어 든 것과 같다. 덕분에 상시 목록도
 * 기타와 똑같이 범주 소제목으로 묶이면서 재정렬이 일어나지 않는다.
 *
 * 상시(8): Overview · 캘린더 · KR Team · 매출 장부 · CRM · 견적·문서 · 하드웨어 재고 · CS 콘솔
 * 기타(9): 마케팅·분석 6(캠페인 3 · 콘텐츠 · 자료 퍼널 · Analytics) + 시스템 3(운영 상태 ·
 *          설정 · 개발 도구)
 *
 * 견적·문서와 CS 콘솔을 상시에 남긴 이유 — 견적은 하드웨어 재고와 한 흐름(견적 산출물 →
 * 재고 검증)이라 떼면 둘 다 나빠지고, CS 콘솔은 가이드 문서·내부 CS 를 품은 **유일한 CS
 * 진입점**이라 기타로 접으면 팀원의 CS 표면 전체가 메뉴에서 사라진다.
 */
export const DEFAULT_PRIMARY_HREFS: readonly string[] = [
  "/admin/overview",
  "/admin/calendar",
  "/admin/branch",
  "/admin/branch/ledger",
  "/admin/crm",
  "/admin/quotes",
  "/admin/hardware",
  "/admin/chatbot",
]

export function isNavPresetKey(value: unknown): value is NavPresetKey {
  return typeof value === "string" && (NAV_PRESET_KEYS as readonly string[]).includes(value)
}

export function isNavPlacement(value: unknown): value is NavPlacement {
  return value === "primary" || value === "folded"
}

/**
 * DB의 nav_overrides(JSONB)를 신뢰하지 않고 정규화한다 — 모르는 키·값은 버린다.
 *
 * 레거시 "deny" 는 버리지 않고 "folded" 로 강등한다. 그냥 버리면 그 항목이 상시로 튀어올라
 * "숨겨 뒀던 게 갑자기 맨 위에" 가 되고, 남겨두면 전면 공개 전환이 무의미해진다. 기타로
 * 내리는 것이 두 의도를 모두 존중하는 유일한 처리다.
 */
export function normalizeNavOverrides(value: unknown): Record<string, NavPlacement> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const known = new Set(ADMIN_NAV.map((item) => item.href))
  const result: Record<string, NavPlacement> = {}

  for (const [href, placement] of Object.entries(value as Record<string, unknown>)) {
    if (!known.has(href)) continue
    if (isNavPlacement(placement)) result[href] = placement
    else if (placement === "deny") result[href] = "folded"
  }

  return result
}

export interface NavAccessContext {
  /** resolveAdminNavAccess가 normalizeAdminRole을 적용한다. 배치에는 영향을 주지 않는다. */
  role: string
  /** 레거시 컬럼값. 배치에 더 이상 영향을 주지 않는다 — 호출부 시그니처 호환용으로만 받는다. */
  preset?: NavPresetKey | null
  overrides: Record<string, NavPlacement>
}

/**
 * 배치 판정 — 사람별 예외가 있으면 그것, 없으면 전원 공통 기본값.
 * 역할·프리셋은 판정에 쓰이지 않는다(전면 공개).
 */
export function resolveNavPlacement(href: string, ctx: NavAccessContext): NavPlacement {
  const override = ctx.overrides[href]
  if (override) return override

  return DEFAULT_PRIMARY_HREFS.includes(href) ? "primary" : "folded"
}

export interface FoldedNavGroup {
  category: AdminNavCategory
  items: AdminNavItem[]
}

export interface ResolvedNavAccess {
  /** 상시 항목 — ADMIN_NAV 선언 순서 그대로(렌더에서 재정렬하지 않는다). */
  primary: AdminNavItem[]
  /**
   * primary를 기타와 같은 범주로 묶은 것 — 상시 범주 소제목 렌더용.
   * ADMIN_NAV 선언이 범주 연속 블록이라 이 묶음은 재정렬 없는 분할이며,
   * 항목을 이어 붙이면 primary와 순서가 완전히 같다.
   */
  primaryGroups: FoldedNavGroup[]
  /**
   * 상시 목록에 범주 소제목을 렌더할지 — 2범주 이상 + 4항목 이상일 때만.
   * 항목보다 헤더가 많아지는 꼴을 피한다. 사이드바·권한 미리보기가 각자 판단하면
   * 어긋나므로 여기서 한 번만 계산한다.
   */
  showPrimaryHeaders: boolean
  folded: FoldedNavGroup[]
}

/** 항목들을 범주 선언 순서(홈 → 고객·매출 → 마케팅·분석 → 시스템)로 묶는다. 빈 범주는 사라진다. */
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
 * 항목들을 상시/기타로 나눈다.
 * 상시 순서는 ADMIN_NAV 선언 순서를 그대로 따르고(렌더에서 재정렬하지 않는다),
 * 상시·기타 모두 같은 범주로 묶는다.
 */
export function resolveNavAccess(
  ctx: NavAccessContext,
  items: readonly AdminNavItem[] = ADMIN_NAV
): ResolvedNavAccess {
  const primary: AdminNavItem[] = []
  const foldedItems: AdminNavItem[] = []

  for (const item of items) {
    if (resolveNavPlacement(item.href, ctx) === "primary") primary.push(item)
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

/**
 * 실제 사용자 컨텍스트용 단일 진입점.
 *
 * 2026-09-10 이후 여기서 항목을 걸러내지 않는다 — 모든 매니저가 같은 목록을 보고, 개인
 * 예외는 상시/기타 자리만 옮긴다. role 은 정규화만 해서 넘기며(레거시 소문자·대문자 혼재
 * 대비) 배치 판정에는 쓰이지 않는다.
 */
export function resolveAdminNavAccess(ctx: NavAccessContext): ResolvedNavAccess {
  return resolveNavAccess(
    {
      role: normalizeAdminRole(ctx.role),
      preset: ctx.preset ?? null,
      overrides: normalizeNavOverrides(ctx.overrides),
    },
    ADMIN_NAV
  )
}

/**
 * 렌더 가능한 항목을 ADMIN_NAV 선언 순서로 되돌린다.
 * 전면 공개 이후 이 함수는 항상 ADMIN_NAV 전체와 같은 집합을 돌려준다 — 호출부(셸의 직접
 * URL 진입 가드, 커맨드 팔레트)가 같은 SSOT 를 계속 쓰도록 시그니처를 유지한다.
 */
export function getAccessibleAdminNavItems(access: ResolvedNavAccess): AdminNavItem[] {
  const accessibleHrefs = new Set([
    ...access.primary.map((item) => item.href),
    ...access.folded.flatMap((group) => group.items.map((item) => item.href)),
  ])

  return ADMIN_NAV.filter((item) => accessibleHrefs.has(item.href))
}
