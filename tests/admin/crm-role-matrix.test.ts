import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  CRM_STAFF_ADMIN_API_ROLES,
  STAFF_ADMIN_API_ROLES,
  defaultAdminApiRolesForMethod,
} from "@/lib/admin-auth"

// CRM 도메인 어드민 API 라우트 — 전부 requireVerifiedAdminContext + CRM_STAFF_ADMIN_API_ROLES
// 단일 롤 매트릭스를 써야 한다. (감사 이슈: 사이드바는 BRANCH에게 CRM을 노출하는데
// API 절반이 BRANCH를 거부해 화면이 깨졌다. unified가 같은 데이터를 BRANCH에 이미
// 합성 반환하므로 원천 거부는 보호 효과도 없다.)
// 주의: crm/source-links/lead-conversion 라우트는 2026-07-02 제거되어 이 목록에 없다.
// app/api/admin/crm/** 전체는 아래 CRM_ROUTE_HANDLER_MATRIX(디렉터리 glob 기반)가
// 핸들러 단위로 다시 고정한다. 이 목록은 leads 라우트를 포함한 원 감사 범위를 유지한다.
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
  "app/api/admin/crm/source-links/hw-outbound/route.ts",
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

// ---------------------------------------------------------------------------
// app/api/admin/crm/** 전체 핸들러 역할 매트릭스 (기획 D3, 2026-09-12)
//
// 파일 목록은 디렉터리를 직접 훑어 만든다 — route.ts가 새로 생기면 매트릭스에 없어서
// 실패하고, 매트릭스에만 있고 파일이 없어도 실패한다. 핸들러 단위로 가드 함수와
// 역할 상수를 고정하며, 역할 상수는 호출부에 명시적으로 전달돼야 한다.
//
// 예외(의도) 목록:
//  - revenue-target POST / external-sync POST: verifyAdmin(req) 기본 역할(POST=STAFF).
//    월 매출 목표 설정·외부 CRM sync 트리거는 관리자 전용.
//  - region-assignments PUT: requireVerifiedAdminContext(req) 기본 역할(PUT=STAFF).
//    팀 라우팅을 바꾸는 쓰기라 GET보다 좁게 둔다(라우트 주석 참조).
//  - map-source POST: STAFF_ADMIN_API_ROLES 명시. 공유지도 원천 적재(폴더 단위 upsert,
//    fullSnapshot 시 이전 스냅샷 stale 처리)는 external-sync와 같은 급의 데이터층 쓰기다.
//    형제 map-source/link POST(장소 1건 연결)는 실무 작업이라 CRM_STAFF.
//  - write-requests/[id] PATCH · execute POST: STAFF_ADMIN_API_ROLES 명시.
//    되밀기 승인·실행은 관리자만 한다(초안 생성 POST·조회 GET은 CRM_STAFF).
//  - revenue-sheet GET: CRM_STAFF(감사 2B.2 수정본). 인자 없는 GET 기본은 VIEWER를 포함해
//    /admin/crm/deals에서 막히는 롤이 REV 시트를 열 수 있었다.
//  - capability 검사(requireAdminCapability)는 CRM 라우트에 0건 — 현 상태를 그대로 고정.
// ---------------------------------------------------------------------------

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
type GuardName = "requireVerifiedAdminContext" | "verifyAdmin"
// DEFAULT_BY_METHOD: 역할 인자 없이 가드를 호출해 defaultAdminApiRolesForMethod에 맡긴다.
type RoleSpec = "CRM_STAFF_ADMIN_API_ROLES" | "STAFF_ADMIN_API_ROLES" | "DEFAULT_BY_METHOD"
type HandlerSpec = { guard: GuardName; roles: RoleSpec }

const CRM_STAFF: HandlerSpec = { guard: "requireVerifiedAdminContext", roles: "CRM_STAFF_ADMIN_API_ROLES" }
const STAFF_EXPLICIT: HandlerSpec = { guard: "requireVerifiedAdminContext", roles: "STAFF_ADMIN_API_ROLES" }
const STAFF_BY_DEFAULT: HandlerSpec = { guard: "requireVerifiedAdminContext", roles: "DEFAULT_BY_METHOD" }
const VERIFY_ADMIN_BY_DEFAULT: HandlerSpec = { guard: "verifyAdmin", roles: "DEFAULT_BY_METHOD" }

const CRM_ROUTE_DIR = "app/api/admin/crm"

const CRM_ROUTE_HANDLER_MATRIX: Record<string, Partial<Record<HttpMethod, HandlerSpec>>> = {
  "account-master/route.ts": { GET: CRM_STAFF },
  "action-kpis/route.ts": { GET: CRM_STAFF },
  "capture/batches/[id]/apply/route.ts": { POST: CRM_STAFF },
  "capture/batches/[id]/cancel/route.ts": { POST: CRM_STAFF },
  "capture/batches/[id]/parse/route.ts": { POST: CRM_STAFF },
  "capture/batches/[id]/route.ts": { GET: CRM_STAFF },
  "capture/batches/route.ts": { GET: CRM_STAFF, POST: CRM_STAFF },
  "capture/rows/[id]/route.ts": { PATCH: CRM_STAFF },
  "compass-pipeline/route.ts": { GET: CRM_STAFF },
  "compass-summary/route.ts": { GET: CRM_STAFF },
  "coverage/route.ts": { GET: CRM_STAFF },
  "customers-neo/[accountId]/route.ts": { GET: CRM_STAFF },
  "customers-neo/route.ts": { GET: CRM_STAFF },
  "customers/[key]/360/route.ts": { GET: CRM_STAFF },
  "customers/[key]/tags/route.ts": { GET: CRM_STAFF, POST: CRM_STAFF, DELETE: CRM_STAFF },
  "customers/unified/route.ts": { GET: CRM_STAFF },
  "deals-lite/[id]/route.ts": { PATCH: CRM_STAFF },
  "deals-lite/route.ts": { POST: CRM_STAFF },
  "event-attendance/route.ts": { GET: CRM_STAFF },
  "events/route.ts": { GET: CRM_STAFF, POST: CRM_STAFF },
  "external-sync/route.ts": { GET: CRM_STAFF, POST: VERIFY_ADMIN_BY_DEFAULT },
  "health-distribution/route.ts": { GET: CRM_STAFF },
  "home/priority-queue/route.ts": { GET: CRM_STAFF },
  "insights/route.ts": { GET: CRM_STAFF },
  "lead-channels/route.ts": { GET: CRM_STAFF },
  "leads/neo-link/route.ts": { POST: CRM_STAFF },
  "manager-report/route.ts": { GET: CRM_STAFF },
  "map-source/link/route.ts": { POST: CRM_STAFF },
  "map-source/route.ts": { GET: CRM_STAFF, POST: STAFF_EXPLICIT },
  "matching/route.ts": { GET: CRM_STAFF },
  "mcp-context/route.ts": { GET: CRM_STAFF },
  "neo/route.ts": { GET: CRM_STAFF },
  "overview/route.ts": { GET: CRM_STAFF },
  "owners/route.ts": { GET: CRM_STAFF },
  "performance/route.ts": { GET: CRM_STAFF },
  "readiness/route.ts": { GET: CRM_STAFF },
  "reconcile/hw-rev/route.ts": { GET: CRM_STAFF },
  "region-assignments/route.ts": { GET: CRM_STAFF, PUT: STAFF_BY_DEFAULT },
  "region-map/route.ts": { GET: CRM_STAFF },
  "revenue-sheet/route.ts": { GET: CRM_STAFF },
  "revenue-target/route.ts": { GET: CRM_STAFF, POST: VERIFY_ADMIN_BY_DEFAULT },
  "revenue/route.ts": { GET: CRM_STAFF },
  "source-links/[id]/route.ts": { PATCH: CRM_STAFF },
  "source-links/bulk/route.ts": { PATCH: CRM_STAFF },
  "source-links/generate/route.ts": { POST: CRM_STAFF },
  "source-links/hw-outbound/route.ts": { POST: CRM_STAFF },
  "source-links/manual/route.ts": { POST: CRM_STAFF },
  "source-links/targets/route.ts": { GET: CRM_STAFF },
  "tasks/[id]/route.ts": { GET: CRM_STAFF, PATCH: CRM_STAFF, DELETE: CRM_STAFF },
  "tags/route.ts": { GET: CRM_STAFF, PATCH: CRM_STAFF },
  "tasks/route.ts": { GET: CRM_STAFF, POST: CRM_STAFF },
  "write-requests/[id]/execute/route.ts": { POST: STAFF_EXPLICIT },
  "write-requests/[id]/route.ts": { GET: CRM_STAFF, PATCH: STAFF_EXPLICIT },
  "write-requests/route.ts": { GET: CRM_STAFF, POST: CRM_STAFF },
}

// 매트릭스 합계 — 라우트가 늘거나 역할이 바뀌면 여기와 기획 문서(D3)를 함께 갱신한다.
const EXPECTED_HANDLER_TOTAL = 68
const EXPECTED_ROLE_DISTRIBUTION: Record<RoleSpec, number> = {
  CRM_STAFF_ADMIN_API_ROLES: 62,
  STAFF_ADMIN_API_ROLES: 3,
  DEFAULT_BY_METHOD: 3,
}

const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

// CRM_ROUTE_DIR 아래 모든 route.ts를 posix 상대 경로로 수집한다 (정렬됨).
function listRouteFiles(relativeDir: string): string[] {
  const found: string[] = []
  const walk = (relative: string) => {
    for (const entry of readdirSync(join(process.cwd(), CRM_ROUTE_DIR, relative), { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(next)
      else if (entry.isFile() && entry.name === "route.ts") found.push(next)
    }
  }
  walk(relativeDir)
  return found.sort()
}

function splitGuardArgs(raw: string): string[] {
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
}

describe("CRM route handler role matrix (app/api/admin/crm/** by directory scan)", () => {
  const discovered = listRouteFiles("")
  const expectedRoutes = Object.keys(CRM_ROUTE_HANDLER_MATRIX).sort()

  it("every route.ts under app/api/admin/crm is listed in the matrix (and vice versa)", () => {
    expect(discovered, "new/removed CRM route files must be reflected in CRM_ROUTE_HANDLER_MATRIX").toEqual(
      expectedRoutes
    )
  })

  it(`fixes ${EXPECTED_HANDLER_TOTAL} handlers with the expected role distribution`, () => {
    const distribution: Record<RoleSpec, number> = {
      CRM_STAFF_ADMIN_API_ROLES: 0,
      STAFF_ADMIN_API_ROLES: 0,
      DEFAULT_BY_METHOD: 0,
    }
    let total = 0
    for (const handlers of Object.values(CRM_ROUTE_HANDLER_MATRIX)) {
      for (const spec of Object.values(handlers)) {
        total += 1
        distribution[spec.roles] += 1
      }
    }
    expect(total).toBe(EXPECTED_HANDLER_TOTAL)
    expect(distribution).toEqual(EXPECTED_ROLE_DISTRIBUTION)
  })

  it("DEFAULT_BY_METHOD handlers are all unsafe methods whose default resolves to STAFF_ADMIN_API_ROLES", () => {
    for (const [route, handlers] of Object.entries(CRM_ROUTE_HANDLER_MATRIX)) {
      for (const [method, spec] of Object.entries(handlers)) {
        if (spec.roles !== "DEFAULT_BY_METHOD") continue
        expect(method, `${route} ${method}: GET must never rely on the default (VIEWER-inclusive)`).not.toBe("GET")
        expect(
          [...defaultAdminApiRolesForMethod(method)],
          `${route} ${method}: default role set drifted away from STAFF_ADMIN_API_ROLES`
        ).toEqual([...STAFF_ADMIN_API_ROLES])
      }
    }
  })

  it("has no capability checks (requireAdminCapability) in any CRM route — current state, not a policy", () => {
    for (const route of discovered) {
      const source = readFileSync(join(process.cwd(), CRM_ROUTE_DIR, route), "utf8")
      expect(
        source.includes("requireAdminCapability") || source.includes("hasAdminCapability"),
        `${route} introduced a capability check — add it to the matrix intentionally`
      ).toBe(false)
    }
  })

  for (const [route, expectedHandlers] of Object.entries(CRM_ROUTE_HANDLER_MATRIX)) {
    const expectedMethods = HTTP_METHODS.filter((method) => method in expectedHandlers)
    const label = expectedMethods
      .map((method) => {
        const spec = expectedHandlers[method] as HandlerSpec
        return `${method}=${spec.guard}(${spec.roles})`
      })
      .join(", ")

    it(`${CRM_ROUTE_DIR}/${route}: ${label}`, () => {
      const absolute = join(process.cwd(), CRM_ROUTE_DIR, route)
      expect(existsSync(absolute), `${route} is in the matrix but missing on disk`).toBe(true)
      const source = readFileSync(absolute, "utf8")
      const handlers = splitRouteHandlers(source)

      // export된 메서드 집합이 매트릭스와 정확히 같아야 한다 (핸들러 추가·삭제 감지).
      expect(
        HTTP_METHODS.filter((method) => handlers.has(method)),
        `${route}: exported handler set changed — update the matrix`
      ).toEqual(expectedMethods)

      for (const method of expectedMethods) {
        const spec = expectedHandlers[method] as HandlerSpec
        const body = handlers.get(method) ?? ""
        const calls = [...body.matchAll(/\b(requireVerifiedAdminContext|verifyAdmin)\s*\(([^)]*)\)/g)]
        expect(calls.length, `${route} ${method}: expected exactly one admin guard call`).toBe(1)

        const [, guard, rawArgs] = calls[0]
        expect(guard, `${route} ${method}: guard function`).toBe(spec.guard)

        const args = splitGuardArgs(rawArgs)
        expect(args[0], `${route} ${method}: guard must receive the request first`).toBe("req")
        if (spec.roles === "DEFAULT_BY_METHOD") {
          expect(
            args,
            `${route} ${method}: intended to rely on the method default — must pass no role argument`
          ).toEqual(["req"])
        } else {
          expect(
            args,
            `${route} ${method}: role constant must be passed explicitly (no default reliance)`
          ).toEqual(["req", spec.roles])
        }
      }
    })
  }
})
