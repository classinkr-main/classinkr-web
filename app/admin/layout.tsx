"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import AdminSidebar from "@/components/admin/AdminSidebar"
import AdminCommandPaletteLauncher from "@/components/admin/AdminCommandPaletteLauncher"
import { ADMIN_NAV, normalizeAdminRole } from "@/components/admin/admin-nav"
import { isNavPresetKey, normalizeNavOverrides, resolveNavPlacement } from "@/components/admin/admin-nav-access"
import { RouteTransition } from "@/components/transitions/RouteTransition"
import { clearAdminSessionStorage } from "@/lib/admin-client"
import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

interface SessionInfo {
  role: string
  name: string
  email: string
  navPreset: string | null
  navOverrides: Record<string, string>
}

// dev 바이패스 토큰은 모듈 로드 시점(어떤 컴포넌트 렌더/이펙트보다 먼저)에 기록한다.
// React 이펙트는 자식이 부모보다 먼저 실행되므로, 레이아웃 이펙트에서만 기록하면
// 페이지 컴포넌트의 첫 데이터 fetch가 토큰 없이 나가는 마운트 레이스가 생긴다.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") {
  if (!sessionStorage.getItem("admin_token")) {
    sessionStorage.setItem("admin_password", "dev-skip")
    sessionStorage.setItem("admin_token", "dev-skip")
    sessionStorage.setItem("admin_role", "admin")
    sessionStorage.setItem("admin_name", "Dev")
    sessionStorage.setItem("admin_email", "dev@local")
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLoginPage = pathname === "/admin/login"
  const [session, setSession] = useState<SessionInfo | null>(() => {
    if (process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") {
      return { role: "admin", name: "Dev", email: "dev@local", navPreset: null, navOverrides: {} }
    }

    return readCachedSession()
  })

  useEffect(() => {
    if (isLoginPage) return

    const cachedSession = readCachedSession()

    if (cachedSession) {
      queueMicrotask(() => setSession((prev) => prev ?? cachedSession))
    }

    if (isAdminAuthBypassEnabled()) {
      queueMicrotask(() => {
        sessionStorage.setItem("admin_password", "dev-skip")
        sessionStorage.setItem("admin_token", "dev-skip")
        sessionStorage.setItem("admin_role", "admin")
        sessionStorage.setItem("admin_name", "Dev")
        sessionStorage.setItem("admin_email", "dev@local")
        setSession({ role: "admin", name: "Dev", email: "dev@local", navPreset: null, navOverrides: {} })
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
  }, [isLoginPage, router])

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
    // 가장 긴 매칭을 고르는 이유: /admin/branch 와 /admin/branch/ledger 가 둘 다 매칭될 때
    // 더 구체적인 쪽(ledger)의 판정이 옳다.
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
      <AdminCommandPaletteLauncher />
    </div>
  )
}
