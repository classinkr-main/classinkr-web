import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { isDraftRecordError } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(품질 웨이브 7, 항목 2 → 2026-11-25 F-06): updateDraft/toggleDraft/deleteDraft의 catch가 에러 종류와
// 무관하게 setQueueMode("local")로 큐 전체를 강등시키던 문제 —
//  1) 404(레코드 소실: 다른 곳에서 이미 삭제/적용됨)는 전역 강등 없이 그 행에만 에러를 붙인다
//     (isDraftRecordError 판정, 실제 export 함수 호출로 검증).
//  2) 5xx/네트워크도 이제 큐를 내리지 않는다(F-06 — 예전엔 한 번의 실패로 세션 내내 로컬 큐였다). 그 행에 "다시 시도"
//     에러를 붙이고 서버 모드 그대로 둔다. 실제 동작(500 뒤 queueMode)은 tests/branch/ledger-draft-queue-hook.test.ts 가
//     훅을 직접 돌려 본다.
//  3) 어느 경우든 "서버-id 섀도 편집"(실패한 요청을 서버 id 그대로 로컬에 낙관 반영해 재전송 판별(localDraftsRef가
//     "local-" 접두만 봄)에서 빠져 무음 소실되던 경로)을 만들지 않는다 — 서버 발급 id 면 성공이든 실패든 항상 return하고
//     아래 updateLocalDrafts로 떨어지지 않는다.
// 소스 스캔 방식은 tests/branch/ledger-entry-reverse-action.test.ts와 동일 관례를 따른다.
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
// 웨이브 7 2단(F5): useLedgerDraftQueue(updateDraft/toggleDraft/deleteDraft/loadDrafts 포함)는
// ledger/useLedgerDraftQueue.ts로 물리 이동됐다(로직 무변경) — 훅 내부 스캔은 이 파일을 읽는다.
// isDraftRecordError는 워크벤치가 재수출하므로 import 표면은 그대로다.
const hookPath = join(process.cwd(), "components/admin/branch/ledger/useLedgerDraftQueue.ts")
// 웨이브 7 2단(F5): DraftQueue 컴포넌트는 ledger/DraftQueue.tsx로 물리 이동(렌더 배선 스캔은
// 여전히 워크벤치를 읽는다 — 훅 반환값을 그대로 prop으로 넘기는 지점이 거기이므로).
const queuePath = join(process.cwd(), "components/admin/branch/ledger/DraftQueue.tsx")

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

function hookSource() {
  return readFileSync(hookPath, "utf8")
}

function queueSource() {
  return readFileSync(queuePath, "utf8")
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

// 서버 발급 id 갈래(if (!id.startsWith("local-")) { … })의 본문 — 그 뒤 로컬 갈래와 나눠 본다.
function serverBranch(body: string, localMarker: string) {
  const start = body.indexOf('if (!id.startsWith("local-")) {')
  expect(start, "서버-id 갈래를 찾지 못함").toBeGreaterThan(-1)
  const end = body.indexOf(localMarker, start)
  expect(end, `로컬 갈래 마커를 찾지 못함: ${localMarker}`).toBeGreaterThan(start)
  return body.slice(start, end)
}

describe("updateDraft — 레코드 오류·네트워크 오류 모두 그 행에만(품질 웨이브 7 항목 2 · F-06)", () => {
  const fnBody = () => sliceFn(
    hookSource(),
    "const updateDraft = useCallback",
    "}, [clearRecordError, setRecordError, updateLocalDrafts])",
  )

  it("catch에서 isDraftRecordError로 먼저 분기해 레코드 오류 배지를 달고, 그 밖의 오류는 '다시 시도' 행 에러로 남긴다", () => {
    const body = fnBody()
    const catchIndex = body.indexOf("} catch (error) {")
    const recordCheckIndex = body.indexOf("if (isDraftRecordError(error)) {")
    const setRecordErrorIndex = body.indexOf("setRecordError(id)")
    const retryIndex = body.indexOf('rowActionFailureMessage("고친 값을 저장하지", error)')
    expect(catchIndex).toBeGreaterThan(-1)
    expect(recordCheckIndex).toBeGreaterThan(catchIndex)
    expect(setRecordErrorIndex).toBeGreaterThan(recordCheckIndex)
    expect(retryIndex).toBeGreaterThan(setRecordErrorIndex)
    expect(body).toContain("return { draft: null, error: message }")
  })

  it("어느 실패에서도 큐를 로컬로 내리지 않는다(F-06)", () => {
    expect(fnBody()).not.toContain('setQueueMode("local")')
  })

  it("성공 시 clearRecordError(id)로 이전 행별 에러를 지운다", () => {
    expect(fnBody()).toContain("clearRecordError(id)")
  })

  it("서버-id 초안은 큐 모드와 상관없이 서버로 보내고, 그 갈래 어디에서도 로컬 낙관 편집(updateLocalDrafts)으로 떨어지지 않는다", () => {
    const body = fnBody()
    expect(body).not.toContain("queueMode")
    const server = serverBranch(body, "let updated: LedgerDraft | null = null")
    expect(server).not.toContain("updateLocalDrafts(")
    // 서버 갈래는 runInChain 결과를 그대로 return 한다 — 아래 로컬 갈래로 흘러가지 않는다.
    expect(server).toContain("return await runInChain(updateChainsRef.current, id,")
  })
})

describe("toggleDraft — 레코드 오류·네트워크 오류 모두 그 행에만(품질 웨이브 7 항목 2 · F-06)", () => {
  const fnBody = () => sliceFn(
    hookSource(),
    "const toggleDraft = useCallback",
    "}, [clearRecordError, drafts, setRecordError, updateLocalDrafts])",
  )

  it("catch에서 isDraftRecordError로 먼저 분기하고, 그 밖의 오류는 '체크 상태를 바꾸지 못했습니다' 행 에러로 남긴다", () => {
    const body = fnBody()
    const catchIndex = body.indexOf("} catch (error) {")
    const recordCheckIndex = body.indexOf("if (isDraftRecordError(error)) {")
    const setRecordErrorIndex = body.indexOf("setRecordError(id)")
    const retryIndex = body.indexOf('setRecordError(id, rowActionFailureMessage("체크 상태를 바꾸지", error))')
    expect(catchIndex).toBeGreaterThan(-1)
    expect(recordCheckIndex).toBeGreaterThan(catchIndex)
    expect(setRecordErrorIndex).toBeGreaterThan(recordCheckIndex)
    expect(retryIndex).toBeGreaterThan(setRecordErrorIndex)
    expect(body).not.toContain('setQueueMode("local")')
  })

  it("성공 시 clearRecordError(id)를 호출한다", () => {
    expect(fnBody()).toContain("clearRecordError(id)")
  })

  it("서버-id 초안의 세 갈래(성공·레코드 오류·네트워크 오류) 모두 명시적으로 return한다(하단 updateLocalDrafts로 흘러가지 않음)", () => {
    const server = serverBranch(fnBody(), "updateLocalDrafts((items) => items.map((draft) =>")
    expect((server.match(/\breturn\b/g) ?? []).length).toBe(3)
  })
})

describe("deleteDraft — 레코드 오류·네트워크 오류 모두 그 행에만(품질 웨이브 7 항목 2 · F-06)", () => {
  const fnBody = () => sliceFn(
    hookSource(),
    "const deleteDraft = useCallback",
    "const reverseEntry = useCallback",
  )

  it("catch에서 isDraftRecordError로 먼저 분기하고 setRecordError 후 즉시 return한다(로컬에서 조용히 지우지 않음)", () => {
    const body = fnBody()
    const catchIndex = body.indexOf("} catch (error) {")
    const recordCheckIndex = body.indexOf("if (isDraftRecordError(error)) {")
    const setRecordErrorIndex = body.indexOf("setRecordError(id)")
    expect(catchIndex).toBeGreaterThan(-1)
    expect(recordCheckIndex).toBeGreaterThan(catchIndex)
    expect(setRecordErrorIndex).toBeGreaterThan(recordCheckIndex)
    expect(body).toContain('setRecordError(id, rowActionFailureMessage("초안을 삭제하지", error))')
    expect(body).not.toContain('setQueueMode("local")')
  })

  it("성공 시 clearRecordError(id)를 호출한다", () => {
    expect(fnBody()).toContain("clearRecordError(id)")
  })
})

describe("recordErrors — 훅 반환값과 재조회 시 초기화(품질 웨이브 7, 항목 2)", () => {
  it("useLedgerDraftQueue가 recordErrors를 반환 객체에 포함한다", () => {
    const source = hookSource()
    const returnStart = source.indexOf("return {", source.indexOf("function useLedgerDraftQueue"))
    const returnEnd = source.indexOf("reloadDrafts: loadDrafts,", returnStart)
    expect(returnEnd).toBeGreaterThan(returnStart)
    expect(source.slice(returnStart, returnEnd)).toContain("recordErrors,")
  })

  it("loadDrafts가 서버 응답을 받으면(health 분기 이전) recordErrors를 비운다 — 재조회가 실제 상태를 다시 맞추므로", () => {
    const source = hookSource()
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
    const source = hookSource()
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
    // 웨이브 7 2단(F5): DraftQueue는 ledger/DraftQueue.tsx로 물리 이동됐다(로직 무변경) —
    // 그 파일은 체크 큐 전용이라 컴포넌트 시작부터 파일 끝까지가 곧 컴포넌트 본문이다.
    const source = queueSource()
    const compStart = source.indexOf("export function DraftQueue({")
    expect(compStart).toBeGreaterThan(-1)
    const compBody = source.slice(compStart)

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
