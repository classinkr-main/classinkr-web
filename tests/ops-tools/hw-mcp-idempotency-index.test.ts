/**
 * HW 배송 예정 MCP 멱등 색인(20261125_hardware_movements_mcp_idempotency_unique.sql)과 키 조회 — 반박 검토 2026-11-25.
 *
 * 어드민 출고 확정(confirm_hardware_planned_movement_v3)은 예정 행의 raw 를 그대로 복사해 출고 행을 만든다. 그래서 출고 행도
 * raw.mcp(호출자·키 해시)를 가진다. 색인과 키 조회가 그 출고 행을 "같은 요청"으로 보면 확정이 23505 로 막히고(막는 결함),
 * 확정된 예정이 "중복"으로 세어져 색인이 만들어지지 않는다(주요 결함). 실제 PostgreSQL 재현은
 * tests/fixtures/hw-mcp-idempotency-index/run-local.sh(일회용 클러스터) — 여기서는 CI 에서 도는 정적·조회 계약만 본다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261125_hardware_movements_mcp_idempotency_unique.sql"), "utf8")
const body = MIGRATION.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n")

describe("마이그레이션 정의", () => {
  it("색인은 MCP 가 직접 만든 살아 있는 예정 행만 넣는다(확정 출고 행·무효 행 제외)", () => {
    const index = body.slice(body.indexOf("create unique index"), body.indexOf("end if;"))
    expect(index).toMatch(/where raw->'mcp'->>'idempotency_key_hash' is not null\s+and converted_from_movement_id is null\s+and voided_at is null;/)
  })

  it("중복 검사는 색인과 같은 조건으로 센다 — 확정된 예정(예정 행 + 출고 행)을 중복으로 세지 않는다", () => {
    const check = body.slice(body.indexOf("select count(*) into duplicate_keys"), body.indexOf("if duplicate_keys"))
    expect(check).toMatch(/is not null\s+and converted_from_movement_id is null\s+and voided_at is null\s+group by/)
  })

  it("머리 주석의 확인 쿼리도 같은 조건이고, 확정 출고 행을 무효 처리하라고 하지 않는다", () => {
    const header = MIGRATION.slice(0, MIGRATION.indexOf("do $$"))
    expect(header).toMatch(/--\s+and converted_from_movement_id is null\n--\s+and voided_at is null/)
    expect(header).toContain("출고 행(converted_from_movement_id 있음)은 무효 처리하지 않는다")
  })
})

describe("키 조회(findHardwareMovementsByMcpIdempotencyKey)", () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock("@/lib/supabase/admin")
  })

  it("확정으로 만들어진 출고 행(raw.mcp 를 물려받음)은 처음 결과에 넣지 않는다", async () => {
    vi.resetModules()
    vi.doMock("server-only", () => ({}))
    vi.doMock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
    const ops: Array<[string, ...unknown[]]> = []
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "is", "order", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        ops.push([m, ...args])
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => builder }) }))
    const { findHardwareMovementsByMcpIdempotencyKey } = await import("@/lib/repositories/hardware-inventory")

    await findHardwareMovementsByMcpIdempotencyKey("bot-a", "h1")

    expect(ops).toContainEqual(["eq", "raw->mcp->>caller", "bot-a"])
    expect(ops).toContainEqual(["eq", "raw->mcp->>idempotency_key_hash", "h1"])
    expect(ops).toContainEqual(["is", "converted_from_movement_id", null])
    // 무효 처리된 예정 행은 여전히 돌려준다(같은 키 = 같은 요청 — 다시 만들지 않는다)
    expect(ops.some(([m, col]) => m === "is" && col === "voided_at")).toBe(false)
  })
})
