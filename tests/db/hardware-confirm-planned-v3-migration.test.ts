import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// 배송 예정 확정 v3 마이그레이션 계약.
//
// v2 는 로트를 lot_no 칸에서만 찾아, lot_no 가 전부 NULL 인 운영 원장(시트 임포트 385건)에서
// 로트 미지정 예정 출고를 하나도 확정하지 못했다(2026-09-14 실측: 대기 33건 59대 전부 거절).
// v3 는 로트 배정을 앱이 계산해 넘기고, 로트가 모자라도 출고를 막지 않는다(운영자 결정).
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914_hardware_confirm_planned_v3.sql"),
  "utf8"
)
const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"))

describe("confirm_hardware_planned_movement_v3 — 시그니처·권한", () => {
  it("새 이름으로 만들어 v2 와 오버로드 모호성이 생기지 않는다", () => {
    expect(sql).toContain("create or replace function public.confirm_hardware_planned_movement_v3(")
    expect(sql).toContain("lot_allocations jsonb default '[]'::jsonb")
    // v2·레거시를 지우지 않는다 — 앱이 v3 → v2 → 레거시로 폴백하는 롤백 경로다.
    expect(sql).not.toMatch(/drop function[^;]*confirm_hardware_planned_movement_v2/i)
    expect(sql).not.toMatch(/drop function[^;]*confirm_hardware_planned_movement\b/i)
  })

  it("service_role 에만 실행 권한을 준다", () => {
    expect(sql).toContain(
      "revoke execute on function public.confirm_hardware_planned_movement_v3(uuid, text, date, int, jsonb)"
    )
    expect(sql).toMatch(/from public, anon, authenticated;/)
    expect(sql).toContain(
      "grant execute on function public.confirm_hardware_planned_movement_v3(uuid, text, date, int, jsonb)\n  to service_role;"
    )
  })
})

describe("confirm_hardware_planned_movement_v3 — v2 와 같은 안전장치", () => {
  it("예정 행을 잠그고 취소·비예정·0 수량을 거절한다", () => {
    expect(body).toContain("for update;")
    expect(body).toContain("이미 취소되었거나 처리된 배송 예정 기록입니다.")
    expect(body).toContain("배송 예정 출고만 완료 처리할 수 있습니다.")
    expect(body).toContain("확정 수량은 1 이상이어야 합니다.")
  })

  it("같은 CRM 오더의 중복 출고를 막는다", () => {
    expect(body).toContain("이미 같은 CRM 오더가 실제 출고로 반영되어 있습니다.")
  })

  it("전량 확정이면 예정 행을 소진하고, 부분 확정이면 남은 수량으로 줄인다", () => {
    expect(body).toContain("void_reason = '배송 예정 출고 완료'")
    expect(body).toContain("set quantity = planned.quantity - effective_qty")
  })
})

describe("confirm_hardware_planned_movement_v3 — 새 계약", () => {
  it("로트 잔량을 SQL 에서 다시 계산하지 않는다 — 규칙이 두 곳에 생기면 또 갈라진다", () => {
    expect(body).not.toMatch(/with lot_movements/i)
    expect(body).not.toContain("group by lot_no")
  })

  it("배정이 비어 오면 전량을 로트 미지정 한 줄로 기록한다", () => {
    expect(body).toContain("jsonb_array_length(lot_allocations) = 0")
    expect(body).toContain("jsonb_build_array(jsonb_build_object('lot_no', null, 'quantity', effective_qty))")
  })

  it("배정 수량이 양의 정수가 아니면 거절한다", () => {
    expect(body).toContain("coalesce(elem ->> 'quantity', '') !~ '^[0-9]+$'")
    expect(body).toContain("로트 배정 수량이 올바르지 않습니다.")
  })

  it("배정 합계가 확정 수량과 다르면 거절한다", () => {
    expect(body).toContain("if allocation_total <> effective_qty then")
    expect(body).toContain("로트 배정 합계(%대)가 확정 수량(%대)과 다릅니다.")
  })

  it("로트 부족으로 거절하지 않는다 — lot_no NULL 배정을 정상으로 기록한다", () => {
    expect(body).not.toContain("lot 재고가 부족합니다")
    expect(body).toContain("allocation_lot := nullif(btrim(coalesce(allocation.elem ->> 'lot_no', '')), '');")
    expect(body).toContain("'unlotted', allocation_lot is null")
  })

  it("배정 순서를 보존한다", () => {
    expect(body).toContain("with ordinality as t(elem, ordinality)")
    expect(body).toContain("order by ordinality")
  })
})
