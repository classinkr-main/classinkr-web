import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DraftQueue } from "@/components/admin/branch/ledger/DraftQueue"
import type { LedgerDraft } from "@/components/admin/branch/ledger/shared"

// 체크 큐 컴팩트(P0-5 · C-4, docs/active/ledger-filter-plan-2026-11-24.md) 최종 검증 라운드 1 지적.
//  1) 긴 목록에서 일괄 띠 아래 10px 틈으로 줄이 비쳤다 — sticky 띠가 스크롤하는 레일(aside)의 안쪽 여백만큼 떠 있었다.
//  2) 레일 전체가 스크롤해 "체크 큐 N" 머리 · 상태 탭이 위로 사라졌다.
//  → 목록(ul) 혼자 스크롤하고 머리 · 탭 · 일괄 띠는 흐름 안에 고정. 레일은 큐 보기일 때 flex 열이라 큐 패널이 줄어든다.
//  4) 같은 일괄 적용을 표 아래 변경 대기 줄은 "시트·장부에 반영"이라 하는데 큐는 "장부에 적용"이라 했다 — 시트 쓰기가
//     켜져 있으면 큐도 "시트·장부에"라고 말한다.
//  라운드 2) 곳은 맞췄는데 동사가 달랐다("4건 시트·장부에 적용" 바로 아래 "4건 시트·장부에 반영") — 같은 일괄 함수라
//     일괄 띠 버튼 · 확인 문구 · 확인 버튼도 변경 대기 줄과 같은 "반영"을 쓴다. 줄 알약 "적용" · 상태 "적용완료"는 그대로.
// 이 저장소의 vitest 는 node 환경(DOM 없음)이라 renderToStaticMarkup 으로 그린 마크업을 본다.

const noop = () => {}

function draft(id: string, status: LedgerDraft["status"], amount: number): LedgerDraft {
  return { id, kind: "edit-row", status, customer: `학원 ${id}`, manager: "A", team: "BD", month: "2026-11", amount, note: "", createdAt: "", updatedAt: "", sourceSheetRow: 20 }
}

const bulkOutcome = async () => ({ done: 0, failed: 0 })

function renderQueue(props: Partial<Parameters<typeof DraftQueue>[0]> = {}) {
  return renderToStaticMarkup(
    <DraftQueue
      drafts={[draft("a", "checked", 100_000), draft("b", "checked", 200_000), draft("c", "draft", 300_000)]}
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
      onBulkCheck={bulkOutcome}
      onBulkApply={bulkOutcome}
      {...props}
    />,
  )
}

describe("DraftQueue — 목록만 스크롤하고 머리 · 탭 · 일괄 띠는 고정", () => {
  it("목록은 줄어드는 스크롤 칸이고, 줄 안 sr-only 가 목록을 기준으로 놓인다(relative)", () => {
    const html = renderQueue()
    const ul = /<ul aria-label="체크 큐 초안" class="([^"]*)"/.exec(html)
    expect(ul, "체크 큐 목록 누락").not.toBeNull()
    const classes = ul![1].split(" ")
    expect(classes).toEqual(expect.arrayContaining(["relative", "min-h-0", "overflow-y-auto"]))
  })

  it("루트는 줄어드는 flex 열이고, 일괄 띠는 sticky 가 아니라 목록 뒤 마지막 줄이다", () => {
    const html = renderQueue()
    expect(html.startsWith('<div class="flex min-h-0 flex-col">')).toBe(true)
    const listEnd = html.indexOf("</ul>")
    const footerStart = html.indexOf("보이는 초안 1건 체크")
    expect(listEnd).toBeGreaterThan(-1)
    expect(footerStart).toBeGreaterThan(listEnd)
    expect(html).not.toContain("sticky")
    // 머리 줄 · 상태 탭은 목록보다 앞에 있다(스크롤 칸 밖).
    expect(html.indexOf('aria-label="상태로 거르기"')).toBeLessThan(html.indexOf('aria-label="체크 큐 초안"'))
  })
})

describe("DraftQueue — 일괄 적용 버튼이 쓰는 곳을 말한다", () => {
  it("시트 쓰기가 켜져 있으면 \"시트·장부에 반영\" — 표 아래 변경 대기 줄(ApprovalBar) 버튼과 같은 말", () => {
    const html = renderQueue({ sheetWriteMode: "on" })
    expect(html).toContain("2건 시트·장부에 반영")
    expect(html).not.toContain("2건 장부에 반영")
    expect(html).not.toContain("장부에 적용")
  })

  it("꺼짐이거나 값이 없으면 \"장부에 반영\"(시트에는 쓰지 않는다)", () => {
    expect(renderQueue({ sheetWriteMode: "off" })).toContain("2건 장부에 반영")
    expect(renderQueue()).toContain("2건 장부에 반영")
  })

  it("줄 알약 · 상태 라벨은 초안 한 건의 단계 이름(SSOT) \"적용\" · \"적용완료\" 그대로", () => {
    const html = renderQueue({ drafts: [draft("a", "checked", 100_000), draft("d", "applied", 50_000)] })
    expect(html).toContain('aria-label="학원 a 적용"')
    expect(html).toContain("적용완료")
  })

  it("인라인 확인 문구 · 확인 버튼도 같은 스위치 · 같은 동사를 따른다(소스)", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/branch/ledger/DraftQueue.tsx"), "utf8")
    expect(source).toContain('{sheetWriteMode === "on" ? "시트(2. REV)와 DB 장부에" : "DB 장부에"} 반영합니다')
    const confirm = source.slice(source.indexOf("onClick={() => void runBulkApply()}"))
    expect(confirm.slice(0, confirm.indexOf("</button>"))).toMatch(/\n\s*반영\n/)
  })
})

describe("빠른 작업 레일 — 큐 보기에서 큐 패널이 레일 높이 안으로 줄어든다(소스)", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")

  it("큐 보기일 때만 레일(aside)이 flex 열이다 — 상세 · 입력 보기는 레일 전체가 스크롤한다", () => {
    expect(source).toContain('<aside className={`${railView === "queue" ? "flex flex-col " : ""}fixed')
  })

  it("큐 패널은 min-h-0 flex 열이고, 시트 쓰기 스위치를 큐에 넘긴다", () => {
    const panel = source.indexOf('id="ledger-rail-panel-queue"')
    expect(panel).toBeGreaterThan(-1)
    const block = source.slice(panel, source.indexOf("/>", source.indexOf("<DraftQueue", panel)))
    expect(block).toContain('className="flex min-h-0 flex-col rounded-lg border border-[rgba(0,0,0,0.08)] bg-white"')
    expect(block).toContain("sheetWriteMode={sheetWrite.mode}")
  })
})
