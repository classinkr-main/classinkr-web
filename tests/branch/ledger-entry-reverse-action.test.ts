import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { draftStatusMeta } from "@/components/admin/branch/SalesLedgerWorkbench"

// 웨이브 5 — 장부 "되돌리기" 버튼 UI 배선 회귀 가드.
// 백엔드(PATCH .../ledger-drafts/{id} action=reverse)는 이미 라이브 — 이 스위트는 프런트 배선만 본다:
//  1) draftStatusMeta가 draft.status(불변, "applied" 그대로) 위에 reversed 신호를 얹어 배지를
//     "적용됨" vs "적용됨(상쇄)"로 분기하는지(픽스처 기반, 실제 export 함수 호출).
//  2) 훅의 reverseEntry가 서버 응답 entry를 그대로 ledgerEntries에 병합하는지(로컬에서 상태를
//     임의로 뒤집지 않음 — 기존 ledgerEntryRows의 active 필터가 자연히 신뢰할 수 있게).
//  3) appliedDraftFallbackRows(entries 누락 시 applied draft를 대체 표시하는 안전망)가
//     reversedDraftIds로 상쇄된 draft를 걸러내는지 — 이게 없으면 재조회 시 되돌린 행이
//     되살아난다(GET 목록 엔드포인트가 entry_status=active만 반환하기 때문).
// 소스 스캔 방식은 tests/branch/ledger-entry-reversal-exclusion.test.ts와 동일 관례를 따른다
// (ledgerEntryRows/appliedDraftFallbackRows는 훅 상태에 묶인 비export useMemo라 직접 호출 불가).
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

describe("draftStatusMeta — 적용됨(상쇄) 배지 분기(웨이브 5)", () => {
  it("status=applied, reversed=false면 기존과 동일한 '적용됨' 라벨/톤을 유지한다", () => {
    const meta = draftStatusMeta("applied", false)
    expect(meta.label).toBe("적용됨")
    expect(meta.className).toContain("#084734")
  })

  it("status=applied, reversed=true면 '적용됨(상쇄)' 라벨과 중립(회색) 톤을 반환한다", () => {
    const meta = draftStatusMeta("applied", true)
    expect(meta.label).toBe("적용됨(상쇄)")
    // 초록(#084734/#ECFDF5) 대신 취소됨과 같은 계열의 중립 톤이어야 활성 적용과 시각적으로 구분된다.
    expect(meta.className).not.toContain("#084734")
    expect(meta.className).toContain("#615D59")
  })

  it("reversed 인자를 생략하면(다른 상태 호출부와의 하위 호환) 기본값 false로 동작한다", () => {
    expect(draftStatusMeta("applied").label).toBe("적용됨")
  })

  it("applied가 아닌 상태에서는 reversed=true를 넘겨도 기존 라벨을 그대로 반환한다", () => {
    expect(draftStatusMeta("checked", true).label).toBe("체크 완료")
    expect(draftStatusMeta("draft", true).label).toBe("검토 필요")
    expect(draftStatusMeta("cancelled", true).label).toBe("취소됨")
  })
})

describe("reverseEntry 훅 — 서버 응답을 그대로 신뢰(웨이브 5)", () => {
  it("PATCH body에 action:'reverse'를 싣고, reason이 있을 때만 실어 보낸다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const reverseEntry = useCallback")
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = source.indexOf("}, [queueMode])", fnStart)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fnBody = source.slice(fnStart, fnEnd)

    expect(fnBody).toContain('{ action: "reverse" }')
    expect(fnBody).toContain("if (reason) body.reason = reason")
    expect(fnBody).toContain("method: \"PATCH\"")
  })

  it("로컬(local-*) 초안은 서버에 적용된 적이 없으니 되돌리기 대상에서 막는다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const reverseEntry = useCallback")
    const fnEnd = source.indexOf("}, [queueMode])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain('draftId.startsWith("local-")')
  })

  it("성공 시 서버가 돌려준 entry로 ledgerEntries를 교체한다(로컬에서 entryStatus를 직접 뒤집지 않음)", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const reverseEntry = useCallback")
    const fnEnd = source.indexOf("}, [queueMode])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    // 서버 응답(reversed = data.entry)을 id 매칭으로 그대로 병합 — 기존 active 필터(웨이브 5,
    // item 2 회귀 테스트)가 이 항목을 매트릭스 파생에서 그대로 신뢰하고 제외할 수 있는 전제.
    expect(fnBody).toContain("setLedgerEntries((items) => items.map((entry) => (entry.id === reversed.id ? reversed : entry)))")
    expect(fnBody).toContain("setReversedDraftIds(")
  })
})

describe("appliedDraftFallbackRows — 상쇄된 draft를 대체 표시 안전망에서 제외(웨이브 5)", () => {
  it("draft.status==='applied' 필터 뒤에 reversedDraftIds 제외 필터가 온다", () => {
    const source = workbenchSource()
    const memoStart = source.indexOf("const appliedDraftFallbackRows = useMemo")
    expect(memoStart).toBeGreaterThan(-1)
    const memoEnd = source.indexOf("}, [drafts, matrixMonths, team, reversedDraftIds])", memoStart)
    expect(memoEnd).toBeGreaterThan(memoStart)
    const memoBody = source.slice(memoStart, memoEnd)

    const appliedFilterIndex = memoBody.indexOf('.filter((draft) => draft.status === "applied")')
    const reversedFilterIndex = memoBody.indexOf(".filter((draft) => !reversedDraftIds.has(draft.id))")
    const mapIndex = memoBody.indexOf(".map((draft) => ({")

    expect(appliedFilterIndex).toBeGreaterThan(-1)
    expect(reversedFilterIndex).toBeGreaterThan(appliedFilterIndex)
    expect(mapIndex).toBeGreaterThan(reversedFilterIndex)
  })

  it("reversedDraftIds가 의존성 배열에 들어가 상쇄 직후(재조회 없이도) 즉시 재계산된다", () => {
    const source = workbenchSource()
    expect(source).toContain("}, [drafts, matrixMonths, team, reversedDraftIds])")
  })
})

describe("DraftQueue UI 배선 — 되돌리기 버튼/다이얼로그(웨이브 5)", () => {
  it("적용(applied) 행에서만 활성화되고, 이미 상쇄된 draft·로컬 draft·서버 큐가 아닐 때는 비활성화된다", () => {
    const source = workbenchSource()
    const btnStart = source.indexOf("onClick={() => setConfirmReverseDraft(draft)}")
    expect(btnStart).toBeGreaterThan(-1)
    const btnBlock = source.slice(btnStart, btnStart + 900)
    expect(btnBlock).toContain('draft.status !== "applied"')
    expect(btnBlock).toContain('mode !== "server"')
    expect(btnBlock).toContain('draft.id.startsWith("local-")')
    expect(btnBlock).toContain("reversedDraftIds.has(draft.id)")
    expect(btnBlock).toContain("<RotateCcw")
  })

  it("확인 다이얼로그는 danger가 아닌 warning 톤 문구('상쇄' + 감사 보존 안내)를 쓴다", () => {
    const source = workbenchSource()
    expect(source).toContain("적용을 상쇄합니다. 초안 기록은 감사용으로 유지됩니다.")
  })

  it("확인 다이얼로그에 선택적 사유 입력(1줄 텍스트)이 있고 되돌리기 클릭 시 trim된 값을 넘긴다", () => {
    const source = workbenchSource()
    expect(source).toContain("사유(선택)")
    expect(source).toContain("await onReverse(id, reverseReason.trim() || undefined)")
  })

  it("성공/실패 모두 다이얼로그를 닫고 in-flight 상태(reversingId)를 정리한다(finally)", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const confirmAndReverse = async (id: string) => {")
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = source.indexOf("}\n", fnStart + 400)
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain("setReversingId(id)")
    expect(fnBody).toContain("finally")
    expect(fnBody).toContain("setReversingId(null)")
    expect(fnBody).toContain("closeReverseDialog()")
  })
})

describe("handleReverseEntry — 성공/실패 토스트(웨이브 5, 에러 우선 큐 재사용)", () => {
  it("성공 시 '적용이 상쇄되었습니다' info 토스트를 띄운다", () => {
    const source = workbenchSource()
    expect(source).toContain('pushMatrixToast({ kind: "info", text: "적용이 상쇄되었습니다" })')
  })

  it("실패 시 error 토스트를 띄우고 에러를 다시 던져 다이얼로그가 항상 닫히게 한다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const handleReverseEntry = useCallback")
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = source.indexOf("}, [reverseEntry, pushMatrixToast])", fnStart)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain('kind: "error"')
    expect(fnBody).toContain("throw error")
  })
})

describe("draft.status 불변 가드 (웨이브 5 — 백엔드와 동일 계약을 프런트도 건드리지 않는지)", () => {
  it("reverseEntry는 draft.status를 update하지 않는다 — action:'reverse'만 보내고 status 필드를 싣지 않는다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const reverseEntry = useCallback")
    const fnEnd = source.indexOf("}, [queueMode])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain("status:")
    expect(fnBody).not.toContain("setDrafts(")
  })
})

// 되돌리기 부활 버그(P0) 최종 수리 — 재마운트/새로고침 시나리오 회귀 가드.
// 문제: reversedDraftIds는 useState(new Set())로 세션 로컬 상태다. 재마운트되면 빈 Set으로
// 초기화되고, GET 목록의 entries는 entry_status=active만 담아오므로(기존 웨이브 5 필터) 방금
// 상쇄된 항목은 어느 신호에서도 보이지 않는다 — appliedDraftFallbackRows(entries 누락 시 applied
// draft를 대체 표시하는 안전망)가 이를 "아직 동기화 안 된 신규 적용"으로 오인해 되살린다.
// 수정: GET 응답에 reversedDraftIds(문자열 배열)를 추가(app/api/admin/branch/ledger-drafts/route.ts —
// 이 라우트의 회귀는 tests/api/branch-ledger-drafts-route.test.ts가 실제 호출로 검증)하고,
// loadDrafts가 마운트마다(최초 마운트 포함) 이 서버 진실로 reversedDraftIds를 시드한다.
describe("loadDrafts — reversedDraftIds 서버 시드 (P0, 재마운트 시나리오)", () => {
  it("data.reversedDraftIds가 있으면 setReversedDraftIds로 로컬 Set과 합집합한다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const loadDrafts = useCallback")
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = source.indexOf("}, [])", fnStart)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fnBody = source.slice(fnStart, fnEnd)

    expect(fnBody).toContain("data.reversedDraftIds")
    expect(fnBody).toContain("setReversedDraftIds((current) => {")
    // 덮어쓰기가 아니라 합집합이어야 한다 — 되돌리기는 단방향이라 안전하고, 같은 세션에서
    // 방금 반전한 항목(로컬에서 이미 add된 것)이 시드 과정에서 유실되면 안 된다.
    expect(fnBody).toContain("const next = new Set(current)")
    expect(fnBody).toContain("next.add(draftId)")
  })

  it("시드 코드가 health.ok===false 조기 반환보다 먼저 실행된다 — 어느 분기로 가든 항상 시드된다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const loadDrafts = useCallback")
    const fnEnd = source.indexOf("}, [])", fnStart)
    const fnBody = source.slice(fnStart, fnEnd)

    const seedIndex = fnBody.indexOf("setReversedDraftIds((current) => {")
    const healthGateIndex = fnBody.indexOf("if (data.health?.ok === false) {")
    expect(seedIndex).toBeGreaterThan(-1)
    expect(healthGateIndex).toBeGreaterThan(-1)
    expect(seedIndex).toBeLessThan(healthGateIndex)
  })

  it("최초 마운트 effect가 loadDrafts를 무조건 호출한다 — 재마운트마다 시드가 재실행됨을 보장", () => {
    const source = workbenchSource()
    expect(source).toContain("useEffect(() => {\n    void loadDrafts()\n  }, [loadDrafts])")
  })

  it("LedgerDraftsResponse 타입이 reversedDraftIds?: string[]를 선언한다(서버 계약 문서화)", () => {
    const source = workbenchSource()
    const ifaceStart = source.indexOf("interface LedgerDraftsResponse")
    expect(ifaceStart).toBeGreaterThan(-1)
    // 닫는 중괄호가 줄 맨 앞에 오는 지점(top-level close)을 찾는다 — 필드 중 하나가
    // `{ ok: boolean; message: string | null }` 같은 인라인 객체 타입이라 첫 "}"만
    // 찾으면 인터페이스가 끝나기 전에 잘린다.
    const ifaceEnd = source.indexOf("\n}", ifaceStart)
    expect(ifaceEnd).toBeGreaterThan(ifaceStart)
    const ifaceBody = source.slice(ifaceStart, ifaceEnd)
    expect(ifaceBody).toContain("reversedDraftIds?: string[]")
  })
})
