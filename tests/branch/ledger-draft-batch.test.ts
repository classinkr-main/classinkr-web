import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 회귀 방지(라운드 4, P0-1·P0-2 — docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4):
// 초안 배치 API(POST/PATCH .../ledger-drafts/batch) 클라이언트 배선.
//  1) checkDrafts/applyDrafts(일괄 체크·적용)가 단건 PATCH 순차 루프 대신 배치 엔드포인트를 쓴다.
//  2) persistDraftsBatch(신규)가 여러 건의 생성/수정을 배치 POST로 묶어 보내고, 항목별
//     200/400/409/404/503 응답을 createDraft/updateDraft와 동일한 계약(DraftMutationResult)으로
//     번역한다.
//  3) 배치 요청 자체가 실패(네트워크/타임아웃)하면 create 항목은 로컬 폴백, update 항목은 낙관
//     편집 없이 실패로 남기고 이후 청크는 보내지 않는다 — 큐를 local로 강등한다(단건 계약과 동일).
//  4) LedgerDraftInput.status(P0-2 자가 체크 힌트)는 로컬 폴백(makeLocalDraft)에서 항상 draft로
//     강제된다 — 로컬 임시 초안은 체크·적용 게이트를 건너뛸 수 없다.
//  5) LedgerDraft에 createdBy/checkedBy/checkedAt 클라 타입이 추가돼 서버가 이미 보내던 필드를
//     읽을 수 있다.
// 소스 스캔 방식은 tests/branch/ledger-draft-optimistic-lock.test.ts·
// ledger-record-error-isolation.test.ts와 동일 관례를 따른다(useLedgerDraftQueue는 훅 내부
// 클로저라 직접 렌더하지 않고는 호출할 수 없다 — 모듈을 직접 import하지 않는다).
const hookPath = join(process.cwd(), "components/admin/branch/ledger/useLedgerDraftQueue.ts")
const sharedPath = join(process.cwd(), "components/admin/branch/ledger/shared.tsx")

function hookSource() {
  return readFileSync(hookPath, "utf8")
}

function sharedSource() {
  return readFileSync(sharedPath, "utf8")
}

function sliceFn(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

const checkDraftsBody = () => sliceFn(
  hookSource(),
  "const checkDrafts = useCallback",
  "}, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])",
)

const applyDraftsBody = () => sliceFn(
  hookSource(),
  "const applyDrafts = useCallback",
  "}, [loadDrafts, queueMode])",
)

const persistDraftsBatchBody = () => sliceFn(
  hookSource(),
  "const persistDraftsBatch = useCallback",
  "}, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])",
)

describe("checkDrafts/applyDrafts — 단건 순차 PATCH 대신 배치 엔드포인트를 쓴다(P0-1)", () => {
  it('checkDrafts는 PATCH batch { action: "check" }를 쓰고 단건 URL 루프가 없다', () => {
    const body = checkDraftsBody()
    expect(body).toContain("/api/admin/branch/ledger-drafts/batch")
    expect(body).toContain('action: "check"')
    expect(body).not.toContain("ledger-drafts/${encodeURIComponent(id)}")
  })

  it('applyDrafts는 PATCH batch { action: "apply" }를 쓰고 단건 URL 루프가 없다', () => {
    const body = applyDraftsBody()
    expect(body).toContain("/api/admin/branch/ledger-drafts/batch")
    expect(body).toContain('action: "apply"')
    expect(body).not.toContain("ledger-drafts/${encodeURIComponent(id)}")
  })

  it("두 함수 모두 청크 단위(LEDGER_DRAFT_BATCH_LIMIT)로 나눠 순차 전송한다", () => {
    expect(checkDraftsBody()).toContain("start += LEDGER_DRAFT_BATCH_LIMIT")
    expect(applyDraftsBody()).toContain("start += LEDGER_DRAFT_BATCH_LIMIT")
  })

  it("청크 요청 자체가 실패하면 그 청크를 전부 failed로 집계하고 중단하되, 큐를 강등하지 않는다(기존 계약 유지)", () => {
    for (const body of [checkDraftsBody(), applyDraftsBody()]) {
      const catchIndex = body.indexOf("} catch {")
      expect(catchIndex).toBeGreaterThan(-1)
      const catchBody = body.slice(catchIndex)
      expect(catchBody).toContain("break")
      expect(catchBody).not.toContain('setQueueMode("local")')
    }
  })
})

describe("persistDraftsBatch — 여러 건 생성/수정을 배치 POST로 묶는다(P0-1, 신규)", () => {
  it('항목을 op: "create"/op: "update"로 매핑하고 update에는 expectedUpdatedAt을 싣는다', () => {
    const body = persistDraftsBatchBody()
    expect(body).toContain('op: "create"')
    expect(body).toContain('op: "update"')
    expect(body).toContain("expectedUpdatedAt")
    expect(body).toContain("draftsRef.current.find((draft) => draft.id === item.id)?.updatedAt")
  })

  it("LEDGER_DRAFT_BATCH_LIMIT건씩 청크로 나눠 순차 전송한다", () => {
    expect(persistDraftsBatchBody()).toContain("start += LEDGER_DRAFT_BATCH_LIMIT")
  })

  it('local- id를 가진 update 항목은 서버로 보내지 않고 로컬 갱신으로 처리한다', () => {
    expect(persistDraftsBatchBody()).toContain('item.id.startsWith("local-")')
  })

  it("항목별 400은 validationMessage, 409(+draft)는 conflict: true로 번역한다", () => {
    const body = persistDraftsBatchBody()
    const status400Index = body.indexOf("if (result.status === 400)")
    const status409Index = body.indexOf("if (result.status === 409 && result.draft)")
    expect(status400Index).toBeGreaterThan(-1)
    expect(status409Index).toBeGreaterThan(status400Index)
    expect(body.slice(status400Index, status409Index)).toContain("validationMessage: result.error")
    expect(body.slice(status409Index)).toContain("conflict: true")
  })

  it("409는 reason이 checked-by-other면 서버 문구를, 아니면 DRAFT_CONFLICT_MESSAGE를 배지에 쓴다", () => {
    const body = persistDraftsBatchBody()
    expect(body).toContain('result.reason === "checked-by-other"')
    expect(body).toContain("DRAFT_CONFLICT_MESSAGE")
  })

  it("항목별 404는 setRecordError(기본 문구)+error 필드로, 그 외(503/500)는 error 필드만으로 반환한다(로컬 폴백 없음)", () => {
    const body = persistDraftsBatchBody()
    const status404Index = body.indexOf("if (result.status === 404)")
    expect(status404Index).toBeGreaterThan(-1)
    const after404 = body.slice(status404Index)
    expect(after404).toContain("setRecordError(item.id)")
    expect(after404).toContain("draft: null, error: result.error")
  })

  it("성공(ok && draft)에서는 create면 맨 앞 삽입+50건 슬라이스, update면 교체 후 clearRecordError를 부른다", () => {
    const body = persistDraftsBatchBody()
    const okIndex = body.indexOf("if (result.ok && result.draft)")
    const status400Index = body.indexOf("if (result.status === 400)")
    expect(okIndex).toBeGreaterThan(-1)
    expect(status400Index).toBeGreaterThan(okIndex)
    const okBranch = body.slice(okIndex, status400Index)
    expect(okBranch).toContain(".slice(0, 50)")
    expect(okBranch).toContain("clearRecordError(nextDraft.id)")
  })

  it("청크 요청 자체 실패(네트워크/타임아웃)는 create 항목을 makeLocalDraft로 로컬 폴백하고 update 항목은 낙관 편집 없이 실패시키며, 큐를 local로 강등한다", () => {
    const body = persistDraftsBatchBody()
    const catchIndex = body.indexOf("} catch (error) {")
    expect(catchIndex).toBeGreaterThan(-1)
    const catchBody = body.slice(catchIndex)
    expect(catchBody).toContain("makeLocalDraft(item.input)")
    expect(catchBody).toContain('setQueueMode("local")')
    expect(catchBody).toContain("draft: null }")
    expect(catchBody).toContain("break")
  })

  it("비서버 모드에서는 로컬 규약(id 없으면 makeLocalDraft, 있으면 applyDraftInput)을 그대로 반복한다", () => {
    const body = persistDraftsBatchBody()
    const localBranchEnd = body.indexOf("// local-* update 항목은 서버로 보내지 않는다")
    expect(localBranchEnd).toBeGreaterThan(-1)
    const localBranch = body.slice(0, localBranchEnd)
    expect(localBranch).toContain("makeLocalDraft(item.input)")
    expect(localBranch).toContain("applyDraftInput(draft, item.input)")
  })
})

describe("updateDraft 409 — checked-by-other 사유 분기(라운드 4 P0-1, 단건 PATCH도 배치와 같은 문구 계약)", () => {
  const updateDraftBody = () => sliceFn(
    hookSource(),
    "const updateDraft = useCallback",
    "}, [clearRecordError, queueMode, setRecordError, updateLocalDrafts])",
  )

  it("data.reason이 checked-by-other면 서버 문구(data.error)를 배지에 쓰고, 아니면 기존 DRAFT_CONFLICT_MESSAGE를 그대로 쓴다", () => {
    const body = updateDraftBody()
    expect(body).toContain('data.reason === "checked-by-other"')
    expect(body).toContain("setRecordError(id, data.error ?? DRAFT_CONFLICT_MESSAGE)")
    // 기존 리터럴·반환값은 else 분기로 그대로 남아 있어야 한다 — ledger-draft-optimistic-lock
    // 스위트가 이 정확한 문자열들을 스캔한다(회귀 마커, 여기서도 이중 확인).
    expect(body).toContain("setRecordError(id, DRAFT_CONFLICT_MESSAGE)")
    expect(body).toContain("return { draft: null, conflict: true }")
  })

  it('LedgerDraftResponse 타입이 reason?: "checked-by-other"를 선언한다', () => {
    const source = hookSource()
    const ifaceStart = source.indexOf("interface LedgerDraftResponse")
    expect(ifaceStart).toBeGreaterThan(-1)
    const ifaceEnd = source.indexOf("\n}", ifaceStart)
    expect(source.slice(ifaceStart, ifaceEnd)).toContain('reason?: "checked-by-other"')
  })
})

describe("LedgerDraftInput.status — P0-2 자가 체크 힌트(로컬 폴백은 항상 draft로 강제)", () => {
  it('LedgerDraftInput에 status?:가 있다', () => {
    const source = hookSource()
    const ifaceStart = source.indexOf("interface LedgerDraftInput")
    expect(ifaceStart).toBeGreaterThan(-1)
    const ifaceEnd = source.indexOf("\n}", ifaceStart)
    expect(source.slice(ifaceStart, ifaceEnd)).toContain("status?:")
  })

  it('makeLocalDraft는 스프레드(...input) 뒤에 literal status: "draft"를 둬 입력값을 항상 덮어쓴다', () => {
    const source = hookSource()
    const fnStart = source.indexOf("function makeLocalDraft(")
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = source.indexOf("\n}", fnStart)
    const body = source.slice(fnStart, fnEnd)
    const spreadIndex = body.indexOf("...input,")
    const statusIndex = body.indexOf('status: "draft",')
    expect(spreadIndex).toBeGreaterThan(-1)
    expect(statusIndex).toBeGreaterThan(spreadIndex)
  })

  it("localDraftToInput은 status 필드를 싣지 않는다(재전송은 항상 draft로 열린다)", () => {
    const source = hookSource()
    const fnStart = source.indexOf("function localDraftToInput(")
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = source.indexOf("\n}", fnStart)
    const body = source.slice(fnStart, fnEnd)
    expect(body).not.toContain("status:")
  })
})

describe("DraftMutationResult.error — persistDraftsBatch 전용 항목 실패 필드", () => {
  it("DraftMutationResult 타입에 error?: string가 있고 validationMessage/conflict와 나란히 선언된다", () => {
    const source = hookSource()
    const ifaceStart = source.indexOf("export interface DraftMutationResult")
    expect(ifaceStart).toBeGreaterThan(-1)
    const ifaceEnd = source.indexOf("\n}", ifaceStart)
    const body = source.slice(ifaceStart, ifaceEnd)
    expect(body).toContain("error?: string")
    expect(body).toContain("validationMessage")
    expect(body).toContain("conflict")
  })
})

describe("반환 객체 — persistDraftsBatch 배선(다른 항목 순서·이름은 그대로)", () => {
  it("useLedgerDraftQueue가 persistDraftsBatch를 반환 객체에 포함하고 기존 항목 이름을 그대로 유지한다", () => {
    const source = hookSource()
    const returnStart = source.indexOf("return {\n    drafts,")
    expect(returnStart).toBeGreaterThan(-1)
    const returnEnd = source.indexOf("reloadDrafts: loadDrafts,", returnStart)
    expect(returnEnd).toBeGreaterThan(returnStart)
    const body = source.slice(returnStart, returnEnd)
    expect(body).toContain("persistDraftsBatch,")
    for (const name of [
      "createDraft,", "updateDraft,", "toggleDraft,", "applyDraft,",
      "checkDrafts,", "applyDrafts,", "cancelDraft,", "deleteDraft,", "reverseEntry,",
    ]) {
      expect(body).toContain(name)
    }
  })
})

describe("shared.tsx LedgerDraft — 서버가 이미 보내던 작성자/체크자 필드의 클라 타입(P0-1·P0-2)", () => {
  it("createdBy?/checkedBy?/checkedAt?를 선언한다", () => {
    const source = sharedSource()
    const ifaceStart = source.indexOf("export interface LedgerDraft {")
    expect(ifaceStart).toBeGreaterThan(-1)
    const ifaceEnd = source.indexOf("\n}", ifaceStart)
    const body = source.slice(ifaceStart, ifaceEnd)
    expect(body).toContain("createdBy?")
    expect(body).toContain("checkedBy?")
    expect(body).toContain("checkedAt?")
  })
})
