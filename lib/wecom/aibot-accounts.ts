import "server-only"

// 위컴 userid → 어드민 계정. 연결표(환경변수, aibot-config.ts)가 이메일을 주면 그 이메일의 어드민 프로필을 찾는다.
// 활성(ACTIVE) 프로필만. 역할은 admin_profiles.role — 화면 로그인과 같은 값이다.
// 다음 단계에서 연결표를 DB 표로 옮기면 이 파일만 바뀐다.
import type { StaffIdentity } from "@/lib/admin-ai/server/actor"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type AdminAccountLookup =
  | { ok: true; admin: StaffIdentity }
  | { ok: false; reason: "not_found" | "inactive" | "no_role" | "lookup_failed" }

const CACHE_TTL_MS = 5 * 60 * 1000
const PAGE_SIZE = 200
const MAX_PAGES = 10
const cache = new Map<string, { at: number; value: AdminAccountLookup }>()

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

/** 이메일(소문자)로 어드민 계정을 찾는다. 결과는 5분 동안 인스턴스 메모리에 둔다(실패는 두지 않는다). */
export async function lookupAdminByEmail(email: string, now: number = Date.now()): Promise<AdminAccountLookup> {
  const cached = cache.get(email)
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value
  let value: AdminAccountLookup
  try {
    const userId = await findAuthUserIdByEmail(email)
    if (!userId) {
      value = { ok: false, reason: "not_found" }
    } else {
      const { data, error } = await createSupabaseAdminClient()
        .from("admin_profiles")
        .select("user_id, display_name, role, status, capabilities")
        .eq("user_id", userId)
        .maybeSingle()
      if (error) throw new Error("profile_lookup_failed")
      const profile = data as { user_id: string; display_name: string | null; role: string | null; status: string | null; capabilities?: string[] | null } | null
      if (!profile) value = { ok: false, reason: "not_found" }
      else if (profile.status !== "ACTIVE") value = { ok: false, reason: "inactive" }
      else if (!profile.role?.trim()) value = { ok: false, reason: "no_role" }
      else
        value = {
          ok: true,
          admin: {
            source: "supabase",
            role: profile.role,
            name: profile.display_name ?? undefined,
            userId: profile.user_id,
            capabilities: profile.capabilities ?? [],
          },
        }
    }
  } catch {
    return { ok: false, reason: "lookup_failed" }
  }
  cache.set(email, { at: now, value })
  return value
}
