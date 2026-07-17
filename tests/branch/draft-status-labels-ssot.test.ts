import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { DRAFT_STATUS_LABELS, draftStatusLabel } from "@/components/admin/branch/ledger/shared"

// 회귀 방지(품질 웨이브 7, 항목 4): draft 상태 라벨이 필터 탭("검토"/"체크"/"적용")과 배지
// ("검토 필요"/"체크 완료"/"적용됨")로 산재해 있던 문제 — 뜻(어느 상태가 어떤 조건인지)은
// 그대로 두고 표기만 ledger/shared.tsx의 DRAFT_STATUS_LABELS SSOT로 통일한다
// (검토중/체크완료/적용완료 + 상쇄 표기).

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

describe("DRAFT_STATUS_LABELS / draftStatusLabel — SSOT (ledger/shared.tsx)", () => {
  it("4개 DraftStatus 전부에 라벨이 있다", () => {
    expect(DRAFT_STATUS_LABELS).toEqual({
      draft: "검토중",
      checked: "체크완료",
      applied: "적용완료",
      cancelled: "취소됨",
    })
  })

  it("draftStatusLabel은 reversed 인자가 없으면 SSOT 라벨을 그대로 반환한다", () => {
    expect(draftStatusLabel("draft")).toBe("검토중")
    expect(draftStatusLabel("checked")).toBe("체크완료")
    expect(draftStatusLabel("applied")).toBe("적용완료")
    expect(draftStatusLabel("cancelled")).toBe("취소됨")
  })

  it("applied+reversed=true일 때만 '(상쇄)'를 덧붙인다 — 다른 상태는 reversed를 무시한다", () => {
    expect(draftStatusLabel("applied", true)).toBe("적용완료(상쇄)")
    expect(draftStatusLabel("checked", true)).toBe("체크완료")
    expect(draftStatusLabel("draft", true)).toBe("검토중")
    expect(draftStatusLabel("cancelled", true)).toBe("취소됨")
  })
})

describe("필터 탭·배지 소비처가 SSOT를 참조한다(소스 스캔, 품질 웨이브 7 항목 4)", () => {
  it("DRAFT_STATUS_FILTERS의 draft/checked/applied 라벨이 DRAFT_STATUS_LABELS를 참조한다(리터럴 재복제 아님)", () => {
    const source = workbenchSource()
    const start = source.indexOf("const DRAFT_STATUS_FILTERS: Array")
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf("]", start)
    const block = source.slice(start, end)
    expect(block).toContain('{ id: "draft", label: DRAFT_STATUS_LABELS.draft }')
    expect(block).toContain('{ id: "checked", label: DRAFT_STATUS_LABELS.checked }')
    expect(block).toContain('{ id: "applied", label: DRAFT_STATUS_LABELS.applied }')
    // "대기"(open 그룹핑)와 "전체"(all)는 단일 상태가 아니라 SSOT 밖에서 그대로 유지.
    expect(block).toContain('{ id: "open", label: "대기" }')
    expect(block).toContain('{ id: "all", label: "전체" }')
  })

  it("draftStatusMeta가 하드코딩 문자열 대신 draftStatusLabel을 호출한다", () => {
    const source = workbenchSource()
    const start = source.indexOf("export function draftStatusMeta")
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf("\nfunction draftMatchesFilter(", start)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)
    expect(body).not.toContain("체크 완료")
    expect(body).not.toContain("적용됨")
    expect(body).not.toContain("검토 필요")
    expect(body).toContain("draftStatusLabel(status)")
    expect(body).toContain("draftStatusLabel(status, true)")
  })
})
