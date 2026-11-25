// 매출 장부 입력 속도 라운드(2026-09-20) §8.4/§8.5 "다음 라운드" 小 항목 3건 + 결정 D6 회귀 가드.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 순수 값 직접 구동 + 소스 스캔
// 관례를 따른다(weekly-confidence.test.ts·input-rail-weekly-split.test.ts와 동일 관례).
//  1) 레일 폼 순서: 확도 블록을 월·금액 블록 뒤로(운영자 멘탈모델 "금액을 친 뒤 확도를 고른다").
//  2) 첫 필드 autoFocus: 마운트 시 1회, 데스크톱 폭(640px 이상)에서만.
//  3) 결정 D6: DRAFT_CONFIDENCE_OPTIONS(shared.tsx SSOT)에 hint 추가, 레일 버튼 title/aria-label 반영.
//  4) 큐 카드 체크/적용 버튼 위계 — 2026-11-24 체크 큐 컴팩트(P0-5)로 "금액 밑 다음 단계 알약 하나 + 펼친 줄 글자 링크"로 바뀌었다.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { DRAFT_CONFIDENCE_OPTIONS } from "@/components/admin/branch/ledger/shared"

const railPath = join(process.cwd(), "components/admin/branch/ledger/InputRailSection.tsx")
const queuePath = join(process.cwd(), "components/admin/branch/ledger/DraftQueue.tsx")

// CRLF 정규화: autocrlf 체크아웃(Windows)에서도 여러 줄 스캔·경계 slice가 일치하도록
// (weekly-confidence.test.ts와 동일 관례).
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

describe("InputRailSection — 확도 블록이 월/금액 블록 뒤로 이동(§8.4 항목 1)", () => {
  it("확도 블록 마커가 금액 블록 마커보다 소스상 뒤에 온다", () => {
    const source = read(railPath)
    // 금액 블록 마커는 "<AdminMoneyInput"(JSX 사용) — 바닐라 "AdminMoneyInput"만 쓰면 최상단
    // import 구문(줄 5)이 먼저 걸려 순서를 실제로 검증하지 못한다(항상 참이 되는 약한 테스트).
    const amountMarkerIndex = source.indexOf("<AdminMoneyInput")
    const confidenceMarkerIndex = source.indexOf("확도 · 전체 일괄 적용")
    expect(amountMarkerIndex).toBeGreaterThan(-1)
    expect(confidenceMarkerIndex).toBeGreaterThan(-1)
    expect(confidenceMarkerIndex).toBeGreaterThan(amountMarkerIndex)
  })

  it("주차 분해 모드에서도 확도 블록(전체 일괄 적용)이 주차 그리드 바로 앞에 인접한다", () => {
    // 관계(그리드 seg=개별 확도, 블록=전체 일괄 적용)는 순서 변경 후에도 유지돼야 한다 — 확도
    // 블록의 마지막 문단부터 weeklySplitActive 그리드 조건부까지 사이에 닫는 태그 몇 줄
    // 이상(다른 <label>/<div> 블록)이 끼어들지 않는지를 거리로 확인한다.
    const source = read(railPath)
    const confidenceParagraphIndex = source.indexOf("초안 적용 시 확도가 함께 기록됩니다")
    expect(confidenceParagraphIndex).toBeGreaterThan(-1)
    const nextGridIndex = source.indexOf("{weeklySplitActive && (", confidenceParagraphIndex)
    expect(nextGridIndex).toBeGreaterThan(confidenceParagraphIndex)
    expect(nextGridIndex - confidenceParagraphIndex).toBeLessThan(200)
  })
})

describe("InputRailSection — 첫 필드 autoFocus(§8.4 항목 2)", () => {
  it("마운트 시 1회 실행되는 focus effect가 있고 데스크톱 폭 게이트(matchMedia 640px)를 참조한다", () => {
    const source = read(railPath)
    expect(source).toContain('window.matchMedia("(min-width: 640px)").matches')
    const effectStart = source.indexOf("useEffect(() => {")
    expect(effectStart).toBeGreaterThan(-1)
    const effectEnd = source.indexOf("}, [])", effectStart)
    expect(effectEnd).toBeGreaterThan(effectStart)
    const effectBody = source.slice(effectStart, effectEnd)
    expect(effectBody).toContain("matchMedia")
    // queueMicrotask/requestAnimationFrame 없이 effect 본문에서 바로 focus한다(요구사항).
    expect(effectBody).toContain(".focus({ preventScroll: false })")
    expect(effectBody).not.toContain("queueMicrotask")
    expect(effectBody).not.toContain("requestAnimationFrame")
  })

  it("고객명이 비어 있으면 고객 input, 채워져 있으면(행 선택·편집 프리필) 금액 input을 대상으로 삼는다", () => {
    const source = read(railPath)
    // 마운트 시점 값을 useRef로 스냅샷 — effect deps에 draftForm을 그대로 넣으면 타이핑마다
    // 재실행돼 포커스를 다시 빼앗는 회귀가 생긴다.
    expect(source).toContain("const focusAmountFirstRef = useRef(Boolean(draftForm.customer))")
    expect(source).toContain("focusAmountFirstRef.current ? amountInputRef.current : customerInputRef.current")
  })

  it("고객 input에 ref를, 금액 input(AdminMoneyInput)에는 공용 컴포넌트의 inputRef 콜백 prop을 연결한다", () => {
    const source = read(railPath)
    expect(source).toContain("ref={customerInputRef}")
    expect(source).toContain("inputRef={attachAmountInput}")
  })
})

describe("DRAFT_CONFIDENCE_OPTIONS — hint 추가(결정 D6, shared.tsx SSOT)", () => {
  it("3항목 모두 hint가 비어 있지 않다", () => {
    expect(DRAFT_CONFIDENCE_OPTIONS).toHaveLength(3)
    for (const option of DRAFT_CONFIDENCE_OPTIONS) {
      expect(typeof option.hint).toBe("string")
      expect(option.hint.length).toBeGreaterThan(0)
    }
  })

  it("high-confidence의 hint는 D6 결정 문구대로 '90%'를 포함한다(시트 파랑 = 90%+ 마감 임박)", () => {
    const highConfidence = DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === "high-confidence")
    expect(highConfidence?.hint).toContain("90%")
  })
})

describe("InputRailSection — 확도 버튼에 hint를 title/aria-label로 노출(결정 D6)", () => {
  it("title·aria-label이 SSOT hint를 참조하고, 버튼 라벨 텍스트({option.label})는 그대로 유지한다", () => {
    const source = read(railPath)
    expect(source).toContain("title={option.hint}")
    expect(source).toContain("aria-label={`확도 ${option.label} — ${option.hint}`}")
    const buttonStart = source.indexOf("title={option.hint}")
    const buttonEnd = source.indexOf("</button>", buttonStart)
    expect(buttonEnd).toBeGreaterThan(buttonStart)
    expect(source.slice(buttonStart, buttonEnd)).toContain("{option.label}")
  })
})

// 체크 큐 컴팩트(P0-5 · C-4, ledger-filter-plan-2026-11-24) — 위 항목 4의 "카드 하단 버튼 6개" 위계를 대체한다.
// 줄마다 금액 밑에 다음 단계 알약 하나(검토중 → 체크, 체크완료 → 적용)만 두고, 편집 · 체크 해제 · 되돌리기 ·
// 취소 · 삭제는 줄을 펼치면 나오는 글자 링크로 옮겼다. 활성 조건 · 확인 다이얼로그는 그대로다.
describe("DraftQueue — 다음 단계 알약 하나 + 펼친 줄 글자 링크(P0-5)", () => {
  function block(source: string, marker: string, from = 0) {
    const start = source.indexOf(marker, from)
    expect(start, `마커 누락: ${marker}`).toBeGreaterThan(-1)
    return { start, text: source.slice(start, source.indexOf("</button>", start)) }
  }

  it("적용 알약은 체크완료 줄에만, 채운 초록(#084734 · 흰 글자)으로 '적용' 라벨과 확인 다이얼로그를 그대로 쓴다", () => {
    const source = read(queuePath)
    const apply = block(source, "onClick={() => setConfirmApplyDraft(draft)}")
    expect(source.slice(apply.start - 120, apply.start)).toContain('nextStep === "apply"')
    expect(apply.text).toContain("rounded-full bg-[#084734]")
    expect(apply.text).toContain("text-white")
    expect(apply.text).toContain("적용")
    // 활성 조건은 예전 적용 버튼 식 그대로.
    expect(apply.text).toContain('disabled={draft.status !== "checked" || mode !== "server" || draft.id.startsWith("local-") || isRowBusy(draft.id)}')
    expect(apply.text).toContain("aria-label={`${customerName} 적용`}")
  })

  it("체크 알약은 검토중 줄에만, 옅은 초록(#ECFDF5)으로 '체크' — 체크 해제는 펼친 줄의 글자 링크로", () => {
    const source = read(queuePath)
    const check = block(source, "onClick={() => void runToggle(draft.id)}")
    expect(source.slice(check.start - 120, check.start)).toContain('nextStep === "check"')
    expect(check.text).toContain("rounded-full bg-[#ECFDF5]")
    expect(check.text).toContain('disabled={draft.status === "applied" || draft.status === "cancelled" || isRowBusy(draft.id)}')
    expect(check.text).toContain("aria-label={`${customerName} 체크`}")
    const uncheck = block(source, "onClick={() => void runToggle(draft.id)}", check.start + 1)
    expect(source.slice(uncheck.start - 120, uncheck.start)).toContain("rowLinks.uncheck")
    expect(uncheck.text).toContain("className={ROW_LINK_CLASS}")
    expect(uncheck.text).toContain("체크 해제")
  })

  it("편집 · 되돌리기 · 취소 · 삭제는 네모 아이콘 버튼이 아니라 글자 링크이고, 이름에 고객명이 들어간다", () => {
    const source = read(queuePath)
    const markers = [
      ["onClick={() => onEdit(draft)}", "편집"],
      ["onClick={() => setConfirmReverseDraft(draft)}", "적용 되돌리기"],
      ["onClick={() => setConfirmCancelDraft(draft)}", "초안 취소"],
      ["onClick={() => setConfirmDeleteDraft(draft)}", "삭제"],
    ] as const
    for (const [marker, label] of markers) {
      const { text } = block(source, marker)
      expect(text).toMatch(/className=\{ROW_LINK(_DANGER)?_CLASS\}/)
      expect(text).not.toContain("h-8 w-8")
      expect(text).toContain(`aria-label={\`\${customerName} ${label}\`}`)
    }
    expect(source).toMatch(/const ROW_LINK_CLASS = `[^`]*underline[^`]*`/)
  })

  it("한 건은 카드 상자가 아니라 구분선 한 줄이고, 줄을 누르면 aria-expanded로 펼친다", () => {
    const source = read(queuePath)
    expect(source).toContain("border-b border-[#F0F0EC]")
    expect(source).toContain("aria-expanded={expanded}")
    expect(source).toContain("hidden={!expanded}")
    expect(source).not.toContain("rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-2.5")
  })
})
