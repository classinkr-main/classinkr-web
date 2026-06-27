import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse, type NextRequest } from "next/server"

/**
 * 서버 사이드 /admin 게이트.
 *
 * `app/admin/layout.tsx`는 클라이언트 `useEffect` 리다이렉트만으로 보호되므로,
 * 인증되지 않은 클라이언트도 리다이렉트 전에 관리자 페이지 HTML/JS를 받는다.
 * 이 미들웨어는 관리자 세션 쿠키가 전혀 없는 요청을 `/admin/login`으로 돌려
 * "완전 미인증 클라이언트에게 관리자 셸이 전달되는" 구멍을 닫는다.
 *
 * 미들웨어 런타임 제약상 무거운 DB 왕복이나 server-only Supabase 클라이언트를
 * import 하지 않는다. 두 가지 세션 형태를 가볍게 검사한다:
 *  - 레거시 `admin_session` 쿠키: 순수 crypto(HMAC + exp)로 인라인 검증
 *  - Supabase `sb-*` 쿠키: 존재 여부만 게이트(정밀 검증은 클라이언트/ API 라우트)
 *
 * 정밀 권한 검증(role, admin_profiles 상태 등)은 여전히 클라이언트 레이아웃과
 * 각 `app/api/admin/*` 라우트의 `verifyAdmin()`이 담당한다.
 */

function getSessionSecret(): string | null {
  const sessionSecret = process.env.SESSION_SECRET?.trim()
  if (sessionSecret) return sessionSecret

  if (process.env.NODE_ENV !== "production") {
    return process.env.ADMIN_PASSWORD?.trim() ?? null
  }

  return null
}

function safeCompare(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)

  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
}

/**
 * `lib/admin-auth.ts`의 `decodeSession`과 동일한 검증을 미들웨어 런타임에서
 * 안전하게(서명 + 만료) 수행한다. 무거운 import를 피하기 위해 인라인한다.
 */
function hasValidLegacySession(cookieValue: string): boolean {
  const secret = getSessionSecret()
  if (!secret) return false

  try {
    const dotIdx = cookieValue.lastIndexOf(".")
    if (dotIdx === -1) return false

    const payload = cookieValue.slice(0, dotIdx)
    const sig = cookieValue.slice(dotIdx + 1)
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex")
    if (!safeCompare(expectedSig, sig)) return false

    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { exp?: number }
    if (!session.exp || !Number.isFinite(session.exp)) return false
    if (session.exp <= Math.floor(Date.now() / 1000)) return false

    return true
  } catch {
    return false
  }
}

function hasAdminSession(req: NextRequest): boolean {
  const legacy = req.cookies.get("admin_session")?.value
  if (legacy && hasValidLegacySession(legacy)) return true

  // Supabase 세션은 미들웨어에서 정밀 검증(getUser + admin_profiles)을 할 수 없으므로
  // 쿠키 존재 여부만 게이트한다. 정밀 검증은 레이아웃/ API 라우트가 수행한다.
  const hasSupabaseCookie = req.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-"))
  if (hasSupabaseCookie) return true

  return false
}

/**
 * `lib/admin-env.ts`의 `isAdminAuthBypassEnabled()`와 동일한 조건.
 * Vercel 배포 환경에서는 절대 우회되지 않는다. 미들웨어 무거운 import를 피하기
 * 위해 인라인한다(레이아웃/ API 라우트는 여전히 동일 헬퍼로 우회를 일관 처리).
 */
function isAdminAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true" &&
    !process.env.VERCEL
  )
}

export function middleware(req: NextRequest): NextResponse {
  if (isAdminAuthBypassEnabled() || hasAdminSession(req)) {
    return NextResponse.next()
  }

  const loginUrl = new URL("/admin/login", req.nextUrl.origin)
  loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  /**
   * `/admin/*`만 게이트한다. 다음은 제외:
   *  - `/admin/login` (로그아웃 상태에서 접근 가능해야 함)
   *  - `/api/admin/auth` 등 모든 API 라우트(matcher가 `/admin/` 페이지 경로만 매칭)
   *  - Next.js 내부 에셋(`_next/*`)
   *
   * matcher는 `/admin` 또는 `/admin/<...>` 형태의 페이지 경로만 매칭하며,
   * `/admin/login`(과 그 하위)은 negative lookahead로 제외한다.
   */
  matcher: ["/admin/((?!login).*)", "/admin"],
}
