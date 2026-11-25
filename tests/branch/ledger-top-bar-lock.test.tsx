import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// 장부 머리(LedgerTopBar)의 2026-11-25 시트 고정 전 정비 — 새 props 는 넘기지 않으면 지금 화면 그대로다.
//  - sync: 동기화 버튼 글자·title(없으면 "동기화" + 기존 title, null 이면 숨김).
//  - sheetLock: 시트 고정 뒤 1줄 아래 조용한 한 줄([data-rev-sheet-lock], 중립 톤).
//  - snapshotReread: 관리자의 "12/1 스냅샷 다시 읽기" — 확인 한 번 뒤에만 onClick.
//  - loading(F-13): 결과 줄의 행 수·합계 대신 "불러오는 중".
//  - F-44 결과 줄 금액은 formatMoney(만 단위, 부호는 ¥ 앞), 정확한 금액은 title.
//  - F-52 범례는 SHEET_FILTER_CONFIDENCES(= CONFIDENCE_TOKENS 키 순서)에서 만든다.
// 정적 마크업은 renderToStaticMarkup(진짜 React), 확인 단계 상호작용은 helpers/hook-runner 의 미니 런타임.

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const { hookImplsWithFallback } = await import("@/tests/branch/helpers/hook-runner")
  return { ...actual, ...hookImplsWithFallback(actual as unknown as Record<string, unknown>) }
})

import LedgerTopBar, {
  DEFAULT_LEDGER_SYNC,
  ledgerTopBarLockView,
  SheetConfidenceLegend,
  SNAPSHOT_REREAD_CONFIRM_DEFAULT,
  SnapshotRereadControl,
  type LedgerTopBarProps,
} from "@/components/admin/branch/ledger/LedgerTopBar"
import { SHEET_FILTER_CONFIDENCES } from "@/components/admin/branch/ledger/ledger-sheet-logic"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { findElements, renderHook, textOf } from "@/tests/branch/helpers/hook-runner"

const noop = () => {}

function baseProps(props: Partial<LedgerTopBarProps> = {}): LedgerTopBarProps {
  return {
    tabs: [{ id: "dsh", label: "DSH" }, { id: "ledger", label: "장부" }],
    activeTab: "ledger",
    onSelectTab: noop,
    month: { value: "2026-11", label: "26년 11월", options: [{ value: "2026-11", label: "26년 11월", current: true }], canPrev: true, canNext: false },
    onMonthChange: noop,
    onMonthStep: noop,
    sheet: {
      pastPinned: false,
      onTogglePastPinned: noop,
      hasPast: true,
      result: { shown: 35, total: 70, monthLabel: "11월 계", sum: 78_540_000 },
    },
    filterLine: { chips: [], onClearAll: null },
    refreshing: false,
    onRefresh: noop,
    hw: { label: "HW 출고 12 · 재고 34 · 예정 5", title: "최근 30일 출고 · 창고 재고 · 출고 예정", low: false },
    onNewEntry: noop,
    scope: { mine: true, all: false, hint: null },
    onScopeMine: noop,
    onScopeAll: noop,
    tableViews: [{ id: "row", label: "건별" }],
    tableView: "row",
    onTableViewChange: noop,
    query: "",
    onQueryChange: noop,
    foldOpen: false,
    onToggleFold: noop,
    foldPanelId: "fold",
    ...props,
  }
}

const render = (props: Partial<LedgerTopBarProps> = {}) => renderToStaticMarkup(<LedgerTopBar {...baseProps(props)} />)

/** 동기화 버튼(RefreshCw 아이콘이 든 버튼) 마크업. */
function syncButtonOf(html: string): string | null {
  const match = /<button[^>]*>(?:(?!<\/button>).)*lucide-refresh-cw(?:(?!<\/button>).)*<\/button>/.exec(html)
  return match?.[0] ?? null
}

describe("sync — 동기화 버튼 글자·title", () => {
  it("넘기지 않으면 지금 그대로: '동기화' + 'REV 장부와 HW 시트를 함께 동기화', HW 칩도 그대로", () => {
    const html = render()
    const button = syncButtonOf(html)
    expect(button).not.toBeNull()
    expect(button).toContain('title="REV 장부와 HW 시트를 함께 동기화"')
    expect(button).toMatch(/<\/svg>동기화<\/button>$/)
    expect(DEFAULT_LEDGER_SYNC).toEqual({ label: "동기화", title: "REV 장부와 HW 시트를 함께 동기화" })
    expect(html).toContain('href="/admin/hardware"')
    expect(html).toContain("HW 출고 12 · 재고 34 · 예정 5")
  })

  it("넘기면 그 글자·title 로 바꾼다(하드코딩 '동기화' 대신)", () => {
    const button = syncButtonOf(render({ sync: { label: "DSH·HW 동기화", title: "DSH 목표·KPI와 HW 시트를 동기화" } }))
    expect(button).toContain('title="DSH 목표·KPI와 HW 시트를 동기화"')
    expect(button).toMatch(/<\/svg>DSH·HW 동기화<\/button>$/)
  })

  it("title 없이 넘기면 title 을 달지 않는다(엉뚱한 'REV 장부와 …'가 남지 않게)", () => {
    const button = syncButtonOf(render({ sync: { label: "DSH·HW 동기화" } }))
    expect(button).not.toContain("title=")
    expect(button).toContain("DSH·HW 동기화")
  })

  it("null 이면 버튼을 숨긴다 — HW 칩·매출 입력은 남는다", () => {
    const html = render({ sync: null })
    expect(syncButtonOf(html)).toBeNull()
    expect(html).not.toContain(">동기화<")
    expect(html).toContain("HW 출고 12")
    expect(html).toContain("매출 입력")
  })

  it("동기화 중이거나 스냅샷을 다시 읽는 중이면 동기화 버튼을 끈다(같은 POST 가 겹치지 않게)", () => {
    expect(syncButtonOf(render({ refreshing: true }))).toContain('disabled=""')
    expect(syncButtonOf(render({ snapshotReread: { label: "12/1 스냅샷 다시 읽기", onClick: noop, busy: true } }))).toContain('disabled=""')
    expect(syncButtonOf(render({ snapshotReread: { label: "12/1 스냅샷 다시 읽기", onClick: noop, busy: false } }))).not.toContain('disabled=""')
    expect(syncButtonOf(render())).not.toContain('disabled=""')
  })
})

describe("sheetLock — 시트 고정 뒤 조용한 한 줄", () => {
  it("넘기지 않으면(또는 null) 그 줄이 없다", () => {
    expect(render()).not.toContain("data-rev-sheet-lock")
    expect(render({ sheetLock: null })).not.toContain("data-rev-sheet-lock")
    expect(render()).not.toContain("lucide-lock")
  })

  it("넘기면 1줄과 2줄 사이에 role=note 한 줄 — 글자 그대로, title, 자물쇠 아이콘, 중립 글자색", () => {
    const html = render({ sheetLock: { text: "시트는 12월 1일 기준으로 고정 — 이후 원본은 장부", title: "마지막으로 시트를 읽은 시각 11/30 17:00" } })
    const note = /<p role="note" data-rev-sheet-lock=""[^>]*>(.*?)<\/p>/.exec(html)
    expect(note).not.toBeNull()
    expect(note?.[0]).toContain('title="마지막으로 시트를 읽은 시각 11/30 17:00"')
    expect(note?.[1]).toContain("lucide-lock")
    expect(textOfHtml(note?.[1] ?? "")).toBe("시트는 12월 1일 기준으로 고정 — 이후 원본은 장부")
    // 경고가 아니다 — 줄은 중립 글자색(#615D59), 경고·위험 색·틴트가 없다.
    const line = /<div class="([^"]*)"><p role="note"/.exec(html)
    expect(line?.[1]).toContain("text-[#615D59]")
    expect(line?.[1]).not.toMatch(/bg-|#7A520F|#A8741A|#B43E3E|#8F2C2C/)
    // 자리: 1줄(매출 입력) 뒤, 2줄(고객 검색) 앞.
    const at = html.indexOf("data-rev-sheet-lock")
    expect(html.indexOf("매출 입력")).toBeLessThan(at)
    expect(html.indexOf('aria-label="고객 검색"')).toBeGreaterThan(at)
  })
})

describe("snapshotReread — 관리자의 '12/1 스냅샷 다시 읽기'", () => {
  it("넘기지 않으면 버튼이 없다", () => {
    expect(render()).not.toContain("스냅샷 다시 읽기")
    expect(render({ snapshotReread: null })).not.toContain("스냅샷 다시 읽기")
  })

  it("넘기면 고정 줄 끝의 조용한 글자 버튼(테두리·채움 없음)으로 보인다", () => {
    const html = render({
      sheetLock: { text: "시트는 12월 1일 기준으로 고정 — 이후 원본은 장부" },
      snapshotReread: { label: "12/1 스냅샷 다시 읽기", onClick: noop, busy: false, title: "잠근 시트를 다시 읽습니다" },
    })
    const button = /<button type="button" title="잠근 시트를 다시 읽습니다" class="([^"]*)">12\/1 스냅샷 다시 읽기<\/button>/.exec(html)
    expect(button).not.toBeNull()
    expect(button?.[1]).toContain("underline")
    expect(button?.[1]).not.toMatch(/(?:^|\s)border(?:\s|-\[)|bg-\[#084734\]/)
    expect(html.indexOf("data-rev-sheet-lock")).toBeLessThan(html.indexOf("12/1 스냅샷 다시 읽기"))
  })

  it("SnapshotRereadControl: 첫 누름은 확인만 띄우고, [다시 읽기]를 눌러야 onClick 을 한 번 부른다", async () => {
    const onClick = vi.fn()
    const view = renderHook(() => SnapshotRereadControl({ label: "12/1 스냅샷 다시 읽기", onClick, busy: false, confirm: "지금 시트 값이 장부 기준값(12/1 스냅샷)이 됩니다" }))
    const trigger = findElements(view.current, (element) => element.type === "button")[0]
    expect(textOf(trigger)).toBe("12/1 스냅샷 다시 읽기")
    ;(trigger.props.onClick as () => void)()
    await view.settle(2)
    expect(onClick).not.toHaveBeenCalled()
    const group = findElements(view.current, (element) => element.props.role === "group")[0]
    expect(group.props["aria-label"]).toBe("12/1 스냅샷 다시 읽기 확인")
    expect(textOf(group)).toContain("지금 시트 값이 장부 기준값(12/1 스냅샷)이 됩니다")
    const confirm = findElements(view.current, (element) => element.type === "button" && textOf(element) === "다시 읽기")[0]
    ;(confirm.props.onClick as () => void)()
    await view.settle(2)
    expect(onClick).toHaveBeenCalledTimes(1)
    // 확인 뒤에는 다시 원래 버튼(확인 줄은 닫힌다).
    expect(findElements(view.current, (element) => element.props.role === "group")).toHaveLength(0)
    expect(textOf(view.current)).toBe("12/1 스냅샷 다시 읽기")
  })

  it("SnapshotRereadControl: [취소]·Esc 는 onClick 없이 닫고, confirm 이 없으면 기본 문구", async () => {
    const onClick = vi.fn()
    const view = renderHook(() => SnapshotRereadControl({ label: "12/1 스냅샷 다시 읽기", onClick, busy: false }))
    const open = () => (findElements(view.current, (element) => element.type === "button")[0].props.onClick as () => void)()
    open()
    await view.settle(2)
    expect(textOf(view.current)).toContain(SNAPSHOT_REREAD_CONFIRM_DEFAULT)
    const cancel = findElements(view.current, (element) => element.type === "button" && textOf(element) === "취소")[0]
    ;(cancel.props.onClick as () => void)()
    await view.settle(2)
    expect(textOf(view.current)).toBe("12/1 스냅샷 다시 읽기")

    open()
    await view.settle(2)
    const group = findElements(view.current, (element) => element.props.role === "group")[0]
    const preventDefault = vi.fn()
    ;(group.props.onKeyDown as (event: { key: string; preventDefault: () => void }) => void)({ key: "Escape", preventDefault })
    await view.settle(2)
    expect(preventDefault).toHaveBeenCalled()
    expect(textOf(view.current)).toBe("12/1 스냅샷 다시 읽기")
    expect(onClick).not.toHaveBeenCalled()
  })

  it("SnapshotRereadControl: 진행 중(busy)·다른 동기화 중(blocked)이면 aria-disabled 로 잠그고 누름을 무시한다", async () => {
    const onClick = vi.fn()
    const busy = renderHook(() => SnapshotRereadControl({ label: "12/1 스냅샷 다시 읽기", onClick, busy: true }))
    const busyButton = findElements(busy.current, (element) => element.type === "button")[0]
    expect(busyButton.props["aria-disabled"]).toBe(true)
    expect(busyButton.props.disabled).toBeUndefined()
    expect(textOf(busyButton)).toBe("다시 읽는 중…")
    ;(busyButton.props.onClick as () => void)()
    await busy.settle(2)
    expect(findElements(busy.current, (element) => element.props.role === "group")).toHaveLength(0)

    const blocked = renderHook(() => SnapshotRereadControl({ label: "12/1 스냅샷 다시 읽기", onClick, busy: false, blocked: true }))
    const blockedButton = findElements(blocked.current, (element) => element.type === "button")[0]
    expect(blockedButton.props["aria-disabled"]).toBe(true)
    expect(blockedButton.props.title).toBe("다른 동기화가 끝난 뒤 누를 수 있습니다")
    ;(blockedButton.props.onClick as () => void)()
    await blocked.settle(2)
    expect(findElements(blocked.current, (element) => element.props.role === "group")).toHaveLength(0)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("머리 줄에서 동기화 중이면(refreshing) 스냅샷 버튼도 잠근다", () => {
    const html = render({ refreshing: true, snapshotReread: { label: "12/1 스냅샷 다시 읽기", onClick: noop, busy: false } })
    expect(html).toMatch(/<button type="button" aria-disabled="true" title="다른 동기화가 끝난 뒤 누를 수 있습니다"[^>]*>12\/1 스냅샷 다시 읽기<\/button>/)
  })
})

describe("loading(F-13) — 결과 줄의 행 수·합계를 숨긴다", () => {
  it("없으면 지금 그대로 '35 / 70행 · 11월 계 ¥…'", () => {
    const html = render()
    expect(html).not.toContain("불러오는 중")
    expect(html).toContain("35")
    expect(html).toContain("11월 계")
  })

  it("loading 이면 행 수·합계 대신 '불러오는 중'(aria-busy) — 범례·칩 줄은 그대로", () => {
    const html = render({ loading: true })
    expect(html).toMatch(/<p aria-busy="true"[^>]*>불러오는 중<\/p>/)
    expect(html).not.toContain("¥7,854만")
    expect(html).not.toContain("11월 계")
    expect(html).not.toMatch(/>35<span/)
    expect(html).toContain('aria-label="확도 범례"')
    expect(html).toContain("걸린 필터 없음")
  })

  it("건별 시트가 아니면(sheet=null) loading 이어도 결과 줄이 없다", () => {
    expect(render({ sheet: null, loading: true })).not.toContain("불러오는 중")
  })
  it("일부만 불러왔으면(result.partial) 행 수만 — 합계는 숨기고 '일부만'", () => {
    const html = render({ sheet: { pastPinned: false, onTogglePastPinned: noop, hasPast: true, result: { shown: 2, total: 2, monthLabel: "11월 계", sum: 60_000, partial: true } } })
    expect(html).toContain("행 · 일부만")
    expect(html).not.toContain("¥6만")
    expect(html).not.toContain("11월 계")
    expect(html).toContain("시트 행을 못 불러와 합계는 보이지 않습니다")
  })
})

describe("F-44 — 결과 줄 금액은 장부 공용 formatMoney", () => {
  it("만 단위(천 단위 쉼표)로 보이고 정확한 금액은 title 에", () => {
    const html = render()
    expect(html).toContain(">¥7,854만</span>")
    expect(html).toContain("보이는 행의 11월 계 ¥78,540,000")
    expect(html).not.toContain(">¥78,540,000<")
  })

  it("음수는 부호를 ¥ 앞에, 글자색은 중립(크림슨 아님 — D2)", () => {
    const html = render({ sheet: { pastPinned: false, onTogglePastPinned: noop, hasPast: true, result: { shown: 1, total: 1, monthLabel: "11월 계", sum: -195_000 } } })
    const sum = /<span class="([^"]*)">(-¥19\.5만)<\/span>/.exec(html)
    expect(sum?.[2]).toBe("-¥19.5만")
    expect(sum?.[1]).toContain("text-[#111110]")
    expect(sum?.[1]).not.toContain(CONFIDENCE_TOKENS.confirmed.textClass)
    expect(html).toContain("보이는 행의 11월 계 -¥195,000")
    expect(html).not.toContain("¥-")
  })
})

describe("F-52 — 범례는 확도 토큰에서 만든다", () => {
  it("SHEET_FILTER_CONFIDENCES 순서대로 토큰 라벨·글자색·틴트를 그린다(단계 수 = 토큰 수)", () => {
    const html = renderToStaticMarkup(<SheetConfidenceLegend />)
    const chips = [...html.matchAll(/<span class="inline-block[^"]*" style="background-color:([^"]+)">([^<]+)<\/span>/g)]
    expect(SHEET_FILTER_CONFIDENCES).toEqual(Object.keys(CONFIDENCE_TOKENS))
    expect(chips).toHaveLength(Object.keys(CONFIDENCE_TOKENS).length)
    expect(chips.map((chip) => chip[2])).toEqual(SHEET_FILTER_CONFIDENCES.map((kind) => CONFIDENCE_TOKENS[kind].label))
    SHEET_FILTER_CONFIDENCES.forEach((kind, index) => {
      expect(chips[index][0]).toContain(CONFIDENCE_TOKENS[kind].textStrongClass)
      expect(chips[index][1]).toBe(CONFIDENCE_TOKENS[kind].tintBg)
    })
    // 굵기는 확도가 높을수록 굵게(지금 화면 그대로).
    expect(chips[0][0]).toContain("font-bold")
    expect(chips[1][0]).toContain("font-semibold")
    expect(chips[2][0]).toContain("font-medium")
  })
})

describe("ledgerTopBarLockView — sheetWrite.lock 으로 머리 줄 값을 정한다", () => {
  it("고정 전(null·scheduled·형식이 틀린 날짜)이면 지금 그대로 — '동기화', 고정 줄·스냅샷 버튼 없음", () => {
    const today = { sync: { label: "동기화", title: "REV 장부와 HW 시트를 함께 동기화" }, sheetLock: null, snapshotReread: null }
    expect(ledgerTopBarLockView(null, { canRereadSnapshot: true })).toEqual(today)
    expect(ledgerTopBarLockView(undefined, { canRereadSnapshot: true })).toEqual(today)
    expect(ledgerTopBarLockView({ lockedAt: "2026-12-01", active: false }, { canRereadSnapshot: true })).toEqual(today)
    expect(ledgerTopBarLockView({ lockedAt: "12/1", active: true }, { canRereadSnapshot: true })).toEqual(today)
  })

  it("active + 관리자: 'DSH·HW 동기화', 고정 줄, '12/1 스냅샷 다시 읽기'(확인 문구 포함)", () => {
    const view = ledgerTopBarLockView({ lockedAt: "2026-12-01", active: true }, { canRereadSnapshot: true, lastRevReadLabel: "11/30 17:00" })
    expect(view.sync.label).toBe("DSH·HW 동기화")
    expect(view.sync.title).toBe("DSH 목표·KPI와 HW 시트를 동기화 — REV 시트는 12월 1일 기준으로 고정돼 다시 읽지 않습니다")
    expect(view.sheetLock?.text).toBe("시트는 12월 1일 기준으로 고정 — 이후 원본은 장부")
    expect(view.sheetLock?.title).toContain("'2. REV' 시트는 12월 1일부터 다시 읽지 않습니다")
    expect(view.sheetLock?.title).toContain("마지막으로 시트를 읽은 시각 11/30 17:00")
    expect(view.snapshotReread?.label).toBe("12/1 스냅샷 다시 읽기")
    expect(view.snapshotReread?.confirm).toBe("지금 시트 값이 장부 기준값(12/1 스냅샷)이 됩니다")
    expect(view.snapshotReread?.title).toContain("잠근 시트(2. REV)를 다시 읽어 장부의 기준값을 바꿉니다")
  })

  it("active + 관리자 아님: 스냅샷 버튼 없음, 마지막 읽은 시각을 모르면 '확인 불가'", () => {
    const view = ledgerTopBarLockView({ lockedAt: "2026-12-01", active: true }, { canRereadSnapshot: false })
    expect(view.sync.label).toBe("DSH·HW 동기화")
    expect(view.snapshotReread).toBeNull()
    expect(view.sheetLock?.title).toContain("마지막으로 시트를 읽은 시각 확인 불가")
  })

  it("결과를 그대로 넘기면 머리 줄에 고정 줄·'DSH·HW 동기화'·스냅샷 버튼이 함께 보인다", () => {
    const view = ledgerTopBarLockView({ lockedAt: "2026-12-01", active: true }, { canRereadSnapshot: true })
    const html = render({
      sync: view.sync,
      sheetLock: view.sheetLock,
      snapshotReread: view.snapshotReread ? { ...view.snapshotReread, onClick: noop, busy: false } : null,
    })
    expect(syncButtonOf(html)).toContain("DSH·HW 동기화")
    expect(html).toContain("시트는 12월 1일 기준으로 고정 — 이후 원본은 장부")
    expect(html).toContain(">12/1 스냅샷 다시 읽기</button>")
  })
})

/** 마크업에서 태그를 지운 글자. */
function textOfHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "")
}
