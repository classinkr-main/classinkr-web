import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "./public-env"

/**
 * 요청 하나에서 확정된 Supabase 사용자 신원. 검증에 성공한 경로에서만 만들어지며,
 * 프록시·API 가드가 같은 요청 안에서 재검증 없이 재사용한다.
 */
export type VerifiedSupabaseUser = {
  id: string
  email?: string
}

type SupabaseClaims = {
  sub?: unknown
  email?: unknown
  [key: string]: unknown
}

/**
 * `supabase.auth`에서 실제로 쓰는 부분만 구조적으로 좁힌 타입.
 * `getClaims`는 구버전 auth-js에 없을 수 있으므로 optional이다.
 */
export type SupabaseAuthVerifier = {
  getUser: () => Promise<{
    data: { user: { id: string; email?: string | null } | null }
    error: unknown
  }>
  getClaims?: () => Promise<{
    data: { claims: SupabaseClaims } | null
    error: unknown
  }>
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * 액세스 토큰을 검증하고 사용자 신원을 돌려준다.
 *
 * 신뢰 모델:
 * - `auth.getClaims()`는 비대칭 서명 키(ECC/RSA) 프로젝트에서 JWKS(10분 캐시)를 이용해
 *   토큰 서명을 **로컬에서 암호학적으로 검증**한다. 즉 만료되지 않은 토큰이면 GoTrue
 *   왕복이 0회다. 토큰이 만료됐거나 만료 직전이면 내부에서 세션을 먼저 갱신하므로
 *   리프레시 토큰 회전은 그대로 동작한다.
 * - 대칭 키(HS256) 레거시 프로젝트이거나 WebCrypto를 못 쓰는 런타임이면 auth-js가
 *   내부적으로 `getUser()`와 동등한 서버 검증을 수행한다. 즉 보안 수준은 동일하고
 *   왕복만 늘어난다(= 기존 동작).
 * - 검증에 실패하거나 `getClaims` 자체가 없는 auth-js 버전이면 기존 `getUser()` 경로로
 *   폴백한다. JWT를 decode만 하고 신뢰하는 경로는 어디에도 없다.
 *
 * 지연 반영(기존 대비 달라지는 지점):
 * - 사용자 삭제/차단(GoTrue 측 변경)은 토큰이 만료될 때까지(기본 최대 1시간) 반영이
 *   늦어질 수 있다. 즉시 차단이 필요하면 세션 무효화(리프레시 토큰 폐기) 후 토큰
 *   만료를 기다리거나 별도 차단 목록이 필요하다.
 * - 관리자 권한 회수(`admin_profiles.role`/`status`)는 기존과 동일하게 최대 60초 지연이다.
 *   프로필 조회 자체는 이 함수 밖에서 그대로 수행된다.
 */
export async function verifySupabaseAuthUser(
  auth: SupabaseAuthVerifier
): Promise<VerifiedSupabaseUser | null> {
  if (typeof auth.getClaims === "function") {
    try {
      const { data, error } = await auth.getClaims()
      const id = error ? undefined : toTrimmedString(data?.claims?.sub)
      if (id) {
        return { id, email: toTrimmedString(data?.claims?.email) }
      }
    } catch {
      // JWKS 조회 실패·WebCrypto 미지원 등 예외는 아래 getUser() 폴백에서 처리한다.
    }
  }

  const {
    data: { user },
    error: userError,
  } = await auth.getUser()
  if (userError || !user) return null

  return { id: user.id, email: toTrimmedString(user.email) }
}

export type SupabaseSessionResult = {
  response: NextResponse
  /** 검증된 사용자. 익명이거나 토큰이 유효하지 않으면 null. */
  user: VerifiedSupabaseUser | null
}

export async function updateSupabaseSession(
  request: NextRequest
): Promise<SupabaseSessionResult> {
  if (!hasSupabaseBrowserEnv()) {
    return { response: NextResponse.next({ request }), user: null }
  }

  // Supabase 인증 쿠키(sb-*)가 없는 익명 요청은 갱신할 세션이 없다.
  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-"))
  if (!hasSupabaseAuthCookie) {
    return { response: NextResponse.next({ request }), user: null }
  }

  const { url, publishableKey } = getSupabaseBrowserEnv()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        response = NextResponse.next({ request })

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // 토큰이 만료됐을 때만 내부에서 세션 갱신이 일어나고, 갱신 결과는 위 setAll을 통해
  // 응답 쿠키에 실린다. (리프레시 토큰 회전·재사용 감지를 위해 반드시 유지해야 한다.)
  const user = await verifySupabaseAuthUser(supabase.auth)

  return { response, user }
}
