// 매트릭스 셀 커밋 직후 "실행 취소" 토스트(입력 속도 라운드 4 P1-6,
// docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4) — 새로 만들어진 초안에만 토스트에
// "실행 취소" 버튼을 붙이고, 누르면 그 초안만 cancelled로 전이한다(하드 삭제 아님 — 감사 추적
// 보존, 2026-09-10 #8 결정과 동일). useLedgerDraftQueue는 훅 내부 클로저라 렌더 없이 직접 호출할
// 수 없어(다른 소스 스캔 테스트와 동일 이유) SalesLedgerWorkbench.tsx를 소스 스캔한다.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe("pushMatrixToast — key 기반 dedupe + ttlMs(라운드 4 P1-6)", () => {
  const body = () => sliceBetween(
    workbenchSource(),
    "const pushMatrixToast = useCallback",
    "const dismissMatrixToast = useCallback",
  )

  it("dedupe 판정을 text 대신 key ?? text로 한다", () => {
    const fn = body()
    expect(fn).toContain("const dedupeKey = next.key ?? next.text")
    expect(fn).toContain("(toast.key ?? toast.text) === dedupeKey")
    // text만 보던 예전 판정이 되살아나지 않았는지(회귀 방지).
    expect(fn).not.toContain("toast.text === next.text")
  })

  it("자동 소거 지연은 next.ttlMs ?? 7000이다(개별 토스트가 기본값을 덮어쓸 수 있어야 함)", () => {
    expect(body()).toContain("next.ttlMs ?? 7000")
  })

  it("스택 상한(MATRIX_TOAST_MAX)·info 우선 드롭 정책은 그대로다", () => {
    const fn = body()
    expect(fn).toContain("if (stacked.length <= MATRIX_TOAST_MAX) return stacked")
    // 라운드 5 리뷰: 드롭 후보는 "기존" 토스트 중에서만 고른다 — 오류가 닫을 때까지 남는 뒤로, 방금 넣은 info(실행 취소 등)가
    // 곧바로 밀려나지 않게.
    expect(fn).toContain('const dropIndex = current.findIndex((toast) => toast.kind === "info")')
  })
})

describe("onCommitCell — 새 초안 경로에서만 실행 취소 토스트(라운드 4 P1-6)", () => {
  // 종료 마커는 tests/branch/ledger-draft-optimistic-lock.test.ts의 onCommitCell 슬라이스
  // 종료 마커와 동일 문자열이다 — onCommitCell 의존성 배열을 바꾸면 두 테스트를 함께 갱신한다.
  const body = () => sliceBetween(
    workbenchSource(),
    "const onCommitCell = useCallback",
    "[buildCellDraftInput, createDraft, pushMatrixToast, undoCellDraft, updateDraft]",
  )

  it("built.existingId가 없고 로컬 폴백도 dedupedRecent도 아닌 경로에 key·ttlMs·action을 붙인다", () => {
    const fn = body()
    const guardIndex = fn.indexOf("if (!built.existingId && draft) {")
    expect(guardIndex).toBeGreaterThan(-1)
    // 이 분기가 로컬 폴백(usedLocalFallback)·재사용(dedupedRecent) 판정보다 뒤에 있어야
    // 그 두 경우를 걸러낸 "새 초안이 실제로 만들어진" 경로에만 적용된다.
    const usedLocalFallbackIndex = fn.indexOf("const usedLocalFallback =")
    const dedupedRecentIndex = fn.indexOf("if (result.dedupedRecent")
    expect(usedLocalFallbackIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeGreaterThan(usedLocalFallbackIndex)
    expect(guardIndex).toBeGreaterThan(dedupedRecentIndex)

    const actionBranch = fn.slice(guardIndex)
    expect(actionBranch).toContain("key: `undo:${draft.id}`")
    expect(actionBranch).toContain("ttlMs: 6000")
    expect(actionBranch).toContain('label: "실행 취소"')
    expect(actionBranch).toContain("undoCellDraft(draft.id)")
    expect(actionBranch).toContain("자가 체크로 저장됨 — 체크 큐에서 적용해야 장부에 반영됩니다.")
  })

  it("기존 대기 초안을 PATCH한 경로(existingId 있음)는 action 없이 기존 문구만 띄운다", () => {
    const fn = body()
    // existingId 경로는 if 분기의 else — action 필드 없는 원래 호출 리터럴이 그대로 남아 있어야 한다.
    expect(fn).toContain(
      'pushMatrixToast({ kind: "info", text: "자가 체크로 저장됨 — 체크 큐에서 적용해야 장부에 반영됩니다." })',
    )
  })
})

describe("undoCellDraft — cancelDraft를 latest-ref로 호출(라운드 4 P1-6)", () => {
  const body = () => sliceBetween(
    workbenchSource(),
    "const undoCellDraft = useCallback",
    "}, [pushMatrixToast])",
  )

  it("cancelDraft를 직접 참조하지 않고 cancelDraftRef.current(id)를 호출한다(drafts 변경에 identity가 흔들리지 않도록)", () => {
    const source = workbenchSource()
    expect(source).toContain("const cancelDraftRef = useRef(cancelDraft)")
    expect(source).toContain("cancelDraftRef.current = cancelDraft")

    const fn = body()
    expect(fn).toContain("await cancelDraftRef.current(id)")
  })

  it("성공하면 '초안 취소됨' info 토스트, 예외면 error 토스트를 띄운다", () => {
    const fn = body()
    const tryIndex = fn.indexOf("try {")
    const successIndex = fn.indexOf("초안 취소됨")
    const catchIndex = fn.indexOf("} catch (error) {")
    expect(tryIndex).toBeGreaterThan(-1)
    expect(successIndex).toBeGreaterThan(tryIndex)
    expect(catchIndex).toBeGreaterThan(successIndex)
    expect(fn.slice(catchIndex)).toContain('pushMatrixToast({ kind: "error"')
  })

  it("의존성 배열은 [pushMatrixToast]로 고정된다(onCommitCell identity를 drafts 변경과 분리하기 위함)", () => {
    expect(workbenchSource()).toContain("const undoCellDraft = useCallback(async (id: string) => {")
  })
})

describe("토스트 렌더 — action 버튼(라운드 4 P1-6)", () => {
  const body = () => sliceBetween(
    workbenchSource(),
    "{matrixToasts.length > 0 && (",
    '{sidePanelCollapsed && lens !== "cockpit" && (',
  )

  it("toast.action이 있을 때만 문구 오른쪽에 버튼을 렌더한다", () => {
    const fn = body()
    expect(fn).toContain("const action = toast.action")
    expect(fn).toContain("{action && (")
    expect(fn).toContain("{action.label}")
  })

  it("버튼 클릭은 action.onClick을 기다린 뒤 그 토스트만 dismissMatrixToast(id)로 닫는다", () => {
    const fn = body()
    const onClickIndex = fn.indexOf("await action.onClick()")
    const dismissIndex = fn.indexOf("dismissMatrixToast(toast.id)", onClickIndex)
    expect(onClickIndex).toBeGreaterThan(-1)
    expect(dismissIndex).toBeGreaterThan(onClickIndex)
  })

  it("처리 중 재클릭을 막는 guard와 disabled 상태가 있다(더블클릭 방지)", () => {
    const fn = body()
    expect(fn).toContain("if (pendingToastActionId === toast.id) return")
    expect(fn).toContain("disabled={actionPending}")
  })

  it("액션 버튼은 새 색 없이 기존 닫기 버튼과 같은 톤(opacity/focus-ring) 클래스를 재사용한다", () => {
    const fn = body()
    expect(fn).toContain("opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current")
  })
})
