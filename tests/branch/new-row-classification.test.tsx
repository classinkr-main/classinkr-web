// 신규 행 계약·경로(F-18) — 장부에서만 넣은 행이 신규/갱신 · 직접/채널로 집계되도록 sourceSnapshot.status · dealType 을
// 시트 어휘('New'/'Renew' · 'Direct'/'Channel')로 싣는다. 레일·콕핏 신규 저장은 둘 다 골라야 한다('계약·경로를 고르세요').
// 2월은 시트에 W5 가 없다(F-31) — 주차 분해 저장은 W5 값을 W4 에 합친다.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CockpitEditor } from "@/components/admin/branch/ledger/CockpitEditor"
import { InputRailSection } from "@/components/admin/branch/ledger/InputRailSection"
import { WeeklyAmountGrid } from "@/components/admin/branch/ledger/WeeklyAmountGrid"
import {
  draftFormClassificationFromRow,
  draftFormClassificationFromSnapshot,
  draftWeeklySaveContract,
  ledgerMonthWeekCount,
  NEW_ROW_CLASSIFICATION_MESSAGE,
  newRowClassificationMissing,
  newRowClassificationSnapshot,
  parseNewRowChannel,
  parseNewRowContract,
  withNewRowClassification,
  type DraftForm,
  type DraftSaveResult,
  type LedgerDraft,
} from "@/components/admin/branch/ledger/shared"
import { snapshotText } from "@/lib/branch/ledger-draft-metadata"

function form(partial: Partial<DraftForm> = {}): DraftForm {
  return {
    operation: "forecast-add",
    customer: "새학원",
    manager: "예시A",
    team: "BD",
    productCategory: "software",
    month: "2026-12",
    fromMonth: "2026-12",
    week: "month",
    confidence: "expected",
    amount: "100000",
    quantity: "",
    note: "",
    weeklyMode: false,
    weekly: ["", "", "", "", ""],
    weeklyConfidence: ["expected", "expected", "expected", "expected", "expected"],
    ...partial,
  }
}

describe("계약·경로 값", () => {
  it("시트 어휘와 한글 라벨을 모두 읽는다", () => {
    expect(parseNewRowContract("New")).toBe("New")
    expect(parseNewRowContract(" renew ")).toBe("Renew")
    expect(parseNewRowContract("갱신")).toBe("Renew")
    expect(parseNewRowContract("기타")).toBeNull()
    expect(parseNewRowChannel("Channel")).toBe("Channel")
    expect(parseNewRowChannel("직접")).toBe("Direct")
    expect(parseNewRowChannel(undefined)).toBeNull()
  })

  it("둘 다 골라야 한다 — 하나라도 비면 missing", () => {
    expect(newRowClassificationMissing(form())).toBe(true)
    expect(newRowClassificationMissing(form({ contract: "New" }))).toBe(true)
    expect(newRowClassificationMissing(form({ contract: "New", channel: "Direct" }))).toBe(false)
    expect(NEW_ROW_CLASSIFICATION_MESSAGE).toBe("계약·경로를 고르세요")
  })

  it("저장 스냅샷에 status · dealType 을 맨 위 키로 얹는다(snapshotText 가 그대로 읽는다)", () => {
    expect(newRowClassificationSnapshot(form({ contract: "Renew", channel: "Channel" }))).toEqual({ status: "Renew", dealType: "Channel" })
    expect(newRowClassificationSnapshot(form({ contract: "Renew" }))).toBeNull()
    const snapshot = withNewRowClassification({ origin: "rail", row: { status: "New" } }, form({ contract: "Renew", channel: "Direct" }))
    expect(snapshot).toEqual({ origin: "rail", row: { status: "New" }, status: "Renew", dealType: "Direct" })
    expect(snapshotText(snapshot, "status")).toBe("Renew")
    expect(snapshotText(snapshot, "dealType")).toBe("Direct")
    // 분류가 없으면 스냅샷을 바꾸지 않는다.
    const base = { origin: "rail" }
    expect(withNewRowClassification(base, form())).toBe(base)
    expect(withNewRowClassification(null, form())).toBeUndefined()
  })

  it("재편집 프리필 — 초안 스냅샷·행에서 계약·경로를 읽는다", () => {
    expect(draftFormClassificationFromSnapshot({ status: "New", dealType: "Channel" })).toEqual({ contract: "New", channel: "Channel" })
    expect(draftFormClassificationFromSnapshot({ row: { status: "Renew", dealType: "Direct" } })).toEqual({ contract: "Renew", channel: "Direct" })
    expect(draftFormClassificationFromSnapshot(undefined)).toEqual({ contract: null, channel: null })
    expect(draftFormClassificationFromRow({ status: "renew", dealType: "Direct" })).toEqual({ contract: "Renew", channel: "Direct" })
  })
})

describe("draftWeeklySaveContract — 2월 W5 는 W4 로 합친다(F-31)", () => {
  it("2월이면 W5 금액·확도를 W4 로 옮긴다", () => {
    const contract = draftWeeklySaveContract(form({
      month: "2027-02",
      weeklyMode: true,
      weekly: ["1000", "", "", "", "500"],
      weeklyConfidence: ["confirmed", "expected", "expected", "expected", "high-confidence"],
    }))
    expect(contract).toMatchObject({ amount: 1500, weekly: [1000, 0, 0, 500, 0], weeklyConfidence: ["confirmed", null, null, "high-confidence", null] })
  })

  it("다른 달은 예전과 같다 · month 가 없어도 같다", () => {
    const base = { weeklyMode: true, weekly: ["1000", "", "", "", "500"], weeklyConfidence: ["confirmed", "expected", "expected", "expected", "high-confidence"] as DraftForm["weeklyConfidence"] }
    expect(draftWeeklySaveContract(form({ ...base, month: "2026-12" }))?.weekly).toEqual([1000, 0, 0, 0, 500])
    expect(draftWeeklySaveContract({ operation: "forecast-add", ...base })?.weeklyConfidence).toEqual(["confirmed", null, null, null, "high-confidence"])
    expect(ledgerMonthWeekCount("2027-02")).toBe(4)
    expect(ledgerMonthWeekCount("2026-07")).toBe(5)
  })
})

const noopSave = async (): Promise<DraftSaveResult> => ({ persisted: true, deduped: false })
const MONTH_OPTIONS = [{ value: "2026-12", label: "12월", current: true }, { value: "2027-02", label: "2월", current: false }]

function renderRail(draftForm: DraftForm, options: { canCreateEditDraft?: boolean; editingDraft?: LedgerDraft | null } = {}) {
  return renderToStaticMarkup(
    <InputRailSection
      editingDraft={options.editingDraft ?? null}
      queueMode="server"
      draftForm={draftForm}
      setDraftForm={() => {}}
      selectedDraftOperation={{ id: "forecast-add", label: "예상 매출 추가", description: "" }}
      monthOptions={MONTH_OPTIONS}
      selectedMonth="2026-12"
      managerOptions={[]}
      customerOptions={[]}
      draftAmountInvalid={false}
      draftQuantityInvalid={false}
      draftFormInvalid={false}
      draftSaving={false}
      canCreateEditDraft={options.canCreateEditDraft ?? false}
      targetCellLocked={false}
      saveEditedDraft={noopSave}
      cancelDraftEdit={() => {}}
      saveDraft={noopSave}
    />,
  )
}

/** 글자로 끝나는 버튼의 여는 태그 — disabled 속성(disabled="")만 본다(클래스의 disabled: 변형과 구별). */
function buttonTag(markup: string, label: string): string {
  const index = markup.indexOf(`${label}</button>`)
  expect(index).toBeGreaterThan(-1)
  const start = markup.lastIndexOf("<button", index)
  return markup.slice(start, markup.indexOf(">", start) + 1)
}

function isDisabled(tag: string): boolean {
  return / disabled=""/.test(tag)
}

describe("InputRailSection — 신규 입력 계약·경로", () => {
  it("행 없이 신규 입력이면 계약·경로 칸과 '계약·경로를 고르세요'가 보이고 신규 입력이 막힌다", () => {
    const markup = renderRail(form())
    expect(markup).toContain("계약")
    expect(markup).toContain("경로")
    expect(markup).toContain(">신규<")
    expect(markup).toContain(">채널<")
    expect(markup).toContain(NEW_ROW_CLASSIFICATION_MESSAGE)
    expect(isDisabled(buttonTag(markup, "신규 입력"))).toBe(true)
  })

  it("둘 다 고르면 안내가 사라지고 저장할 수 있다", () => {
    const markup = renderRail(form({ contract: "New", channel: "Direct" }))
    expect(markup).not.toContain('role="alert">계약·경로를 고르세요')
    expect(isDisabled(buttonTag(markup, "신규 입력"))).toBe(false)
  })

  it("시트 행을 골라 수정 초안이 기본이면 안내 대신 신규 입력 버튼만 막고 칸 아래 한 줄로 알린다", () => {
    const markup = renderRail(form(), { canCreateEditDraft: true })
    expect(markup).not.toContain('role="alert">계약·경로를 고르세요')
    expect(markup).toContain("신규 입력에만 쓰입니다")
    expect(isDisabled(buttonTag(markup, "수정 초안"))).toBe(false)
    expect(isDisabled(buttonTag(markup, "신규 입력"))).toBe(true)
  })

  it("수정 초안을 고치는 중이면 계약·경로 칸이 없다", () => {
    const editing = { id: "d-1", kind: "edit-row", status: "draft", customer: "새학원", manager: "", team: "BD", month: "2026-12", amount: 1, note: "", createdAt: "", updatedAt: "" } as LedgerDraft
    const markup = renderRail(form(), { editingDraft: editing })
    expect(markup).not.toContain("고르세요")
  })

  it("2월이면 주차 고르기에서 W5 를 고를 수 없다", () => {
    const markup = renderRail(form({ month: "2027-02", operation: "period-shift" }))
    expect(markup).toContain("W5(시트에 없음)")
  })
})

describe("CockpitEditor — 새 딜 계약·경로", () => {
  it("새 딜 저장은 계약·경로를 골라야 한다", () => {
    const markup = renderToStaticMarkup(
      <CockpitEditor
        editingDraft={null}
        dealContext={null}
        draftForm={form({ weeklyMode: true, weekly: ["1000", "", "", "", ""] })}
        setDraftForm={() => {}}
        monthOptions={MONTH_OPTIONS}
        managerOptions={[]}
        draftFormInvalid={false}
        draftSaving={false}
        canCreateEditDraft={false}
        targetCellLocked={false}
        currentMonthAmount={0}
        saveEditedDraft={noopSave}
        cancelDraftEdit={() => {}}
        saveDraft={noopSave}
        onSwitchToRev={() => {}}
      />,
    )
    expect(markup).toContain(NEW_ROW_CLASSIFICATION_MESSAGE)
    expect(isDisabled(buttonTag(markup, "신규 입력"))).toBe(true)
  })
})

describe("WeeklyAmountGrid — 2월 W5", () => {
  it("weekCount 4 면 W5 는 입력 없는 비활성 줄이고, 남은 값이 있으면 W4 에 합친다고 알린다", () => {
    const markup = renderToStaticMarkup(
      <WeeklyAmountGrid
        weekly={["", "", "", "", "500"]}
        weeklyConfidence={["expected", "expected", "expected", "expected", "expected"]}
        onAmountChange={() => {}}
        onConfidenceChange={() => {}}
        weekCount={4}
        variant="rail"
      />,
    )
    expect(markup).toContain("시트에 W4까지만 있는 달입니다 — 저장하면 W4에 합칩니다")
    expect(markup).not.toContain('aria-label="W5 금액"')
    expect(markup).toContain('aria-label="W4 금액"')
  })
})
