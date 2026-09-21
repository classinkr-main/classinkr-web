// 자가 체크(입력 속도 라운드 4, P0-2) — 매트릭스 셀 커밋이 저장 시점에 checked로 올라올 때
// 큐가 "본인 체크"를 배지로 구분하는 순수 판정 + 워크벤치/큐 배선 소스 스캔.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { isSelfCheckedDraft, SELF_CHECK_BADGE_LABEL } from "@/components/admin/branch/ledger/self-check"

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
const queuePath = join(process.cwd(), "components/admin/branch/ledger/DraftQueue.tsx")

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe("isSelfCheckedDraft — created_by === checked_by 파생(새 컬럼 없음)", () => {
  it("checked 상태이고 작성자와 체크자가 같으면 true", () => {
    expect(isSelfCheckedDraft({ status: "checked", createdBy: "김지사", checkedBy: "김지사" })).toBe(true)
  })

  it("applied 상태에서도 감사 표시로 유지된다", () => {
    expect(isSelfCheckedDraft({ status: "applied", createdBy: "김지사", checkedBy: "김지사" })).toBe(true)
  })

  it("남이 체크한 초안은 false — 검수자의 체크를 자가 체크로 오인하지 않는다", () => {
    expect(isSelfCheckedDraft({ status: "checked", createdBy: "김지사", checkedBy: "박검수" })).toBe(false)
  })

  it("draft/cancelled 또는 체크 정보가 없으면 false", () => {
    expect(isSelfCheckedDraft({ status: "draft", createdBy: "김지사", checkedBy: "김지사" })).toBe(false)
    expect(isSelfCheckedDraft({ status: "cancelled", createdBy: "김지사", checkedBy: "김지사" })).toBe(false)
    expect(isSelfCheckedDraft({ status: "checked", createdBy: "김지사", checkedBy: null })).toBe(false)
    expect(isSelfCheckedDraft({ status: "checked" })).toBe(false)
    expect(isSelfCheckedDraft({ status: "checked", createdBy: "  ", checkedBy: "  " })).toBe(false)
  })

  it("앞뒤 공백 차이는 같은 사람으로 본다(actor 문자열은 서버가 trim해서 넣지만 방어)", () => {
    expect(isSelfCheckedDraft({ status: "checked", createdBy: "김지사 ", checkedBy: " 김지사" })).toBe(true)
  })
})

describe("매트릭스 셀 커밋 → 자가 체크 배선(소스 스캔)", () => {
  const workbench = read(workbenchPath)

  it("셀 커밋 입력 빌더는 status:'checked'를 싣고, 레일 폼 빌더(buildDraftInput)는 싣지 않는다", () => {
    const cell = sliceBetween(workbench, "const buildCellDraftInput = useCallback", "const onCommitCell = useCallback")
    expect(cell).toContain('status: "checked"')
    const rail = sliceBetween(workbench, "const buildDraftInput = useCallback", "}, [detail, draftForm, lens, period, selectedMonth, selectedRow, team])")
    expect(rail).not.toContain('status: "checked"')
  })

  it("셀 커밋 성공 토스트가 자가 체크 사실과 '적용은 큐에서'를 함께 알린다", () => {
    const body = sliceBetween(workbench, "const onCommitCell = useCallback", "const onMatrixAmountClamped = useCallback")
    expect(body).toContain("자가 체크로 저장됨")
    expect(body).toContain("적용해야 장부에 반영")
  })
})

describe("체크 큐 자가 체크 배지(소스 스캔)", () => {
  const queue = read(queuePath)

  it("카드 상태 배지 옆에 isSelfCheckedDraft 판정으로 배지를 단다", () => {
    expect(queue).toContain("isSelfCheckedDraft(draft)")
    expect(queue).toContain("SELF_CHECK_BADGE_LABEL")
    expect(SELF_CHECK_BADGE_LABEL).toBe("자가 체크")
  })
})
