// 매출 장부 입력 속도 라운드(2026-09-20) §8.4/§8.5 "다음 라운드" 小 항목 3건 + 결정 D6 회귀 가드.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 순수 값 직접 구동 + 소스 스캔
// 관례를 따른다(weekly-confidence.test.ts·input-rail-weekly-split.test.ts와 동일 관례).
//  1) 레일 폼 순서: 확도 블록을 월·금액 블록 뒤로(운영자 멘탈모델 "금액을 친 뒤 확도를 고른다").
//  2) 첫 필드 autoFocus: 마운트 시 1회, 데스크톱 폭(640px 이상)에서만.
//  3) 결정 D6: DRAFT_CONFIDENCE_OPTIONS(shared.tsx SSOT)에 hint 추가, 레일 버튼 title/aria-label 반영.
//  4) 큐 카드 체크/적용 버튼 위계: h-9 min-w-[72px] + 라벨 상시 노출(나머지 4개는 그대로).
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

describe("DraftQueue — 체크/적용 버튼 위계(§8.4 항목 4)", () => {
  it("적용 버튼은 h-9 min-w-[72px] 확대 크기와 '적용' 라벨을 상시 노출한다", () => {
    const source = read(queuePath)
    const applyBtnStart = source.indexOf("onClick={() => setConfirmApplyDraft(draft)}")
    expect(applyBtnStart).toBeGreaterThan(-1)
    const applyBtnEnd = source.indexOf("</button>", applyBtnStart)
    const applyBtnBlock = source.slice(applyBtnStart, applyBtnEnd)
    expect(applyBtnBlock).toContain("h-9 min-w-[72px]")
    expect(applyBtnBlock).toContain("적용")
    // 아이콘(Send/Loader2)도 그대로 유지된다.
    expect(applyBtnBlock).toContain("<Send")
  })

  it("체크 버튼은 h-9 min-w-[72px] 확대 크기와 상태별 '체크'/'체크 해제' 라벨을 갖는다", () => {
    const source = read(queuePath)
    const toggleBtnStart = source.indexOf("onClick={() => void runToggle(draft.id)}")
    expect(toggleBtnStart).toBeGreaterThan(-1)
    const toggleBtnEnd = source.indexOf("</button>", toggleBtnStart)
    const toggleBtnBlock = source.slice(toggleBtnStart, toggleBtnEnd)
    expect(toggleBtnBlock).toContain("h-9 min-w-[72px]")
    expect(toggleBtnBlock).toContain('draft.status === "checked" ? "체크 해제" : "체크"')
    expect(toggleBtnBlock).toContain("<CheckCircle2")
  })

  it("나머지 4개(편집·되돌리기·취소·삭제) 버튼은 h-8 w-8 아이콘 전용 크기를 그대로 유지한다", () => {
    const source = read(queuePath)
    const markers = [
      "onClick={() => onEdit(draft)}",
      "onClick={() => setConfirmReverseDraft(draft)}",
      "onClick={() => setConfirmCancelDraft(draft)}",
      "onClick={() => setConfirmDeleteDraft(draft)}",
    ]
    for (const marker of markers) {
      const start = source.indexOf(marker)
      expect(start, `버튼 마커 누락: ${marker}`).toBeGreaterThan(-1)
      const end = source.indexOf("</button>", start)
      expect(source.slice(start, end)).toContain("h-8 w-8")
    }
  })

  it("액션 버튼 행에 flex-wrap이 있어 좁은 화면(모바일)에서 줄바꿈된다", () => {
    const source = read(queuePath)
    expect(source).toContain('className="flex shrink-0 flex-wrap items-center gap-1"')
  })
})
