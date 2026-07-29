# 어드민 탭 재구성 구현 계획 (2026-07-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 사이드바 21탭을 사람별 상시 5±2개 + 하단 "기타" 접힘 그룹으로 재구성하고, 슈퍼 관리자가 탭 접근 권한을 UI에서 배정할 수 있게 한다.

**Architecture:** 순수 데이터 모듈(`admin-nav-access.ts`)이 `(role, preset, overrides) → placement`를 계산하고, 사이드바·커맨드 팔레트·권한 설정 미리보기가 **같은 함수**를 쓴다. 저장소는 `admin_profiles`에 `nav_preset`/`nav_overrides` 2컬럼 추가. `nav_preset`이 NULL이면 기존 `roles` 기반 동작으로 폴백해 배포 시점 무변화를 보장한다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Supabase · Vitest (`npm test` = `vitest run --dir tests`)

**스펙:** [admin-tab-restructure-2026-07-29.md](admin-tab-restructure-2026-07-29.md)

---

## 사전 확인 (작업 시작 전 필수)

- [ ] **워크트리 충돌 확인**

이 저장소는 동시 세션이 같은 워크트리를 편집한다. 계획 작성 시점에 `components/admin/AdminSidebar.tsx`가 **다른 세션에 의해 수정 중**이었다.

```bash
git status --short
```

`components/admin/AdminSidebar.tsx`가 ` M`으로 나오면 **Task 5를 시작하기 전에** 해당 세션의 작업이 커밋됐는지 확인한다. 커밋 전이면 `git stash`하지 말 것 — 남의 작업이다. 그 파일만 나중으로 미루고 Task 1~4를 먼저 진행한다.

- [ ] **브랜치 확인**

```bash
git branch --show-current
```

Expected: `home_v3`

## 파일 구조

**신규**

| 파일 | 책임 |
|---|---|
| `components/admin/admin-nav-access.ts` | 프리셋·접근 묶음 정의 + 순수 해석 함수. React 의존 없음 |
| `components/admin/settings/MemberNavAccessDrawer.tsx` | 슈퍼 관리자용 탭 권한 편집 드로어 |
| `lib/korea-holidays.ts` | 한국 공휴일을 캘린더 이벤트로 주입 |
| `supabase/migrations/20260729_admin_nav_access.sql` | `nav_preset` / `nav_overrides` 컬럼 |
| `tests/admin/nav-access.test.ts` | 해석 함수 단위 테스트 |
| `tests/admin/nav-access-ui.test.ts` | 사이드바·드로어 소스 계약 테스트 |

**수정**

| 파일 | 변경 |
|---|---|
| `components/admin/admin-nav.ts` | `category`·`maturity` 필드 추가, 공개 행사·트래픽 항목 제거 |
| `components/admin/AdminSidebar.tsx` | 섹션 헤더 → 상시/기타 2단 렌더 |
| `app/admin/layout.tsx` | profile select에 nav 컬럼 추가 → 사이드바로 전달 |
| `app/admin/page.tsx` | `/admin/overview` → `/admin/calendar` |
| `app/api/admin/users/route.ts` | PATCH에 `navPreset`/`navOverrides` 수용 |
| `lib/repositories/admin-users.ts` | 디렉터리 응답에 nav 필드 노출 |
| `components/admin/settings/MembersPanel.tsx` | 드로어 연결 |
| `app/admin/traffic/page.tsx` | redirect 스텁 |
| `app/admin/analytics/page.tsx` | 트래픽 탭 흡수 |
| `components/admin/BlogPostEditor.tsx` | AI 버튼 순서·에디터 배경 |
| `app/admin/calendar/page.tsx` | 공휴일·주간 스트립·리드 스트립 |

**⚠️ `section` 필드는 유지한다.** 커맨드 팔레트가 `ADMIN_NAV_SECTION_META[section].label`로 그룹을 만들고 `tests/admin/command-palette.test.ts`·`tests/admin/sidebar-docs-gaps.test.ts`가 이를 고정한다. 사이드바에서 **렌더만 멈추고** 필드는 남긴다.

---

# Phase A — 권한 기반

## Task 1: nav 항목에 category·maturity 필드 추가

**Files:**
- Modify: `components/admin/admin-nav.ts`
- Test: `tests/admin/nav-access.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/admin/nav-access.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"

// 기타 그룹은 3범주(고객·매출 / 마케팅·분석 / 시스템)로 묶인다 — 스펙 §4.2.
// 상시 후보 7개는 범주가 필요 없다(기타에 들어갈 때만 쓰인다).
describe("admin nav — 기타 범주 메타", () => {
  it("assigns a category to every tab that can be folded", () => {
    const expected: Record<string, string> = {
      "/admin/crm": "customer",
      "/admin/branch": "customer",
      "/admin/branch/ledger": "customer",
      "/admin/lead-magnets": "growth",
      "/admin/analytics": "growth",
      "/admin/campaigns/manage": "growth",
      "/admin/campaigns/projects": "growth",
      "/admin/overview": "system",
      "/admin/chatbot": "system",
      "/admin/ops": "system",
      "/admin/settings": "system",
      "/admin/dev": "system",
    }

    for (const [href, category] of Object.entries(expected)) {
      const item = ADMIN_NAV.find((entry) => entry.href === href)
      expect(item, href).toBeDefined()
      expect(item?.category, href).toBe(category)
    }
  })

  it("marks 매출 장부 as work-in-progress so the sidebar can grey it out", () => {
    const ledger = ADMIN_NAV.find((item) => item.href === "/admin/branch/ledger")
    expect(ledger?.maturity).toBe("wip")
  })

  it("drops 공개 행사 and 방문자/트래픽 — absorbed into 캘린더 and Analytics", () => {
    expect(ADMIN_NAV.some((item) => item.href === "/admin/events")).toBe(false)
    expect(ADMIN_NAV.some((item) => item.href === "/admin/traffic")).toBe(false)
  })

  it("keeps the absorbed surfaces reachable from ⌘K via the host tab keywords", () => {
    const calendar = ADMIN_NAV.find((item) => item.href === "/admin/calendar")
    expect(calendar?.keywords).toContain("행사")
    const analytics = ADMIN_NAV.find((item) => item.href === "/admin/analytics")
    expect(analytics?.keywords).toContain("방문자")
    expect(analytics?.keywords).toContain("트래픽")
  })

  // resolveNavAccess(Task 2)는 ADMIN_NAV 선언 순서를 그대로 상시 목록 순서로 쓴다.
  // 따라서 스펙 §4.1의 사이드바 순서는 이 배열 순서로만 표현된다 — 렌더에서 다시 정렬하지 않는다.
  it("declares the 7 primary candidates in sidebar order, 캘린더 first", () => {
    const primaryCandidates = [
      "/admin/calendar",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/campaigns",
      "/admin/blog",
      "/admin/cs-chatbot",
      "/admin/docs",
    ]
    const declared = ADMIN_NAV.map((item) => item.href).filter((href) =>
      primaryCandidates.includes(href)
    )
    expect(declared).toEqual(primaryCandidates)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/admin/nav-access.test.ts`
Expected: FAIL — `item?.category` is `undefined`

- [ ] **Step 3: `admin-nav.ts` 수정**

타입에 두 필드를 추가한다 (`AdminNavItem` 인터페이스, `keywords` 아래):

```ts
export type AdminNavCategory = "customer" | "growth" | "system"

export interface AdminNavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: AdminRole[]
  section: AdminNavSection
  badge?: string
  /** 커맨드 팔레트 검색어 — 공백 구분, 한/영 병기 */
  keywords?: string
  /**
   * "기타" 접힘 그룹에 들어갔을 때 묶이는 범주(스펙 §4.2).
   * 상시 후보 7개에는 없어도 된다 — 오버라이드로 기타에 내려갈 때만 "system" 폴백.
   */
  category?: AdminNavCategory
  /** 아직 다듬는 중인 화면 — 사이드바에서 회색 톤 + 뱃지로 렌더한다. */
  maturity?: "wip"
}

export const ADMIN_NAV_CATEGORY_META: Record<AdminNavCategory, { label: string }> = {
  customer: { label: "고객·매출" },
  growth: { label: "마케팅·분석" },
  system: { label: "시스템" },
}

export const ADMIN_NAV_CATEGORIES = Object.keys(ADMIN_NAV_CATEGORY_META) as AdminNavCategory[]
```

`ADMIN_NAV` 배열에서 아래 항목에 `category`를 붙인다 (기존 필드는 그대로):

```ts
{ href: "/admin/overview", ..., category: "system" },
{ href: "/admin/branch", ..., category: "customer" },
{ href: "/admin/branch/ledger", ..., category: "customer", maturity: "wip" },
{ href: "/admin/crm", ..., category: "customer" },
{ href: "/admin/campaigns/manage", ..., category: "growth" },
{ href: "/admin/campaigns/projects", ..., category: "growth" },
{ href: "/admin/lead-magnets", ..., category: "growth" },
{ href: "/admin/analytics", ..., category: "growth" },
{ href: "/admin/chatbot", ..., category: "system" },
{ href: "/admin/ops", ..., category: "system" },
{ href: "/admin/settings", ..., category: "system" },
{ href: "/admin/dev", ..., category: "system" },
```

`/admin/events`와 `/admin/traffic` 항목 **두 줄을 삭제**하고, 흡수 사실을 주석으로 남긴다:

```ts
// (2026-07-29 탭 재구성) 공개 행사(/admin/events)는 캘린더 항목으로 흡수됐다 —
// 캘린더는 이미 source: "event"로 공개 행사를 그리고 있어 화면 병합이 아니라 nav 항목만 내린 것이다.
// 방문자/트래픽(/admin/traffic)은 Analytics의 ?tab=traffic으로 흡수. 두 라우트 다 살아 있다.
```

흡수된 검색어를 숙주 항목의 `keywords`에 병합한다:

```ts
{ href: "/admin/calendar", label: "캘린더", ..., keywords: "캘린더 일정 calendar schedule 행사 이벤트 event 웨비나 공개 행사" },
{ href: "/admin/analytics", label: "Analytics", ..., keywords: "analytics 분석 통계 방문자 트래픽 traffic 추적 pixel 계측 홈페이지 흐름" },
```

- [ ] **Step 3b: 상시 후보 7개를 사이드바 순서로 재정렬**

`resolveNavAccess`(Task 2)는 **`ADMIN_NAV` 선언 순서를 그대로 상시 목록 순서로 쓴다.** 렌더 단계에서 다시 정렬하지 않으므로, 스펙 §4.1의 순서는 이 배열에서만 표현된다.

현재 배열은 `overview → branch → ledger → crm → quotes → hardware → calendar → …` 순이라 캘린더가 7번째다. 상시 후보 7개가 아래 순서로 **선언되도록** 항목을 옮긴다 (다른 항목의 상대 순서는 건드리지 않는다):

```
/admin/calendar    ← 첫 화면이므로 최상단
/admin/quotes
/admin/hardware
/admin/campaigns
/admin/blog
/admin/cs-chatbot
/admin/docs
```

실무적으로는 `/admin/calendar` 한 줄을 배열 맨 앞(구 `/admin/overview` 자리)으로 올리고, `cs` 블록에서 `/admin/cs-chatbot`을 `/admin/docs` **위로** 올리면 나머지는 이미 이 순서다. 옮기면서 `section` 값은 **바꾸지 않는다** — 커맨드 팔레트 그룹 라벨이 거기 묶여 있다.

옮긴 이유를 주석으로 남긴다:

```ts
// (2026-07-29 탭 재구성) 배열 순서 = 사이드바 상시 목록 순서다(resolveNavAccess가 선언 순서를 그대로 쓴다).
// 캘린더가 첫 화면이라 맨 앞으로 올렸다. section 필드는 팔레트 그룹 라벨용으로 그대로 둔다.
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/admin/nav-access.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 기존 nav 테스트 회귀 확인**

Run: `npx vitest run tests/admin`
Expected: `tests/admin/marketing-cross-links.test.tsx`가 실패할 수 있다 — `section === "marketing"` 목록에서 `/admin/events`·`/admin/traffic`이 빠졌기 때문. 실패하면 그 테스트의 기대 목록에서 두 href를 제거하고, 흡수됐다는 주석을 남긴다:

```ts
// /admin/events → 캘린더 흡수, /admin/traffic → Analytics 흡수 (2026-07-29 탭 재구성).
// 라우트는 살아 있고 nav 항목만 내려갔다.
```

- [ ] **Step 6: 커밋**

```bash
git add components/admin/admin-nav.ts tests/admin/nav-access.test.ts tests/admin/marketing-cross-links.test.tsx
git commit -m "feat(admin-nav): 기타 범주·성숙도 필드 추가 + 공개 행사·트래픽 항목 흡수"
```

---

## Task 2: 프리셋·접근 해석 모듈

**Files:**
- Create: `components/admin/admin-nav-access.ts`
- Test: `tests/admin/nav-access.test.ts` (Task 1 파일에 describe 블록 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/admin/nav-access.test.ts` 하단에 추가:

```ts
import {
  NAV_PRESETS,
  resolveNavAccess,
  resolveNavPlacement,
  type NavAccessContext,
} from "@/components/admin/admin-nav-access"

const ctx = (over: Partial<NavAccessContext> = {}): NavAccessContext => ({
  role: "ADMIN",
  preset: "staff",
  overrides: {},
  ...over,
})

describe("resolveNavPlacement", () => {
  it("falls back to legacy role behaviour when no preset is assigned", () => {
    // preset=null이면 오늘과 완전히 동일해야 한다 — 배포 시점 무변화(스펙 P4).
    expect(resolveNavPlacement("/admin/settings", ctx({ preset: null }))).toBe("primary")
    expect(resolveNavPlacement("/admin/crm", ctx({ preset: null }))).toBe("primary")
  })

  it("denies MOON_ONLY tabs for every non-super preset", () => {
    for (const preset of ["staff", "sales", "marketing", "cs", "lead", "branch"] as const) {
      expect(resolveNavPlacement("/admin/settings", ctx({ preset })), preset).toBe("deny")
      expect(resolveNavPlacement("/admin/overview", ctx({ preset })), preset).toBe("deny")
      expect(resolveNavPlacement("/admin/chatbot", ctx({ preset })), preset).toBe("deny")
    }
  })

  it("restricts 매출 장부 to lead/branch and Analytics to lead", () => {
    expect(resolveNavPlacement("/admin/branch/ledger", ctx({ preset: "lead" }))).toBe("folded")
    expect(resolveNavPlacement("/admin/branch/ledger", ctx({ preset: "marketing" }))).toBe("deny")
    expect(resolveNavPlacement("/admin/analytics", ctx({ preset: "lead" }))).toBe("folded")
    expect(resolveNavPlacement("/admin/analytics", ctx({ preset: "branch" }))).toBe("deny")
  })

  it("folds every OPEN tab the preset did not promote", () => {
    expect(resolveNavPlacement("/admin/calendar", ctx({ preset: "cs" }))).toBe("primary")
    expect(resolveNavPlacement("/admin/hardware", ctx({ preset: "cs" }))).toBe("folded")
  })

  it("lets an override promote, demote, or grant access", () => {
    const granted = ctx({ preset: "marketing", overrides: { "/admin/branch/ledger": "folded" } })
    expect(resolveNavPlacement("/admin/branch/ledger", granted)).toBe("folded")

    const promoted = ctx({ preset: "cs", overrides: { "/admin/hardware": "primary" } })
    expect(resolveNavPlacement("/admin/hardware", promoted)).toBe("primary")

    const revoked = ctx({ preset: "lead", overrides: { "/admin/analytics": "deny" } })
    expect(resolveNavPlacement("/admin/analytics", revoked)).toBe("deny")
  })

  it("always gives SUPER_ADMIN everything regardless of preset or override", () => {
    const locked = ctx({ role: "SUPER_ADMIN", preset: "staff", overrides: { "/admin/settings": "deny" } })
    expect(resolveNavPlacement("/admin/settings", locked)).toBe("primary")
  })
})

describe("resolveNavAccess", () => {
  it("splits the cs preset into 4 primary items and folds the rest", () => {
    const { primary, folded } = resolveNavAccess(ctx({ preset: "cs" }))
    expect(primary.map((item) => item.href)).toEqual([
      "/admin/calendar",
      "/admin/quotes",
      "/admin/cs-chatbot",
      "/admin/docs",
    ])
    const foldedHrefs = folded.flatMap((group) => group.items.map((item) => item.href))
    expect(foldedHrefs).toContain("/admin/crm")
    expect(foldedHrefs).not.toContain("/admin/settings")
    expect(foldedHrefs).not.toContain("/admin/branch/ledger")
  })

  it("orders folded groups 고객·매출 → 마케팅·분석 → 시스템 and drops empty ones", () => {
    const { folded } = resolveNavAccess(ctx({ preset: "cs" }))
    expect(folded.map((group) => group.category)).toEqual(["customer", "growth"])
    expect(folded.every((group) => group.items.length > 0)).toBe(true)
  })

  it("gives super 7 primary and 12 folded", () => {
    const { primary, folded } = resolveNavAccess(ctx({ role: "SUPER_ADMIN", preset: "super" }))
    expect(primary).toHaveLength(7)
    expect(folded.flatMap((group) => group.items)).toHaveLength(12)
  })

  it("declares a primary set for every preset key", () => {
    for (const key of Object.keys(NAV_PRESETS)) {
      expect(NAV_PRESETS[key as keyof typeof NAV_PRESETS].primary.length, key).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/admin/nav-access.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/admin/admin-nav-access"`

- [ ] **Step 3: 모듈 구현**

`components/admin/admin-nav-access.ts` 생성:

```ts
// 어드민 사이드바 접근·배치 SSOT — 스펙 docs/active/admin-tab-restructure-2026-07-29.md §5.
// 순수 데이터/함수만 둔다(React·브라우저 API 없음). 사이드바·커맨드 팔레트·권한 설정
// 미리보기가 전부 이 모듈의 resolveNavAccess를 호출해야 세 화면이 어긋나지 않는다.
import { ADMIN_NAV, ADMIN_NAV_CATEGORIES, type AdminNavCategory, type AdminNavItem } from "./admin-nav"

export type NavPlacement = "primary" | "folded" | "deny"
export type NavPresetKey = "staff" | "sales" | "marketing" | "cs" | "lead" | "branch" | "super"

/** 문준혁(SUPER_ADMIN) 전용 — 다른 어떤 프리셋에도 열리지 않는다(오버라이드로만 예외 부여). */
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
  /** 상시 노출 href. 나머지 접근 가능 항목은 자동으로 folded. */
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
      "/admin/cs-chatbot",
      "/admin/docs",
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
  /** normalizeAdminRole을 통과한 값. SUPER_ADMIN이면 모든 제한을 무시한다. */
  role: string
  /** null이면 레거시(roles 기반) 동작으로 폴백한다. */
  preset: NavPresetKey | null
  overrides: Record<string, NavPlacement>
}

export function resolveNavPlacement(href: string, ctx: NavAccessContext): NavPlacement {
  // 1) 슈퍼 관리자는 항상 전부 — 자기 설정 화면을 잠가버리는 복구 불가 상태를 막는다.
  if (ctx.role === "SUPER_ADMIN") return "primary"

  // 2) 프리셋 미배정 = 오늘과 동일. 롤 필터는 호출부(사이드바)가 이미 걸고 있으므로 primary.
  if (!ctx.preset) return "primary"

  // 3) 사람별 예외가 최우선 — 차단 묶음도 뚫는다(슈퍼 관리자만 지정 가능, API가 가드).
  const override = ctx.overrides[href]
  if (override) return override

  // 4) 문 전용 묶음.
  if (MOON_ONLY_HREFS.includes(href)) return "deny"

  // 5) 화이트리스트 묶음.
  const allowed = RESTRICTED_HREFS[href]
  if (allowed) return allowed.includes(ctx.preset) ? "folded" : "deny"

  // 6) 나머지는 전부 접근 가능. 프리셋이 올린 것만 상시.
  return NAV_PRESETS[ctx.preset].primary.includes(href) ? "primary" : "folded"
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
 * 상시 순서는 ADMIN_NAV 선언 순서를 따르고, 기타는 범주 선언 순서(고객·매출→마케팅·분석→시스템)로 묶는다.
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/admin/nav-access.test.ts`
Expected: PASS (13 tests)

`resolveNavAccess`의 `super` 케이스가 7/12로 안 떨어지면 `ADMIN_NAV` 항목 수를 센다 — Task 1에서 2개를 지웠으니 19개여야 한다:

```bash
node -e "const s=require('fs').readFileSync('components/admin/admin-nav.ts','utf8');console.log((s.match(/\{ href: \"\/admin/g)||[]).length)"
```
Expected: `19`

- [ ] **Step 5: 커밋**

```bash
git add components/admin/admin-nav-access.ts tests/admin/nav-access.test.ts
git commit -m "feat(admin-nav): 프리셋 7종 + 사람별 예외 해석 모듈"
```

---

## Task 3: 마이그레이션 — nav_preset / nav_overrides

**Files:**
- Create: `supabase/migrations/20260729_admin_nav_access.sql`
- Modify: `lib/supabase/database.types.ts`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 어드민 사이드바 접근·배치 저장소.
-- 스펙: docs/active/admin-tab-restructure-2026-07-29.md §5.1
--
-- 기존 capabilities(TEXT[])와 섞지 않는다 — capabilities는 hardware.finalize 같은 *동작* 권한이고
-- nav_*는 *표면 배치* 축이다. 한 배열에 넣으면 둘 다 읽기 어려워진다.
--
-- nav_preset이 NULL이면 애플리케이션이 기존 ADMIN_NAV[].roles 동작으로 폴백한다.
-- 따라서 이 마이그레이션만 적용해도 화면은 하나도 바뀌지 않는다(배포 안전).

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS nav_preset TEXT,
  ADD COLUMN IF NOT EXISTS nav_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.admin_profiles
  DROP CONSTRAINT IF EXISTS admin_profiles_nav_preset_check;

ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_nav_preset_check
  CHECK (nav_preset IS NULL OR nav_preset IN ('staff','sales','marketing','cs','lead','branch','super'));

-- nav_overrides는 {"<href>": "primary|folded|deny"} 평면 객체만 허용한다.
ALTER TABLE public.admin_profiles
  DROP CONSTRAINT IF EXISTS admin_profiles_nav_overrides_check;

ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_nav_overrides_check
  CHECK (jsonb_typeof(nav_overrides) = 'object');

COMMENT ON COLUMN public.admin_profiles.nav_preset IS
  '어드민 사이드바 프리셋 키. NULL이면 기존 role 기반 동작(무변화). docs/active/admin-tab-restructure-2026-07-29.md §5.2';
COMMENT ON COLUMN public.admin_profiles.nav_overrides IS
  '프리셋 대비 사람별 예외. {"/admin/crm":"primary"} 형태. 키=nav href, 값=primary|folded|deny.';
```

- [ ] **Step 2: 타입 추가**

`lib/supabase/database.types.ts`의 `AdminProfile`에 두 필드를 추가한다 (`capabilities` 옆):

```ts
  nav_preset: string | null;
  nav_overrides: Record<string, string>;
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260729_admin_nav_access.sql lib/supabase/database.types.ts
git commit -m "feat(db): admin_profiles nav_preset/nav_overrides 컬럼"
```

- [ ] **Step 5: 프로덕션 적용은 별도**

이 저장소는 마이그레이션이 자동 적용되지 않는다. Supabase Management API로 수동 실행해야 한다 (메모리: "Mgmt API SQL프로브=curl만"). 적용 전까지 앱은 컬럼 부재를 견뎌야 하므로 **Task 4에서 select 실패 시 폴백**을 넣는다.

---

# Phase B — 사이드바 재구성

## Task 4: 세션에 nav 접근 정보 싣기

**Files:**
- Modify: `app/admin/layout.tsx:135-160`

- [ ] **Step 1: profile select 확장**

`app/admin/layout.tsx`에서 `admin_profiles` 조회를 두 단계로 만든다. 컬럼이 아직 없는 환경(마이그레이션 미적용)에서도 로그인이 깨지면 안 된다:

```ts
      // nav_preset/nav_overrides는 20260729 마이그레이션 이후에만 존재한다.
      // 미적용 환경에서 select가 통째로 실패해 로그인이 막히는 걸 막으려고 확장 select를
      // 먼저 시도하고, 실패하면 기존 3컬럼으로 폴백한다(= preset 없음 = 오늘과 동일한 동작).
      const extended = await supabase
        .from("admin_profiles")
        .select("display_name, role, status, nav_preset, nav_overrides")
        .eq("user_id", user.id)
        .single()

      const { data: profile } = extended.error
        ? await supabase
            .from("admin_profiles")
            .select("display_name, role, status")
            .eq("user_id", user.id)
            .single()
        : extended
```

- [ ] **Step 2: sessionStorage에 저장 + state 확장**

`SessionInfo` 인터페이스와 `readCachedSession`을 확장한다:

```ts
interface SessionInfo {
  role: string
  name: string
  email: string
  navPreset: string | null
  navOverrides: Record<string, string>
}
```

```ts
function readCachedSession(): SessionInfo | null {
  if (typeof window === "undefined") return null

  const role = sessionStorage.getItem("admin_role")
  const name = sessionStorage.getItem("admin_name")
  const email = sessionStorage.getItem("admin_email") ?? ""

  if (!role || !name) return null

  const navPreset = sessionStorage.getItem("admin_nav_preset")
  let navOverrides: Record<string, string> = {}
  try {
    navOverrides = JSON.parse(sessionStorage.getItem("admin_nav_overrides") ?? "{}")
  } catch {
    navOverrides = {}
  }

  return { role, name, email, navPreset: navPreset || null, navOverrides }
}
```

Supabase 분기의 저장 블록에 두 줄을 추가한다:

```ts
        sessionStorage.setItem("admin_nav_preset", (profile as { nav_preset?: string | null }).nav_preset ?? "")
        sessionStorage.setItem(
          "admin_nav_overrides",
          JSON.stringify((profile as { nav_overrides?: unknown }).nav_overrides ?? {})
        )
```

그리고 `setSession({...})` 호출에 `navPreset` / `navOverrides`를 함께 넣는다. **dev 바이패스·legacy 분기의 `setSession`에도** `navPreset: null, navOverrides: {}`를 추가한다 (타입 에러로 바로 드러난다).

- [ ] **Step 3: 사이드바로 전달**

```tsx
        <AdminSidebar
          role={session.role}
          name={session.name}
          email={session.email}
          navPreset={session.navPreset}
          navOverrides={session.navOverrides}
        />
```

- [ ] **Step 4: 로그아웃 시 정리**

`lib/admin-client.ts`의 `clearAdminSessionStorage`가 지우는 키 목록에 두 키를 추가한다. 목록을 확인:

```bash
grep -n "removeItem\|admin_role" lib/admin-client.ts | head -20
```

새 키가 빠져 있으면 추가한다 — 계정 전환 시 이전 사람의 프리셋이 남으면 잘못된 사이드바가 잠깐 보인다.

- [ ] **Step 5: 타입체크**

Run: `npm run typecheck`
Expected: PASS (`AdminSidebar` props에 아직 두 필드가 없으므로 **FAIL이 정상** — Task 5에서 받는다. 이 스텝은 에러 메시지가 `navPreset`/`navOverrides` 두 개뿐인지 확인하는 용도다.)

- [ ] **Step 6: 커밋 보류**

Task 5와 함께 커밋한다 (단독으로는 타입이 안 맞는다).

---

## Task 5: 사이드바 렌더 재구성

> ⚠️ 시작 전 "사전 확인"의 워크트리 충돌 항목을 다시 본다. 이 파일은 다른 세션이 만지고 있었다.

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`
- Test: `tests/admin/nav-access-ui.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/admin/nav-access-ui.test.ts` 생성. 이 저장소의 UI 테스트는 소스 문자열 계약 방식이다 (`members-capability-ui.test.ts` 참조):

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const sidebar = readFileSync(join(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8")

describe("AdminSidebar — 상시/기타 2단 구조", () => {
  it("resolves placement through the shared access module, not a local copy", () => {
    expect(sidebar).toContain('from "./admin-nav-access"')
    expect(sidebar).toContain("resolveNavAccess(")
  })

  it("stops rendering section headers (기타 범주 소제목이 대신한다)", () => {
    expect(sidebar).not.toContain("ADMIN_NAV_SECTION_META[section].label")
  })

  it("remembers the 기타 open state across reloads", () => {
    expect(sidebar).toContain("admin_sidebar_other_open")
  })

  it("greys out work-in-progress tabs", () => {
    expect(sidebar).toContain('maturity === "wip"')
    expect(sidebar).toContain("다듬는 중")
  })

  it("keeps the mobile bottom bar aligned with the new IA", () => {
    // 구 IA(Overview·CRM·캘린더·입력함) → 캘린더·견적·문서·CRM·More
    expect(sidebar).toContain('href: "/admin/calendar"')
    expect(sidebar).toContain('href: "/admin/quotes"')
    expect(sidebar).not.toContain('href: "/admin/overview",\n    label: "Overview"')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/admin/nav-access-ui.test.ts`
Expected: FAIL (5 tests)

- [ ] **Step 3: props·계산 배선**

`Props` 인터페이스와 `AdminSidebarContent` 시그니처를 확장한다:

```tsx
interface Props {
  role: string
  name: string
  email: string
  navPreset: string | null
  navOverrides: Record<string, string>
}
```

임포트에 추가:

```tsx
import { ADMIN_NAV_CATEGORY_META } from "./admin-nav"
import {
  isNavPresetKey,
  normalizeNavOverrides,
  resolveNavAccess,
} from "./admin-nav-access"
```

기존 `groupedNav` 계산을 **대체**한다 (`visibleNav`는 롤 필터로 그대로 두고, 그 위에 배치 계산을 얹는다):

```tsx
  const navAccess = useMemo(() => {
    const preset = isNavPresetKey(navPreset) ? navPreset : null
    return resolveNavAccess(
      { role: normalizedRole, preset, overrides: normalizeNavOverrides(navOverrides) },
      visibleNav
    )
  }, [normalizedRole, navPreset, navOverrides, visibleNav])
```

`groupedNav`를 참조하던 자리(데스크톱 `nav`, 모바일 드로어 `nav`)를 `navAccess.primary` + `navAccess.folded`로 바꾼다.

- [ ] **Step 4: 기타 접힘 상태**

```tsx
  const [otherOpen, setOtherOpen] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("admin_sidebar_other_open") === "true"
  })

  const toggleOther = () => {
    setOtherOpen((prev) => {
      localStorage.setItem("admin_sidebar_other_open", String(!prev))
      return !prev
    })
  }
```

- [ ] **Step 5: 렌더 구현**

상시 항목은 기존 `items.map` 렌더를 그대로 쓰되 섹션 래퍼를 없앤다. 그 아래에 기타 블록을 넣는다:

```tsx
{navAccess.folded.length > 0 && (
  <div className="mt-5 border-t border-[#f0f0ec] pt-4">
    <button
      type="button"
      onClick={toggleOther}
      aria-expanded={otherOpen}
      className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
    >
      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${otherOpen ? "rotate-90" : ""}`} />
      {!effectiveCollapsed && (
        <>
          <span className="flex-1 text-left">기타</span>
          <span className="tabular-nums text-[#1a1a1a]/30">
            {navAccess.folded.reduce((sum, group) => sum + group.items.length, 0)}
          </span>
        </>
      )}
    </button>

    {otherOpen && !effectiveCollapsed && (
      <div className="mt-1 space-y-3">
        {navAccess.folded.map(({ category, items }) => (
          <div key={category}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/28">
              {ADMIN_NAV_CATEGORY_META[category].label}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = isNavActive(item.href)
                const isWip = item.maturity === "wip"
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onFocus={() => warmAdminTab(item.href)}
                    onMouseEnter={() => scheduleWarmAdminTab(item.href)}
                    onMouseLeave={cancelWarmAdminTab}
                    onPointerDown={() => warmAdminTab(item.href)}
                    onClick={() => warmAdminTab(item.href)}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-[#111110] text-white"
                        : isWip
                          ? "text-[#1a1a1a]/35 hover:bg-[#f5f5f2] hover:text-[#1a1a1a]/60"
                          : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                    }`}
                  >
                    <span className={isActive ? "text-white" : "text-[#1a1a1a]/30"}>
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {isWip && !isActive && (
                      <span className="rounded bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-normal text-[#1a1a1a]/40">
                        다듬는 중
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

모바일 드로어에도 같은 구조를 넣는다 (`min-h-11` 터치 타깃 유지).

- [ ] **Step 6: 모바일 하단 탭 갱신**

`MOBILE_PRIMARY_NAV`를 새 IA로 교체한다:

```tsx
// 현장 사용 빈도 기준 — 2026-07-29 탭 재구성으로 첫 화면이 캘린더가 되면서 Overview를 내렸다.
// 나머지는 More의 전체 메뉴에서 접근한다.
const MOBILE_PRIMARY_NAV: AdminNavItem[] = [
  {
    href: "/admin/calendar",
    label: "캘린더",
    icon: CalendarDays,
    roles: ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER", "BRANCH"],
    section: "sales",
  },
  {
    href: "/admin/quotes",
    label: "견적",
    icon: FileText,
    roles: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
    section: "sales",
  },
  {
    href: "/admin/crm",
    label: "CRM",
    icon: Users,
    roles: ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER", "BRANCH"],
    section: "sales",
  },
]
```

임포트에서 `LayoutDashboard`·`ClipboardPaste`를 빼고 `FileText`를 넣는다 (eslint `no-unused-vars`가 잡는다).

- [ ] **Step 7: 테스트·게이트 통과 확인**

```bash
npx vitest run tests/admin
npm run typecheck
npx eslint app components lib --max-warnings=0
```
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add app/admin/layout.tsx components/admin/AdminSidebar.tsx lib/admin-client.ts tests/admin/nav-access-ui.test.ts
git commit -m "feat(admin): 사이드바 상시/기타 2단 구조 + 프리셋 배선"
```

---

## Task 6: 첫 화면 전환 + 차단 탭 라우트 가드

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/layout.tsx`
- Test: `tests/admin/nav-access-ui.test.ts` (describe 추가)

- [ ] **Step 1: redirect 변경**

```tsx
import { redirect } from "next/navigation"

// 2026-07-29 탭 재구성 — 첫 화면이 Overview에서 캘린더로 바뀌었다.
// 사람별 분기는 하지 않는다: 이 파일은 세션을 모르는 서버 컴포넌트고,
// 분기를 넣으려면 리다이렉트 전에 세션 조회가 들어가 첫 진입이 느려진다.
// Overview는 사이드바 "기타 › 시스템"에서 접근한다(SUPER_ADMIN 전용).
export default function AdminRootPage() {
  redirect("/admin/calendar")
}
```

- [ ] **Step 2: 가드 테스트 작성**

`tests/admin/nav-access-ui.test.ts`에 추가:

```ts
const layout = readFileSync(join(process.cwd(), "app/admin/layout.tsx"), "utf8")

describe("AdminLayout — 차단 탭 라우트 가드", () => {
  it("blocks rendering when the current path resolves to deny", () => {
    expect(layout).toContain("resolveNavPlacement(")
    expect(layout).toContain('=== "deny"')
  })

  it("explains the block instead of silently redirecting", () => {
    // 조용한 리다이렉트는 "왜 튕겼지"를 남긴다 — 문구로 알린다.
    expect(layout).toContain("접근 권한이 없습니다")
  })

  it("states plainly that this is a surface guard, not a security boundary", () => {
    expect(layout).toContain("보안 경계가 아니다")
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/admin/nav-access-ui.test.ts -t "라우트 가드"`
Expected: FAIL (3 tests)

- [ ] **Step 4: 가드 구현**

`app/admin/layout.tsx`에 임포트를 추가한다:

```tsx
import { normalizeAdminRole } from "@/components/admin/admin-nav"
import {
  isNavPresetKey,
  normalizeNavOverrides,
  resolveNavPlacement,
} from "@/components/admin/admin-nav-access"
```

`session`이 확정된 뒤, `children`을 그리기 전에 판정한다:

```tsx
  // 차단된 탭에 URL을 직접 쳐서 들어온 경우를 막는다.
  //
  // ⚠️ 이것은 업무 표면 가드이지 보안 경계가 아니다. 이 레이아웃은 클라이언트 컴포넌트라
  // 우회 가능하고, 이 저장소에는 middleware도 없다. 실제 데이터 차단은 각 API의
  // requireVerifiedAdminContext 롤 목록이 담당한다(스펙 §5.5).
  const blocked = (() => {
    if (!session || isLoginPage) return false
    const preset = isNavPresetKey(session.navPreset) ? session.navPreset : null
    if (!preset) return false

    // 하위 경로(/admin/crm/customers/...)도 상위 탭의 판정을 따른다.
    const target = ADMIN_NAV.map((item) => item.href.split("?")[0])
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0]
    if (!target) return false

    return (
      resolveNavPlacement(target, {
        role: normalizeAdminRole(session.role),
        preset,
        overrides: normalizeNavOverrides(session.navOverrides),
      }) === "deny"
    )
  })()
```

`children` 자리에 분기를 넣는다:

```tsx
{blocked ? (
  <div className="flex min-h-[60vh] items-center justify-center px-6">
    <div className="max-w-sm text-center">
      <p className="text-[15px] font-semibold text-[#111110]">접근 권한이 없습니다</p>
      <p className="mt-1 text-[13px] text-[#1a1a1a]/45">
        이 화면은 현재 계정에 배정되지 않았습니다. 필요하면 최고 관리자에게 요청하세요.
      </p>
      <Link
        href="/admin/calendar"
        className="mt-4 inline-block rounded-lg bg-[#111110] px-4 py-2 text-[13px] font-medium text-white"
      >
        캘린더로 이동
      </Link>
    </div>
  </div>
) : (
  children
)}
```

`ADMIN_NAV`와 `Link` 임포트를 추가한다.

- [ ] **Step 5: 확인**

```bash
npx vitest run tests/admin
npm run typecheck
npm run build
```
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/admin/page.tsx app/admin/layout.tsx tests/admin/nav-access-ui.test.ts
git commit -m "feat(admin): 첫 화면 캘린더 전환 + 차단 탭 라우트 가드"
```

---

# Phase C — 권한 설정 UI

## Task 7: PATCH API 확장

**Files:**
- Modify: `app/api/admin/users/route.ts:27-63`
- Modify: `lib/repositories/admin-users.ts:60-120`
- Test: `tests/admin/nav-access.test.ts` (describe 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/admin/nav-access.test.ts` 하단에 추가:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("PATCH /api/admin/users — nav access 계약", () => {
  const route = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8")

  it("stays SUPER_ADMIN-only", () => {
    expect(route).toContain('requireVerifiedAdminContext(req, ["SUPER_ADMIN"])')
  })

  it("accepts navPreset and navOverrides alongside capabilities", () => {
    expect(route).toContain("navPreset")
    expect(route).toContain("navOverrides")
    expect(route).toContain("isNavPresetKey")
    expect(route).toContain("normalizeNavOverrides")
  })

  it("audits nav access changes separately from capability changes", () => {
    expect(route).toContain('action: "admin.nav_access.update"')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/admin/nav-access.test.ts -t "nav access 계약"`
Expected: FAIL

- [ ] **Step 3: PATCH 핸들러 확장**

`app/api/admin/users/route.ts` — 임포트 추가:

```ts
import { isNavPresetKey, normalizeNavOverrides } from "@/components/admin/admin-nav-access"
```

PATCH 본문을 두 갈래로 나눈다. 기존 capabilities 경로는 건드리지 않는다 (`members-capability-ui.test.ts`가 그 계약을 고정하고 있다):

```ts
export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, ["SUPER_ADMIN"])
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  // nav 배치 갱신 — capabilities와 별개 축이라 별도 분기·별도 감사 로그를 쓴다.
  if ("navPreset" in (body ?? {}) || "navOverrides" in (body ?? {})) {
    const rawPreset = body?.navPreset
    if (rawPreset != null && !isNavPresetKey(rawPreset)) {
      return NextResponse.json({ error: "Unknown navPreset" }, { status: 400 })
    }

    const navPreset = (rawPreset ?? null) as string | null
    const navOverrides = normalizeNavOverrides(body?.navOverrides)

    const { data, error } = await supabase
      .from("admin_profiles")
      .update({ nav_preset: navPreset, nav_overrides: navOverrides })
      .eq("user_id", userId)
      .select("user_id, display_name, role, status, nav_preset, nav_overrides")
      .single()

    if (error || !data) {
      console.error("[PATCH /api/admin/users nav]", error)
      return NextResponse.json({ error: "Failed to update admin nav access" }, { status: 500 })
    }

    await logAdminAudit({
      admin,
      action: "admin.nav_access.update",
      targetType: "admin_profile",
      targetId: userId,
      payload: { navPreset, navOverrides },
    })

    return NextResponse.json({ user: data })
  }

  const capabilities = normalizeAdminCapabilities(body?.capabilities)
  if (!capabilities) {
    return NextResponse.json(
      { error: "userId and a valid capabilities array are required" },
      { status: 400 }
    )
  }

  // ...기존 capabilities 업데이트 블록 그대로...
}
```

- [ ] **Step 4: 디렉터리 응답에 nav 필드 노출**

`lib/repositories/admin-users.ts`:

`ExtendedAdminProfile`의 `Pick` 목록에 `"nav_preset" | "nav_overrides"`를 추가하고, `AdminCrmOwnerOption`에:

```ts
  navPreset?: string | null
  navOverrides?: Record<string, string>
```

`toCrmOwnerOption`의 반환에:

```ts
    navPreset: extended.nav_preset ?? null,
    navOverrides: (extended.nav_overrides as Record<string, string> | undefined) ?? {},
```

`line 205`의 select 문자열 끝에 `, nav_preset, nav_overrides`를 추가한다.

> **주의:** 이 select는 마이그레이션 적용 전에 실패한다. `listAdminUserDirectory`가 이미 try/catch로 env 폴백을 갖고 있는지 확인하고, 없으면 Task 3의 폴백 패턴(확장 select 실패 시 기본 select 재시도)을 여기에도 넣는다.

- [ ] **Step 5: 테스트·타입체크**

```bash
npx vitest run tests/admin
npm run typecheck
```
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/api/admin/users/route.ts lib/repositories/admin-users.ts tests/admin/nav-access.test.ts
git commit -m "feat(admin-api): nav_preset/nav_overrides PATCH 계약 + 감사 로그"
```

---

## Task 8: 권한 설정 드로어

**Files:**
- Create: `components/admin/settings/MemberNavAccessDrawer.tsx`
- Modify: `components/admin/settings/MembersPanel.tsx`
- Test: `tests/admin/nav-access-ui.test.ts` (describe 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/admin/nav-access-ui.test.ts` 하단에 추가:

```ts
const drawer = readFileSync(
  join(process.cwd(), "components/admin/settings/MemberNavAccessDrawer.tsx"),
  "utf8"
)

describe("MemberNavAccessDrawer", () => {
  it("previews with the shared resolver instead of a second implementation", () => {
    expect(drawer).toContain("resolveNavAccess(")
    expect(drawer).toContain('from "@/components/admin/admin-nav-access"')
  })

  it("locks every row when the target is a SUPER_ADMIN", () => {
    expect(drawer).toContain('targetRole === "SUPER_ADMIN"')
  })

  it("marks rows that differ from the preset as 예외", () => {
    expect(drawer).toContain("예외")
  })

  it("persists through the users PATCH contract", () => {
    expect(drawer).toContain('method: "PATCH"')
    expect(drawer).toContain("navPreset")
    expect(drawer).toContain("navOverrides")
  })

  it("renders explicit saving, saved, and error states", () => {
    expect(drawer).toContain('"saving"')
    expect(drawer).toContain('"saved"')
    expect(drawer).toContain('role="alert"')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/admin/nav-access-ui.test.ts`
Expected: FAIL — 파일 없음(ENOENT)

- [ ] **Step 3: 드로어 구현**

`components/admin/settings/MemberNavAccessDrawer.tsx` 생성:

```tsx
"use client"

// 슈퍼 관리자 전용 탭 권한 편집기 — 스펙 §5.4.
// 미리보기는 반드시 admin-nav-access의 resolveNavAccess를 쓴다. 여기서 배치를 다시 계산하면
// 실제 사이드바와 어긋나고, 어긋난 미리보기는 이 기능 전체의 신뢰를 깎는다.
import { useMemo, useState } from "react"

import { ADMIN_NAV, ADMIN_NAV_CATEGORY_META } from "@/components/admin/admin-nav"
import {
  NAV_PRESETS,
  isNavPresetKey,
  normalizeNavOverrides,
  resolveNavAccess,
  resolveNavPlacement,
  type NavPlacement,
  type NavPresetKey,
} from "@/components/admin/admin-nav-access"
import { adminFetchJson } from "@/lib/admin-client"

const PLACEMENTS: Array<{ value: NavPlacement; label: string }> = [
  { value: "primary", label: "상시" },
  { value: "folded", label: "기타" },
  { value: "deny", label: "차단" },
]

type SaveState = { status: "idle" | "saving" | "saved" } | { status: "error"; message: string }

interface Props {
  userId: string
  displayName: string
  targetRole: string
  initialPreset: string | null
  initialOverrides: Record<string, string>
  onClose: () => void
  onSaved: (preset: string | null, overrides: Record<string, NavPlacement>) => void
}

export default function MemberNavAccessDrawer({
  userId,
  displayName,
  targetRole,
  initialPreset,
  initialOverrides,
  onClose,
  onSaved,
}: Props) {
  const locked = targetRole === "SUPER_ADMIN"
  const [preset, setPreset] = useState<NavPresetKey | null>(
    isNavPresetKey(initialPreset) ? initialPreset : null
  )
  const [overrides, setOverrides] = useState<Record<string, NavPlacement>>(() =>
    normalizeNavOverrides(initialOverrides)
  )
  const [save, setSave] = useState<SaveState>({ status: "idle" })

  const ctx = useMemo(
    () => ({ role: targetRole, preset, overrides }),
    [targetRole, preset, overrides]
  )
  const preview = useMemo(() => resolveNavAccess(ctx), [ctx])

  // 프리셋만 적용했을 때의 배치 — "예외" 뱃지 판정 기준.
  const presetOnly = useMemo(
    () => ({ role: targetRole, preset, overrides: {} }),
    [targetRole, preset]
  )

  const setPlacement = (href: string, next: NavPlacement) => {
    const base = resolveNavPlacement(href, presetOnly)
    setOverrides((prev) => {
      const draft = { ...prev }
      if (next === base) delete draft[href]
      else draft[href] = next
      return draft
    })
  }

  const exceptionCount = Object.keys(overrides).length

  const handleSave = async () => {
    setSave({ status: "saving" })
    try {
      await adminFetchJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, navPreset: preset, navOverrides: overrides }),
      })
      setSave({ status: "saved" })
      onSaved(preset, overrides)
    } catch (error) {
      setSave({
        status: "error",
        message: error instanceof Error ? error.message : "저장에 실패했습니다.",
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-[#111110]/35" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} 탭 권한`}
        className="relative flex w-[min(92vw,520px)] flex-col border-l border-[#e8e8e4] bg-white shadow-2xl"
      >
        <header className="border-b border-[#e8e8e4] px-5 py-4">
          <p className="text-[15px] font-semibold text-[#111110]">{displayName}</p>
          <p className="text-[12px] text-[#1a1a1a]/45">
            {locked ? "최고 관리자는 항상 전체 메뉴를 봅니다" : `예외 ${exceptionCount}개`}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="mb-4 block">
            <span className="mb-1 block text-[12px] font-medium text-[#111110]">프리셋</span>
            <select
              disabled={locked}
              value={preset ?? ""}
              onChange={(event) =>
                setPreset(isNavPresetKey(event.target.value) ? event.target.value : null)
              }
              className="w-full rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] disabled:opacity-40"
            >
              <option value="">미배정 (기존 동작 유지)</option>
              {Object.entries(NAV_PRESETS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-0.5">
            {ADMIN_NAV.map((item) => {
              const current = resolveNavPlacement(item.href, ctx)
              const isException = Object.prototype.hasOwnProperty.call(overrides, item.href)
              return (
                <div key={item.href} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                  <span className="flex-1 truncate text-[13px] text-[#111110]">{item.label}</span>
                  {isException && (
                    <span className="rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] text-[#084734]">
                      예외
                    </span>
                  )}
                  <div className="flex overflow-hidden rounded-md border border-[#e8e8e4]">
                    {PLACEMENTS.map((placement) => (
                      <button
                        key={placement.value}
                        type="button"
                        disabled={locked}
                        onClick={() => setPlacement(item.href, placement.value)}
                        className={`px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                          current === placement.value
                            ? "bg-[#111110] text-white"
                            : "bg-white text-[#1a1a1a]/50 hover:bg-[#f5f5f2]"
                        }`}
                      >
                        {placement.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
            <p className="mb-2 text-[11px] font-semibold text-[#1a1a1a]/45">
              {displayName} 님이 보게 될 사이드바
            </p>
            <ul className="space-y-1 text-[13px] text-[#111110]">
              {preview.primary.map((item) => (
                <li key={item.href}>{item.label}</li>
              ))}
            </ul>
            {preview.folded.length > 0 && (
              <p className="mt-2 text-[12px] text-[#1a1a1a]/45">
                ▸ 기타 {preview.folded.reduce((sum, group) => sum + group.items.length, 0)} (
                {preview.folded.map((group) => ADMIN_NAV_CATEGORY_META[group.category].label).join(" · ")})
              </p>
            )}
          </div>
        </div>

        <footer className="border-t border-[#e8e8e4] px-5 py-3">
          {save.status === "error" && (
            <p role="alert" className="mb-2 text-[12px] text-[#B85C33]">
              {save.message}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            {save.status === "saved" && (
              <span className="mr-auto text-[12px] text-[#084734]">저장됨</span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#e8e8e4] px-3 py-2 text-[13px] text-[#1a1a1a]/60"
            >
              닫기
            </button>
            <button
              type="button"
              disabled={locked || save.status === "saving"}
              onClick={handleSave}
              className="rounded-lg bg-[#111110] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {save.status === "saving" ? "저장 중..." : "저장"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: MembersPanel에 연결**

`components/admin/settings/MembersPanel.tsx`에서 각 회원 행에 "탭 권한" 버튼을 추가하고, 클릭 시 드로어를 연다. `canManageCapabilities`(기존 SUPER_ADMIN 판정)를 그대로 재사용한다:

```tsx
const [navTarget, setNavTarget] = useState<AdminCrmOwnerOption | null>(null)
```

```tsx
{canManageCapabilities && user.userId && (
  <button
    type="button"
    onClick={() => setNavTarget(user)}
    className="rounded-md border border-[#e8e8e4] px-2 py-1 text-[11px] text-[#1a1a1a]/60 hover:bg-[#f5f5f2]"
  >
    탭 권한
  </button>
)}
```

```tsx
{navTarget?.userId && (
  <MemberNavAccessDrawer
    userId={navTarget.userId}
    displayName={navTarget.displayName}
    targetRole={String(navTarget.role)}
    initialPreset={navTarget.navPreset ?? null}
    initialOverrides={navTarget.navOverrides ?? {}}
    onClose={() => setNavTarget(null)}
    onSaved={() => setNavTarget(null)}
  />
)}
```

- [ ] **Step 5: 테스트·게이트**

```bash
npx vitest run tests/admin
npm run typecheck
npx eslint app components lib --max-warnings=0
```
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add components/admin/settings/ tests/admin/nav-access-ui.test.ts
git commit -m "feat(admin-settings): 탭 권한 드로어 — 프리셋·예외·실시간 미리보기"
```

---

# Phase D — 흡수와 리다이렉트

## Task 9: 트래픽 → Analytics 흡수

**Files:**
- Modify: `app/admin/analytics/page.tsx`
- Modify: `app/admin/traffic/page.tsx`

- [ ] **Step 1: 트래픽 본문을 공용 패널로 추출**

`app/admin/traffic/page.tsx`(현재 트래픽 대시보드 전체)의 본문을 `components/admin/analytics/TrafficPanel.tsx`로 **그대로 옮긴다**. 로직 변경 없이 `"use client"` + `export default function TrafficPanel()`로 감싸기만 한다. 페이지 레벨 래퍼(제목·패딩)는 남기지 말고 패널만 옮긴다 — 호스트가 헤더를 그린다.

코드를 복제하지 않는 게 핵심이다. 트래픽 화면이 두 벌이 되면 다음 수정 때 한쪽만 고쳐진다.

- [ ] **Step 2: Analytics에 탭 추가**

`app/admin/analytics/page.tsx`가 이미 탭 구조를 갖는지 확인한다:

```bash
grep -n "useUrlState\|activeTab" app/admin/analytics/page.tsx | head -10
```

**없으면** 이 저장소의 표준 훅으로 만든다 (`app/admin/settings/page.tsx:900`이 같은 패턴):

```tsx
import { useUrlState } from "@/lib/use-url-state"

const [tab, setTab] = useUrlState("tab", "overview")
```

```tsx
<div className="mb-4 flex gap-1 border-b border-[#e8e8e4]">
  {[
    { key: "overview", label: "개요" },
    { key: "traffic", label: "방문자·트래픽" },
  ].map((item) => (
    <button
      key={item.key}
      type="button"
      onClick={() => setTab(item.key)}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        tab === item.key
          ? "border-[#111110] text-[#111110]"
          : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
      }`}
    >
      {item.label}
    </button>
  ))}
</div>

{tab === "traffic" ? <TrafficPanel /> : <>{/* 기존 Analytics 본문 */}</>}
```

**있으면** 기존 탭 배열에 `traffic` 항목만 추가한다.

- [ ] **Step 3: 트래픽 라우트를 리다이렉트 스텁으로**

`app/admin/traffic/page.tsx` 전체 교체:

```tsx
import { redirect } from "next/navigation"

// 2026-07-29 탭 재구성 — 방문자/트래픽은 Analytics의 탭으로 흡수됐다(스펙 §4.3).
// 화면이 사라진 게 아니라 옮겨간 것이라 이 라우트는 북마크·딥링크 호환용 스텁으로 남긴다.
export default function AdminTrafficRedirectPage() {
  redirect("/admin/analytics?tab=traffic")
}
```

- [ ] **Step 4: warm-up 키 갱신**

`components/admin/AdminSidebar.tsx`의 `NAV_WARMUP_REQUESTS`에서 `"/admin/traffic"` 키를 `"/admin/analytics?tab=traffic"`으로 바꾸고, `"/admin/analytics"` 키는 그대로 둔다.

warm 키는 페이지가 실제 호출하는 URL과 **문자 그대로** 같아야 적중한다(그 파일 상단 경고). 트래픽 탭이 부르는 URL이 기존 `/api/admin/traffic-summary?range=30`에서 바뀌지 않았는지 확인한다.

- [ ] **Step 5: 확인**

```bash
npm run build
npx vitest run tests/admin
```
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/admin/analytics app/admin/traffic components/admin/AdminSidebar.tsx components/admin/analytics
git commit -m "feat(admin): 방문자/트래픽을 Analytics 탭으로 흡수"
```

---

## Task 10: 공개 행사 → 캘린더 연결

**Files:**
- Modify: `app/admin/calendar/page.tsx`

공개 행사는 이미 캘린더에 `source: "event"`로 그려지고 있다. 필요한 건 **관리 화면으로 가는 링크**뿐이다 — nav 항목이 사라졌으니 도달 경로가 없어진다.

- [ ] **Step 1: 소스 칩 옆에 관리 링크 추가**

`SOURCE_OPTIONS`의 `event` 칩 영역 근처(`sourceCounts` 렌더 블록)에 링크를 넣는다:

```tsx
<Link
  href="/admin/events"
  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[#A8741A] transition-colors hover:bg-[#FEF9F0]"
>
  공개 행사 관리
</Link>
```

- [ ] **Step 2: 행사 우선 정렬 (U4)**

같은 날짜 이벤트 정렬에서 `source === "event"`를 최상단으로 올린다:

```tsx
// 행사가 가장 우선으로 캘린더에 붙여진다 — 회의 결정(스펙 U4).
const sortByPriority = (a: CalendarEvent, b: CalendarEvent) => {
  const rank = (event: CalendarEvent) => (getEventSource(event) === "event" ? 0 : 1)
  return rank(a) - rank(b)
}
```

- [ ] **Step 3: 확인·커밋**

```bash
npm run build
git add app/admin/calendar/page.tsx
git commit -m "feat(admin-calendar): 공개 행사 관리 진입점 + 행사 우선 정렬"
```

---

# Phase E — 사용성 개선

## Task 11: 블로그 AI 버튼 순서·배경 (U6·U7)

**Files:**
- Modify: `components/admin/BlogPostEditor.tsx:2078-2100`
- Modify: `components/admin/RichMarkdownEditor.tsx:877`

- [ ] **Step 1: 버튼 순서 교체**

`components/admin/BlogPostEditor.tsx`의 AI 블록(`{/* AI 다듬기 */}` 주석 아래 `space-y-1.5` div) 안에서 **"초안 생성" 블록 전체를 "본문 다듬기" 버튼 위로** 옮긴다. 두 블록의 내용은 그대로다 — 순서만 바뀐다.

회의 근거: "본문 다듬기 초안 생성 먼저 아니에요"(정규성). 빈 글에서 시작하는 순서가 실제 작업 순서다.

옮긴 뒤 구조:

```tsx
<div className="space-y-1.5">
  {/* 1. 초안 생성 — 빈 글에서 시작하는 첫 동작이라 위로 (2026-07-29 회의) */}
  {!showInlineDraft ? (
    <button type="button" onClick={() => setShowInlineDraft(true)} ...>
      <Type className="h-3 w-3 shrink-0 text-[#084734]" />
      초안 생성
    </button>
  ) : (
    <div className="space-y-1.5 rounded-lg border border-[#e8e8e4] bg-white p-2.5">
      {/* ...기존 인라인 초안 입력 블록 그대로... */}
    </div>
  )}

  {/* 2. 본문 다듬기 — 이미 쓴 글에 적용하는 동작 */}
  <button type="button" disabled={...} onClick={() => handleAiAction("optimize")} ...>
    ...
    본문 다듬기
  </button>
  <p className="px-0.5 text-[10px] text-[#1a1a1a]/35">전체 본문 · 전문적 톤으로 적용됩니다</p>
</div>
```

- [ ] **Step 2: 다듬기 기본값 노출**

위 구조의 `<p>` 한 줄이 그것이다 — "저 아무것도 안 눌렀는데 그냥 다듬기 들어가네" 해소.

문구의 값이 실제 기본값과 맞는지 확인한다:

```bash
grep -n 'handleAiAction("optimize")' -A 3 components/admin/BlogPostEditor.tsx
grep -n 'tone:\|length:' components/admin/BlogPostEditor.tsx | head
```

실제 기본값이 `전문적`/`medium`이 아니면 문구를 실제 값에 맞춘다. **틀린 안내는 안내가 없는 것보다 나쁘다.**

- [ ] **Step 3: 에디터 배경 흰색**

`components/admin/RichMarkdownEditor.tsx:877`의 `bg-[#fcfcfb]` → `bg-white`.

> `npm run prebuild`에 `check:design-tokens`가 걸려 있다. `bg-white`가 토큰 검사를 통과하는지 확인하고, 막히면 `bg-[#FFFFFF]`를 쓴다 (DESIGN.md 팔레트의 섹션 배경 값).

- [ ] **Step 4: 확인·커밋**

```bash
npm run build
git add components/admin/BlogPostEditor.tsx components/admin/RichMarkdownEditor.tsx
git commit -m "fix(admin-blog): AI 초안 생성을 본문 다듬기 위로 + 에디터 배경 흰색"
```

---

## Task 12: 한국 공휴일 자동 주입 (U1)

**Files:**
- Create: `lib/korea-holidays.ts`
- Modify: `app/api/admin/calendar/route.ts`
- Test: `tests/admin/korea-holidays.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

> **필드명 주의:** `CalendarEvent`의 읽기전용 플래그는 `readonly`(전부 소문자)다. `readOnly`가 아니다.
> `createdAt`·`updatedAt`은 **필수 필드**라 매핑에서 반드시 채워야 한다.

```ts
import { describe, expect, it } from "vitest"

import { KOREA_HOLIDAY_CALENDAR_ID, toHolidayEvent } from "@/lib/korea-holidays"

describe("korea holidays", () => {
  it("points at Google's Korean holiday calendar", () => {
    expect(KOREA_HOLIDAY_CALENDAR_ID).toBe("ko.south_korea#holiday@group.v.calendar.google.com")
  })

  it("maps a Google all-day holiday into a read-only calendar event", () => {
    const event = toHolidayEvent({
      id: "abc",
      summary: "광복절",
      start: { date: "2026-08-15" },
      end: { date: "2026-08-16" },
    })

    expect(event.type).toBe("holiday")
    expect(event.title).toBe("광복절")
    expect(event.date).toBe("2026-08-15")
    expect(event.source).toBe("holiday")
    expect(event.allDay).toBe(true)
    expect(event.readonly).toBe(true)
    expect(event.createdAt).toBeTruthy()
    expect(event.updatedAt).toBeTruthy()
  })

  it("returns null for entries without a title or an all-day start", () => {
    expect(toHolidayEvent({ id: "x", start: { date: "2026-08-15" } })).toBeNull()
    expect(toHolidayEvent({ id: "y", summary: "무언가" })).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/admin/korea-holidays.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 모듈 구현**

먼저 `lib/calendar-data.ts`의 `EventSource`에 `"holiday"`를 추가한다:

```ts
export type EventSource = "calendar" | "partner" | "event" | "notion" | "showroom" | "team_event" | "holiday"
```

`app/admin/calendar/page.tsx`의 `SOURCE_OPTIONS`에도 칩을 넣는다:

```ts
{ value: "holiday", label: "공휴일", dot: "#A8741A" },
```

`lib/korea-holidays.ts` 생성. 순수 매핑 함수는 테스트가 직접 부르므로 **전체를 명시한다**:

```ts
/**
 * korea-holidays.ts — 구글 공개 공휴일 캘린더 읽기 전용 연동.
 *
 * 회의(2026-07-29): "공휴일 같은 거 반영되고 하면 얘도 쓸 만할 것 같아요."
 * 기존 EventType의 'holiday'는 손으로 넣는 타입이었고 자동 주입이 없었다.
 *
 * 팀원 개인 캘린더(lib/team-member-calendars.ts)와 달리 이 캘린더는 공개라
 * 서비스 계정 공유 설정이 필요 없다. 자격 미설정 시 조용히 빈 배열.
 */
import "server-only"

import type { calendar_v3 } from "googleapis"

import type { CalendarEvent } from "@/lib/calendar-data"
import { calendar as googleCalendar } from "@/lib/google"

export const KOREA_HOLIDAY_CALENDAR_ID = "ko.south_korea#holiday@group.v.calendar.google.com"

const CACHE_TTL_MS = 60 * 60_000 // 공휴일은 거의 안 바뀐다 — 1시간
let cache: { at: number; data: CalendarEvent[] } | null = null

/** 구글 이벤트 하나를 읽기 전용 공휴일 CalendarEvent로 매핑한다. 종일 일정이 아니면 null. */
export function toHolidayEvent(raw: calendar_v3.Schema$Event): CalendarEvent | null {
  const title = raw.summary?.trim()
  const date = raw.start?.date?.trim()
  if (!title || !date) return null

  const stamp = raw.updated ?? `${date}T00:00:00.000Z`

  return {
    id: `holiday:${raw.id ?? `${date}-${title}`}`,
    title,
    date,
    // 구글의 종일 end는 배타적(다음 날)이라 하루짜리는 endDate를 비운다.
    type: "holiday",
    allDay: true,
    source: "holiday",
    sourceLabel: "공휴일",
    readonly: true,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

function hasServiceAccount(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.GOOGLE_PRIVATE_KEY?.trim()
  )
}

export async function getKoreaHolidayEvents(opts: { timeMin?: string; timeMax?: string } = {}) {
  if (!hasServiceAccount()) return []
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data

  try {
    // lib/google.ts:38의 calendar는 모듈 로드 시 만들어진 *객체*다(함수 아님) — 호출하지 않는다.
    const response = await googleCalendar.events.list({
      calendarId: KOREA_HOLIDAY_CALENDAR_ID,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
    })

    const data = (response.data.items ?? [])
      .map(toHolidayEvent)
      .filter((event): event is CalendarEvent => event !== null)

    cache = { at: Date.now(), data }
    return data
  } catch {
    // 공휴일이 안 떠도 캘린더의 나머지는 살아야 한다.
    return []
  }
}
```

확인 완료된 계약: `lib/google.ts:38`이 `export const calendar = google.calendar({ version: "v3", auth })`로 객체를 내보낸다. `lib/team-member-calendars.ts`도 같은 방식으로 쓴다.

- [ ] **Step 4: 캘린더 API에 합류**

`app/api/admin/calendar/route.ts`가 소스들을 합치는 지점을 찾아 공휴일을 추가한다:

```bash
grep -n "getTeamEventsCalendarEvents\|Promise.all\|concat" app/api/admin/calendar/route.ts
```

기존 소스와 같은 `Promise.all` 묶음에 넣고, 실패해도 다른 소스가 살아남게 `.catch(() => [])`를 건다 (팀원 캘린더가 쓰는 패턴과 동일).

- [ ] **Step 5: 확인·커밋**

```bash
npx vitest run tests/admin/korea-holidays.test.ts
npm run typecheck
git add lib/korea-holidays.ts app/api/admin/calendar/route.ts app/admin/calendar/page.tsx lib/calendar-data.ts tests/admin/korea-holidays.test.ts
git commit -m "feat(admin-calendar): 한국 공휴일 자동 주입"
```

---

## Task 13: 팀원 고정 색상 + 캘린더 상단 스트립 (U2·U3·U5)

**Files:**
- Create: `lib/team-member-colors.ts`
- Modify: `app/admin/calendar/page.tsx`
- Test: `tests/admin/team-member-colors.test.ts` (신규)

- [ ] **Step 1: 색상 테스트 작성**

회의 불만은 정확히 이거였다: "어떤 것들은 색깔도 비슷하고, 이게 누구 건지가 제대로 안 나와 있어요. 색깔로 다 구분을 해야 되는데."

```ts
import { describe, expect, it } from "vitest"

import { TEAM_MEMBER_COLORS, getTeamMemberColor } from "@/lib/team-member-colors"

describe("team member colors", () => {
  it("assigns a distinct colour to every configured member", () => {
    const colors = Object.values(TEAM_MEMBER_COLORS)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it("covers everyone in data/team-calendars.json", async () => {
    const members = (await import("../../data/team-calendars.json")).default as Array<{ name: string }>
    for (const member of members) {
      expect(TEAM_MEMBER_COLORS[member.name], member.name).toBeDefined()
    }
  })

  it("falls back to a neutral colour for unknown assignees instead of throwing", () => {
    expect(getTeamMemberColor("모르는사람")).toBe("#A39E98")
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/admin/team-member-colors.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 색상 모듈 구현**

`lib/team-member-colors.ts` 생성. 색상은 DESIGN.md 팔레트에서 **서로 충분히 구분되는** 9개를 고른다 — 구글 캘린더의 "색깔이 비슷하다" 문제를 되풀이하지 않는 게 이 모듈의 존재 이유다:

```ts
/**
 * 팀원별 고정 색상 — 캘린더에서 "이게 누구 건지" 즉시 읽히게 한다(스펙 U2).
 *
 * 구글 캘린더의 실패를 되풀이하지 않으려고 색상을 자동 배정(해시)하지 않고 손으로 고정한다.
 * 해시 배정은 팀원이 늘 때마다 기존 사람 색이 바뀌고, 인접한 두 명이 비슷한 색을 받는다.
 *
 * 키는 data/team-calendars.json의 name과 정확히 일치해야 한다 — 그 파일의 name이
 * 곧 캘린더 이벤트의 assignee다(lib/team-member-calendars.ts 참조).
 */
export const TEAM_MEMBER_COLORS: Record<string, string> = {
  문준혁: "#084734", // 딥 그린
  정규성: "#B85C33", // 테라코타
  신희성: "#0E766E", // 틸
  김민재: "#6D4AA8", // 퍼플
  김정무: "#1F4E79", // 네이비
  이왕찬: "#A8741A", // 앰버
  황찬우: "#9B2C5D", // 마젠타
  박한: "#3F6212", // 올리브
  진소망: "#5B6470", // 슬레이트
}

export const TEAM_MEMBER_FALLBACK_COLOR = "#A39E98"

export function getTeamMemberColor(name: string | null | undefined): string {
  if (!name) return TEAM_MEMBER_FALLBACK_COLOR
  return TEAM_MEMBER_COLORS[name.trim()] ?? TEAM_MEMBER_FALLBACK_COLOR
}
```

- [ ] **Step 4: 캘린더에 배선**

`app/admin/calendar/page.tsx`는 이미 담당자 필터(`hiddenAssignees`)를 갖고 있다. 담당자 칩과 이벤트 점(dot)의 색을 소스 색 대신 팀원 색으로 바꾼다:

```tsx
import { getTeamMemberColor } from "@/lib/team-member-colors"
```

담당자 칩 렌더에서 `accent`를 `getTeamMemberColor(assignee)`로 넘기고, 팀원 행사(`source === "team_event"`) 이벤트의 dot도 같은 색을 쓴다. 소스 색(`getSourceColor`)은 팀원이 없는 소스(공개 행사·쇼룸·노션)에만 남긴다.

- [ ] **Step 5: 이번 주 요약 스트립 (U3)**

캘린더 그리드 위에 이번 주(월~일) 일정을 담당자별로 묶어 보이는 스트립을 넣는다. 회의 근거: "회의할 때 구글 캘린더 켜놓고 누구누구 이거 합니다 이런 거 못 하거든요."

기존 `visibleEvents`를 재사용한다 — **새 페치 없음**:

```tsx
const weekStrip = useMemo(() => {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // 월=0
  const monday = new Date(now)
  monday.setDate(now.getDate() - day)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const toKey = (date: Date) => date.toISOString().slice(0, 10)
  const from = toKey(monday)
  const to = toKey(sunday)

  const byAssignee = new Map<string, CalendarEvent[]>()
  for (const event of visibleEvents) {
    const date = event.date
    if (date < from || date > to) continue
    for (const assignee of event.assignees?.length ? event.assignees : ["미지정"]) {
      const bucket = byAssignee.get(assignee)
      if (bucket) bucket.push(event)
      else byAssignee.set(assignee, [event])
    }
  }

  return [...byAssignee.entries()].sort((a, b) => b[1].length - a[1].length)
}, [visibleEvents])
```

```tsx
{weekStrip.length > 0 && (
  <div className="mb-4 rounded-xl border border-[#e8e8e4] bg-white p-3">
    <p className="mb-2 text-[11px] font-semibold text-[#1a1a1a]/45">이번 주</p>
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {weekStrip.map(([assignee, items]) => (
        <div key={assignee} className="flex items-center gap-1.5 text-[12px]">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: getTeamMemberColor(assignee) }}
          />
          <span className="font-medium text-[#111110]">{assignee}</span>
          <span className="tabular-nums text-[#1a1a1a]/40">{items.length}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: 미처리 리드 스트립 (U5)**

Overview가 하던 리드 대응 진입점을 보존한다. 기존 API를 그대로 쓴다:

```tsx
const [pendingLeads, setPendingLeads] = useState<number | null>(null)

useEffect(() => {
  adminFetchJsonCached<{ leads?: Array<{ status?: string | null }> }>(
    "/api/admin/leads?scope=dashboard",
    undefined,
    { cacheKey: "calendar:lead-strip", ttlMs: 120_000, staleWhileRevalidateMs: 300_000 }
  )
    .then((data) => {
      const pending = (data?.leads ?? []).filter(
        (lead) => !lead.status || lead.status === "new" || lead.status === "pending"
      ).length
      setPendingLeads(pending)
    })
    .catch(() => setPendingLeads(null))
}, [])
```

> `status` 값의 실제 enum을 먼저 확인한다: `grep -rn "status" lib/leads*.ts | head`. 위 필터가 실제 값과 다르면 맞춘다 — 틀린 필터는 항상 0이거나 항상 전체가 되어 배너가 거짓말을 한다.

```tsx
{pendingLeads != null && pendingLeads > 0 && (
  <Link
    href="/admin/crm"
    className="mb-3 flex items-center gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[13px] text-[#B85C33] transition-colors hover:bg-[#FCE9DF]"
  >
    <span className="font-semibold tabular-nums">{pendingLeads}</span>
    <span>건의 리드가 아직 대응되지 않았습니다</span>
    <ChevronRight className="ml-auto h-4 w-4" />
  </Link>
)}
```

0이면 렌더하지 않는다 — 빈 배너는 소음이다.

- [ ] **Step 7: 확인·커밋**

```bash
npx vitest run tests/admin/team-member-colors.test.ts
npm run typecheck
npm run build
git add lib/team-member-colors.ts app/admin/calendar/page.tsx tests/admin/team-member-colors.test.ts
git commit -m "feat(admin-calendar): 팀원 고정 색상 + 이번 주 요약 + 미처리 리드 스트립"
```

---

## Task 14: 최종 게이트 + 문서 갱신

- [ ] **Step 1: 전체 게이트**

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
npm test
```
Expected: 4개 전부 PASS

- [ ] **Step 2: 수동 검증 (스펙 §10)**

```bash
npm run dev
```

- `nav_preset` NULL 계정 → 사이드바가 **오늘과 동일**한가
- `super` → 상시 7 + 기타 12, 새로고침 후 기타 펼침 유지
- `cs` 프리셋 → 설정·Overview·매출 장부가 ⌘K에서도 안 나오는가
- `/admin` → `/admin/calendar`
- `/admin/traffic` → `/admin/analytics?tab=traffic`
- 드로어에서 오버라이드 지정 → 미리보기 즉시 반영

- [ ] **Step 3: 스펙 문서에 구현 완료 표시**

`docs/active/admin-tab-restructure-2026-07-29.md` §11 미결 사항에 실제 결과를 반영한다 (하드웨어 재고 왕찬 확인 여부 등).

- [ ] **Step 4: 커밋**

```bash
git add docs/active/admin-tab-restructure-2026-07-29.md
git commit -m "docs(admin): 탭 재구성 구현 결과 반영"
```

---

## 배포 후 절차 (스펙 §8)

구현·배포가 끝난 뒤 문준혁이 직접 수행한다. **코드 작업이 아니다.**

1. Supabase Management API로 `20260729_admin_nav_access.sql` 적용
2. 자기 계정에 `nav_preset = 'super'` 부여 → 새 사이드바 확인
3. `/admin/settings?tab=members`에서 8명에게 프리셋 배정 (§5.2 배정 제안 참고)
4. 팀 공지 — "탭이 사라진 게 아니라 하단 **기타**에 있습니다"

되돌리기: 해당 사용자의 `nav_preset`을 NULL로 → 즉시 기존 동작. 배포 롤백 불필요.
