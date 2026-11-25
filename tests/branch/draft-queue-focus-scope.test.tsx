import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 체크 큐·결재 바·칸 편집기의 2026-11-25 시트 고정 전 정비(렌더·상호작용).
//  - F-46 큐 줄의 달: 활성 회계연도 밖이면 "26년 4월".
//  - F-21 일괄은 화면 범위(bulkScope)만, 담당자가 여럿이면 "전체 담당자 N건" + 확인 문구에 담당자별 건수.
//  - F-20 반영 진행 중(applyBusy·applyingIds)이면 일괄·줄 적용을 잠그고 "반영 중…".
//  - F-39 체크 알약은 진행 중 aria-disabled(포커스 유지)·같은 key, 사라진 "체크 해제"의 포커스는 줄 알약으로.
//  - F-22 시트 고정 뒤 되돌리기 막힘 사유는 "장부에서 원래 값으로 다시 입력".
//  - F-34 칸 편집기: 저장 중 readOnly(포커스 유지), 거절이면 입력칸으로 포커스, 임시 저장이면 "아직 안 보냄 · 다시 시도".
// 정적 마크업은 renderToStaticMarkup(진짜 React), 상태가 바뀌는 상호작용은 helpers/hook-runner 의 미니 런타임으로
// 컴포넌트 함수를 직접 돌려 요소 트리를 본다(이 저장소의 vitest 는 DOM 이 없는 node 환경).

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const { hookImplsWithFallback } = await import("@/tests/branch/helpers/hook-runner")
  return { ...actual, ...hookImplsWithFallback(actual as unknown as Record<string, unknown>) }
})
// 다이얼로그 포커스 훅은 document 를 만진다 — 런타임 렌더에서는 끈다(정적 렌더에서는 effect 가 돌지 않는다).
vi.mock("@/components/admin/use-dialog-focus", () => ({ useDialogFocus: () => {} }))

import { bulkOwnerBreakdown, DraftQueue, queueMonthLabel } from "@/components/admin/branch/ledger/DraftQueue"
import {
  ApprovalBar,
  approvalResultLine,
  cellCommitOutcome,
  InlineCellEditor,
  type CellCommitResult,
  type LedgerCellEditApi,
} from "@/components/admin/branch/ledger/LedgerSimpleEdit"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"
import {
  APPLY_NO_RESPONSE_MESSAGE,
  APPLY_SKIPPED_IN_FLIGHT_MESSAGE,
  type ApplySheetOutcome,
} from "@/components/admin/branch/ledger/sheet-write-view"
import { SHEET_WRITE_MESSAGES } from "@/lib/branch/sheet-writeback/messages"
import { findByProp, findElements, renderHook, textOf } from "@/tests/branch/helpers/hook-runner"

const noop = () => {}
const bulkOutcome = async () => ({ done: 0, failed: 0 })
const FY = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]

function draft(id: string, status: LedgerDraft["status"], partial: Partial<LedgerDraft> = {}): LedgerDraft {
  return { id, kind: "edit-row", status, customer: `학원 ${id}`, manager: "A", team: "BD", month: "2026-11", amount: 100_000, note: "", createdAt: "", updatedAt: "", sourceSheetRow: 20, ...partial }
}

type QueueProps = Parameters<typeof DraftQueue>[0]

function queueProps(props: Partial<QueueProps> = {}): QueueProps {
  return {
    drafts: [draft("a", "checked"), draft("b", "checked"), draft("c", "draft")],
    mode: "server",
    loading: false,
    error: null,
    reversedDraftIds: new Set(),
    recordErrors: new Map(),
    onReload: noop,
    onEdit: noop,
    onToggle: noop,
    onApply: noop,
    onCancel: noop,
    onDelete: noop,
    onReverse: noop,
    onBulkCheck: bulkOutcome,
    onBulkApply: bulkOutcome,
    ...props,
  }
}

const renderQueue = (props: Partial<QueueProps> = {}) => renderToStaticMarkup(<DraftQueue {...queueProps(props)} />)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("F-46 — 활성 회계연도 밖의 달은 해를 붙인다", () => {
  it("queueMonthLabel: 회계연도 안이면 '11월', 밖이면 '26년 3월'·'27년 4월', 회계연도를 모르면 지금처럼 달만", () => {
    expect(queueMonthLabel("2026-11", FY)).toBe("11월")
    expect(queueMonthLabel("2027-04", FY)).toBe("27년 4월")
    expect(queueMonthLabel("2026-03", FY)).toBe("26년 3월")
    expect(queueMonthLabel("2027-04")).toBe("4월")
    expect(queueMonthLabel("2027-04", [])).toBe("4월")
  })

  it("큐 줄 둘째 줄이 같은 '4월'을 두 해로 가른다", () => {
    const drafts = [draft("x", "draft", { month: "2026-04", metadata: { week: "w3" } }), draft("y", "draft", { month: "2027-04", metadata: { week: "w1" } })]
    const html = renderQueue({ drafts, fiscalMonths: FY })
    expect(html).toContain("4월 W3 · A")
    expect(html).toContain("27년 4월 W1 · A")
    // 회계연도를 넘기지 않으면 지금과 같다.
    expect(renderQueue({ drafts })).not.toContain("27년")
  })
})

describe("F-21 — 일괄은 화면 범위만, 담당자가 여럿이면 그렇게 말한다", () => {
  const twoOwners = [draft("a", "checked", { manager: "예시A" }), draft("b", "checked", { manager: "예시B" }), draft("c", "draft", { manager: "예시A" })]

  it("bulkOwnerBreakdown: 많은 순, 같으면 이름순 · 빈 담당자는 '담당자 없음'", () => {
    expect(bulkOwnerBreakdown([{ manager: "예시B" }, { manager: "예시A" }, { manager: "예시B" }, { manager: " " }])).toEqual({
      owners: 3,
      text: "예시B 2건 · 담당자 없음 1건 · 예시A 1건",
    })
  })

  it("범위(담당자 예시A)를 주면 일괄 반영·체크는 그 담당자 것만 세고, 범위 밖 체크완료는 건수만 조용히 알린다", () => {
    const html = renderQueue({ drafts: twoOwners, bulkScope: (item) => item.manager === "예시A" })
    expect(html).toContain("1건 장부에 반영")
    expect(html).not.toContain("전체 담당자")
    expect(html).toContain("다른 담당자 체크완료 1건 제외")
    expect(html).toContain("보이는 초안 1건 체크")
  })

  it("범위가 없고 담당자가 여럿이면 버튼이 '전체 담당자 N건'이고, 확인 문구에 담당자별 건수가 붙는다", async () => {
    expect(renderQueue({ drafts: twoOwners })).toContain("전체 담당자 2건 장부에 반영")
    const view = renderHook(() => DraftQueue(queueProps({ drafts: twoOwners })))
    const open = findElements(view.current, (element) => element.type === "button" && textOf(element).includes("전체 담당자 2건 장부에 반영"))[0]
    ;(open.props.onClick as () => void)()
    await view.settle(2)
    const confirm = findByProp(view.current, "role", "alert")
    expect(textOf(confirm)).toContain("전체 담당자 2건")
    expect(textOf(confirm)).toContain("예시A 1건 · 예시B 1건")
  })
})

describe("F-20 — 다른 곳의 반영이 진행 중이면 잠그고 '반영 중…'", () => {
  it("큐 일괄 버튼은 꺼지고 '반영 중…', 진행 중인 줄의 적용 알약도 '반영 중…'(aria-disabled), 다른 줄 알약도 잠근다", () => {
    const html = renderQueue({ applyBusy: true, applyingIds: new Set(["a"]) })
    expect(html).toMatch(/<button type="button" disabled="" class="inline-flex h-7[^"]*"[^>]*>.*반영 중…<\/button>/)
    const pillA = /<button[^>]*aria-label="학원 a 적용"[^>]*>(.*?)<\/button>/.exec(html)
    expect(pillA?.[0]).toContain('aria-disabled="true"')
    expect(pillA?.[1]).toContain("반영 중…")
    const pillB = /<button[^>]*aria-label="학원 b 적용"[^>]*>(.*?)<\/button>/.exec(html)
    expect(pillB?.[0]).toContain('aria-disabled="true"')
    expect(pillB?.[0]).toContain("다른 반영이 끝난 뒤 적용할 수 있습니다")
    expect(pillB?.[1]).toContain("적용")
  })

  it("결재 바도 다른 곳의 반영이 진행 중이면 반영·확인 버튼을 끄고 '반영 중…'", () => {
    const html = renderToStaticMarkup(
      <ApprovalBar drafts={[draft("a", "checked"), draft("c", "draft")]} serverQueue applyBusy onCheck={bulkOutcome} onApply={bulkOutcome} onShowAll={noop} />,
    )
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>반영 중…<\/button>/)
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>1건 확인<\/button>/)
    expect(html).not.toContain("1건 장부에 반영")
  })
})

describe("F-39 — 체크 알약은 누른 뒤에도 포커스를 지킨다", () => {
  it("진행 중엔 disabled 가 아니라 aria-disabled 이고, 체크 → 적용으로 바뀌어도 같은 key 의 알약이다", async () => {
    let finish!: () => void
    const onToggle = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    let props = queueProps({ drafts: [draft("c", "draft")], onToggle })
    const view = renderHook(() => DraftQueue(props))
    const pill = () => findByProp(view.current, "aria-label", "학원 c 체크") ?? findByProp(view.current, "aria-label", "학원 c 적용")

    const before = pill()
    expect(before?.key).toBe("next-step-c")
    ;(before?.props.onClick as () => void)()
    await view.settle(2)
    const busy = pill()
    expect(busy?.props.disabled).toBe(false)
    expect(busy?.props["aria-disabled"]).toBe(true)
    // 진행 중 다시 눌러도 요청이 두 번 나가지 않는다.
    ;(busy?.props.onClick as () => void)()
    expect(onToggle).toHaveBeenCalledTimes(1)

    finish()
    props = { ...props, drafts: [draft("c", "checked")] }
    await view.settle(2)
    view.rerender()
    const after = pill()
    expect(after?.props["aria-label"]).toBe("학원 c 적용")
    expect(after?.key).toBe("next-step-c")
    expect(after?.props["aria-disabled"]).toBeUndefined()
  })

  it("'체크 해제' 링크가 사라져 포커스가 몸통으로 떨어지면 그 줄의 알약으로 돌린다", async () => {
    const body = { tag: "body" }
    vi.stubGlobal("document", { activeElement: body, body })
    let finish!: () => void
    const onToggle = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    let props = queueProps({ drafts: [draft("a", "checked")], onToggle })
    const view = renderHook(() => DraftQueue(props))
    // 줄을 펼쳐 체크 해제 링크를 꺼낸다.
    const rowButton = findElements(view.current, (element) => element.type === "button" && element.props["aria-expanded"] === false)[0]
    ;(rowButton.props.onClick as () => void)()
    await view.settle(2)

    const focus = vi.fn()
    const pillRef = findByProp(view.current, "aria-label", "학원 a 적용")?.props.ref as (node: unknown) => void
    pillRef({ focus })
    ;(findByProp(view.current, "aria-label", "학원 a 체크 해제")?.props.onClick as () => void)()
    await view.settle(2)
    finish()
    props = { ...props, drafts: [draft("a", "draft")] }
    await view.settle(2)
    view.rerender()
    // 새 알약(체크)에 ref 가 다시 붙는 것은 진짜 DOM 의 몫 — 여기서는 등록된 노드로 포커스가 갔는지만 본다.
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it("포커스가 아직 살아 있는 요소에 있으면(알약이 그대로 남은 경우) 건드리지 않는다", async () => {
    const pillNode = { focus: vi.fn() }
    vi.stubGlobal("document", { activeElement: pillNode, body: {} })
    const view = renderHook(() => DraftQueue(queueProps({ drafts: [draft("c", "draft")], onToggle: async () => {} })))
    const pill = findByProp(view.current, "aria-label", "학원 c 체크")
    ;(pill?.props.ref as (node: unknown) => void)(pillNode)
    ;(pill?.props.onClick as () => void)()
    await view.settle(3)
    expect(pillNode.focus).not.toHaveBeenCalled()
  })
})

describe("F-22 — 시트 고정 뒤 되돌리기 막힘 사유", () => {
  const applied = [draft("a", "applied")]
  const sheetWrites = { a: { status: "written" as const, code: "written", message: "시트에 반영됨", writtenAt: null, rowId: null } }

  // 적용완료 줄은 "적용완료" 탭에서만 보인다 — 탭을 눌러 되돌리기 링크의 title 을 읽는다.
  async function reverseTitle(sheetLock: QueueProps["sheetLock"]) {
    const view = renderHook(() => DraftQueue(queueProps({ drafts: applied, sheetWrites, sheetLock })))
    const tab = findElements(view.current, (element) => element.type === "button" && element.props["aria-pressed"] === false && textOf(element).startsWith("적용완료"))[0]
    ;(tab.props.onClick as () => void)()
    await view.settle(2)
    const link = findByProp(view.current, "aria-label", "학원 a 적용 되돌리기")
    expect(link?.props.disabled).toBe(true)
    return link?.props.title
  }

  it("고정이 적용 중이면 '시트는 12월 1일 기준으로 고정돼 되돌릴 수 없습니다 — 장부에서 원래 값으로 다시 입력하세요'", async () => {
    expect(await reverseTitle({ lockedAt: "2026-12-01", active: true })).toBe(
      "시트는 12월 1일 기준으로 고정돼 되돌릴 수 없습니다 — 장부에서 원래 값으로 다시 입력하세요",
    )
  })

  it("고정 전(예정·없음)은 지금 문구", async () => {
    for (const sheetLock of [null, { lockedAt: "2026-12-01", active: false }]) {
      expect(await reverseTitle(sheetLock)).toContain("시트에 반영된 항목입니다 — 시트에서 직접 되돌리거나")
    }
  })
})

describe("결재 바 결과 줄 — 할 일을 이미 말하는 실패에는 '모두 보기'를 붙이지 않는다", () => {
  const out = (id: string, partial: Partial<ApplySheetOutcome>): ApplySheetOutcome => ({ id, ok: false, status: 409, code: null, message: null, error: "x", ...partial })

  it("전부 시트 잠김이면 잠김 문구만(관리자 안내 포함)", () => {
    const sheetResults = [out("a", { code: "sheet_locked" }), out("b", { code: "sheet_locked" })]
    expect(approvalResultLine("apply", { done: 0, failed: 2, sheetResults })).toEqual({
      text: `2건 ${SHEET_WRITE_MESSAGES.sheet_locked}`,
      alert: true,
    })
  })

  it("전부 응답 없음이면 새로고침 안내만, 행 사유가 있는 실패가 섞이면 '모두 보기에서 사유 확인'", () => {
    const noResponse = [out("a", { status: 0 }), out("b", { status: 0 })]
    expect(approvalResultLine("apply", { done: 0, failed: 2, sheetResults: noResponse }).text).toBe(`2건 ${APPLY_NO_RESPONSE_MESSAGE}`)
    const mixed = [out("a", { code: "sheet_locked" }), out("b", { code: "conflict" })]
    expect(approvalResultLine("apply", { done: 0, failed: 2, sheetResults: mixed }).text).toMatch(/ — 모두 보기에서 사유 확인$/)
  })

  it("시트 쓰기가 꺼져 있어도 실패가 있으면 사유별로(응답 없음을 '실패'로 뭉뚱그리지 않는다)", () => {
    const sheetResults: ApplySheetOutcome[] = [
      { id: "a", ok: true, status: 200, code: "disabled", message: null, error: null },
      out("b", { status: 0 }),
    ]
    expect(approvalResultLine("apply", { done: 1, failed: 1, sheetResults })).toEqual({
      text: `1건 반영됨 · 1건 ${APPLY_NO_RESPONSE_MESSAGE}`,
      alert: true,
    })
  })

  it("보낸 것이 없으면(전부 다른 곳에서 반영 중) 그렇게 말한다", () => {
    expect(approvalResultLine("apply", { done: 0, failed: 0, sheetResults: [] })).toEqual({ text: APPLY_SKIPPED_IN_FLIGHT_MESSAGE, alert: false })
  })
})

// ── F-34 칸 편집기 ──────────────────────────────────────────────────────────

const ROW = {
  id: "deal-1",
  customer: "서울 학원",
  manager: "A",
  team: "BD",
  region: null,
  revenue: 5000,
  ledgerOrigin: "sheet",
  monthlyPayments: { "2026-11": 5000 },
} as unknown as LedgerRevenueRow

function editApi(commit: () => Promise<CellCommitResult>, overrides: Partial<LedgerCellEditApi> = {}): LedgerCellEditApi {
  return { editable: () => true, value: () => 5000, confidence: () => "expected", pending: () => null, commit, ...overrides }
}

function mountEditor(edit: LedgerCellEditApi) {
  const onClose = vi.fn()
  const view = renderHook(() => InlineCellEditor({ label: "서울 학원 · 11월", month: "2026-11", candidates: [ROW], edit, onClose, onMore: noop }))
  const input = () => findElements(view.current, (element) => element.type === "input")[0]
  const inputNode = { focus: vi.fn(), select: vi.fn() }
  ;(input().props.ref as { current: unknown }).current = inputNode
  const type = async (value: string) => {
    ;(input().props.onChange as (event: unknown) => void)({ target: { value } })
    await view.settle(1)
  }
  const save = () => (findByProp(view.current, "aria-label", "저장")?.props.onClick as () => void)()
  return { view, input, inputNode, onClose, type, save }
}

describe("F-34 — 칸 편집기 저장 결과 셋", () => {
  it("cellCommitOutcome: true·saved → saved, local → local, false·rejected → rejected", () => {
    expect([true, "saved", "local", false, "rejected"].map((value) => cellCommitOutcome(value as CellCommitResult))).toEqual([
      "saved",
      "saved",
      "local",
      "rejected",
      "rejected",
    ])
  })

  it("저장 중엔 입력칸이 disabled 가 아니라 readOnly(포커스 유지), 서버에 저장되면 닫는다", async () => {
    let finish!: (value: CellCommitResult) => void
    const editor = mountEditor(editApi(() => new Promise((resolve) => { finish = resolve })))
    await editor.type("9000")
    editor.save()
    await editor.view.settle(1)
    expect(editor.input().props.disabled).toBeUndefined()
    expect(editor.input().props.readOnly).toBe(true)
    expect(editor.input().props["aria-busy"]).toBe(true)
    finish("saved")
    await editor.view.settle(2)
    expect(editor.onClose).toHaveBeenCalledTimes(1)
  })

  it("거절(충돌·검증)이면 열어 둔 채 입력칸으로 포커스를 돌린다 — 다시 Enter 할 수 있다", async () => {
    const editor = mountEditor(editApi(async () => false))
    await editor.type("9000")
    editor.save()
    await editor.view.settle(2)
    expect(editor.onClose).not.toHaveBeenCalled()
    expect(editor.inputNode.focus).toHaveBeenCalled()
    expect(editor.input().props.readOnly).toBe(false)
  })

  it("이 브라우저에만 임시 저장되면 '아직 안 보냄 · 다시 시도' — 다시 시도가 다 보내면 닫는다", async () => {
    const retryUnsent = vi.fn(async () => true)
    const editor = mountEditor(editApi(async () => "local", { retryUnsent }))
    await editor.type("9000")
    editor.save()
    await editor.view.settle(2)
    const status = findByProp(editor.view.current, "data-cell-unsent", "idle")
    expect(textOf(status)).toContain("아직 안 보냄")
    const retry = findElements(status, (element) => element.type === "button")[0]
    expect(textOf(retry)).toBe("다시 시도")
    ;(retry.props.onClick as () => void)()
    await editor.view.settle(2)
    expect(retryUnsent).toHaveBeenCalledTimes(1)
    expect(editor.onClose).toHaveBeenCalledTimes(1)
  })

  it("다시 보내기도 실패하면 열어 둔 채 '다시 보내지 못했습니다', 다시 시도할 길이 없으면(retryUnsent 없음) 그냥 닫는다", async () => {
    const editor = mountEditor(editApi(async () => "local", { retryUnsent: async () => false }))
    await editor.type("9000")
    editor.save()
    await editor.view.settle(2)
    ;(findElements(findByProp(editor.view.current, "data-cell-unsent", "idle"), (element) => element.type === "button")[0].props.onClick as () => void)()
    await editor.view.settle(2)
    expect(textOf(findByProp(editor.view.current, "data-cell-unsent", "failed"))).toContain("다시 보내지 못했습니다")
    expect(editor.onClose).not.toHaveBeenCalled()

    const plain = mountEditor(editApi(async () => "local"))
    await plain.type("9000")
    plain.save()
    await plain.view.settle(2)
    expect(plain.onClose).toHaveBeenCalledTimes(1)
  })
})
