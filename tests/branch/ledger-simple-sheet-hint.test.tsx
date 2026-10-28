import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import LedgerSimpleView from "@/components/admin/branch/ledger/LedgerSimpleView"
import {
  ApprovalBar,
  approvalConfirmText,
  approvalResultLine,
  decideInlineSave,
  initialInlineEditorDraft,
  InlineCellEditor,
  inlineEditorKeyIntent,
  pickInlineConfidence,
  type InlineEditorDraft,
  type LedgerCellEditApi,
} from "@/components/admin/branch/ledger/LedgerSimpleEdit"
import { cellSheetWriteHint, SHEET_WRITE_ON_NOTICE, type SheetHint } from "@/components/admin/branch/ledger/sheet-write-view"
import type { DraftConfidence, LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"
import { SHEET_WRITE_MESSAGES } from "@/lib/branch/sheet-writeback/messages"

// 장부(A안) 칸 안 편집의 REV 시트 쓰기 힌트(ADR-011).
//  - 켜짐(edit.sheetHint 있음)이면 칸 아래 한 줄, block 이면 role="alert" + Enter·↵ 저장 안 함.
//  - 꺼짐(sheetHint 없음)이면 힌트 없이 지금과 같다.
//  - confidenceTouched 는 확도 키(E·H·C)·띠를 눌렀을 때만 true.
// 이 저장소의 vitest 는 node 환경(DOM 없음)이라 렌더는 renderToStaticMarkup, 키·저장은 InlineCellEditor 가
// 그대로 쓰는 순수 판정(inlineEditorKeyIntent·pickInlineConfidence·decideInlineSave)을 같은 순서로 돌려 본다.

const MONTH = "2026-10"
const TODAY = "2026-10-23"

function row(partial: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "deal-1",
    customer: "서울 학원",
    manager: "A",
    team: "BD",
    region: null,
    revenue: 5000,
    ledgerOrigin: "sheet",
    rowId: "r_0123456789ab",
    monthlyPayments: { [MONTH]: 5000 },
    weeklyPayments: { [MONTH]: [0, 0, 0, 5000, 0] },
    weeklyColors: { [MONTH]: "---k-" },
    ...partial,
  }
}

function realHint(today = TODAY): NonNullable<LedgerCellEditApi["sheetHint"]> {
  return (target, month, amount, confidence, confidenceTouched) =>
    cellSheetWriteHint({ kind: "edit-row", sheetRow: target, month, amount, confidence, confidenceTouched, today, capturedAt: "2026-10-23T01:00:00.000Z" })
}

function editApi(overrides: Partial<LedgerCellEditApi> = {}): LedgerCellEditApi {
  return {
    editable: () => true,
    value: () => 5000,
    confidence: () => "expected",
    pending: () => null,
    commit: vi.fn(async () => true),
    ...overrides,
  }
}

function renderEditor(edit: LedgerCellEditApi, candidate = row()) {
  return renderToStaticMarkup(
    <InlineCellEditor label="서울 학원 10월" month={MONTH} candidates={[candidate]} edit={edit} onClose={() => {}} onMore={() => {}} />,
  )
}

describe("InlineCellEditor — 켜짐이면 칸 아래 힌트, 꺼짐이면 없음", () => {
  it("켜짐: 서버와 같은 판정의 info 한 줄(alert 아님)", () => {
    const html = renderEditor(editApi({ sheetHint: realHint() }))
    expect(html).toContain('data-sheet-hint="info"')
    expect(html).toContain("시트에서 바뀌는 칸이 없습니다 — 장부에만 기록됩니다")
    expect(html).not.toContain('role="alert"')
  })

  it("켜짐 + block(행 ID 없음): role=alert 문구, ↵ 저장 버튼 비활성", () => {
    const html = renderEditor(editApi({ sheetHint: realHint() }), row({ rowId: null }))
    expect(html).toMatch(new RegExp(`<p[^>]*data-sheet-hint="block"[^>]*role="alert"[^>]*>${SHEET_WRITE_MESSAGES.no_row_id}</p>`))
    expect(html).toMatch(/<button[^>]*aria-label="저장"[^>]*disabled=""/)
  })

  it("꺼짐(sheetHint 없음): 힌트 없음 — 저장 버튼도 지금처럼 켜져 있다", () => {
    const html = renderEditor(editApi())
    expect(html).not.toContain("data-sheet-hint")
    expect(html).not.toContain('role="alert"')
    expect(html).not.toMatch(/<button[^>]*aria-label="저장"[^>]*disabled=""/)
  })

  it("처음 그릴 때 힌트는 confidenceTouched=false 로 계산된다(확도를 아직 안 골랐다)", () => {
    const sheetHint = vi.fn<NonNullable<LedgerCellEditApi["sheetHint"]>>(() => null)
    renderEditor(editApi({ sheetHint }))
    expect(sheetHint).toHaveBeenCalled()
    for (const call of sheetHint.mock.calls) {
      expect(call[2]).toBe(5000)
      expect(call[4]).toBe(false)
    }
  })
})

type Step = { type: "type"; value: string } | { type: "key"; key: string; onInput?: boolean; modifier?: boolean } | { type: "band"; value: DraftConfidence }

/**
 * InlineCellEditor 와 같은 순서로 판정을 돌린다: keydown → inlineEditorKeyIntent, 확도 키·띠 → pickInlineConfidence,
 * Enter → (그때 상태로 힌트 계산) → decideInlineSave → commit 일 때만 edit.commit.
 */
function simulate(steps: Step[], hint: NonNullable<LedgerCellEditApi["sheetHint"]> | null, initial = { value: 5000, confidence: "expected" as DraftConfidence }) {
  const target = row()
  let draft: InlineEditorDraft = initialInlineEditorDraft(initial.value, initial.confidence)
  const commits: Array<{ amount: number; confidence: DraftConfidence; confidenceTouched: boolean }> = []
  const blocked: string[] = []
  let closed = false
  for (const step of steps) {
    if (step.type === "type") {
      draft = { ...draft, amount: step.value }
      continue
    }
    if (step.type === "band") {
      draft = pickInlineConfidence(draft, step.value)
      continue
    }
    const intent = inlineEditorKeyIntent({ key: step.key, onButton: false, onInput: step.onInput ?? true, modifier: step.modifier ?? false })
    if (!intent) continue
    if (intent.type === "close") closed = true
    else if (intent.type === "confidence") draft = pickInlineConfidence(draft, intent.value)
    else {
      const amount = Number(draft.amount.replace(/[^\d]/g, "")) || null
      const current: SheetHint | null = hint ? hint(target, MONTH, amount, draft.confidence, draft.confidenceTouched) : null
      const decision = decideInlineSave(draft, initial, current)
      if (decision.type === "commit") commits.push({ amount: decision.amount, confidence: decision.confidence, confidenceTouched: decision.confidenceTouched })
      else if (decision.type === "blocked") blocked.push(decision.text)
      else if (decision.type === "unchanged") closed = true
    }
  }
  return { commits, blocked, closed, draft }
}

describe("키·저장 — block 이면 Enter 저장 안 함, touched 는 확도 키·띠만", () => {
  it("block(지난 주차)이면 Enter 를 눌러도 저장하지 않는다", () => {
    const result = simulate([{ type: "type", value: "7,000" }, { type: "key", key: "Enter" }], realHint("2026-10-29"))
    expect(result.commits).toEqual([])
    expect(result.blocked).toEqual([SHEET_WRITE_MESSAGES.past_week])
  })

  it("같은 입력도 꺼짐이면(힌트 없음) 지금처럼 저장한다", () => {
    const result = simulate([{ type: "type", value: "7,000" }, { type: "key", key: "Enter" }], null)
    expect(result.commits).toEqual([{ amount: 7000, confidence: "expected", confidenceTouched: false }])
  })

  it("금액만 바꾸면 touched=false, 확도 키를 누르면 touched=true 로 저장한다", () => {
    expect(simulate([{ type: "type", value: "7000" }, { type: "key", key: "Enter" }], realHint()).commits)
      .toEqual([{ amount: 7000, confidence: "expected", confidenceTouched: false }])
    expect(simulate([{ type: "type", value: "7000" }, { type: "key", key: "c" }, { type: "key", key: "Enter" }], realHint()).commits)
      .toEqual([{ amount: 7000, confidence: "confirmed", confidenceTouched: true }])
    // 한글 자판(ㅊ)·띠 클릭도 같은 "직접 고름"이다.
    expect(simulate([{ type: "key", key: "ㅊ" }, { type: "key", key: "Enter" }], realHint()).commits)
      .toEqual([{ amount: 5000, confidence: "confirmed", confidenceTouched: true }])
    expect(simulate([{ type: "band", value: "high-confidence" }, { type: "key", key: "Enter" }], realHint()).commits)
      .toEqual([{ amount: 5000, confidence: "high-confidence", confidenceTouched: true }])
  })

  it("선택 상자 위·조합키의 글자는 확도가 아니다(touched 그대로)", () => {
    const onSelect = simulate([{ type: "key", key: "c", onInput: false }], realHint())
    expect(onSelect.draft).toMatchObject({ confidence: "expected", confidenceTouched: false })
    const withCtrl = simulate([{ type: "key", key: "c", modifier: true }], realHint())
    expect(withCtrl.draft).toMatchObject({ confidence: "expected", confidenceTouched: false })
  })

  it("바뀐 것이 없으면 block 이어도 닫기만 한다(저장 없음)", () => {
    const result = simulate([{ type: "key", key: "Enter" }], () => ({ tone: "block", text: "막힘" }))
    expect(result).toMatchObject({ commits: [], blocked: [], closed: true })
  })

  it("판정 함수의 경계 — Enter 는 버튼 위에선 저장이 아니고, Escape 는 닫기", () => {
    expect(inlineEditorKeyIntent({ key: "Enter", onButton: true, onInput: false, modifier: false })).toBeNull()
    expect(inlineEditorKeyIntent({ key: "Escape", onButton: false, onInput: true, modifier: false })).toEqual({ type: "close" })
    expect(decideInlineSave({ amount: "", confidence: "expected", confidenceTouched: false }, { value: 0, confidence: "expected" }, null))
      .toEqual({ type: "invalid" })
  })

  it("InlineCellEditor 가 이 판정만으로 저장·확도를 정한다(소스 배선)", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/branch/ledger/LedgerSimpleEdit.tsx"), "utf8")
    const editor = source.slice(source.indexOf("export function InlineCellEditor("), source.indexOf("/** 일괄 체크·반영 결과"))
    expect(editor).toMatch(/const decision = decideInlineSave\(draft, \{ value: initialValue, confidence: initialConfidence \}, hint\)/)
    expect(editor).toMatch(/if \(decision\.type === "invalid" \|\| decision\.type === "blocked"\) return/)
    expect(editor).toMatch(/edit\.commit\(row\.id, month, decision\.amount, decision\.confidence, decision\.confidenceTouched\)/)
    expect(editor).toMatch(/const intent = inlineEditorKeyIntent\(\{/)
    expect(editor).toMatch(/onClick=\{\(\) => chooseConfidence\(item\.id\)\}/)
    expect(editor).toMatch(/setDraft\(\(current\) => pickInlineConfidence\(current, next\)\)/)
    // 확도를 바꾸는 setDraft 는 위 한 곳뿐 — 금액 입력은 confidenceTouched 를 건드리지 않는다.
    expect(editor.match(/confidenceTouched: true/g) ?? []).toHaveLength(0)
    expect(editor).toMatch(/setDraft\(\(current\) => \(\{ \.\.\.current, amount \}\)\)/)
  })
})

function draft(id: string, status: LedgerDraft["status"], amount: number): LedgerDraft {
  return { id, kind: "edit-row", status, customer: "서울 학원", manager: "A", team: "BD", month: MONTH, amount, note: "", createdAt: "", updatedAt: "" }
}

describe("ApprovalBar — 확인 문구·결과 줄", () => {
  it("켜짐이면 시트(2. REV)와 장부에, 꺼짐이면 지금 문구", () => {
    expect(approvalConfirmText(2, 12345, "on")).toBe("2건 · ¥12,345을 시트(2. REV)와 장부에 반영합니다")
    expect(approvalConfirmText(2, 12345, "off")).toBe("2건 · ¥12,345을 장부에 반영합니다")
  })

  it("반영 결과는 코드별 건수, 실패가 섞이면 alert", () => {
    const sheetResults = [
      { id: "a", ok: true, status: 200, code: "written" as const, message: null, error: null },
      { id: "b", ok: true, status: 200, code: "written" as const, message: null, error: null },
      { id: "c", ok: true, status: 200, code: "written" as const, message: null, error: null },
      { id: "d", ok: false, status: 409, code: "conflict" as const, message: null, error: "x" },
      { id: "e", ok: true, status: 200, code: "new_row_app_only" as const, message: null, error: null },
    ]
    expect(approvalResultLine("apply", { done: 4, failed: 1, sheetResults })).toEqual({
      text: "3건 시트에 반영 · 1건 장부에만(새 행) · 1건 충돌 — 시트가 바뀌었습니다 — 모두 보기에서 사유 확인",
      alert: true,
    })
    expect(approvalResultLine("apply", { done: 3, failed: 0, sheetResults: sheetResults.slice(0, 3) })).toEqual({ text: "3건 시트에 반영", alert: false })
  })

  it("꺼짐(전부 disabled)·체크는 지금 문구, 실패는 alert", () => {
    const disabled = [{ id: "a", ok: true, status: 200, code: "disabled" as const, message: null, error: null }]
    expect(approvalResultLine("apply", { done: 1, failed: 0, sheetResults: disabled })).toEqual({ text: "1건 반영됨", alert: false })
    expect(approvalResultLine("check", { done: 2, failed: 1 })).toEqual({ text: "2건 확인, 1건 실패 — 모두 보기에서 사유 확인", alert: true })
  })

  it("반영 버튼이 켜짐이면 시트·장부에 반영한다고 말한다", () => {
    const noop = async () => ({ done: 0, failed: 0 })
    const on = renderToStaticMarkup(<ApprovalBar drafts={[draft("d1", "checked", 100)]} serverQueue sheetWriteMode="on" onCheck={noop} onApply={noop} onShowAll={() => {}} />)
    expect(on).toContain("1건 시트·장부에 반영")
    const off = renderToStaticMarkup(<ApprovalBar drafts={[draft("d1", "checked", 100)]} serverQueue onCheck={noop} onApply={noop} onShowAll={() => {}} />)
    expect(off).toContain("1건 장부에 반영")
    expect(off).not.toContain("시트·장부")
  })
})

describe("LedgerSimpleView — 상단 한 줄은 켜짐일 때만", () => {
  const props = {
    rows: [],
    months: ["2026-10"],
    currentMonth: MONTH,
    monthlyGoals: null,
    personal: true,
    managerGoals: [],
    loading: false,
    edit: null,
    pendingDrafts: [],
    serverQueue: true,
    onCheckDrafts: async () => ({ done: 0, failed: 0 }),
    onApplyDrafts: async () => ({ done: 0, failed: 0 }),
    onShowQueue: () => {},
    onOpenRow: () => {},
    onOpenManager: () => {},
  }

  it("on 이면 안내, off·생략이면 없음", () => {
    // 정적 마크업은 ' 를 &#x27; 로 바꾼다 — 문구 전체를 같은 방식으로 이스케이프해 비교한다.
    const notice = SHEET_WRITE_ON_NOTICE.replace(/'/g, "&#x27;")
    const on = renderToStaticMarkup(<LedgerSimpleView {...props} sheetWriteMode="on" />)
    expect(on).toMatch(/<span data-sheet-write-notice="true"[^>]*>/)
    expect(on).toContain(notice)
    expect(renderToStaticMarkup(<LedgerSimpleView {...props} sheetWriteMode="off" />)).not.toContain("data-sheet-write-notice")
    expect(renderToStaticMarkup(<LedgerSimpleView {...props} />)).not.toContain(notice)
  })

  it("시트 쓰기 기록을 못 읽었으면 서버 문구를 상태로 보인다(없으면 안 보임)", () => {
    const html = renderToStaticMarkup(<LedgerSimpleView {...props} sheetWriteHealthMessage="시트 쓰기 기록을 읽지 못했습니다" />)
    expect(html).toMatch(/<span role="status" data-sheet-write-health="true"[^>]*>시트 쓰기 기록을 읽지 못했습니다<\/span>/)
    expect(renderToStaticMarkup(<LedgerSimpleView {...props} />)).not.toContain("data-sheet-write-health")
  })
})

describe("DraftQueue — 행 배지·사유 한 줄(sheetWrites)", () => {
  it("시트 쓰기 시도가 있는 행에 배지를, 막힌 행에는 messages.ts 문구 한 줄을 단다", async () => {
    const { DraftQueue } = await import("@/components/admin/branch/ledger/DraftQueue")
    const noop = () => {}
    const html = renderToStaticMarkup(
      <DraftQueue
        // 기본 필터(대기 = draft·checked)에서 보이는 행으로 — 반영 직후 재조회 전에는 checked 행에 written 이 붙어 있다.
        drafts={[draft("ok-1", "checked", 100), draft("bad-1", "checked", 200), draft("none-1", "checked", 300)]}
        mode="server"
        loading={false}
        error={null}
        reversedDraftIds={new Set()}
        recordErrors={new Map()}
        sheetWrites={{
          "ok-1": { status: "written", code: "written", message: SHEET_WRITE_MESSAGES.written, writtenAt: "2026-10-23T01:00:00.000Z", rowId: "r_0123456789ab" },
          "bad-1": { status: "refused", code: "past_week", message: SHEET_WRITE_MESSAGES.past_week, writtenAt: null, rowId: "r_0123456789ab" },
        }}
        onReload={noop}
        onEdit={noop}
        onToggle={noop}
        onApply={noop}
        onCancel={noop}
        onDelete={noop}
        onReverse={noop}
      />,
    )
    expect(html.match(/data-sheet-write-badge="/g) ?? []).toHaveLength(2)
    expect(html).toMatch(/<span data-sheet-write-badge="success"[^>]*>시트 반영됨<\/span>/)
    expect(html).toMatch(/<span data-sheet-write-badge="danger"[^>]*>실패<\/span>/)
    expect(html).toMatch(new RegExp(`<p data-sheet-write-reason="true"[^>]*>${SHEET_WRITE_MESSAGES.past_week}</p>`))
    expect(html.match(/data-sheet-write-reason/g) ?? []).toHaveLength(1)
  })

  it("sheetWrites 를 넘기지 않으면(꺼짐·기록 없음) 배지 없음", async () => {
    const { DraftQueue } = await import("@/components/admin/branch/ledger/DraftQueue")
    const noop = () => {}
    const html = renderToStaticMarkup(
      <DraftQueue
        drafts={[draft("a", "checked", 100)]}
        mode="server"
        loading={false}
        error={null}
        reversedDraftIds={new Set()}
        recordErrors={new Map()}
        onReload={noop}
        onEdit={noop}
        onToggle={noop}
        onApply={noop}
        onCancel={noop}
        onDelete={noop}
        onReverse={noop}
      />,
    )
    expect(html).not.toContain("data-sheet-write-badge")
  })
})
