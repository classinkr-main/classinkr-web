import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { LEADS_BOARD_FETCH_OPTIONS } from "@/components/admin/crm/leads/LeadsBoardClient"

// T2-S — 리드 보드 캐시 정합. 4,000줄 클라이언트 컴포넌트를 통째로 렌더하는 대신,
// 실제 fetchLeads가 adminFetchJsonCached에 넘기는 옵션 객체를 모듈에서 그대로
// export한 LEADS_BOARD_FETCH_OPTIONS를 검증한다(소스 계약 테스트, tests/admin 관례).
// 정본: docs/active/supabase-optimization-execution-plan-2026-09-02.md §T2-S.

describe("LEADS_BOARD_FETCH_OPTIONS", () => {
  it("CrmSubnav의 60s hover 워밍과 정합하는 30s ttl을 쓴다", () => {
    // 이전엔 ttlMs: 0이라 워밍 캐시를 무시하고 탭 진입마다 전체 테이블을 다시 받았다.
    expect(LEADS_BOARD_FETCH_OPTIONS.ttlMs).toBe(30_000)
  })

  it("전체 테이블을 sessionStorage에 넣지 않는다", () => {
    expect(LEADS_BOARD_FETCH_OPTIONS.persist).toBe(false)
  })

  it("네트워크 실패 시 이전 데이터를 stale로라도 보여준다", () => {
    expect(LEADS_BOARD_FETCH_OPTIONS.staleIfError).toBe(true)
  })

  it("워밍 TTL(60s) 동안은 즉시 stale 응답 + 백그라운드 재검증", () => {
    expect(LEADS_BOARD_FETCH_OPTIONS.staleWhileRevalidateMs).toBe(60_000)
  })

  it("force는 옵션 상수에 없다 — 호출부에서 매 호출 스프레드 뒤에 개별로 얹는다", () => {
    expect(LEADS_BOARD_FETCH_OPTIONS).not.toHaveProperty("force")
  })
})

describe("fetchLeads가 LEADS_BOARD_FETCH_OPTIONS를 그대로 스프레드해서 쓴다", () => {
  const source = readFileSync(
    join(process.cwd(), "components/admin/crm/leads/LeadsBoardClient.tsx"),
    "utf8"
  )

  it("adminFetchJsonCached 호출이 상수를 스프레드하고 force만 옵션별로 얹는다", () => {
    expect(source).toContain(
      'const data = await adminFetchJsonCached<{ leads: LeadRecord[] }>("/api/admin/leads", undefined, {\n' +
        "        ...LEADS_BOARD_FETCH_OPTIONS,\n" +
        "        force: options?.force,\n" +
        "      })"
    )
  })

  it("옛 ttlMs: 0 / staleIfError: false / staleWhileRevalidateMs: 0 조합이 남아있지 않다", () => {
    expect(source).not.toContain("ttlMs: 0,")
    expect(source).not.toContain("staleWhileRevalidateMs: 0,")
  })
})
