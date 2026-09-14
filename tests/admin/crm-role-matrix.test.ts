import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { CRM_STAFF_ADMIN_API_ROLES } from "@/lib/admin-auth"

// CRM 도메인 어드민 API 라우트 — 전부 requireVerifiedAdminContext + CRM_STAFF_ADMIN_API_ROLES
// 단일 롤 매트릭스를 써야 한다. (감사 이슈: 사이드바는 BRANCH에게 CRM을 노출하는데
// API 절반이 BRANCH를 거부해 화면이 깨졌다. unified가 같은 데이터를 BRANCH에 이미
// 합성 반환하므로 원천 거부는 보호 효과도 없다.)
// 주의: crm/source-links/lead-conversion 라우트는 2026-07-02 제거되어 이 목록에 없다.
const CRM_DOMAIN_ROUTES = [
  "app/api/admin/leads/route.ts",
  "app/api/admin/leads/[id]/route.ts",
  "app/api/admin/leads/[id]/activity/route.ts",
  "app/api/admin/leads/[id]/convert-v2/route.ts",
  "app/api/admin/leads/bulk-assign/route.ts",
  "app/api/admin/leads/assignment-preview/route.ts",
  "app/api/admin/leads/bulk-convert/route.ts",
  "app/api/admin/leads/[id]/logs/route.ts",
  "app/api/admin/leads/activity-summary/route.ts",
  "app/api/admin/crm/customers/unified/route.ts",
  "app/api/admin/crm/customers-neo/route.ts",
  "app/api/admin/crm/customers-neo/[accountId]/route.ts",
  "app/api/admin/crm/neo/route.ts",
  "app/api/admin/crm/matching/route.ts",
  "app/api/admin/crm/coverage/route.ts",
  "app/api/admin/crm/source-links/generate/route.ts",
  "app/api/admin/crm/source-links/manual/route.ts",
  "app/api/admin/crm/source-links/targets/route.ts",
  "app/api/admin/crm/source-links/bulk/route.ts",
  "app/api/admin/crm/source-links/[id]/route.ts",
  // 읽기 전용 라우트(2026-07-02 후속 통일) — 사이드바 warmup·홈 위젯이 호출하므로
  // BRANCH가 /admin/crm 진입 시 403이 나면 안 된다.
  "app/api/admin/crm/overview/route.ts",
  "app/api/admin/crm/action-kpis/route.ts",
  "app/api/admin/crm/insights/route.ts",
  "app/api/admin/crm/revenue/route.ts",
  "app/api/admin/crm/performance/route.ts",
  "app/api/admin/crm/health-distribution/route.ts",
  "app/api/admin/crm/readiness/route.ts",
  "app/api/admin/crm/lead-channels/route.ts",
  "app/api/admin/crm/mcp-context/route.ts",
] as const

// 읽기(GET)만 CRM 롤 매트릭스로 완화한 혼합 라우트. 쓰기 메서드는 의도적으로
// verifyAdmin 기본롤(SUPER_ADMIN/ADMIN)을 유지한다:
//  - revenue-target POST: 월 매출 목표 설정 — 관리자 전용
//  - external-sync POST: 외부 CRM sync 트리거 — 관리자 전용
const CRM_READ_RELAXED_WRITE_DEFAULT_ROUTES = [
  "app/api/admin/crm/revenue-target/route.ts",
  "app/api/admin/crm/external-sync/route.ts",
] as const

// route 파일을 export된 HTTP 메서드 핸들러 단위로 자른다 (텍스트 기반).
function splitRouteHandlers(source: string): Map<string, string> {
  const handlers = new Map<string, string>()
  const matches = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0
    const end = i + 1 < matches.length ? matches[i + 1].index ?? source.length : source.length
    handlers.set(matches[i][1], source.slice(start, end))
  }
  return handlers
}

// CRM nav 노출 롤의 원천. admin-nav 모듈 추출 작업이 병행 중이라 두 위치 모두 시도한다.
const NAV_SOURCE_CANDIDATES = [
  "components/admin/admin-nav.ts",
  "components/admin/admin-nav.tsx",
  "components/admin/AdminSidebar.tsx",
] as const

function loadNavSource(): { path: string; source: string } {
  for (const candidate of NAV_SOURCE_CANDIDATES) {
    const absolute = join(process.cwd(), candidate)
    if (!existsSync(absolute)) continue
    const source = readFileSync(absolute, "utf8")
    // 추출 중간 상태(빈 파일 등)에서 CRM 항목이 없으면 다음 후보로 넘어간다.
    if (source.includes('href: "/admin/crm"')) return { path: candidate, source }
  }
  throw new Error(
    `CRM nav source not found. Tried: ${NAV_SOURCE_CANDIDATES.join(", ")}`
  )
}

describe("CRM domain API role matrix (single source: CRM_STAFF_ADMIN_API_ROLES)", () => {
  for (const route of CRM_DOMAIN_ROUTES) {
    it(`${route} authorizes via requireVerifiedAdminContext + CRM_STAFF_ADMIN_API_ROLES`, () => {
      const source = readFileSync(join(process.cwd(), route), "utf8")

      expect(source, `${route} must import CRM_STAFF_ADMIN_API_ROLES`).toContain(
        "CRM_STAFF_ADMIN_API_ROLES"
      )
      expect(source, `${route} must use requireVerifiedAdminContext`).toContain(
        "requireVerifiedAdminContext"
      )
      // 개별 라우트가 자체 롤셋(verifyAdmin 기본값 등)으로 회귀하면 안 된다.
      expect(
        /\bverifyAdmin\s*\(/.test(source),
        `${route} must not call verifyAdmin (default roles reject BRANCH)`
      ).toBe(false)

      // 모든 호출부가 롤 매트릭스를 명시적으로 전달해야 한다 (기본값 회귀 방지).
      const callSites = [...source.matchAll(/requireVerifiedAdminContext\(([^)]*)\)/g)]
      expect(callSites.length, `${route} must call requireVerifiedAdminContext`).toBeGreaterThan(0)
      for (const call of callSites) {
        expect(
          call[1],
          `${route}: requireVerifiedAdminContext(${call[1]}) must pass CRM_STAFF_ADMIN_API_ROLES`
        ).toContain("CRM_STAFF_ADMIN_API_ROLES")
      }
    })
  }
})

describe("CRM mixed routes: GET relaxed to CRM matrix, writes keep default roles", () => {
  for (const route of CRM_READ_RELAXED_WRITE_DEFAULT_ROUTES) {
    it(`${route} relaxes only GET; write handlers stay on default admin roles`, () => {
      const source = readFileSync(join(process.cwd(), route), "utf8")
      const handlers = splitRouteHandlers(source)

      const get = handlers.get("GET")
      expect(get, `${route} must export a GET handler`).toBeTruthy()
      expect(get, `${route} GET must use requireVerifiedAdminContext`).toContain(
        "requireVerifiedAdminContext"
      )
      expect(
        /\bverifyAdmin\s*\(/.test(get ?? ""),
        `${route} GET must not call verifyAdmin (default roles reject BRANCH)`
      ).toBe(false)
      const getCalls = [...(get ?? "").matchAll(/requireVerifiedAdminContext\(([^)]*)\)/g)]
      expect(getCalls.length, `${route} GET must call requireVerifiedAdminContext`).toBeGreaterThan(0)
      for (const call of getCalls) {
        expect(
          call[1],
          `${route} GET: requireVerifiedAdminContext(${call[1]}) must pass CRM_STAFF_ADMIN_API_ROLES`
        ).toContain("CRM_STAFF_ADMIN_API_ROLES")
      }

      // 쓰기 메서드(POST/PUT/PATCH/DELETE) — 기본롤을 유지해야 하며(BRANCH 완화 금지),
      // 가드가 아예 빠지는 회귀도 막는다.
      const writeMethods = ["POST", "PUT", "PATCH", "DELETE"].filter((m) => handlers.has(m))
      expect(writeMethods.length, `${route} must have a write handler (else move to CRM_DOMAIN_ROUTES)`).toBeGreaterThan(0)
      for (const method of writeMethods) {
        const body = handlers.get(method) ?? ""
        expect(
          /\b(verifyAdmin|requireVerifiedAdminContext)\s*\(/.test(body),
          `${route} ${method} must call an admin guard`
        ).toBe(true)
        expect(
          body.includes("CRM_STAFF_ADMIN_API_ROLES"),
          `${route} ${method} is a write — must NOT be relaxed to CRM_STAFF_ADMIN_API_ROLES`
        ).toBe(false)
      }
    })
  }
})

describe("CRM nav exposure vs API role matrix (2026-09-10 전면 공개 이후)", () => {
  const apiRoles = [...CRM_STAFF_ADMIN_API_ROLES]

  // 사이드바는 더 이상 역할로 항목을 거르지 않는다(components/admin/admin-nav.ts —
  // 항목별 roles 필드 제거). 따라서 "nav 노출 롤 ⊆ API 허용 롤" 이라는 옛 등식은 성립하지
  // 않는다. 그 자리를 대신하는 계약은 두 가지다.
  //  1. 진짜 경계인 API 역할 묶음은 그대로 유지된다(위 describe 가 라우트별로 강제한다).
  //  2. 정본 운영 역할 3종은 전부 API 가 허용해야 한다 — 그래야 "메뉴에 보이는데 403" 이
  //     레거시 역할(EDITOR/VIEWER)에만 남고 실제 매니저에게는 생기지 않는다.
  const CANONICAL_OPERATING_ROLES = ["SUPER_ADMIN", "ADMIN", "BRANCH"]

  it("사이드바가 CRM 을 역할로 거르지 않는다", () => {
    const { source } = loadNavSource()
    // ADMIN_NAV 항목과 CRM_CHILD_NAV 의 "현황" 항목 둘 다 잡힌다 — 어느 쪽도 roles 를 갖지 않아야 한다.
    const crmItems = source.match(/\{[^{}]*?href:\s*"\/admin\/crm"[^{}]*?\}/g) ?? []
    expect(crmItems.length).toBeGreaterThan(0)
    for (const item of crmItems) expect(item, item).not.toMatch(/roles:/)
  })

  it("정본 운영 역할 3종은 전부 CRM API 가 허용한다", () => {
    for (const role of CANONICAL_OPERATING_ROLES) {
      expect(apiRoles, `CRM 탭은 전원에게 보이는데 API 가 ${role} 를 거부한다`).toContain(role)
    }
  })

  it("allows BRANCH in CRM_STAFF_ADMIN_API_ROLES", () => {
    expect(apiRoles).toContain("BRANCH")
  })
})
