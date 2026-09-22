import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// P2-9 "적용된 값을 한 번에 바꾸기" — 훅(useLedgerDraftQueue.supersedeEntry)·레일
// (InputRailSection)의 클라이언트 배선 회귀 가드. useLedgerDraftQueue는 훅 내부 클로저라
// 직접 렌더하지 않고는 호출할 수 없다 — 소스 스캔 방식은 tests/branch/ledger-entry-
// reverse-action.test.ts·ledger-draft-batch.test.ts와 동일 관례를 따른다.
const hookPath = join(process.cwd(), "components/admin/branch/ledger/useLedgerDraftQueue.ts")
const railPath = join(process.cwd(), "components/admin/branch/ledger/InputRailSection.tsx")

function hookSource() {
  return readFileSync(hookPath, "utf8").replace(/\r\n/g, "\n")
}

function railSource() {
  return readFileSync(railPath, "utf8").replace(/\r\n/g, "\n")
}

function sliceFn(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

const supersedeEntryBody = () => sliceFn(
  hookSource(),
  "const supersedeEntry = useCallback",
  "}, [loadDrafts, queueMode])",
)

describe("supersedeEntry — 새 값을 checked로 생성 후 action:supersede PATCH 1건(P2-9)", () => {
  it("서버 모드가 아니면 로컬 폴백 없이 즉시 실패를 반환한다", () => {
    const body = supersedeEntryBody()
    const gateIndex = body.indexOf('if (queueMode !== "server") {')
    expect(gateIndex).toBeGreaterThan(-1)
    const gateBlock = body.slice(gateIndex, body.indexOf("}", gateIndex))
    expect(gateBlock).toContain("return { draft: null, error:")
    expect(gateBlock).not.toContain("makeLocalDraft")
  })

  it("새 값 초안 생성 POST 바디에 status:\"checked\"를 함께 싣는다(자가 체크)", () => {
    const body = supersedeEntryBody()
    expect(body).toContain('method: "POST"')
    expect(body).toContain('JSON.stringify({ ...input, status: "checked" })')
  })

  it("생성 실패(400/네트워크) 어느 분기에서도 makeLocalDraft를 호출하지 않는다(로컬 폴백 절대 금지)", () => {
    expect(supersedeEntryBody()).not.toContain("makeLocalDraft")
  })

  it("생성 성공 후 옛 draft id로 PATCH action:\"supersede\"를 1건만 보낸다", () => {
    const body = supersedeEntryBody()
    expect(body).toContain("`/api/admin/branch/ledger-drafts/${encodeURIComponent(oldDraftId)}`")
    expect(body).toContain('method: "PATCH"')
    expect(body).toContain('JSON.stringify({ action: "supersede", newDraftId: created.id })')
  })

  it("503 supersede-unavailable 분기는 setSupersedeAvailable(false)를 부르고 새 초안을 그대로 반환한다 — reverse는 절대 호출하지 않는다", () => {
    const body = supersedeEntryBody()
    const gateIndex = body.indexOf('response.status === 503 && data?.reason === "supersede-unavailable"')
    expect(gateIndex).toBeGreaterThan(-1)
    const branchEnd = body.indexOf("if (response.status === 400) {", gateIndex)
    expect(branchEnd).toBeGreaterThan(gateIndex)
    const branch = body.slice(gateIndex, branchEnd)
    expect(branch).toContain("setSupersedeAvailable(false)")
    expect(branch).toContain("return { draft: created, unavailable: true }")
    // 이 분기(그리고 이 함수 전체)는 되돌리기 액션(action:"reverse")이나 reverseEntry 호출을
    // 절대 포함하지 않는다 — fail-closed는 폴백이 아니라 "그대로 실패를 알림"이어야 한다.
    expect(body).not.toContain('action: "reverse"')
    expect(body).not.toContain("reverseEntry(")
  })

  it("400/404/409는 서버 문구를 validationMessage/error/conflict로 번역하고 새 초안은 그대로 둔다(장부 무변경)", () => {
    const body = supersedeEntryBody()
    expect(body).toContain("if (response.status === 400) {")
    expect(body).toContain("validationMessage: data?.error")
    expect(body).toContain("if (response.status === 404) {")
    expect(body).toContain("if (response.status === 409) {")
    expect(body).toContain("conflict: true")
  })

  it("성공 시 drafts를 새 초안으로 갱신하고 setReversedDraftIds에 oldDraftId를 추가한 뒤 loadDrafts를 재호출한다", () => {
    const body = supersedeEntryBody()
    const okIndex = body.indexOf("const appliedDraft = data.draft")
    expect(okIndex).toBeGreaterThan(-1)
    const okBlock = body.slice(okIndex)
    expect(okBlock).toContain("setDrafts((items) => items.map((draft) => (draft.id === appliedDraft.id ? appliedDraft : draft)))")
    expect(okBlock).toContain("setReversedDraftIds((current) => {")
    expect(okBlock).toContain("next.add(oldDraftId)")
    expect(okBlock).toContain("await loadDrafts()")
    expect(okBlock).toContain("return { draft: appliedDraft }")
  })

  it("네트워크 실패(catch)도 로컬 폴백 없이 이미 생성된 초안(created)을 그대로 반환한다", () => {
    const body = supersedeEntryBody()
    const catchIndex = body.lastIndexOf("} catch (error) {")
    expect(catchIndex).toBeGreaterThan(-1)
    const catchBody = body.slice(catchIndex)
    expect(catchBody).toContain("return { draft: created, error: errorMessage(error) }")
    expect(catchBody).not.toContain("makeLocalDraft")
  })
})

describe("SupersedeEntryResult / LedgerDraftsResponse.capabilities 타입(P2-9)", () => {
  it("SupersedeEntryResult가 draft/unavailable/error/validationMessage/conflict를 선언한다", () => {
    const source = hookSource()
    const ifaceStart = source.indexOf("export interface SupersedeEntryResult")
    expect(ifaceStart).toBeGreaterThan(-1)
    const ifaceEnd = source.indexOf("\n}", ifaceStart)
    const body = source.slice(ifaceStart, ifaceEnd)
    expect(body).toContain("draft: LedgerDraft | null")
    expect(body).toContain("unavailable?:")
    expect(body).toContain("error?:")
    expect(body).toContain("validationMessage?:")
    expect(body).toContain("conflict?:")
  })

  it("LedgerDraftsResponse가 capabilities?: { supersede?: boolean }를 선언한다", () => {
    const source = hookSource()
    const ifaceStart = source.indexOf("interface LedgerDraftsResponse")
    expect(ifaceStart).toBeGreaterThan(-1)
    const ifaceEnd = source.indexOf("\n}", ifaceStart)
    const body = source.slice(ifaceStart, ifaceEnd)
    expect(body).toContain("capabilities?: { supersede?: boolean }")
  })
})

describe("supersedeAvailable 상태 — capabilities.supersede 미러링(P2-9)", () => {
  it("useState(false)로 시작한다(기본 false — fail-closed)", () => {
    const source = hookSource()
    expect(source).toContain("const [supersedeAvailable, setSupersedeAvailable] = useState(false)")
  })

  it("loadDrafts 성공 경로가 health 분기보다 먼저 data.capabilities.supersede === true로 동기화한다", () => {
    const source = hookSource()
    const fnStart = source.indexOf("const loadDrafts = useCallback")
    const fnEnd = source.indexOf("}, [])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    const syncIndex = fnBody.indexOf("setSupersedeAvailable(data.capabilities?.supersede === true)")
    const healthGateIndex = fnBody.indexOf("if (data.health?.ok === false) {")
    expect(syncIndex).toBeGreaterThan(-1)
    expect(healthGateIndex).toBeGreaterThan(-1)
    expect(syncIndex).toBeLessThan(healthGateIndex)
  })

  it("loadDrafts 자체가 실패하면(네트워크 등) 보수적으로 false로 되돌린다", () => {
    const source = hookSource()
    const fnStart = source.indexOf("const loadDrafts = useCallback")
    const fnEnd = source.indexOf("}, [])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    const catchIndex = fnBody.lastIndexOf("} catch (error) {")
    expect(catchIndex).toBeGreaterThan(-1)
    expect(fnBody.slice(catchIndex)).toContain("setSupersedeAvailable(false)")
  })
})

describe("반환 객체 — supersedeAvailable/supersedeEntry 배선(다른 항목 순서·이름은 그대로)", () => {
  it("useLedgerDraftQueue가 둘 다 반환 객체에 포함하고 기존 항목 이름을 그대로 유지한다", () => {
    const source = hookSource()
    const returnStart = source.indexOf("return {\n    drafts,")
    expect(returnStart).toBeGreaterThan(-1)
    const returnEnd = source.indexOf("reloadDrafts: loadDrafts,", returnStart)
    expect(returnEnd).toBeGreaterThan(returnStart)
    const body = source.slice(returnStart, returnEnd)
    expect(body).toContain("supersedeAvailable,")
    expect(body).toContain("supersedeEntry,")
    for (const name of [
      "createDraft,", "updateDraft,", "toggleDraft,", "applyDraft,",
      "checkDrafts,", "applyDrafts,", "cancelDraft,", "deleteDraft,", "reverseEntry,",
      "persistDraftsBatch,",
    ]) {
      expect(body).toContain(name)
    }
  })
})

describe("InputRailSection — supersedeTarget 배너 CTA(P2-9, 소스 스캔)", () => {
  it("props에 supersedeTarget?/onSupersede?를 선언한다(optional — 워크벤치 미배선이어도 컴파일된다)", () => {
    const source = railSource()
    const ifaceStart = source.indexOf("interface InputRailSectionProps")
    const ifaceEnd = source.indexOf("\nexport function InputRailSection", ifaceStart)
    const body = source.slice(ifaceStart, ifaceEnd)
    expect(body).toContain("supersedeTarget?:")
    expect(body).toContain("onSupersede?:")
  })

  it("targetCellLocked 배너 안에서 supersedeTarget?.available일 때만 CTA를 보여준다", () => {
    const source = railSource()
    const gateIndex = source.indexOf("{blockedByLock && (")
    expect(gateIndex).toBeGreaterThan(-1)
    const bannerBlock = source.slice(gateIndex, gateIndex + 1600)
    expect(bannerBlock).toContain("supersedeTarget?.available")
    expect(bannerBlock).toContain("한 번에 바꾸기")
    expect(bannerBlock).toContain("min-h-11")
  })

  it("available이 false인 supersedeTarget에는 마이그레이션 안내 문구를 보여준다", () => {
    const source = railSource()
    expect(source).toContain("supersedeTarget && !supersedeTarget.available")
    expect(source).toContain("운영 DB 마이그레이션 적용 후 한 번에 바꾸기가 켜집니다.")
  })

  it("CTA 클릭은 onSupersede를 호출하고, 저장 버튼의 lock 사전검사(blockedByLock)와는 별도 경로다", () => {
    const source = railSource()
    expect(source).toContain("handleSupersedeClick")
    expect(source).toContain("onSupersede()")
  })
})

// ── 상위 세션 배선·검토 보강(P2-9) ────────────────────────────────────────────
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
function workbenchSource() {
  return readFileSync(workbenchPath, "utf8").replace(/\r\n/g, "\n")
}

describe("InputRailSection — 대체는 곧바로 장부 적용이라 인라인 2단 확인을 거친다(P2-9)", () => {
  it("첫 버튼은 확인 단계만 열고(setSupersedeConfirm(true)), 실제 호출은 [대체 적용]에서만 한다", () => {
    const source = railSource()
    expect(source).toContain("onClick={() => setSupersedeConfirm(true)}")
    expect(source).toContain('aria-label="장부 값 대체 확인"')
    const confirmIndex = source.indexOf('aria-label="장부 값 대체 확인"')
    const applyIndex = source.indexOf("onClick={() => void handleSupersedeClick()}", confirmIndex)
    expect(applyIndex).toBeGreaterThan(confirmIndex)
    expect(source).toContain("대체 적용")
    expect(source).toContain("옛 값은 되돌리기 기록으로 남습니다")
  })

  it("성공 문구는 공용 저장 문구(체크 → 적용 후 반영)가 아니라 대체 전용 문구다 — 이미 적용된 상태이므로", () => {
    const body = sliceFn(railSource(), "const handleSupersedeClick = async () => {", "const primaryDraftKind")
    expect(body).toContain("장부 값을 대체했습니다")
    const successIndex = body.indexOf("장부 값을 대체했습니다")
    const sharedIndex = body.indexOf("resultToDraftFeedback(saveResult)")
    expect(sharedIndex).toBeGreaterThan(successIndex)
  })
})

describe("워크벤치 배선 — supersedeTarget·onSupersede(P2-9)", () => {
  it("(딜, 월) → 적용된 정정 초안 역참조 맵을 editRowOverrideMonths와 별도로 둔다(잠금 계약 불변)", () => {
    const source = workbenchSource()
    const body = sliceFn(source, "const editRowOverrideDrafts = useMemo(() => {", "}, [replacementAppliedDraftRows])")
    expect(body).toContain("months.set(month, { draftId, amount: row.revenue })")
    expect(body).toContain('draftId.startsWith("local-")')
  })

  it("supersedeTarget은 잠긴 칸 + 정정 저장 대상 + 편집 중 아님일 때만, 가용성(supersedeAvailable)을 실어 만든다", () => {
    const body = sliceFn(workbenchSource(), "const supersedeTarget = useMemo(() => {", "const onSupersede = useCallback")
    expect(body).toContain("if (!targetCellLocked || editingDraft || !isEditRowSaveTarget || !draftEditTargetRow) return null")
    expect(body).toContain("available: supersedeAvailable")
  })

  it("onSupersede는 레일 입력 빌더로 새 값을 만들어 supersedeEntry 1회를 부르고, 실패 시 '새 초안은 큐에 남음·장부는 옛 값'을 알린다", () => {
    const body = sliceFn(workbenchSource(), "const onSupersede = useCallback", "}, [buildDraftInput, defaultDraftForm, supersedeEntry, supersedeTarget])")
    expect(body).toContain('supersedeEntry(supersedeTarget.oldDraftId, buildDraftInput("edit-row"))')
    expect(body).toContain("if (result.unavailable) return { unavailable: true }")
    expect(body).toContain("새 값 초안은 체크 큐에 남았습니다(장부는 옛 값 그대로)")
    expect(body).not.toContain("reverseEntry")
  })

  it("inputRailProps로 supersedeTarget·onSupersede를 넘긴다", () => {
    const body = sliceFn(workbenchSource(), "const inputRailProps = {", "  }\n")
    expect(body).toContain("supersedeTarget,")
    expect(body).toContain("onSupersede,")
  })
})
