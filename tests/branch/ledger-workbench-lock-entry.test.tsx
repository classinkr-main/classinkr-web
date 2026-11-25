// 워크벤치 배선 2부(웨이브 3b) — 시트 고정 화면(design-1) · 시트 쓰기 화면 문제(F-07) · 못 보낸 임시 초안(F-06 · F-34) ·
// 반영 중 잠금(F-20) · 일괄 범위(F-21) · DSH 장부 실적(D4) · 칸 커밋(F-02 · F-05 · F-17 · F-18).
//
// vitest 는 node 환경이라 effect 가 돌지 않는 서버 렌더(renderToStaticMarkup)로 첫 화면을 본다. 초안 큐 훅은 실제 훅을 돌리되
// 서버 응답이 정하는 값(sheetWrite · sheetWrites · drafts · 미전송 수 · 반영 중)만 바꿔 끼운다 — 화면이 그 값을 어떻게 그리는지가
// 이 파일의 대상이다. 지연 로드(ssr:false) 카드(DSH · 체크 큐)는 서버 렌더에 나오지 않아 소스 배선으로 본다.
import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { LedgerDraft } from "@/components/admin/branch/ledger/shared"
import type { SheetWriteState, SheetWriteView } from "@/components/admin/branch/ledger/sheet-write-view"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

type QueueOverrides = {
  sheetWrite?: SheetWriteState
  sheetWrites?: Record<string, SheetWriteView>
  drafts?: LedgerDraft[]
  unsyncedLocalCount?: number
  applyBusy?: boolean
  queueMode?: "server" | "local"
}
let overrides: QueueOverrides = {}

vi.mock("@/components/admin/branch/ledger/useLedgerDraftQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/branch/ledger/useLedgerDraftQueue")>()
  return {
    ...actual,
    useLedgerDraftQueue: () => {
      const real = actual.useLedgerDraftQueue()
      return { ...real, queueMode: "server" as const, queueLoading: false, ...overrides }
    },
  }
})

const { default: SalesLedgerWorkbench } = await import("@/components/admin/branch/SalesLedgerWorkbench")

afterEach(() => {
  overrides = {}
})

const SHEET_OFF: SheetWriteState = { mode: "off", lastRevSyncStartedAt: null, healthMessage: null, lock: null }

function render() {
  return renderToStaticMarkup(<SalesLedgerWorkbench defaultManager="예시A" initialBusinessDate="2026-12-02" />)
}

function draft(partial: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    id: "d-1",
    kind: "edit-row",
    status: "checked",
    sourceDealId: "deal-1",
    customer: "예시학원",
    manager: "예시A",
    team: "BD",
    month: "2026-12",
    amount: 100_000,
    note: "",
    metadata: { week: "w2" },
    createdAt: "2026-12-02T00:00:00Z",
    updatedAt: "2026-12-02T00:00:00Z",
    ...partial,
  }
}

describe("시트 고정(design-1) — 고정이 없으면 지금과 같은 화면", () => {
  it("고정 없음: '동기화' 버튼, 고정 줄 · 'DSH·HW 동기화' 없음", () => {
    overrides = { sheetWrite: SHEET_OFF }
    const html = render()
    expect(html).toContain(">동기화<")
    expect(html).not.toContain("data-rev-sheet-lock")
    expect(html).not.toContain("DSH·HW 동기화")
    expect(html).not.toContain("스냅샷 다시 읽기")
  })

  it("고정 예정(active:false)도 지금과 같다", () => {
    overrides = { sheetWrite: { ...SHEET_OFF, lock: { lockedAt: "2026-12-01", active: false } } }
    const html = render()
    expect(html).not.toContain("data-rev-sheet-lock")
    expect(html).toContain(">동기화<")
  })

  it("고정 적용 중: 조용한 한 줄 · 'DSH·HW 동기화'. 서버 렌더는 관리자 역할을 모르므로(세션 저장소) 다시 읽기 버튼이 없다", () => {
    overrides = { sheetWrite: { ...SHEET_OFF, lastRevSyncStartedAt: "2026-11-30T08:00:00Z", lock: { lockedAt: "2026-12-01", active: true } } }
    const html = render()
    expect(html).toContain("data-rev-sheet-lock")
    expect(html).toContain("시트는 12월 1일 기준으로 고정 — 이후 원본은 장부")
    expect(html).toContain("DSH·HW 동기화")
    expect(html).not.toContain("12/1 스냅샷 다시 읽기")
  })
})

describe("시트 쓰기 화면 문제(F-07) — 체크완료가 시트 잠김 · 권한으로 막혔으면 화면 한 줄", () => {
  const locked: SheetWriteView = { status: "failed", code: "sheet_locked", message: "", writtenAt: null, rowId: null }

  it("시트 쓰기 켜짐 + 체크완료 1건이 sheet_locked → role=alert 한 줄(관리자에게 끄기 요청)", () => {
    overrides = { sheetWrite: { ...SHEET_OFF, mode: "on" }, sheetWrites: { "d-1": locked }, drafts: [draft()] }
    const html = render()
    expect(html).toMatch(/role="alert"[^>]*>체크완료 1건이 시트 쓰기에서 막혔습니다 — 시트가 잠겨 시트 쓰기를 할 수 없습니다 — 관리자에게 시트 쓰기 끄기를 요청하세요/)
  })

  it("시트 고정 중이거나 시트 쓰기 꺼짐이면 보이지 않는다(다시 반영하면 장부에만 기록된다)", () => {
    overrides = { sheetWrite: { ...SHEET_OFF, lock: { lockedAt: "2026-12-01", active: true } }, sheetWrites: { "d-1": locked }, drafts: [draft()] }
    expect(render()).not.toContain("시트 쓰기에서 막혔습니다")
    overrides = { sheetWrite: SHEET_OFF, sheetWrites: { "d-1": locked }, drafts: [draft()] }
    expect(render()).not.toContain("시트 쓰기에서 막혔습니다")
  })
})

describe("못 보낸 임시 초안(F-06 · F-34) — 모든 보기에서 같은 자리, [다시 보내기]", () => {
  it("서버 모드에서 미전송이 있으면 한 줄 + 다시 보내기", () => {
    overrides = { sheetWrite: SHEET_OFF, unsyncedLocalCount: 2 }
    const html = render()
    expect(html).toContain("로컬 초안 2건 아직 안 보냄 — 서버에 저장하지 못해 이 브라우저에만 있습니다. 장부에 적용할 수 없습니다.")
    expect(html).toContain("다시 보내기")
  })

  it("없으면 보이지 않는다", () => {
    overrides = { sheetWrite: SHEET_OFF, unsyncedLocalCount: 0 }
    expect(render()).not.toContain("아직 안 보냄")
  })
})

describe("반영 중(F-20) — 다른 곳에서 반영 요청이 나가 있으면 결재 바가 잠긴다", () => {
  it("applyBusy 면 결재 바 버튼이 '반영 중…'", () => {
    overrides = { sheetWrite: SHEET_OFF, drafts: [draft()], applyBusy: true }
    expect(render()).toContain("반영 중…")
  })

  it("아니면 'N건 장부에 반영'", () => {
    overrides = { sheetWrite: SHEET_OFF, drafts: [draft()], applyBusy: false }
    const html = render()
    expect(html).not.toContain("반영 중…")
    expect(html).toContain("1건 장부에 반영")
  })
})

describe("소스 배선 — 지연 로드 카드 · 칸 커밋(서버 렌더에 나오지 않는 것)", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8").replace(/\r\n/g, "\n")
  const slice = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))

  it("DSH 네 카드에 장부 실적 정보(D4)를 넘긴다", () => {
    expect(source.match(/ledger=\{summary\.data\?\.dsh_ledger \?\? null\}/g)?.length).toBe(4)
  })

  it("체크 큐: 일괄 범위 = 결재 바와 같은 함수(F-21) · 반영 중(F-20) · 회계연도 달(F-46) · 고정(F-22)", () => {
    const queue = slice("<DraftQueue", "</section>")
    expect(queue).toContain("bulkScope={draftInLedgerScope}")
    expect(queue).toContain("applyingIds={applyingIds}")
    expect(queue).toContain("applyBusy={applyBusy}")
    expect(queue).toContain("fiscalMonths={matrixMonths}")
    expect(queue).toContain("sheetLock={sheetWrite.lock}")
    expect(source).toContain("pendingDrafts: openDrafts.filter(draftInLedgerScope),")
    // 큐 슬라이스 테스트(ledger-record-error-isolation)가 mode → recordErrors 거리를 본다 — 새 props 는 뒤에 붙였다.
    expect(queue.indexOf("recordErrors={recordErrors}") - queue.indexOf("mode={queueMode}")).toBeLessThan(400)
  })

  it("고정 줄 · 동기화 글자 · 관리자 다시 읽기는 ledgerTopBarLockView 하나가 정한다(관리자 = canRunAdminOperations)", () => {
    expect(source).toMatch(/ledgerTopBarLockView\(sheetWrite\.lock, \{\n\s+canRereadSnapshot: canRunAdminOperations,/)
    expect(source).toContain("sync={lockView.sync}")
    expect(source).toContain("sheetLock={lockView.sheetLock}")
    const reread = slice("const onSnapshotReread = useCallback", "const reloadLedgerData = useCallback")
    expect(reread).toContain('postBranchSync(["rev", "hw"], { revSnapshotReread: true })')
    expect(reread).toContain("describeSyncOutcome(body, { httpStatus: status })")
    // 고정 중 오류 띠 [다시 시도]는 다시 읽기만(POST 없음).
    expect(source).toContain("onClick={() => (revSheetLocked ? reloadLedgerData() : void onRefresh())}")
    expect(source).toContain("revLockedDayLabel={sheetWrite.lock?.active ? formatLockDayLabel(sheetWrite.lock.lockedAt) : null}")
  })

  it("칸 커밋: 주차 병합(F-02) · 응답 전 저장에 잇기(F-05) · 스냅샷 분류(F-17) · 세 갈래 결과(F-34)", () => {
    const builder = slice("const buildCellDraftInput = useCallback", "const cancelDraftRef = useRef")
    expect(builder).toContain("const prior = cellInFlightRef.current.get(monthKey) ?? null")
    expect(builder).toContain("const pending: MatrixPendingDraft | null = prior?.pending ?? serverPending")
    expect(builder).toContain("existingId: serverPending?.id ?? null,")
    expect(builder).toContain("row: cellDraftSnapshotRow(row, priorAmount),")
    expect(builder).toContain('const weekToken = placedWeek != null ? `w${placedWeek + 1}` : "month"')
    const commit = slice("const onCommitCell = useCallback", "const onMatrixAmountClamped = useCallback")
    expect(commit).toContain("): Promise<CellCommitResult> => {")
    expect(commit).toContain("if (result.error) {")
    expect(commit).toContain('return usedLocalFallback ? "local" : true')
    expect(commit).toContain("cellInFlightRef.current.set(built.monthKey, entry)")
    expect(commit).toContain("}).finally(settle)")
    // 칸 편집기 "다시 시도"(F-34).
    expect(source).toContain("() => ({ ...ledgerCellEdit, retryUnsent: retryUnsentDrafts }),")
  })

  it("신규 행은 계약 · 경로를 시트 어휘로 싣고(F-18), 폼 기본 · 재편집 · 같은 고객 신규 입력이 그 값을 잇는다", () => {
    expect(source).toContain("? withNewRowClassification(snapshot, draftForm)")
    expect(slice("const defaultDraftForm = useMemo<DraftForm>", "}), [selectedMonth, team])")).toContain("contract: null,\n    channel: null,")
    expect(slice("const editDraft = useCallback", "}, [team])")).toContain("...draftFormClassificationFromSnapshot(draft.sourceSnapshot),")
    expect(slice("const loadDealDetail = useCallback", "}, [selectedMonth, team])")).toContain("...draftFormClassificationFromRow(row),")
  })

  it("칸 표시는 대기 초안 + 응답 전 저장(F-19 · F-05), 저장 대상 판정은 서버 목록 그대로", () => {
    expect(source).toContain("pendingByCell={displayPendingByCell}\n                  savingCells={cellSavingByRow}")
    expect(source.match(/savingCells=\{cellSavingByRow\.get\(row\.id\) \?\? null\}/g)?.length).toBe(2)
    expect(slice("const buildCellDraftInput = useCallback", "const cancelDraftRef = useRef")).toContain("lookupMatrixPending(pendingByCell, { rowId, month, week }, kind)")
  })
})
