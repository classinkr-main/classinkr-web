// 라운드 5 Q-3·Q-7·Q-8·Q-9·Q-11 — 입력 레일 "대상" 칩, 편집 저장 뒤 큐 복귀, 큐 카드 입력자·시각, 비활성 사유, 적용 확인 문구.
import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DraftQueue } from "@/components/admin/branch/ledger/DraftQueue"
import { draftAuthorLine, draftDeleteDisabledReason, draftEditDisabledReason } from "@/components/admin/branch/ledger/draft-card-meta"
import { InputRailSection } from "@/components/admin/branch/ledger/InputRailSection"
import { DRAFT_OPERATIONS, defaultDraftWeeklyConfidence, type DraftForm, type LedgerDraft } from "@/components/admin/branch/ledger/shared"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

function draft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    id: "d-1",
    kind: "edit-row",
    status: "draft",
    customer: "한빛학원",
    manager: "Minjae",
    team: "BD",
    month: "2026-09",
    amount: 1_000_000,
    note: "",
    createdAt: "2026-09-23T05:00:00Z",
    updatedAt: "2026-09-23T05:00:10Z",
    createdBy: "김입력",
    checkedBy: null,
    ...overrides,
  }
}

describe("draftAuthorLine — 누가·언제(Q-9)", () => {
  it("입력자·시각, 1분 넘게 뒤 수정이면 수정 시각, 다른 사람이 체크했으면 체크자", () => {
    expect(draftAuthorLine(draft())).toMatch(/^입력 김입력 · /)
    expect(draftAuthorLine(draft())).not.toContain("수정")
    expect(draftAuthorLine(draft({ updatedAt: "2026-09-23T07:00:00Z" }))).toContain(" · 수정 ")
    expect(draftAuthorLine(draft({ status: "checked", checkedBy: "이검수" }))).toContain(" · 체크 이검수")
    // 자가 체크는 체크자를 따로 적지 않는다(배지가 말한다).
    expect(draftAuthorLine(draft({ status: "checked", checkedBy: "김입력" }))).not.toContain("체크")
    expect(draftAuthorLine(draft({ createdBy: null }))).toMatch(/^입력 미확인/)
  })
})

describe("비활성 사유(Q-8)", () => {
  it("편집: 자가 체크는 셀 입력 안내, 남이 체크했으면 체크 해제 안내, 적용·취소는 각자 경로", () => {
    expect(draftEditDisabledReason(draft())).toBeNull()
    expect(draftEditDisabledReason(draft({ status: "checked", checkedBy: "김입력" }))).toContain("셀 입력은 저장과 함께 체크까지")
    expect(draftEditDisabledReason(draft({ status: "checked", checkedBy: "이검수" }))).toContain("'체크 해제' 후 편집")
    expect(draftEditDisabledReason(draft({ status: "applied" }))).toContain("되돌리기(상쇄)")
    expect(draftEditDisabledReason(draft({ status: "cancelled" }))).toContain("취소된 초안")
  })

  it("삭제: draft만 가능, 나머지는 취소·되돌리기로", () => {
    expect(draftDeleteDisabledReason(draft())).toBeNull()
    expect(draftDeleteDisabledReason(draft({ status: "checked" }))).toContain("'취소'")
    expect(draftDeleteDisabledReason(draft({ status: "applied" }))).toContain("되돌리기")
  })
})

describe("DraftQueue 카드 — 입력자 줄·막힌 이유(SSR)", () => {
  function queue(drafts: LedgerDraft[]) {
    return renderToStaticMarkup(
      <DraftQueue
        drafts={drafts}
        mode="server"
        loading={false}
        error={null}
        reversedDraftIds={new Set()}
        recordErrors={new Map()}
        onReload={() => {}}
        onEdit={() => {}}
        onToggle={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
        onReverse={() => {}}
      />,
    )
  }

  it("자가 체크 초안의 편집 버튼은 이유를 title·aria-label로 말한다", () => {
    const html = queue([draft({ status: "checked", checkedBy: "김입력" })])
    expect(html).toContain("입력 김입력")
    expect(html).toContain("셀 입력은 저장과 함께 체크까지 끝난 초안입니다")
    expect(html).toContain("체크된 초안은 삭제할 수 없습니다")
  })

  it("편집 가능한 초안은 사유 없이 '초안 편집'", () => {
    const html = queue([draft()])
    expect(html).toContain('title="초안 편집"')
    expect(html).not.toContain("체크까지 끝난 초안")
  })

  it("단건 적용 확인은 '되돌릴 수 없음'이 아니라 되돌리기(상쇄) 경로를 말한다(Q-11)", () => {
    const source = read("components/admin/branch/ledger/DraftQueue.tsx")
    const applyDialog = source.slice(source.indexOf('aria-label="초안 적용 확인"'), source.indexOf('aria-label="적용 되돌리기 확인"'))
    expect(applyDialog).toContain("되돌리기&rsquo;(상쇄 기록)")
    expect(applyDialog).not.toContain("되돌릴 수 없습니다")
  })
})

describe("InputRailSection — 대상 칩(Q-3)", () => {
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
    amount: "1000000",
    quantity: "",
    note: "",
    weeklyMode: false,
    weekly: ["", "", "", "", ""],
    weeklyConfidence: defaultDraftWeeklyConfidence("expected"),
  }
  function rail(props: Partial<Parameters<typeof InputRailSection>[0]> = {}) {
    return renderToStaticMarkup(
      <InputRailSection
        editingDraft={null}
        queueMode="server"
        draftForm={form}
        setDraftForm={() => {}}
        selectedDraftOperation={DRAFT_OPERATIONS[3]}
        monthOptions={[{ value: "2026-09", label: "9월", current: true }]}
        selectedMonth="2026-09"
        managerOptions={[]}
        customerOptions={[]}
        draftAmountInvalid={false}
        draftQuantityInvalid={false}
        draftFormInvalid={false}
        draftSaving={false}
        canCreateEditDraft
        targetCellLocked={false}
        saveEditedDraft={async () => ({ persisted: true, deduped: false })}
        cancelDraftEdit={() => {}}
        saveDraft={async () => ({ persisted: true, deduped: false })}
        {...props}
      />,
    )
  }

  it("대상 행이 있으면 고객·시트 행·월과 해제 버튼", () => {
    const html = rail({ targetRow: { customer: "한빛학원", sheetRow: 12, origin: "sheet" }, onClearTarget: () => {} })
    expect(html).toContain("대상</span> 한빛학원 · 시트 12행 · ")
    expect(html).toContain('aria-label="대상 행 풀고 신규 입력으로"')
  })

  it("대상이 없으면 신규 입력 안내, 초안 편집 중이면 둘 다 없음", () => {
    expect(rail({ canCreateEditDraft: false })).toContain("장부에 없는 고객·딜을 새 행으로")
    const editing = rail({ editingDraft: draft(), targetRow: { customer: "한빛학원", sheetRow: 12, origin: "sheet" } })
    expect(editing).not.toContain("시트 12행")
    expect(editing).not.toContain("새 행으로 남깁니다")
  })
})

describe("워크벤치 배선 — 레일·큐", () => {
  const source = read("components/admin/branch/SalesLedgerWorkbench.tsx")

  it("큐에서 고친 초안은 저장 성공 뒤 큐로 돌아가고 토스트로 알린다(Q-7)", () => {
    const body = source.slice(source.indexOf("const saveEditedDraft = useCallback"), source.indexOf("const revenue = summary.data?.revenue"))
    const guard = body.indexOf("if (!result.conflict && !result.validationMessage) {")
    const back = body.indexOf('setRailView("queue")')
    expect(guard).toBeGreaterThan(-1)
    expect(back).toBeGreaterThan(guard)
    expect(body).toContain("체크 큐로 돌아왔습니다")
  })

  it("레일에 대상 행과 해제 경로를 넘긴다(Q-3)", () => {
    expect(source).toContain("targetRow: railTargetRow,")
    expect(source).toContain("onClearTarget: clearRailTarget,")
  })
})
