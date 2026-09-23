// 라운드 5 K-4·K-6·K-8 — 콕핏 편집기: 목록 월과 편집기 월 동기화, "저장 후 다음", 딜별 초기화 회귀 고정.
// 편집기는 SSR로 직접 그려 보고(훅 초기값), 워크벤치 배선은 소스로 확인한다(렌더 하네스 없음).
import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CockpitEditor } from "@/components/admin/branch/ledger/CockpitEditor"
import { defaultDraftWeeklyConfidence, type DraftForm } from "@/components/admin/branch/ledger/shared"

const form: DraftForm = {
  operation: "amount-change",
  customer: "한빛학원",
  manager: "Minjae",
  team: "BD",
  productCategory: "software",
  month: "2026-09",
  fromMonth: "2026-09",
  week: "month",
  confidence: "expected",
  amount: "",
  quantity: "",
  note: "",
  weeklyMode: true,
  weekly: ["100000", "", "", "", ""],
  weeklyConfidence: defaultDraftWeeklyConfidence("expected"),
}

function render(props: Partial<Parameters<typeof CockpitEditor>[0]> = {}) {
  return renderToStaticMarkup(
    <CockpitEditor
      editingDraft={null}
      dealContext={null}
      draftForm={form}
      setDraftForm={() => {}}
      monthOptions={[
        { value: "2026-09", label: "9월", current: true },
        { value: "2026-10", label: "10월", current: false },
      ]}
      managerOptions={[]}
      draftFormInvalid={false}
      draftSaving={false}
      canCreateEditDraft
      targetCellLocked={false}
      currentMonthAmount={0}
      saveEditedDraft={async () => ({ persisted: true, deduped: false })}
      cancelDraftEdit={() => {}}
      saveDraft={async () => ({ persisted: true, deduped: false })}
      onSwitchToRev={() => {}}
      {...props}
    />,
  )
}

describe("CockpitEditor — 월 불일치 안내(K-4)", () => {
  it("목록 월과 편집기 월이 다르면 어느 달에 저장되는지와 '다시 불러오기'를 보인다", () => {
    const html = render({ listMonth: "2026-10", onReloadForListMonth: () => {} })
    expect(html).toContain("저장하면")
    expect(html).toContain("값으로 다시 불러오기")
  })

  it("같은 달이거나 부모가 경로를 주지 않으면(새 딜·초안 편집) 안내가 없다", () => {
    expect(render({ listMonth: "2026-09", onReloadForListMonth: () => {} })).not.toContain("값으로 다시 불러오기")
    expect(render({ listMonth: "2026-10" })).not.toContain("값으로 다시 불러오기")
  })
})

describe("CockpitEditor — 저장 후 다음(K-6)", () => {
  it("다음 딜이 있으면 버튼·단축키 안내(다음 딜 이름 포함)", () => {
    const html = render({ onSavedGoNext: () => {}, nextDealName: "다온학원" })
    expect(html).toContain("저장 후 다음")
    expect(html).toContain("Ctrl+Enter 저장 후 다음 (다온학원)")
    expect(html).toContain('aria-keyshortcuts="Control+Enter Meta+Enter"')
  })

  it("다음 딜이 없거나 초안 편집 중이면 없다", () => {
    expect(render()).not.toContain("저장 후 다음")
    const editing = render({
      onSavedGoNext: () => {},
      editingDraft: { id: "d1", kind: "edit-row", status: "draft", customer: "한빛학원", manager: "", team: "BD", month: "2026-09", amount: 1, note: "", createdAt: "", updatedAt: "" } as never,
    })
    expect(editing).not.toContain("저장 후 다음")
  })
})

describe("워크벤치 배선 — 콕핏", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")

  it("편집기는 딜·초안마다 새로 마운트된다(K-8 — 이전 딜 저장 메시지 잔존 방지)", () => {
    expect(source).toContain('key={editingDraftId ?? selectedRow?.id ?? "new"}')
  })

  it("편집기 입력은 '손댄 값' 표시를 남기고, 딜을 새로 불러오면 지운다", () => {
    expect(source).toContain("setDraftForm={setCockpitDraftForm}")
    const load = source.slice(source.indexOf("const loadDealDetail = useCallback"), source.indexOf("const operation: DraftOperation = row.ledgerOrigin"))
    expect(load).toContain("cockpitFormDirtyRef.current = false")
  })

  it("목록 월이 실제로 바뀐 실행에서만, 손대지 않은 시트 행을 그 달로 다시 불러온다", () => {
    const effect = source.slice(source.indexOf("const cockpitListMonthRef = useRef(selectedMonth)"), source.indexOf("const onCockpitEditorMonthChange"))
    expect(effect).toContain("if (previousMonth === selectedMonth) return")
    expect(effect).toContain("cockpitFormDirtyRef.current) return")
    expect(effect).toContain("void loadDealDetail(cockpitSheetRow)")
    expect(source).toContain('lens === "cockpit" && selectedRow && !editingDraftId && selectedRow.ledgerOrigin !== "draft" ? selectedRow : null')
  })

  it("저장 후 다음은 목록이 보여 주는 순서의 다음 딜로, 넘어간 직후 한 번만 첫 주차 칸 포커스", () => {
    expect(source).toContain("onVisibleRowIdsChange={onCockpitVisibleRowIds}")
    expect(source).toContain("onSavedGoNext={cockpitNextRow ? goToNextCockpitDeal : undefined}")
    expect(source).toContain("autoFocusWeekly={cockpitAutoFocusRowId != null && cockpitAutoFocusRowId === selectedRow?.id}")
  })
})
