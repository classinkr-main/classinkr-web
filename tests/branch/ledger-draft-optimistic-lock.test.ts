import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import {
  DRAFT_CONFLICT_MESSAGE,
  DRAFT_DEDUPED_RECENT_NOTICE,
} from "@/components/admin/branch/ledger/shared"

// 회귀 방지(웨이브 7 2단, I4): 초안 수정(content update) 경로의 낙관적 잠금 클라이언트 배선.
//  1) updateDraft는 클라가 들고 있는 그 초안의 updatedAt을 expectedUpdatedAt으로 동봉한다 —
//     서버(action=update)가 CAS 비교해 다른 곳에서 먼저 수정됐으면 409 {error, draft}로 응답.
//  2) 409 수신 시 로컬 낙관 반영 없이 응답의 draft(서버 현재본)로 해당 레코드만 새로고침하고,
//     그 행에 충돌 배지(recordErrors)를 붙인다 — 레코드 소실(404)과 동일하게 전역 강등 없음.
//  3) status 전이(toggle)·apply·reverse 경로는 서버가 expectedUpdatedAt을 받지 않으므로
//     보내지 않는다.
//  4) POST 응답 dedupedRecent(60초 내 동일 입력 재사용, 200)는 "직전 동일 초안 재사용됨"으로
//     안내한다(중복 생성 오인 방지).
//  5) 400(양수 검증 등 서버 검증 거부)은 서버 문구를 그대로 노출하고 큐 강등·로컬 폴백을 하지
//     않는다.
// 소스 스캔 방식은 tests/branch/ledger-record-error-isolation.test.ts와 동일 관례를 따른다
// (useLedgerDraftQueue는 훅 내부 클로저라 직접 렌더하지 않고는 호출할 수 없다).
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
// 웨이브 7 2단(F5): useLedgerDraftQueue(createDraft/updateDraft/toggleDraft/applyDraft/reverseEntry)는
// ledger/useLedgerDraftQueue.ts로 물리 이동됐다(로직 무변경) — 훅 내부 스캔은 이 파일을 읽는다.
const hookPath = join(process.cwd(), "components/admin/branch/ledger/useLedgerDraftQueue.ts")
const railPath = join(process.cwd(), "components/admin/branch/ledger/InputRailSection.tsx")

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

function hookSource() {
  return readFileSync(hookPath, "utf8")
}

function railSource() {
  return readFileSync(railPath, "utf8")
}

function sliceFn(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

const updateDraftBody = () => sliceFn(
  hookSource(),
  "const updateDraft = useCallback",
  "}, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])",
)

const createDraftBody = () => sliceFn(
  hookSource(),
  "const createDraft = useCallback",
  "}, [queueMode, updateLocalDrafts])",
)

describe("충돌 안내 문구 SSOT (ledger/shared.tsx)", () => {
  it("DRAFT_CONFLICT_MESSAGE는 배지·토스트·인라인 피드백이 공유하는 확정 문장이다", () => {
    expect(DRAFT_CONFLICT_MESSAGE).toBe(
      "다른 곳에서 먼저 수정됨 — 서버 값으로 새로고침했습니다. 확인 후 다시 시도하세요.",
    )
  })

  it("DRAFT_DEDUPED_RECENT_NOTICE는 '재사용'(새 초안 아님)을 명시한다", () => {
    expect(DRAFT_DEDUPED_RECENT_NOTICE).toContain("직전 동일 초안 재사용됨")
    expect(DRAFT_DEDUPED_RECENT_NOTICE).toContain("새로 만들지 않았습니다")
  })
})

describe("updateDraft — expectedUpdatedAt 동봉(웨이브 7 2단, I4)", () => {
  it("클라가 보유한 해당 초안의 updatedAt을 expectedUpdatedAt으로 PATCH 바디에 동봉한다", () => {
    const body = updateDraftBody()
    // 원천: drafts state 전체 미러(draftsRef) — 서버 응답 원본의 updatedAt 문자열 그대로.
    expect(body).toContain("draftsRef.current.find((draft) => draft.id === id)?.updatedAt")
    // 레코드를 아직 모르면(이론상) 잠금 없이 기존 무조건 덮어쓰기(서버 계약상 생략 = 하위호환).
    expect(body).toContain("JSON.stringify(expectedUpdatedAt ? { ...input, expectedUpdatedAt } : input)")
  })

  it("409 응답은 {error, draft}의 draft(서버 현재본)로 해당 레코드만 새로고침한다 — 로컬 낙관 반영 없음", () => {
    const body = updateDraftBody()
    const conflictGateIndex = body.indexOf("if (response.status === 409 && data?.draft) {")
    expect(conflictGateIndex).toBeGreaterThan(-1)
    const refreshIndex = body.indexOf(
      "setDrafts((items) => items.map((draft) => (draft.id === id ? serverDraft : draft)))",
    )
    expect(refreshIndex).toBeGreaterThan(conflictGateIndex)
  })

  it("409 분기는 충돌 배지(setRecordError + DRAFT_CONFLICT_MESSAGE)를 붙이고 conflict: true로 반환한다", () => {
    const body = updateDraftBody()
    expect(body).toContain("setRecordError(id, DRAFT_CONFLICT_MESSAGE)")
    expect(body).toContain("return { draft: null, conflict: true }")
  })

  it("409 분기는 전역 강등(setQueueMode local) 경로를 절대 타지 않는다 — 충돌 처리(try)가 강등(catch)보다 먼저 등장하고 그 안에서 return한다", () => {
    const body = updateDraftBody()
    const conflictGateIndex = body.indexOf("if (response.status === 409 && data?.draft) {")
    const conflictReturnIndex = body.indexOf("return { draft: null, conflict: true }")
    const queueDemoteIndex = body.indexOf('setQueueMode("local")')
    expect(conflictGateIndex).toBeGreaterThan(-1)
    expect(conflictReturnIndex).toBeGreaterThan(conflictGateIndex)
    expect(queueDemoteIndex).toBeGreaterThan(conflictReturnIndex)
  })

  it("400(서버 검증 거부)은 서버 문구(data?.error)를 그대로 validationMessage로 반환한다 — 큐 강등·로컬 폴백 없음", () => {
    const body = updateDraftBody()
    const validationGateIndex = body.indexOf("if (response.status === 400) {")
    const genericThrowIndex = body.indexOf("if (!response.ok) {")
    expect(validationGateIndex).toBeGreaterThan(-1)
    // 400 분기가 일반 throw(→catch→강등)보다 먼저 가로챈다.
    expect(genericThrowIndex).toBeGreaterThan(validationGateIndex)
    const validationBranch = body.slice(validationGateIndex, genericThrowIndex)
    expect(validationBranch).toContain("validationMessage: data?.error")
  })

  it("404 등 나머지 4xx/5xx는 서버 리터럴을 그대로 던져 기존 isDraftRecordError 계약(catch)을 유지한다", () => {
    const body = updateDraftBody()
    expect(body).toContain("throw new Error(data?.error ??")
    expect(body).toContain("if (isDraftRecordError(error)) {")
  })
})

describe("status 전이·apply·reverse 경로는 expectedUpdatedAt을 보내지 않는다(서버 미지원)", () => {
  it("toggleDraft(체크 토글)는 { status }만 보낸다", () => {
    const body = sliceFn(
      hookSource(),
      "const toggleDraft = useCallback",
      "}, [clearRecordError, drafts, queueMode, setRecordError, updateLocalDrafts])",
    )
    expect(body).toContain("JSON.stringify({ status })")
    expect(body).not.toContain("expectedUpdatedAt")
  })

  it("applyDraft/reverseEntry는 action 바디만 보낸다", () => {
    const source = hookSource()
    const applyBody = sliceFn(source, "const applyDraft = useCallback", "}, [drafts, loadDrafts, queueMode])")
    expect(applyBody).toContain('JSON.stringify({ action: "apply" })')
    expect(applyBody).not.toContain("expectedUpdatedAt")
    const reverseBody = sliceFn(source, "const reverseEntry = useCallback", "}, [queueMode])")
    expect(reverseBody).not.toContain("expectedUpdatedAt")
  })
})

describe("createDraft — dedupedRecent 패스스루 + 400 검증 거부(웨이브 7 2단, I4)", () => {
  it("성공 응답의 dedupedRecent를 결과에 실어 호출부가 '재사용' 안내를 낼 수 있게 한다", () => {
    expect(createDraftBody()).toContain("dedupedRecent: data.dedupedRecent === true")
  })

  it("400 분기는 서버 문구를 그대로 반환하고, 그 분기 안에서는 로컬 폴백(makeLocalDraft)을 만들지 않는다", () => {
    const body = createDraftBody()
    const validationGateIndex = body.indexOf("if (response.status === 400) {")
    const genericThrowIndex = body.indexOf("if (!response.ok) {")
    expect(validationGateIndex).toBeGreaterThan(-1)
    expect(genericThrowIndex).toBeGreaterThan(validationGateIndex)
    const validationBranch = body.slice(validationGateIndex, genericThrowIndex)
    expect(validationBranch).toContain("validationMessage: data?.error")
    expect(validationBranch).not.toContain("makeLocalDraft")
    expect(validationBranch).not.toContain('setQueueMode("local")')
  })

  it("네트워크/5xx catch의 로컬 폴백은 기존 그대로 유지된다(무음 유실 방지 계약 불변)", () => {
    const body = createDraftBody()
    const catchIndex = body.indexOf("} catch (error) {")
    expect(catchIndex).toBeGreaterThan(-1)
    expect(body.slice(catchIndex)).toContain("makeLocalDraft(input)")
    expect(body.slice(catchIndex)).toContain('setQueueMode("local")')
  })
})

describe("onCommitCell — 매트릭스 셀 커밋의 충돌/재사용/검증 거부 노출(웨이브 7 2단, I4)", () => {
  const fnBody = () => sliceFn(
    workbenchSource(),
    "const onCommitCell = useCallback",
    "[createDraft, lens, pendingByCell, period, pushMatrixToast, rowById, team, updateDraft]",
  )

  it("conflict면 로컬 폴백 문구가 아니라 DRAFT_CONFLICT_MESSAGE 토스트를 띄우고 false를 반환한다", () => {
    const body = fnBody()
    const conflictIndex = body.indexOf("if (result.conflict) {")
    const conflictToastIndex = body.indexOf('pushMatrixToast({ kind: "error", text: DRAFT_CONFLICT_MESSAGE })')
    const localFallbackToastIndex = body.indexOf("서버 저장 실패 — 로컬 임시 초안으로만 저장됐습니다")
    expect(conflictIndex).toBeGreaterThan(-1)
    expect(conflictToastIndex).toBeGreaterThan(conflictIndex)
    // 충돌 분기가 로컬 폴백 판정보다 먼저 가로채 잘못된 "로컬 임시 저장" 문구가 나가지 않는다.
    expect(localFallbackToastIndex).toBeGreaterThan(conflictToastIndex)
    expect(body.slice(conflictIndex, localFallbackToastIndex)).toContain("return false")
  })

  it("validationMessage(400)는 서버 문구를 그대로 토스트로 노출한다", () => {
    const body = fnBody()
    expect(body).toContain("if (result.validationMessage) {")
    expect(body).toContain('pushMatrixToast({ kind: "error", text: result.validationMessage })')
  })

  it("dedupedRecent면 info 토스트로 '재사용'을 안내한다(silent 억제 존중)", () => {
    const body = fnBody()
    expect(body).toContain("if (result.dedupedRecent && !usedLocalFallback && !options?.silent) {")
    expect(body).toContain('pushMatrixToast({ kind: "info", text: DRAFT_DEDUPED_RECENT_NOTICE })')
  })
})

describe("saveDraft/saveEditedDraft — 입력 레일 결과 플래그 전파(웨이브 7 2단, I4)", () => {
  it("saveDraft는 conflict/dedupedRecent/validationMessage를 DraftSaveResult로 전달하고, 검증 거부·충돌 시 폼을 리셋하지 않는다", () => {
    const body = sliceFn(
      workbenchSource(),
      "const saveDraft = useCallback",
      "[buildDraftInput, createDraft, defaultDraftForm, draftForm.customer, draftForm.month, draftForm.week, drafts, pendingByCell, selectedRow, updateDraft]",
    )
    expect(body).toContain('if (kind === "new-row" && draft) {')
    expect(body).toContain("conflict: result.conflict")
    expect(body).toContain("dedupedRecent: result.dedupedRecent")
    expect(body).toContain("validationMessage: result.validationMessage")
  })

  it("saveEditedDraft는 충돌·검증 거부 시 편집 상태를 유지한다(폼 입력값 보존 + 인라인 피드백 유지)", () => {
    const body = sliceFn(
      workbenchSource(),
      "const saveEditedDraft = useCallback",
      "[buildDraftInput, defaultDraftForm, draftForm.month, draftForm.week, editingDraft, pendingByCell, rowByDealKey, updateDraft]",
    )
    const guardIndex = body.indexOf("if (!result.conflict && !result.validationMessage) {")
    const clearEditIndex = body.indexOf("setEditingDraftId(null)")
    expect(guardIndex).toBeGreaterThan(-1)
    expect(clearEditIndex).toBeGreaterThan(guardIndex)
    expect(body).toContain("conflict: result.conflict")
    expect(body).toContain("validationMessage: result.validationMessage")
  })
})

describe("InputRailSection — 인라인 피드백 배선(웨이브 7 2단, I4)", () => {
  it("conflict가 최우선으로 DRAFT_CONFLICT_MESSAGE를 보여준다", () => {
    const source = railSource()
    const runSaveIndex = source.indexOf("const runSave = async")
    const conflictIndex = source.indexOf("result.conflict", runSaveIndex)
    const validationIndex = source.indexOf("result.validationMessage", runSaveIndex)
    const persistedIndex = source.indexOf("!result.persisted", runSaveIndex)
    expect(conflictIndex).toBeGreaterThan(runSaveIndex)
    expect(validationIndex).toBeGreaterThan(conflictIndex)
    expect(persistedIndex).toBeGreaterThan(validationIndex)
    expect(source).toContain("text: DRAFT_CONFLICT_MESSAGE")
  })

  it("validationMessage는 서버 문구를 그대로(가공 없이) 보여준다", () => {
    expect(railSource()).toContain("text: result.validationMessage")
  })

  it("dedupedRecent는 성공 피드백에 '재사용' 안내를 얹는다", () => {
    const source = railSource()
    expect(source).toContain("result.dedupedRecent")
    expect(source).toContain("DRAFT_DEDUPED_RECENT_NOTICE")
  })
})
