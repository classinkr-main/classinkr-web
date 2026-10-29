// REV 매트릭스 편집 바(RevMatrixEditBar) 신규 컴포넌트 계약 검증.
//   - 기획 sales-ledger-input-speed-plan-2026-09-20.md §8.3 A안(팝오버를 행 우측 고정으로
//     재배치)의 대체 — 팝오버 위치를 옮기는 대신 매트릭스 위에 상시 표면(편집 바)을 둔다.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 소스 스캔 관례를 따른다
// (rev-matrix-link-popover.test.ts·matrix-confidence-feedback.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const editBarPath = join(process.cwd(), "components/admin/branch/ledger/RevMatrixEditBar.tsx")

// CRLF 정규화(autocrlf 체크아웃에서도 스캔 패턴이 일치하도록) — 기존 테스트들과 동일 관례.
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

const source = read(editBarPath)

describe("RevMatrixEditBar — 접근성·구조 계약(소스 스캔)", () => {
  it("한 줄 바는 role=region + aria-label + aria-live=polite로 편집 대상 변경을 읽어준다", () => {
    expect(source).toContain('role="region"')
    expect(source).toContain('aria-label="셀 편집"')
    expect(source).toContain('aria-live="polite"')
  })

  it("모바일에선 매트릭스와 함께 숨는다(hidden md:flex)", () => {
    expect(source).toContain("hidden md:flex")
  })

  it("확도 3버튼은 radiogroup/radio 시맨틱 + hint 툴팁을 갖는다", () => {
    expect(source).toContain('role="radiogroup"')
    expect(source).toContain('aria-label="확도"')
    expect(source).toContain('role="radio"')
    expect(source).toContain("aria-checked")
    expect(source).toContain("title={option.hint}")
  })

  it("확도 버튼은 WCAG 2.5.8 대응 min-h-9(≥36px) 이상이다", () => {
    expect(source).toContain("min-h-9")
  })

  it("확도 버튼은 onMouseDown으로 편집 input의 포커스를 지킨다(팝오버와 동일 이유)", () => {
    expect(source).toContain("onMouseDown")
    // preventDefault 없이 onMouseDown만 있으면 포커스가 새면서 blur 커밋이 그대로 발생한다.
    const mousedownAt = source.indexOf("onMouseDown")
    expect(mousedownAt).toBeGreaterThan(-1)
    expect(source.slice(mousedownAt, mousedownAt + 80)).toContain("preventDefault()")
  })

  it("좌측 확도색 인디케이터는 CONFIDENCE_TOKENS[confidence].color를 쓴다(새 hex 리터럴 아님)", () => {
    expect(source).toContain("CONFIDENCE_TOKENS[confidence].color")
  })

  it("확도 hex 리터럴을 새로 정의하지 않는다 — CONFIDENCE_TOKENS 맵만 참조한다", () => {
    expect(source).not.toContain("#084734")
    expect(source).not.toContain("#1E5DA8")
    expect(source).not.toContain("#A8741A")
  })
})

describe("RevMatrixEditBar — 컴포넌트 시그니처(상위 세션 배선 계약, 변경 금지)", () => {
  it("export function RevMatrixEditBar 시그니처를 그대로 노출한다", () => {
    expect(source).toContain("export function RevMatrixEditBar")
    // 반환 타입은 React.JSX.Element — 이 파일 상단 주석 참고(전역 JSX 네임스페이스가
    // 이 저장소의 @types/react 19 + isolatedModules에서 비한정 참조로 해석되지 않는다).
    expect(source).toContain("RevMatrixEditBarProps): React.JSX.Element")
  })

  it("RevMatrixEditBarProps는 스펙과 동일한 필드 이름을 쓴다(8개: 타입명 + 필드 7개)", () => {
    expect(source).toContain("export interface RevMatrixEditBarProps")
    const fieldNames = [
      "editing",
      "selected",
      "context",
      "buffer",
      "confidence",
      "onPickConfidence",
      "disabled",
    ]
    expect(fieldNames).toHaveLength(7)
    for (const field of fieldNames) {
      expect(source).toContain(field)
    }
  })

  it("editing·selected는 MatrixCellCoord | null, DraftConfidence·MatrixCellCoord는 import type", () => {
    expect(source).toContain("editing: MatrixCellCoord | null")
    expect(source).toContain("selected: MatrixCellCoord | null")
    expect(source).toContain('import type { DraftConfidence } from "./shared"')
    expect(source).toContain('import type { MatrixCellCoord } from "./rev-matrix-logic"')
  })

  it("context는 customer/monthLabel/weekLabel?/currentAmount 4개 필드를 갖는다", () => {
    expect(source).toContain("customer: string")
    expect(source).toContain("monthLabel: string")
    expect(source).toContain("weekLabel?: string")
    expect(source).toContain("currentAmount: number")
  })

  it("onPickConfidence는 (next: DraftConfidence) => void, disabled는 선택적 boolean", () => {
    expect(source).toContain("onPickConfidence: (next: DraftConfidence) => void")
    expect(source).toContain("disabled?: boolean")
  })
})

describe("RevMatrixEditBar — 렌더 규칙(좌측 상태 텍스트·우측 힌트)", () => {
  it("editing 상태 텍스트는 customer · monthLabel(weekLabel) 형태를 만든다", () => {
    expect(source).toContain("{context.customer} · {context.monthLabel}")
    expect(source).toContain('{context.weekLabel ? ` ${context.weekLabel}` : ""}')
  })

  it("현재값→입력값 표기는 원 단위(formatExactMoney)와 빈 버퍼 폴백 문구를 쓴다(라운드 5 R-8)", () => {
    expect(source).toContain("formatExactMoney(context.currentAmount)")
    expect(source).toContain('bufferAmount == null ? "빈 칸" : formatExactMoney(bufferAmount)')
    // 선택만 된 상태도 수식 입력줄처럼 고객·월·정확한 금액을 보인다.
    expect(source).toContain('context.currentAmount > 0 ? formatExactMoney(context.currentAmount) : "빈 칸"')
  })

  it("selected만 있을 때·둘 다 없을 때의 안내 문구가 스펙과 일치한다", () => {
    expect(source).toContain("선택됨 — Enter/F2 또는 숫자 입력으로 편집")
    expect(source).toContain("셀을 선택하면 여기서 확도를 고를 수 있습니다")
  })

  it("우측 단축키 힌트는 hidden lg:inline이고 스펙 문구와 일치한다", () => {
    expect(source).toContain("hidden shrink-0 whitespace-nowrap text-[10.5px] font-semibold text-[#A39E98] lg:inline")
    // 라운드 5: Ctrl+D는 "위 칸 값으로 채우기"라 문구를 바로잡고, 선택 셀 Ctrl+C 복사(B1)를 더했다.
    expect(source).toContain("Enter 저장 · Tab 다음 칸 · Esc 취소 · Ctrl+D 위 값 채우기 · Ctrl+C 복사 · Ctrl+V 붙여넣기")
  })

  it("확도 버튼은 라벨 + 단축키(E/H/C) kbd를 병기한다", () => {
    expect(source).toContain("<kbd")
    expect(source).toContain("expected: \"E\"")
    expect(source).toContain('"high-confidence": "H"')
    expect(source).toContain('confirmed: "C"')
  })

  it("활성/비활성 확도 버튼 톤은 CONFIDENCE_TOKENS[option.id]의 bgClass/textClass를 쓴다", () => {
    expect(source).toContain("token.bgClass")
    expect(source).toContain("token.textClass")
    expect(source).toContain("border-[rgba(0,0,0,0.08)] bg-white")
  })
})
