import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// 속도 3라운드 Phase 1(docs/active/admin-performance-round3-2026-09-10.md §3.1·§4)의 계약을
// 고정한다. 조회 경로가 다시 동기 재계산을 물게 되면 이 테스트들이 먼저 깨져야 한다.
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260910_admin_crm_overview_stale_first.sql"),
  "utf8"
)
const consumer = readFileSync(join(process.cwd(), "lib/admin-crm-overview.ts"), "utf8")

describe("admin_crm_business_overview — stale-first 계약", () => {
  it("오버로드를 만들지 않고 기존 2인자 함수를 DROP 한다", () => {
    // PostgREST 는 인자 이름으로 후보를 고른다 — 같은 이름의 함수가 둘이면 양쪽 다 죽는다.
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.admin_crm_business_overview(INTEGER, BOOLEAN);"
    )
    expect(migration).toContain("p_hard_max_age_seconds INTEGER DEFAULT 3600")
  })

  it("스냅샷이 있으면 안전핀 안에서는 force 가 아닌 한 즉시 반환한다", () => {
    expect(migration).toContain(
      "IF NOT COALESCE(p_force, FALSE) AND v_row.refreshed_at >= now() - v_hard_age THEN"
    )
  })

  it("낡음은 반환을 막지 않고 stale 플래그로만 표기한다", () => {
    expect(migration).toContain("v_is_stale := v_row.refreshed_at < now() - v_max_age")
    expect(migration).toContain("'stale', v_is_stale")
  })

  it("안전핀은 소프트 TTL 보다 짧아질 수 없다", () => {
    expect(migration).toContain("GREATEST(COALESCE(p_hard_max_age_seconds, 3600)")
  })

  it("service_role 에만 실행 권한을 준다", () => {
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.admin_crm_business_overview(INTEGER, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;"
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_crm_business_overview(INTEGER, BOOLEAN, INTEGER) TO service_role;"
    )
  })
})

describe("lib/admin-crm-overview.ts — 백그라운드 갱신 배선", () => {
  it("마이그레이션 미적용 DB 를 위해 2인자로 한 번 재시도한다", () => {
    // 이 폴백이 없으면 배포~마이그레이션 사이에 CRM 개요가 매번 live 쿼리로 떨어져 느려진다.
    expect(consumer).toContain("if (error && isMissingSnapshotInfraError(error)) {")
  })

  it("stale 스냅샷을 받으면 응답 뒤 갱신을 예약한다", () => {
    expect(consumer).toContain("scheduleAdminCrmOverviewRefresh()")
    expect(consumer).toContain('import { after } from "next/server"')
  })

  it("예약에 쿨다운을 둬 캐시된 stale 이 갱신을 줄줄이 태우지 않게 한다", () => {
    expect(consumer).toContain("OVERVIEW_REFRESH_COOLDOWN_MS")
  })

  it("요청 스코프 밖 호출은 조용히 건너뛴다", () => {
    // 스크립트·테스트에서 after() 는 던진다 — 갱신은 다음 요청이 맡는다.
    expect(consumer).toContain("lastOverviewRefreshScheduledAt = 0")
  })
})
