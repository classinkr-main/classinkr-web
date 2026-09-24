import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { normalizeNavOverrides } from "@/components/admin/admin-nav-access"
import {
  invalidateAdminShellSessionCache,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { ADMIN_USER_DIRECTORY_CACHE_TAG } from "@/lib/repositories/admin-users"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// PATCH /api/admin/me/nav — 본인 사이드바 편집(상시·기타·숨김) 저장.
//
// 개인 취향 설정이지 권한이 아니다: nav_overrides 는 사이드바 목록의 자리만 바꾸고, 숨긴 탭도
// ⌘K·주소로 그대로 열린다(components/admin/admin-nav-access.ts). 그래서 모든 활성 관리자
// 역할이 **자기 행만** 바꿀 수 있다. 남의 배치는 SUPER_ADMIN 전용 PATCH /api/admin/users 가 맡는다.
//
// 계약:
//  - 대상은 세션의 userId 하나다. body 의 userId 는 읽지 않는다(타인 행 변경 경로를 만들지 않는다).
//  - admin_profiles 를 거치지 않은 세션(레거시 쿠키·dev 바이패스)은 저장할 행이 없어 409, DB 호출 없음.
//  - 요청은 전체 상태({ navOverrides })다 — 부분 병합이 아니다. 정규화가 모르는 href·값을 버리고
//    Overview 의 hidden 을 지운다.
//  - nav_preset(레거시 컬럼)은 건드리지 않는다.
//  - 성공하면 사용자 디렉터리 캐시 태그와 이 인스턴스의 셸 세션 캐시를 무효화한다.
export async function PATCH(req: NextRequest) {
  // unsafe 메서드의 기본 허용 역할은 STAFF_ADMIN 이다 — 본인 설정은 전 역할이 써야 하므로 명시한다.
  const admin = await requireVerifiedAdminContext(req, ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR", "VIEWER"])
  if (admin instanceof NextResponse) return admin

  if (admin.source !== "supabase" || !admin.userId) {
    return NextResponse.json(
      {
        error: "이 로그인 세션에는 저장할 관리자 프로필이 없습니다. Supabase 계정으로 로그인해 주세요.",
        code: "NAV_PROFILE_REQUIRED",
      },
      { status: 409 }
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || !("navOverrides" in body)) {
    return NextResponse.json({ error: "navOverrides is required" }, { status: 400 })
  }

  const navOverrides = normalizeNavOverrides((body as { navOverrides?: unknown }).navOverrides)

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("admin_profiles")
    .update({ nav_overrides: navOverrides })
    .eq("user_id", admin.userId)
    .eq("status", "ACTIVE")
    .select("user_id, nav_overrides")
    .single()

  if (error || !data) {
    console.error("[PATCH /api/admin/me/nav]", error)
    return NextResponse.json({ error: "사이드바 설정을 저장하지 못했습니다." }, { status: 500 })
  }

  await logAdminAudit({
    admin,
    action: "admin.nav_access.self_update",
    targetType: "admin_profile",
    targetId: admin.userId,
    payload: { navOverrides },
  })

  // admin_profiles 를 바꿨으니 120초 사용자 디렉터리 캐시(설정 › 회원의 "개인 N" 표시 등)와
  // 60초 셸 세션 캐시를 비운다. 셸 캐시는 이 인스턴스만 비워지므로 클라이언트가 저장 직후
  // 65초 동안 자기 값을 우선한다(components/admin/AdminShell.tsx).
  revalidateTag(ADMIN_USER_DIRECTORY_CACHE_TAG, "max")
  invalidateAdminShellSessionCache()

  return NextResponse.json({ navOverrides: normalizeNavOverrides(data.nav_overrides) })
}
