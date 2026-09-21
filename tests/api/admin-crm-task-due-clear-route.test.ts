/**
 * PATCH /api/admin/crm/tasks/[id] { action: "update", dueAt } 의 3상태 계약(2026-09-21).
 *
 * 이전엔 라우트가 optionalString(raw.dueAt)로 읽어 null을 undefined(=그대로)로 버렸다 — 기한 없던
 * 할 일을 '내일로' 미룬 뒤 되돌리면 기한이 내일 09:00으로 남았다(crm-tab-develop-plan §10 후속).
 * 반대로 파싱 안 되는 문자열은 저장소 nullableIso가 null로 바꿔 기한을 조용히 지웠다.
 *
 * 저장소(lib/repositories/crm-tasks.ts)는 실제 모듈을 쓰고 Supabase 클라이언트만 기록 스텁으로 바꿔,
 * 요청 바디가 crm_tasks.update(patch)의 due_at까지 어떻게 내려가는지를 끝까지 고정한다.
 */
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}))

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["crm-staff-sentinel"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/admin-users", () => ({
  findAdminCrmOwner: vi.fn(),
  listAdminUserDirectory: vi.fn().mockResolvedValue(null),
}))

const TASK_DB_ROW = {
  id: "task-1",
  target_type: "lead",
  target_id: "lead-1",
  target_label: "테스트 학원",
  owner_key: "kim",
  owner_name_snapshot: "김담당",
  task_type: "call",
  title: "첫 응대 전화",
  detail: null,
  due_at: null,
  snoozed_until: null,
  priority: "normal",
  status: "open",
  source_event_id: null,
  created_by: null,
  assigned_by: null,
  completed_at: null,
  completed_by: null,
  outcome: null,
  created_at: "2026-09-20T00:00:00.000Z",
  updated_at: "2026-09-21T00:00:00.000Z",
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        mocks.updates.push(patch)
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { ...TASK_DB_ROW, ...patch }, error: null }),
            }),
          }),
        }
      },
    }),
  }),
}))

import { PATCH } from "@/app/api/admin/crm/tasks/[id]/route"

function patchRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/tasks/task-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

async function patchTask(body: unknown) {
  const response = await PATCH(patchRequest(body), { params: Promise.resolve({ id: "task-1" }) })
  return { response, json: await response.json() }
}

describe("PATCH /api/admin/crm/tasks/[id] — update dueAt 3상태", () => {
  beforeEach(() => {
    mocks.updates.length = 0
    mocks.requireVerifiedAdminContext.mockReset()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "admin", name: "관리자", userId: "admin-1" })
  })

  it("dueAt: null은 기한을 지운다(due_at = null)", async () => {
    const { response, json } = await patchTask({ action: "update", dueAt: null })

    expect(response.status).toBe(200)
    expect(mocks.updates).toEqual([{ due_at: null }])
    expect(json.task.dueAt).toBeNull()
  })

  it("dueAt 키가 없으면 기한을 건드리지 않는다", async () => {
    const { response } = await patchTask({ action: "update", title: "제목만 바꿈" })

    expect(response.status).toBe(200)
    expect(mocks.updates).toHaveLength(1)
    expect(mocks.updates[0]).toEqual({ title: "제목만 바꿈" })
    expect(mocks.updates[0]).not.toHaveProperty("due_at")
  })

  it("날짜 문자열은 UTC ISO로 정규화해 설정한다", async () => {
    const { response, json } = await patchTask({ action: "update", dueAt: "2026-09-22T09:00:00+09:00" })

    expect(response.status).toBe(200)
    expect(mocks.updates).toEqual([{ due_at: "2026-09-22T00:00:00.000Z" }])
    expect(json.task.dueAt).toBe("2026-09-22T00:00:00.000Z")
  })

  it("빈 문자열은 기존 동작대로 기한 지움으로 받는다(비운 날짜 입력칸)", async () => {
    const { response } = await patchTask({ action: "update", dueAt: "   " })

    expect(response.status).toBe(200)
    expect(mocks.updates).toEqual([{ due_at: null }])
  })

  it("파싱 안 되는 문자열은 기한을 조용히 지우지 않고 400으로 거절한다", async () => {
    const { response, json } = await patchTask({ action: "update", dueAt: "not-a-date" })

    expect(response.status).toBe(400)
    expect(json.error).toBe("Invalid dueAt")
    expect(mocks.updates).toHaveLength(0)
  })

  it.each([[123], [true], [{ at: "2026-09-22" }], [["2026-09-22"]]])(
    "문자열·null이 아닌 dueAt(%j)은 400으로 거절한다",
    async (dueAt) => {
      const { response } = await patchTask({ action: "update", dueAt })

      expect(response.status).toBe(400)
      expect(mocks.updates).toHaveLength(0)
    }
  )

  it("dueAt 검증은 update 액션에만 걸린다 — complete는 dueAt 값과 무관하게 그대로 동작한다", async () => {
    const { response } = await patchTask({ action: "complete", dueAt: "not-a-date" })

    expect(response.status).toBe(200)
    expect(mocks.updates).toHaveLength(1)
    expect(mocks.updates[0]).toMatchObject({ status: "done" })
    expect(mocks.updates[0]).not.toHaveProperty("due_at")
  })

  it("인증 가드는 그대로 — CRM 스태프 롤로 확인하고, 거부되면 쓰기 없이 그 응답을 돌려준다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))

    const { response } = await patchTask({ action: "update", dueAt: null })

    expect(response.status).toBe(403)
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.anything(), ["crm-staff-sentinel"])
    expect(mocks.updates).toHaveLength(0)
  })
})
