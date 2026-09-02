"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import AdminSidebar from "@/components/admin/AdminSidebar"
import AdminCommandPaletteLauncher from "@/components/admin/AdminCommandPaletteLauncher"
import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  getAccessibleAdminNavItems,
  isNavPresetKey,
  normalizeNavOverrides,
  resolveAdminNavAccess,
} from "@/components/admin/admin-nav-access"
import { resolveAdminNavParentHref } from "@/components/admin/admin-nav-routes"
import { RouteTransition } from "@/components/transitions/RouteTransition"
import type { AdminShellSession } from "@/lib/admin-auth"
import { clearAdminSessionStorage } from "@/lib/admin-client"
import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

// 셸이 실제로 그리는 데 쓰는 필드. 서버 세션(AdminShellSession)에서 파생시켜
// 두 모양이 조용히 어긋나는 걸 컴파일러가 잡게 한다.
type SessionInfo = Pick<
  AdminShellSession,
  "role" | "name" | "email" | "navPreset" | "navOverrides"
>

// dev 바이패스가 흉내 낼 페르소나 — 사이드바 프리셋을 로컬에서 검증하기 위한 손잡이.
//
// 바이패스는 어떤 계정으로 들어오든 세션을 Dev/dev@local로 덮어쓰고 nav_preset을 비운다.
// nav_preset이 비면 설계상 "기존 동작 = 전 탭 상시"라(admin-nav-access.ts resolveNavPlacement
// 첫 분기) 로컬에서는 프리셋이 적용된 화면을 아예 볼 수 없었다 — 확인하려면 매번 이 파일을
// 손으로 고쳤다 되돌려야 했다. 그래서 env로 뺀다.
//
//   NEXT_PUBLIC_DEV_NAV_PRESET=sales   # staff|sales|marketing|cs|lead|branch|super
//   NEXT_PUBLIC_DEV_ROLE=ADMIN         # 생략 시 admin
//
// 둘 다 미설정이면 기존 동작 그대로다. 프로덕션에는 영향이 없다 —
// isAdminAuthBypassEnabled()가 NODE_ENV=development + !VERCEL을 요구한다.
const DEV_ROLE = process.env.NEXT_PUBLIC_DEV_ROLE?.trim() || "admin"
const DEV_NAV_PRESET = process.env.NEXT_PUBLIC_DEV_NAV_PRESET?.trim() || ""

// dev 바이패스 토큰은 모듈 로드 시점(어떤 컴포넌트 렌더/이펙트보다 먼저)에 기록한다.
// React 이펙트는 자식이 부모보다 먼저 실행되므로, 레이아웃 이펙트에서만 기록하면
// 페이지 컴포넌트의 첫 데이터 fetch가 토큰 없이 나가는 마운트 레이스가 생긴다.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") {
  if (!sessionStorage.getItem("admin_token")) {
    sessionStorage.setItem("admin_password", "dev-skip")
    sessionStorage.setItem("admin_token", "dev-skip")
    sessionStorage.setItem("admin_role", DEV_ROLE)
    sessionStorage.setItem("admin_name", DEV_NAV_PRESET ? `Dev (${DEV_NAV_PRESET})` : "Dev")
    sessionStorage.setItem("admin_email", "dev@local")
    sessionStorage.setItem("admin_nav_preset", DEV_NAV_PRESET)
    sessionStorage.setItem("admin_nav_overrides", "{}")
  }
}

function readCachedSession(): SessionInfo | null {
  if (typeof window === "undefined") return null

  const role = sessionStorage.getItem("admin_role")
  const name = sessionStorage.getItem("admin_name")
  const email = sessionStorage.getItem("admin_email") ?? ""

  if (!role || !name) return null

  // nav_preset/nav_overrides는 20260729 마이그레이션 이후에만 채워진다. 빈 문자열(프리셋
  // 미배정)은 null로 정규화하고, 깨진 JSON 하나로 로그인 캐시 전체가 막히지 않도록 try/catch로 감싼다.
  const navPreset = sessionStorage.getItem("admin_nav_preset")
  let navOverrides: Record<string, string> = {}
  try {
    navOverrides = JSON.parse(sessionStorage.getItem("admin_nav_overrides") ?? "{}")
  } catch {
    navOverrides = {}
  }

  return { role, name, email, navPreset: navPreset || null, navOverrides }
}

// 서버가 확정한 셸 세션을 sessionStorage로 옮긴다 — 기존 클라이언트 경로가 쓰던 키·값을
// 그대로 유지해야 adminFetch(Authorization 헤더)와 sessionStorage를 직접 읽는 화면들
// (CsConsoleNav·BranchDashboardClient·SoftwareQuoteCodesPanel 등)이 그대로 동작한다.
//
// 이펙트가 아니라 렌더 단계에서 부른다: React 이펙트는 자식이 부모보다 먼저 실행되므로
// 여기서 미루면 자식 페이지의 첫 fetch와 lazy initializer가 토큰·역할 없이 먼저 돈다.
// 값이 서버 응답 그대로라 몇 번 실행해도 결과가 같다(멱등).
function hydrateAdminSessionStorage(session: AdminShellSession) {
  if (typeof window === "undefined") return

  const token = session.source === "supabase" ? "supabase-authed" : "legacy-session"

  sessionStorage.setItem("admin_password", token)
  sessionStorage.setItem("admin_token", token)
  sessionStorage.setItem("admin_role", session.role)
  sessionStorage.setItem("admin_name", session.name)
  sessionStorage.setItem("admin_email", session.email)
  sessionStorage.setItem("admin_nav_preset", session.navPreset ?? "")
  sessionStorage.setItem("admin_nav_overrides", JSON.stringify(session.navOverrides))

  if (session.branch) sessionStorage.setItem("admin_branch", session.branch)
  else sessionStorage.removeItem("admin_branch")
}

export default function AdminShell({
  initialSession,
  children,
}: {
  /** 서버(app/admin/layout.tsx)가 해석한 세션. null이면 기존 클라이언트 경로를 그대로 탄다. */
  initialSession: AdminShellSession | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isLoginPage = pathname === "/admin/login"
  const [session, setSession] = useState<SessionInfo | null>(() => {
    if (process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") {
      return {
        role: DEV_ROLE,
        name: DEV_NAV_PRESET ? `Dev (${DEV_NAV_PRESET})` : "Dev",
        email: "dev@local",
        navPreset: DEV_NAV_PRESET || null,
        navOverrides: {},
      }
    }

    // 서버가 이미 확정한 세션이면 첫 렌더부터 사이드바를 그리고, sessionStorage도 지금
    // 채운다(위 hydrateAdminSessionStorage 주석의 마운트 레이스).
    if (initialSession) {
      hydrateAdminSessionStorage(initialSession)
      return initialSession
    }

    return readCachedSession()
  })

  useEffect(() => {
    if (isLoginPage) return

    // 서버 셸 세션이 있으면 브라우저 왕복(getUser + admin_profiles)이 통째로 불필요하다.
    // router.refresh() 등으로 새 세션이 내려오면 sessionStorage와 상태를 다시 맞춘다.
    // 세션 만료는 여기서 감시하지 않는다 — adminFetch가 401을 받으면 세션을 비우고
    // /admin/login으로 보낸다(기존과 동일한 안전망).
    if (initialSession) {
      hydrateAdminSessionStorage(initialSession)
      // 마운트 시점에는 useState 초기값과 같은 객체라 React가 리렌더를 건너뛴다.
      // 값이 실제로 바뀐 경우(router.refresh 등)만 반영된다. queueMicrotask는 아래
      // 바이패스 경로와 같은 이유 — 이펙트 본문에서 동기 setState를 하지 않기 위해서다.
      queueMicrotask(() => setSession(initialSession))
      return
    }

    const cachedSession = readCachedSession()

    if (cachedSession) {
      queueMicrotask(() => setSession((prev) => prev ?? cachedSession))
    }

    if (isAdminAuthBypassEnabled()) {
      queueMicrotask(() => {
        // 여기서는 모듈 상단과 달리 무조건 덮어쓴다 — 이전에 다른 페르소나로 켜뒀던
        // sessionStorage가 남아 있으면 env를 바꿔도 화면이 안 바뀌기 때문이다.
        sessionStorage.setItem("admin_password", "dev-skip")
        sessionStorage.setItem("admin_token", "dev-skip")
        sessionStorage.setItem("admin_role", DEV_ROLE)
        sessionStorage.setItem("admin_name", DEV_NAV_PRESET ? `Dev (${DEV_NAV_PRESET})` : "Dev")
        sessionStorage.setItem("admin_email", "dev@local")
        sessionStorage.setItem("admin_nav_preset", DEV_NAV_PRESET)
        sessionStorage.setItem("admin_nav_overrides", "{}")
        setSession({
          role: DEV_ROLE,
          name: DEV_NAV_PRESET ? `Dev (${DEV_NAV_PRESET})` : "Dev",
          email: "dev@local",
          navPreset: DEV_NAV_PRESET || null,
          navOverrides: {},
        })
      })
      return
    }

    let cancelled = false

    const load = async () => {
      if (!hasSupabaseBrowserEnv()) {
        if (cachedSession) {
          if (!cancelled) setSession(cachedSession)
          return
        }

        try {
          const response = await fetch("/api/admin/auth")
          const data = await response.json().catch(() => null)

          if (!response.ok || !data) {
            clearAdminSessionStorage()
            router.replace("/admin/login")
            return
          }

          sessionStorage.setItem("admin_password", "legacy-session")
          sessionStorage.setItem("admin_token", "legacy-session")
          sessionStorage.setItem("admin_role", data.role ?? "admin")
          sessionStorage.setItem("admin_name", data.name ?? "Admin")
          sessionStorage.setItem("admin_email", "")

          if (data.branch) sessionStorage.setItem("admin_branch", data.branch)
          else sessionStorage.removeItem("admin_branch")

          if (!cancelled) {
            setSession({
              role: data.role ?? "admin",
              name: data.name ?? "Admin",
              email: "",
              // legacy 세션(/api/admin/auth)은 admin_profiles를 거치지 않아 프리셋 데이터가 없다.
              navPreset: null,
              navOverrides: {},
            })
          }
        } catch {
          clearAdminSessionStorage()
          router.replace("/admin/login")
        }

        return
      }

      const supabase = createSupabaseBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        clearAdminSessionStorage()
        router.replace("/admin/login")
        return
      }

      // nav_preset/nav_overrides는 20260729 마이그레이션 이후에만 존재한다.
      // 미적용 환경에서 select 실패로 로그인이 막히는 걸 막으려고 확장 select를 먼저 시도하고,
      // 실패하면 기존 3컬럼으로 폴백한다(= preset 없음 = 오늘과 동일한 동작).
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

      if (!profile || profile.status !== "ACTIVE") {
        clearAdminSessionStorage()
        await supabase.auth.signOut()
        router.replace("/admin/login")
        return
      }

      if (!cancelled) {
        const navPreset = (profile as { nav_preset?: string | null }).nav_preset ?? null
        const navOverrides = (profile as { nav_overrides?: Record<string, string> }).nav_overrides ?? {}

        sessionStorage.setItem("admin_password", "supabase-authed")
        sessionStorage.setItem("admin_token", "supabase-authed")
        sessionStorage.setItem("admin_role", profile.role)
        sessionStorage.setItem("admin_name", profile.display_name)
        sessionStorage.setItem("admin_email", user.email ?? "")
        sessionStorage.removeItem("admin_branch")
        sessionStorage.setItem("admin_nav_preset", navPreset ?? "")
        sessionStorage.setItem("admin_nav_overrides", JSON.stringify(navOverrides))

        setSession({
          role: profile.role,
          name: profile.display_name,
          email: user.email ?? "",
          navPreset,
          navOverrides,
        })
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [initialSession, isLoginPage, router])

  // 차단된 탭에 URL을 직접 쳐서 들어온 경우를 막는다.
  //
  // ⚠️ 이것은 업무 표면 가드이지 보안 경계가 아니다. 셸 세션이 서버(RSC)에서 오더라도
  // 이 컴포넌트는 여전히 클라이언트라 우회 가능하다. 실제 데이터 차단은 각 API의
  // requireVerifiedAdminContext 롤 목록이 담당한다(스펙 §5.5).
  const blocked = (() => {
    if (!session || isLoginPage) return false
    const preset = isNavPresetKey(session.navPreset) ? session.navPreset : null

    // 직접 하위 경로뿐 아니라 사이드바 부모에 흡수된 독립 라우트(events·traffic·CS 계열)도
    // admin-nav-routes SSOT에서 부모를 찾아 동일한 접근 판정을 상속한다.
    const target = resolveAdminNavParentHref(
      pathname,
      ADMIN_NAV.map((item) => item.href)
    )
    if (!target) return false

    const access = resolveAdminNavAccess({
      role: session.role,
      preset,
      overrides: normalizeNavOverrides(session.navOverrides),
    })

    return !getAccessibleAdminNavItems(access).some((item) => item.href === target)
  })()

  if (isLoginPage) return <>{children}</>

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAF8] lg:h-[100dvh] lg:flex-row lg:overflow-hidden">
      {session ? (
        <AdminSidebar
          role={session.role}
          name={session.name}
          email={session.email}
          navPreset={session.navPreset}
          navOverrides={session.navOverrides}
        />
      ) : (
        <aside
          aria-hidden="true"
          className="hidden border-b border-[#e8e8e4] bg-white lg:flex lg:min-h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0"
        >
          <div className="border-b border-[#e8e8e4] px-5 py-6">
            <div className="h-3 w-12 rounded-full bg-[#f0f0ec] animate-pulse" />
            <div className="mt-2 h-4 w-20 rounded-full bg-[#f0f0ec] animate-pulse" />
          </div>
          <div className="flex-1 px-4 py-5">
            <div className="h-32 rounded-2xl border border-dashed border-[#ecece8] bg-[#fafaf8]" />
          </div>
          <div className="px-4 pb-5">
            <div className="h-10 rounded-lg bg-[#f5f5f2] animate-pulse" />
          </div>
        </aside>
      )}
      <main className="min-w-0 flex-1 overflow-x-hidden pt-16 pb-24 lg:overflow-y-auto lg:overscroll-contain lg:pt-0 lg:pb-0">
        <div className="mx-auto w-full max-w-[1680px]">
          <RouteTransition tone="admin">
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
          </RouteTransition>
        </div>
      </main>
      {session ? (
        <AdminCommandPaletteLauncher
          role={session.role}
          navPreset={session.navPreset}
          navOverrides={session.navOverrides}
        />
      ) : null}
    </div>
  )
}
