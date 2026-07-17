import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { isDraftRecordError } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(품질 웨이브 7, 항목 2): updateDraft/toggleDraft/deleteDraft의 catch가 에러 종류와
// 무관하게 무조건 setQueueMode("local")로 큐 전체를 강등시키던 문제 —
//  1) 404(레코드 소실: 다른 곳에서 이미 삭제/적용됨)는 전역 강등 없이 그 행에만 에러를 붙여야
//     한다(isDraftRecordError 판정, 실제 export 함수 호출로 검증).
//  2) 5xx/네트워크만 기존처럼 큐를 로컬로 내린다.
//  3) 두 경우 모두 "서버-id 섀도 편집"(실패한 요청을 서버 id 그대로 로컬에 낙관 반영해
//     재전송 판별(localDraftsRef가 "local-" 접두만 봄)에서 빠져 무음 소실되던 경로)을 만들지
//     않는다 — 큐가 "server"이고 id가 서버 발급이면, 성공이든 두 실패 분기든 항상 return하고
//     아래 updateLocalDrafts로 떨어지지 않는다.
// 소스 스캔 방식은 tests/branch/ledger-entry-reverse-action.test.ts와 동일 관례를 따른다
// (useLedgerDraftQueue는 훅 내부 클로저라 직접 렌더하지 않고는 호출할 수 없다).
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

function sliceFn(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe("isDraftRecordError — 4xx 레코드 오류 판정(품질 웨이브 7, 항목 2)", () => {
  it("라우트가 실제로 돌려주는 404 리터럴 메시지('Draft not found')는 레코드 오류로 판정한다", () => {
    expect(isDraftRecordError(new Error("Draft not found"))).toBe(true)
  })

  it("그 외 Error 메시지(네트워크/5xx로 감싸진 서버 오류)는 레코드 오류가 아니다", () => {
    expect(isDraftRecordError(new Error("Failed to fetch"))).toBe(false)
    expect(isDraftRecordError(new Error("Failed to update sales ledger draft"))).toBe(false)
    expect(isDraftRecordError(new Error("서버 연결 시간이 초과됐습니다."))).toBe(false)
  })

  it("Error 인스턴스가 아니면(문자열 throw 등) 레코드 오류로 오판하지 않는다", () => {
    expect(isDraftRecordError("Draft not found")).toBe(false)
    expect(isDraftRecordError(null)).toBe(false)
    expect(isDraftRecordError(undefined)).toBe(false)
  })
})

describe("updateDraft — 레코드 오류는 전역 강등 없이 그 행에만(품질 웨이브 7, 항목 2)", () => {
  const fnBody = () => sliceFn(
    workbenchSource(),
    "const updateDraft = useCallback",
    "}, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])",
  )

  it("catch에서 isDraftRecordError로 먼저 분기하고, 맞으면 setRecordError만 호출한 뒤 즉시 return한다", () => {
    const body = fnBody()
    const catchIndex = body.indexOf("} catch (error) {")
    const recordCheckIndex = body.indexOf("if (isDraftRecordError(error)) {")
    const setRecordErrorIndex = body.indexOf("setRecordError(id)")
    const setQueueModeLocalIndex = body.indexOf('setQueueMode("local")')

    expect(catchIndex).toBeGreaterThan(-1)
    expect(recordCheckIndex).toBeGreaterThan(catchIndex)
    expect(setRecordErrorIndex).toBeGreaterThan(recordCheckIndex)
    // 레코드 오류 분기가 setQueueMode("local") 호출보다 먼저 등장하고 그 안에서 return한다 —
    // 즉 레코드 오류는 큐 전체 강등 경로를 절대 타지 않는다.
    expect(setQueueModeLocalIndex).toBeGreaterThan(setRecordErrorIndex)
  })

  it("성공 시 clearRecordError(id)로 이전 행별 에러를 지운다", () => {
    expect(fnBody()).toContain("clearRecordError(id)")
  })

  it("서버-id 초안(id가 local- 아님)의 두 실패 분기(레코드 오류·5xx) 모두 return하고, 그 아래 updateLocalDrafts로 떨어지지 않는다", () => {
    const body = fnBody()
    // if (queueMode === "server" && !id.startsWith("local-")) { ... } 블록 안에서
    // catch의 두 분기가 각각 return null로 끝나는지 — 정규식으로 "return null}" 패턴이 2회(레코드
    // 오류 분기, 5xx 분기) 나타나야 한다(성공 경로의 return data.draft는 별개 문자열).
    const returnNullCount = (body.match(/return null/g) ?? []).length
    expect(returnNullCount).toBe(2)
  })

  it("5xx/네트워크 분기 메시지는 '로컬 폴백'이 아니라 재시도를 안내한다(더 이상 로컬에 낙관 반영하지 않으므로)", () => {
    expect(fnBody()).toContain("서버 초안 수정에 실패했습니다(네트워크/서버 오류) — 재연결 후 다시 시도하세요.")
  })
})

describe("toggleDraft — 레코드 오류는 전역 강등 없이 그 행에만(품질 웨이브 7, 항목 2)", () => {
  const fnBody = () => sliceFn(
    workbenchSource(),
    "const toggleDraft = useCallback",
    "}, [clearRecordError, drafts, queueMode, setRecordError, updateLocalDrafts])",
  )

  it("catch에서 isDraftRecordError로 먼저 분기하고 setRecordError 후 즉시 return한다(로컬 상태 토글 없음)", () => {
    const body = fnBody()
    const catchIndex = body.indexOf("} catch (error) {")
    const recordCheckIndex = body.indexOf("if (isDraftRecordError(error)) {")
    const setRecordErrorIndex = body.indexOf("setRecordError(id)")
    const setQueueModeLocalIndex = body.indexOf('setQueueMode("local")')

    expect(catchIndex).toBeGreaterThan(-1)
    expect(recordCheckIndex).toBeGreaterThan(catchIndex)
    expect(setRecordErrorIndex).toBeGreaterThan(recordCheckIndex)
    expect(setQueueModeLocalIndex).toBeGreaterThan(setRecordErrorIndex)
  })

  it("성공 시 clearRecordError(id)를 호출한다", () => {
    expect(fnBody()).toContain("clearRecordError(id)")
  })

  it("서버-id 초안의 두 실패 분기 모두 명시적으로 return한다(하단 updateLocalDrafts로 흘러가지 않음)", () => {
    const body = fnBody()
    // if(...) { try { ... } catch (error) { if (record) { ...; return } ...; return } }
    // 블록을 벗어나는 지점(다음 updateLocalDrafts 호출) 앞에 return이 두 번 더 있어야 한다.
    const ifBlockStart = body.indexOf('if (queueMode === "server" && !id.startsWith("local-")) {')
    const updateLocalDraftsIndex = body.indexOf("updateLocalDrafts((items) => items.map((draft) =>")
    const ifBlock = body.slice(ifBlockStart, updateLocalDraftsIndex)
    const returnCount = (ifBlock.match(/\breturn\b/g) ?? []).length
    // return(성공) + return(레코드 오류) + return(5xx) = 3
    expect(returnCount).toBe(3)
  })
})

describe("deleteDraft — 레코드 오류는 전역 강등 없이 그 행에만(품질 웨이브 7, 항목 2)", () => {
  const fnBody = () => sliceFn(
    workbenchSource(),
    "const deleteDraft = useCallback",
    "}, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])",
  )

  it("catch에서 isDraftRecordError로 먼저 분기하고 setRecordError 후 즉시 return한다(로컬에서 조용히 지우지 않음)", () => {
    const body = fnBody()
    const catchIndex = body.indexOf("} catch (error) {")
    const recordCheckIndex = body.indexOf("if (isDraftRecordError(error)) {")
    const setRecordErrorIndex = body.indexOf("setRecordError(id)")
    const setQueueModeLocalIndex = body.indexOf('setQueueMode("local")')

    expect(catchIndex).toBeGreaterThan(-1)
    expect(recordCheckIndex).toBeGreaterThan(catchIndex)
    expect(setRecordErrorIndex).toBeGreaterThan(recordCheckIndex)
    expect(setQueueModeLocalIndex).toBeGreaterThan(setRecordErrorIndex)
  })

  it("성공 시 clearRecordError(id)를 호출한다", () => {
    expect(fnBody()).toContain("clearRecordError(id)")
  })
})

describe("recordErrors — 훅 반환값과 재조회 시 초기화(품질 웨이브 7, 항목 2)", () => {
  it("useLedgerDraftQueue가 recordErrors를 반환 객체에 포함한다", () => {
    const source = workbenchSource()
    const returnStart = source.indexOf("return {", source.indexOf("function useLedgerDraftQueue"))
    const returnEnd = source.indexOf("reloadDrafts: loadDrafts,", returnStart)
    expect(returnEnd).toBeGreaterThan(returnStart)
    expect(source.slice(returnStart, returnEnd)).toContain("recordErrors,")
  })

  it("loadDrafts가 서버 응답을 받으면(health 분기 이전) recordErrors를 비운다 — 재조회가 실제 상태를 다시 맞추므로", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const loadDrafts = useCallback")
    const fnEnd = source.indexOf("}, [])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    const setRecordErrorsIndex = fnBody.indexOf("setRecordErrors(new Map())")
    const healthGateIndex = fnBody.indexOf("if (data.health?.ok === false) {")
    expect(setRecordErrorsIndex).toBeGreaterThan(-1)
    expect(healthGateIndex).toBeGreaterThan(-1)
    expect(setRecordErrorsIndex).toBeLessThan(healthGateIndex)
  })

  it("loadDrafts 자체가 실패해 로컬 큐로 전환할 때도 recordErrors를 비운다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const loadDrafts = useCallback")
    const fnEnd = source.indexOf("}, [])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    const catchIndex = fnBody.lastIndexOf("} catch (error) {")
    expect(catchIndex).toBeGreaterThan(-1)
    expect(fnBody.slice(catchIndex)).toContain("setRecordErrors(new Map())")
  })
})

describe("DraftQueue — 행별 에러 배지 배선(품질 웨이브 7, 항목 2)", () => {
  it("recordErrors prop을 받아 그 행에만 배지 + 새로고침 버튼을 렌더한다", () => {
    const source = workbenchSource()
    const compStart = source.indexOf("function DraftQueue({")
    expect(compStart).toBeGreaterThan(-1)
    const compEnd = source.indexOf("\nfunction matrixSameColumn(", compStart)
    expect(compEnd).toBeGreaterThan(compStart)
    const compBody = source.slice(compStart, compEnd)

    expect(compBody).toContain("recordErrors: Map<string, string>")
    expect(compBody).toContain("recordErrors.get(draft.id)")
    expect(compBody).toContain("onClick={onReload}")
  })

  it("SalesLedgerWorkbench가 훅의 recordErrors를 그대로 DraftQueue에 전달한다", () => {
    const source = workbenchSource()
    // <DraftQueueMode> 타입 표기와 겹치지 않게 JSX 호출부(mode={queueMode} prop 포함)를 앵커로 삼는다.
    const renderIndex = source.indexOf("mode={queueMode}")
    expect(renderIndex).toBeGreaterThan(-1)
    const propsBlock = source.slice(renderIndex, renderIndex + 400)
    expect(propsBlock).toContain("recordErrors={recordErrors}")
  })
})
