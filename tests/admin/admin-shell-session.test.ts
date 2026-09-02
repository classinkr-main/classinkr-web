import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 어드민 셸 세션의 서버 부트스트랩 계약을 고정하는 테스트.
//
// 이 함수가 세션을 돌려주면 클라이언트(components/admin/AdminShell.tsx)는 마운트 후
// getUser() + admin_profiles 왕복을 통째로 건너뛴다. 그래서 여기서 지켜야 할 것은
// "정확히 언제 세션을 주고, 언제 원격을 때리는가" 두 가지다.
//
//  1. sb-* 쿠키가 없으면 원격 왕복 0회로 즉시 null (로그인 페이지 비용 ≈ 0)
//  2. 유효 토큰 + ACTIVE 프로필이면 nav_preset/nav_overrides까지 실린 세션
//  3. 비활성 프로필은 null → 클라이언트가 기존 경로(로그인 리다이렉트)를 탄다
//  4. 확장 select가 없는 DB(마이그레이션 이전)에서는 3컬럼으로 폴백한다
//  5. 같은 쿠키는 60초 안에서 원격 조회 1회
//  6. Supabase 세션이 없으면 서명·만료가 검증된 admin_session 쿠키로 폴백
//  7. dev 바이패스는 null (클라이언트가 자기 페르소나를 그대로 쓰게 둔다)

type StubClaims = { sub?: unknown; email?: unknown } | null

type StubConfig = {
  claims?: StubClaims
  claimsError?: unknown
  user?: { id: string; email?: string } | null
  userError?: unknown
  profile?: Record<string, unknown> | null
  profileError?: unknown
  /** 확장 select(nav_preset 포함)만 실패시킨다 — 마이그레이션 이전 DB 재현. */
  extendedSelectError?: unknown
}

const counters = { createClient: 0, getClaims: 0, getUser: 0, extendedSelect: 0, baseSelect: 0 }
let config: StubConfig = {}
let cookieJar: { name: string; value: string }[] = []

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => cookieJar,
    get: (name: string) => cookieJar.find((cookie) => cookie.name === name),
  }),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    counters.createClient += 1

    return {
      auth: {
        async getClaims() {
          counters.getClaims += 1
          if (config.claimsError) return { data: null, error: config.claimsError }
          const claims = config.claims
          return claims ? { data: { claims }, error: null } : { data: null, error: null }
        },
        async getUser() {
          counters.getUser += 1
          return {
            data: { user: config.user ?? null },
            error: config.userError ?? null,
          }
        },
      },
      from() {
        return {
          select(columns: string) {
            const extended = columns.includes("nav_preset")
            return {
              eq() {
                return {
                  async single() {
                    if (extended) {
                      counters.extendedSelect += 1
                      if (config.extendedSelectError) {
                        return { data: null, error: config.extendedSelectError }
                      }
                      return { data: config.profile ?? null, error: config.profileError ?? null }
                    }

                    counters.baseSelect += 1
                    const profile = config.profile
                    return {
                      data: profile
                        ? {
                            display_name: profile.display_name,
                            role: profile.role,
                            status: profile.status,
                          }
                        : null,
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
  },
}))

const { encodeSession, resolveAdminShellSession } = await import("@/lib/admin-auth")

const ACTIVE_PROFILE = {
  display_name: "왕찬",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  nav_preset: "sales",
  nav_overrides: { "/admin/crm": "primary" },
}

// 캐시는 모듈 스코프에 살아 있으므로 테스트마다 다른 쿠키 값으로 키를 분리한다.
let cookieSeed = 0
function useSupabaseCookie() {
  cookieSeed += 1
  cookieJar = [{ name: "sb-project-auth-token", value: `token-${cookieSeed}` }]
}

beforeEach(() => {
  counters.createClient = 0
  counters.getClaims = 0
  counters.getUser = 0
  counters.extendedSelect = 0
  counters.baseSelect = 0
  config = {}
  cookieJar = []
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
  vi.stubEnv("SESSION_SECRET", "shell-session-test-secret")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("resolveAdminShellSession", () => {
  it("returns null without a single round trip when there is no session cookie", async () => {
    expect(await resolveAdminShellSession()).toBeNull()
    expect(counters.createClient).toBe(0)
    expect(counters.getClaims).toBe(0)
    expect(counters.extendedSelect).toBe(0)
  })

  it("hands back the full shell session for a verified ACTIVE admin", async () => {
    config = { claims: { sub: "user-1", email: "admin@classin.com" }, profile: ACTIVE_PROFILE }
    useSupabaseCookie()

    expect(await resolveAdminShellSession()).toEqual({
      role: "SUPER_ADMIN",
      name: "왕찬",
      email: "admin@classin.com",
      navPreset: "sales",
      navOverrides: { "/admin/crm": "primary" },
      source: "supabase",
    })
    // 로컬 claims 검증만으로 끝난다 — GoTrue getUser 왕복 없음.
    expect(counters.getUser).toBe(0)
    expect(counters.extendedSelect).toBe(1)
  })

  it("returns null for a suspended admin profile", async () => {
    config = { claims: { sub: "user-1" }, profile: { ...ACTIVE_PROFILE, status: "SUSPENDED" } }
    useSupabaseCookie()

    expect(await resolveAdminShellSession()).toBeNull()
  })

  it("returns null when the token cannot be verified", async () => {
    config = {
      claimsError: { message: "invalid jwt" },
      user: null,
      userError: { message: "invalid jwt" },
    }
    useSupabaseCookie()

    expect(await resolveAdminShellSession()).toBeNull()
    expect(counters.extendedSelect).toBe(0)
  })

  it("falls back to the three-column select before the nav migration", async () => {
    config = {
      claims: { sub: "user-1" },
      profile: ACTIVE_PROFILE,
      extendedSelectError: { code: "42703", message: "column nav_preset does not exist" },
    }
    useSupabaseCookie()

    // 프리셋 없음 = 마이그레이션 이전과 동일한 동작(전 탭 상시)이지 세션 실패가 아니다.
    expect(await resolveAdminShellSession()).toEqual({
      role: "SUPER_ADMIN",
      name: "왕찬",
      email: "",
      navPreset: null,
      navOverrides: {},
      source: "supabase",
    })
    expect(counters.extendedSelect).toBe(1)
    expect(counters.baseSelect).toBe(1)
  })

  it("serves the same cookie from cache for 60s instead of re-querying", async () => {
    config = { claims: { sub: "user-1" }, profile: ACTIVE_PROFILE }
    useSupabaseCookie()

    const first = await resolveAdminShellSession()
    const second = await resolveAdminShellSession()

    expect(second).toEqual(first)
    expect(counters.getClaims).toBe(1)
    expect(counters.extendedSelect).toBe(1)
  })

  it("shares one in-flight lookup across concurrent renders", async () => {
    config = { claims: { sub: "user-1" }, profile: ACTIVE_PROFILE }
    useSupabaseCookie()

    const results = await Promise.all([
      resolveAdminShellSession(),
      resolveAdminShellSession(),
      resolveAdminShellSession(),
    ])

    expect(results[0]).toEqual(results[2])
    expect(counters.extendedSelect).toBe(1)
  })

  it("falls back to the signed legacy cookie when there is no Supabase session", async () => {
    cookieJar = [
      {
        name: "admin_session",
        value: encodeSession({ name: "지점장", role: "branch", branch: "강남" }),
      },
    ]

    expect(await resolveAdminShellSession()).toEqual({
      role: "branch",
      name: "지점장",
      email: "",
      navPreset: null,
      navOverrides: {},
      branch: "강남",
      source: "legacy",
    })
    // sb-* 쿠키가 없으므로 Supabase 클라이언트는 아예 만들지 않는다.
    expect(counters.createClient).toBe(0)
  })

  it("rejects a legacy cookie whose signature does not match", async () => {
    const signed = encodeSession({ name: "지점장", role: "branch" })
    cookieJar = [{ name: "admin_session", value: `${signed.split(".")[0]}.deadbeef` }]

    expect(await resolveAdminShellSession()).toBeNull()
  })

  it("stays out of the way of the dev bypass persona", async () => {
    config = { claims: { sub: "user-1" }, profile: ACTIVE_PROFILE }
    useSupabaseCookie()
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_SKIP_ADMIN_AUTH", "true")
    vi.stubEnv("VERCEL", "")

    expect(await resolveAdminShellSession()).toBeNull()
    expect(counters.createClient).toBe(0)
  })
})
