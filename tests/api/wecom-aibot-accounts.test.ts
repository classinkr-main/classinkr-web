import { beforeEach, describe, expect, it, vi } from "vitest"

// 어드민 계정 조회 — Supabase 클라이언트는 가짜다(운영 DB 를 부르지 않는다). 값은 지어낸 것이다.
const state = vi.hoisted(() => ({
  profile: { user_id: "user-1", display_name: "스태프(샘플)", role: "ADMIN", status: "ACTIVE", capabilities: [] as string[] } as Record<string, unknown>,
  listUsers: 0,
  profileReads: 0,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async () => {
          state.listUsers += 1
          return { data: { users: [{ id: "user-1", email: "staff1@example.test" }] }, error: null }
        },
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.profileReads += 1
            return { data: { ...state.profile }, error: null }
          },
        }),
      }),
    }),
  }),
}))

import { lookupAdminByEmail } from "@/lib/wecom/aibot-accounts"

beforeEach(() => {
  state.profile = { user_id: "user-1", display_name: "스태프(샘플)", role: "ADMIN", status: "ACTIVE", capabilities: [] }
  state.listUsers = 0
  state.profileReads = 0
})

describe("위컴 계정 조회", () => {
  it("비활성으로 바뀌면 다음 글부터 바로 거절한다(성공 결과를 캐시하지 않는다)", async () => {
    const t0 = Date.UTC(2026, 10, 25)
    expect((await lookupAdminByEmail("staff1@example.test", t0)).ok).toBe(true)
    state.profile = { ...state.profile, status: "INACTIVE" }
    expect(await lookupAdminByEmail("staff1@example.test", t0 + 60_000)).toEqual({ ok: false, reason: "inactive" })
  })

  it("역할을 낮추면 다음 글부터 새 역할을 쓴다", async () => {
    const t0 = Date.UTC(2026, 10, 26)
    await lookupAdminByEmail("staff1@example.test", t0)
    state.profile = { ...state.profile, role: "PARTNER" }
    const next = await lookupAdminByEmail("staff1@example.test", t0 + 1_000)
    expect(next.ok && next.admin.role).toBe("PARTNER")
  })

  it("이메일 → 계정 키(인증 사용자 목록 넘기기)만 잠시 기억한다 — 프로필은 글마다 읽는다", async () => {
    const t0 = Date.UTC(2026, 10, 27)
    await lookupAdminByEmail("staff1@example.test", t0)
    await lookupAdminByEmail("staff1@example.test", t0 + 1_000)
    expect(state.listUsers).toBe(1)
    expect(state.profileReads).toBe(2)
  })
})
