import "server-only"

// 위컴 userid → 어드민 계정. 연결표(환경변수, aibot-config.ts)가 이메일을 주면 그 이메일의 어드민 프로필을 찾는다.
// 활성(ACTIVE) 프로필만. 역할은 admin_profiles.role — 화면 로그인과 같은 값이다.
// 다음 단계에서 연결표를 DB 표로 옮기면 이 파일만 바뀐다.
import type { StaffIdentity } from "@/lib/admin-ai/server/actor"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type AdminAccountLookup =
  | { ok: true; admin: StaffIdentity }
  | { ok: false; reason: "not_found" | "inactive" | "no_role" | "lookup_failed" }

/** 이메일 → 인증 사용자 키만 잠시 기억한다(사용자 목록을 쪽마다 넘기는 조회라 비싸다). 계정 키는 바뀌지 않는다. */
const USER_ID_TTL_MS = 5 * 60 * 1000
const PAGE_SIZE = 200
const MAX_PAGES = 10
const userIdCache = new Map<string, { at: number; userId: string | null }>()

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw new Error("auth_lookup_failed")
    const users = data?.users ?? []
    const hit = users.find((user) => user.email?.trim().toLowerCase() === email)
    if (hit) return hit.id
    if (users.length < PAGE_SIZE) return null
  }
  return null
}

async function cachedUserId(email: string, now: number): Promise<string | null> {
  const cached = userIdCache.get(email)
  if (cached && now - cached.at < USER_ID_TTL_MS) return cached.userId
  const userId = await findAuthUserIdByEmail(email)
  userIdCache.set(email, { at: now, userId })
  return userId
}

/**
 * 이메일(소문자)로 어드민 계정을 찾는다. 프로필(상태·역할·권한)은 글마다 새로 읽는다 — 어드민 화면에서 비활성·역할을 바꾸면
 * 다음 글부터 바로 따른다. 이메일 → 계정 키만 5분 기억한다(새로 만든 계정은 최대 5분 뒤 연결된다). 실패는 기억하지 않는다.
 */
export async function lookupAdminByEmail(email: string, now: number = Date.now()): Promise<AdminAccountLookup> {
  try {
    const userId = await cachedUserId(email, now)
    if (!userId) return { ok: false, reason: "not_found" }
    const { data, error } = await createSupabaseAdminClient()
      .from("admin_profiles")
      .select("user_id, display_name, role, status, capabilities")
      .eq("user_id", userId)
      .maybeSingle()
    if (error) throw new Error("profile_lookup_failed")
    const profile = data as { user_id: string; display_name: string | null; role: string | null; status: string | null; capabilities?: string[] | null } | null
    if (!profile) return { ok: false, reason: "not_found" }
    if (profile.status !== "ACTIVE") return { ok: false, reason: "inactive" }
    if (!profile.role?.trim()) return { ok: false, reason: "no_role" }
    return {
      ok: true,
      admin: {
        source: "supabase",
        role: profile.role,
        name: profile.display_name ?? undefined,
        userId: profile.user_id,
        capabilities: profile.capabilities ?? [],
      },
    }
  } catch {
    return { ok: false, reason: "lookup_failed" }
  }
}
