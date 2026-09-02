import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 어드민 인증 경로의 GoTrue 왕복 예산을 고정하는 테스트.
//
// 핵심 계약:
//  1. 유효한(만료되지 않은) 토큰이면 미들웨어는 getClaims()만 쓰고 getUser()를 부르지 않는다.
//     (비대칭 서명 키 프로젝트에서 getClaims는 JWKS 로컬 검증이라 네트워크 왕복이 0회다.)
//  2. getClaims가 없거나 실패하면 기존 getUser() 경로로 폴백한다. → 회귀 없음.
//  3. /admin 페이지 요청은 토큰 검증을 요청당 1회만 한다. (프록시가 미들웨어 결과를 재사용)
//  4. /api/admin/* 가드는 같은 세션 쿠키에 대해 60초 안에서 원격 조회를 1회만 한다.
//  5. 비활성(admin_profiles.status !== "ACTIVE") 프로필은 여전히 401 / 로그인 리다이렉트다.

type StubClaims = { sub?: unknown; email?: unknown } | null

type StubConfig = {
  omitGetClaims?: boolean
  claims?: StubClaims
  claimsError?: unknown
  claimsThrows?: boolean
  user?: { id: string; email?: string } | null
  userError?: unknown
  profile?: Record<string, unknown> | null
  profileError?: unknown
}

const counters = { createClient: 0, getClaims: 0, getUser: 0, profile: 0 }
let config: StubConfig = {}

function buildClientStub() {
  counters.createClient += 1

  const auth: Record<string, unknown> = {
    async getUser() {
      counters.getUser += 1
      return {
        data: { user: config.user ?? null },
        error: config.userError ?? null,
      }
    },
  }

  if (!config.omitGetClaims) {
    auth.getClaims = async () => {
      counters.getClaims += 1
      if (config.claimsThrows) throw new Error("jwks unreachable")
      if (config.claimsError) return { data: null, error: config.claimsError }
      const claims = config.claims
      return claims ? { data: { claims }, error: null } : { data: null, error: null }
    }
  }

  return {
    auth,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  counters.profile += 1
                  return {
                    data: config.profile ?? null,
                    error: config.profileError ?? null,
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => buildClientStub(),
}))

const { updateSupabaseSession, verifySupabaseAuthUser } = await import(
  "@/lib/supabase/middleware"
)
const { proxy } = await import("@/proxy")
const { verifyAdmin } = await import("@/lib/admin-auth")

const ACTIVE_ADMIN_PROFILE = {
  user_id: "user-1",
  display_name: "왕찬",
  role: "ADMIN",
  status: "ACTIVE",
  capabilities: [],
}

// 캐시는 모듈 스코프에 살아 있으므로 테스트마다 다른 쿠키 값을 써서 키를 분리한다.
let cookieSeed = 0
function nextCookie() {
  cookieSeed += 1
  return `sb-project-auth-token=token-${cookieSeed}`
}

function makeRequest(path: string, cookie: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie },
  })
}

beforeEach(() => {
  counters.createClient = 0
  counters.getClaims = 0
  counters.getUser = 0
  counters.profile = 0
  config = {}
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("verifySupabaseAuthUser", () => {
  it("trusts locally verified claims without any getUser round trip", async () => {
    config = { claims: { sub: "user-1", email: "admin@classin.com" } }

    const user = await verifySupabaseAuthUser(buildClientStub().auth as never)

    expect(user).toEqual({ id: "user-1", email: "admin@classin.com" })
    expect(counters.getClaims).toBe(1)
    expect(counters.getUser).toBe(0)
  })

  it("falls back to getUser when the auth-js build has no getClaims", async () => {
    config = { omitGetClaims: true, user: { id: "user-1", email: "admin@classin.com" } }

    const user = await verifySupabaseAuthUser(buildClientStub().auth as never)

    expect(user).toEqual({ id: "user-1", email: "admin@classin.com" })
    expect(counters.getClaims).toBe(0)
    expect(counters.getUser).toBe(1)
  })

  it("falls back to getUser when getClaims returns an error", async () => {
    config = {
      claimsError: { name: "AuthApiError", message: "invalid jwt" },
      user: { id: "user-2" },
    }

    const user = await verifySupabaseAuthUser(buildClientStub().auth as never)

    expect(user).toEqual({ id: "user-2", email: undefined })
    expect(counters.getClaims).toBe(1)
    expect(counters.getUser).toBe(1)
  })

  it("falls back to getUser when getClaims throws (no WebCrypto / JWKS failure)", async () => {
    config = { claimsThrows: true, user: { id: "user-3" } }

    const user = await verifySupabaseAuthUser(buildClientStub().auth as never)

    expect(user?.id).toBe("user-3")
    expect(counters.getUser).toBe(1)
  })

  it("never trusts a claims payload without a subject", async () => {
    config = { claims: { sub: "   " }, user: null, userError: { message: "no session" } }

    expect(await verifySupabaseAuthUser(buildClientStub().auth as never)).toBeNull()
    expect(counters.getUser).toBe(1)
  })
})

describe("updateSupabaseSession", () => {
  it("returns the verified identity so downstream guards can reuse it", async () => {
    config = { claims: { sub: "user-1", email: "admin@classin.com" } }

    const { response, user } = await updateSupabaseSession(
      makeRequest("/admin/leads", nextCookie())
    )

    expect(user).toEqual({ id: "user-1", email: "admin@classin.com" })
    expect(response.headers.get("location")).toBeNull()
    expect(counters.getClaims).toBe(1)
    expect(counters.getUser).toBe(0)
  })

  it("skips Supabase entirely for anonymous requests without sb-* cookies", async () => {
    const { user } = await updateSupabaseSession(
      makeRequest("/admin/leads", "other=1")
    )

    expect(user).toBeNull()
    expect(counters.createClient).toBe(0)
  })
})

describe("admin page proxy", () => {
  it("verifies the token once per request and only queries admin_profiles afterwards", async () => {
    config = { claims: { sub: "user-1" }, profile: { role: "ADMIN", status: "ACTIVE" } }

    const response = await proxy(makeRequest("/admin/leads", nextCookie()))

    expect(response.headers.get("location")).toBeNull()
    expect(counters.getClaims).toBe(1)
    expect(counters.getUser).toBe(0)
    expect(counters.profile).toBe(1)
  })

  it("reuses the 60s session cache so repeat page loads skip admin_profiles too", async () => {
    config = { claims: { sub: "user-1" }, profile: { role: "ADMIN", status: "ACTIVE" } }
    const cookie = nextCookie()

    await proxy(makeRequest("/admin/leads", cookie))
    const second = await proxy(makeRequest("/admin/hardware", cookie))

    expect(second.headers.get("location")).toBeNull()
    expect(counters.getClaims).toBe(2) // 세션 갱신 경로는 요청마다 유지된다
    expect(counters.getUser).toBe(0)
    expect(counters.profile).toBe(1) // 프로필 조회만 캐시된다
  })

  it("redirects an inactive admin profile to the login page", async () => {
    config = { claims: { sub: "user-1" }, profile: { role: "ADMIN", status: "SUSPENDED" } }

    const response = await proxy(makeRequest("/admin/leads", nextCookie()))

    expect(response.headers.get("location")).toContain("/admin/login")
  })

  it("redirects when neither getClaims nor getUser can verify the token", async () => {
    config = {
      claimsError: { message: "invalid jwt" },
      user: null,
      userError: { message: "invalid jwt" },
    }

    const response = await proxy(makeRequest("/admin/leads", nextCookie()))

    expect(response.headers.get("location")).toContain("/admin/login")
    expect(counters.profile).toBe(0)
  })
})

describe("admin API guard", () => {
  it("performs one remote lookup per cookie key inside the 60s window", async () => {
    config = { claims: { sub: "user-1" }, profile: ACTIVE_ADMIN_PROFILE }
    const cookie = nextCookie()

    const first = await verifyAdmin(makeRequest("/api/admin/leads", cookie))
    const second = await verifyAdmin(makeRequest("/api/admin/hardware", cookie))

    expect(first).toBeUndefined()
    expect(second).toBeUndefined()
    expect(counters.getClaims).toBe(1)
    expect(counters.getUser).toBe(0)
    expect(counters.profile).toBe(1)
  })

  it("shares a single in-flight lookup across concurrent prefetches", async () => {
    config = { claims: { sub: "user-1" }, profile: ACTIVE_ADMIN_PROFILE }
    const cookie = nextCookie()

    const results = await Promise.all(
      ["/api/admin/leads", "/api/admin/hardware", "/api/admin/crm"].map((path) =>
        verifyAdmin(makeRequest(path, cookie))
      )
    )

    expect(results).toEqual([undefined, undefined, undefined])
    expect(counters.getClaims).toBe(1)
    expect(counters.profile).toBe(1)
  })

  it("falls back to getUser and still authorizes when getClaims is unavailable", async () => {
    config = {
      omitGetClaims: true,
      user: { id: "user-1" },
      profile: ACTIVE_ADMIN_PROFILE,
    }

    expect(await verifyAdmin(makeRequest("/api/admin/leads", nextCookie()))).toBeUndefined()
    expect(counters.getUser).toBe(1)
  })

  it("rejects an inactive admin profile with 401", async () => {
    config = {
      claims: { sub: "user-1" },
      profile: { ...ACTIVE_ADMIN_PROFILE, status: "SUSPENDED" },
    }

    const response = await verifyAdmin(makeRequest("/api/admin/leads", nextCookie()))

    expect(response?.status).toBe(401)
  })

  it("rejects a request whose token fails every verification path with 401", async () => {
    config = {
      claimsError: { message: "invalid jwt" },
      user: null,
      userError: { message: "invalid jwt" },
    }

    const response = await verifyAdmin(makeRequest("/api/admin/leads", nextCookie()))

    expect(response?.status).toBe(401)
    expect(counters.profile).toBe(0)
  })
})
