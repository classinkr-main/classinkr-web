import { describe, expect, it } from "vitest"

import {
  canAssignOtherOwner,
  canConfirmAll,
  canRecordInboundOrAdjust,
  MANAGER_ONLY_TITLE,
  movementButtonState,
  OWN_OR_MANAGER_TITLE,
  viewerActor,
  type HardwareViewer,
} from "@/components/admin/hardware/inventory/movement-permissions"
import type { HardwareMovement } from "@/components/admin/hardware/inventory/shared"

const movement = (patch: Partial<HardwareMovement> = {}): HardwareMovement =>
  ({
    id: "m1",
    item_id: "ifp86",
    product_name: '86" IFP',
    movement_type: "outbound",
    quantity: 1,
    status: "배송 예정",
    planned: true,
    source: "admin_manual",
    owner: "김매니저",
    owner_user_id: "user-kim",
    created_by_user_id: null,
    ...patch,
  }) as HardwareMovement

const manager: HardwareViewer = { canFinalize: false, canManageInventory: true, userId: "user-lee", name: "이관리" }
const kim: HardwareViewer = { canFinalize: false, canManageInventory: false, userId: "user-kim", name: "김매니저" }
const park: HardwareViewer = { canFinalize: false, canManageInventory: false, userId: "user-park", name: "박매니저" }

describe("버튼 권한 — 정의서 §권한 · D2", () => {
  it("배송 예정 수정·확정·취소는 본인 건 또는 입고관리 권한자", () => {
    for (const button of ["edit", "confirm", "void"] as const) {
      expect(movementButtonState(button, movement(), kim)).toEqual({ allowed: true })
      expect(movementButtonState(button, movement(), manager)).toEqual({ allowed: true })
      expect(movementButtonState(button, movement(), park)).toEqual({ allowed: false, title: OWN_OR_MANAGER_TITLE })
    }
  })

  it("실현 기록 수정·취소는 입고관리 권한자만 — 본인 건이어도 막는다", () => {
    const actual = movement({ status: "설치 완료", planned: false })
    expect(movementButtonState("edit", actual, kim)).toEqual({ allowed: false, title: MANAGER_ONLY_TITLE })
    expect(movementButtonState("void", actual, kim).allowed).toBe(false)
    expect(movementButtonState("edit", actual, manager).allowed).toBe(true)
    expect(movementButtonState("confirm", actual, manager).allowed).toBe(false)
  })

  it("계정 id 가 없는 옛 기록은 담당자 이름으로 본인 건을 판정한다", () => {
    const legacy = movement({ owner_user_id: null, owner: "김 매니저" })
    expect(movementButtonState("confirm", legacy, kim).allowed).toBe(true)
    expect(movementButtonState("confirm", legacy, park).allowed).toBe(false)
  })

  it("시트 가져오기 행은 누구의 건도 아니다", () => {
    expect(movementButtonState("confirm", movement({ source: "sheet_import" }), kim).allowed).toBe(false)
    expect(movementButtonState("confirm", movement({ source: "sheet_import" }), manager).allowed).toBe(true)
  })

  it("권한 칸이 없는 구응답은 예정 버튼을 열어 두고 실현 기록은 canFinalize 를 따른다", () => {
    const legacyViewer = { canFinalize: false, name: "김매니저" } as HardwareViewer
    expect(viewerActor(legacyViewer)).toBeNull()
    expect(viewerActor(undefined)).toBeNull()
    expect(movementButtonState("confirm", movement(), legacyViewer).allowed).toBe(true)
    expect(movementButtonState("edit", movement({ status: "출고", planned: false }), legacyViewer).allowed).toBe(false)
    expect(movementButtonState("edit", movement({ status: "출고", planned: false }), undefined).allowed).toBe(true)
  })

  it("여러 건 확정은 하나라도 막히면 그 품목을 사유에 적는다", () => {
    const mine = movement()
    const others = movement({ id: "m2", product_name: "S1", owner_user_id: "user-park", owner: "박매니저" })
    expect(canConfirmAll([mine], kim)).toEqual({ allowed: true })
    const blocked = canConfirmAll([mine, others], kim)
    expect(blocked.allowed).toBe(false)
    expect(blocked.title).toContain("S1")
  })

  it("다른 담당 지정은 입고관리 권한자만, 입고·조정은 명시적으로 막힌 경우만 숨긴다", () => {
    expect(canAssignOtherOwner(manager)).toBe(true)
    expect(canAssignOtherOwner(kim)).toBe(false)
    expect(canAssignOtherOwner(undefined)).toBe(false)
    expect(canRecordInboundOrAdjust(kim)).toBe(false)
    expect(canRecordInboundOrAdjust(manager)).toBe(true)
    expect(canRecordInboundOrAdjust(undefined)).toBe(true)
  })
})
