// 라운드 3 P2 — REV 렌즈 상단 확도 스택 게이지(ConfidenceStackBar) 배선 규약(소스 스캔).
// 보드 렌즈 헤더(ForecastBoard)의 확정/고확도/예정(빗금) 스택 바 시각 문법을 shared.tsx의
// 프레젠테이션 컴포넌트로 승격해 REV 보조 분석 요약 라인에도 붙인 것을 검증한다.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 소스 스캔 관례를 따른다
// (forecast-board.test.ts·lens-cross-jump.test.ts와 동일 관례). CRLF 정규화 read 필수
// (autocrlf 체크아웃에서 여러 줄 "\n" 패턴이 깨지는 것을 막는다).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const read = (relPath: string) =>
  readFileSync(join(process.cwd(), relPath), "utf8").replace(/\r\n/g, "\n")

// 함수 경계 slice — 마커가 없으면 -1 slice로 조용히 파일 전체를 훑는 약화를 막기 위해 즉시 실패.
function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커 누락: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `끝 마커 누락: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

const sharedSource = read("components/admin/branch/ledger/shared.tsx")
const boardSource = read("components/admin/branch/ledger/ForecastBoard.tsx")
const revAuxSource = read("components/admin/branch/ledger/RevAuxAnalysisSection.tsx")
const workbenchSource = read("components/admin/branch/SalesLedgerWorkbench.tsx")

describe("shared.tsx — ConfidenceStackBar 프레젠테이션 컴포넌트(보드→shared 승격)", () => {
  const componentBody = sliceBetween(
    sharedSource,
    "export function ConfidenceStackBar(",
    "\nexport function LoadingPanel(",
  )

  it("월 총액이 0 이하면 렌더하지 않는다(보드 헤더와 동일 가드)", () => {
    expect(componentBody).toContain("if (total <= 0) return null")
  })

  it("확정/고확도 채움은 CONFIDENCE_TOKENS 필드만 쓰고 확도 색 리터럴을 재정의하지 않는다", () => {
    expect(componentBody).toContain("CONFIDENCE_TOKENS.confirmed.bgClass")
    expect(componentBody).toContain('CONFIDENCE_TOKENS["high-confidence"].bgClass')
    expect(componentBody).not.toContain("#084734")
    expect(componentBody).not.toContain("#1E5DA8")
  })

  it("예정 잔여는 OPEN_HATCH_BACKGROUND(#ECD29C/#FBF1E0 빗금) SSOT를 그대로 쓴다", () => {
    expect(sharedSource).toContain(
      'export const OPEN_HATCH_BACKGROUND =\n  "repeating-linear-gradient(45deg, #ECD29C, #ECD29C 4px, #FBF1E0 4px, #FBF1E0 8px)"',
    )
    expect(componentBody).toContain("background: OPEN_HATCH_BACKGROUND")
  })

  it("total/confirmed/high 3개 숫자 prop만 받는다(새 집계 없는 순수 프레젠테이션)", () => {
    const propsBlock = sliceBetween(sharedSource, "export interface ConfidenceStackBarProps {", "}")
    expect(propsBlock).toContain("total: number")
    expect(propsBlock).toContain("confirmed: number")
    expect(propsBlock).toContain("high: number")
  })
})

describe("ForecastBoard — 헤더 스택바가 shared의 ConfidenceStackBar를 재사용한다(중복 제거)", () => {
  it("로컬 OPEN_HATCH_BACKGROUND 재정의 없이 shared에서 재수입한다", () => {
    expect(boardSource).not.toContain("const OPEN_HATCH_BACKGROUND =")
    expect(boardSource).toMatch(/import\s*\{[\s\S]*?ConfidenceStackBar[\s\S]*?\}\s*from\s*"\.\/shared"/)
    expect(boardSource).toMatch(/import\s*\{[\s\S]*?OPEN_HATCH_BACKGROUND[\s\S]*?\}\s*from\s*"\.\/shared"/)
  })

  it("헤더 바는 모델 스칼라(monthTotal/monthConfirmed/monthHighConfidence)를 그대로 넘긴다", () => {
    const barBlock = sliceBetween(boardSource, "<ConfidenceStackBar", "/>")
    expect(barBlock).toContain("total={model.monthTotal}")
    expect(barBlock).toContain("confirmed={model.monthConfirmed}")
    expect(barBlock).toContain("high={model.monthHighConfidence}")
  })

  it("레전드(라벨·확정/고확도/예정 금액·퍼센트)는 리팩터 후에도 그대로 남아 있다", () => {
    expect(boardSource).toContain("{CONFIDENCE_TOKENS.confirmed.label}")
    expect(boardSource).toContain("{CONFIDENCE_TOKENS[\"high-confidence\"].label}")
    expect(boardSource).toContain("{CONFIDENCE_TOKENS.expected.label}(잔여)")
    expect(boardSource).toContain("{confirmedPct}%")
    expect(boardSource).toContain("{highPct}%")
    expect(boardSource).toContain("{openPct}%")
  })
})

describe("RevAuxAnalysisSection — REV 렌즈 확도 스택 게이지 배선(소스 스캔)", () => {
  it("shared의 ConfidenceStackBar를 가져온다", () => {
    expect(revAuxSource).toMatch(/import\s*\{[\s\S]*?ConfidenceStackBar[\s\S]*?\}\s*from\s*"\.\/shared"/)
  })

  it("게이지는 '보조 분석' 토글 버튼 바로 아래, 펼침 콘텐츠보다 앞에 위치한다", () => {
    const buttonCloseIndex = revAuxSource.indexOf("</button>")
    const barIndex = revAuxSource.indexOf("<ConfidenceStackBar")
    const expandedContentIndex = revAuxSource.indexOf("{revAuxOpen && (")
    expect(buttonCloseIndex).toBeGreaterThan(-1)
    expect(barIndex).toBeGreaterThan(buttonCloseIndex)
    expect(expandedContentIndex).toBeGreaterThan(barIndex)
  })

  it("revMonthScalars 파생 스칼라(total/confirmed/high)를 그대로 넘긴다 — 새 집계 없음", () => {
    const barBlock = sliceBetween(revAuxSource, "<ConfidenceStackBar", "/>")
    expect(barBlock).toContain("total={revMonthTotal}")
    expect(barBlock).toContain("confirmed={revMonthConfirmed}")
    expect(barBlock).toContain("high={revMonthHighConfidence}")
    expect(barBlock).toContain("title={confidenceBarTitle}")
  })

  it("월 총액 0 가드로 감싼다(보드와 동일 가드)", () => {
    const gaugeBlock = sliceBetween(revAuxSource, "</button>", "{revAuxOpen && (")
    expect(gaugeBlock).toContain("revMonthTotal > 0 && (")
  })

  it("title 툴팁은 확정/고확도/예정 금액·퍼센트를 담는다(범례 대체)", () => {
    expect(revAuxSource).toContain("확정 ${formatMoney(revMonthConfirmed)}")
    expect(revAuxSource).toContain("고확도 ${formatMoney(revMonthHighConfidence)}")
    expect(revAuxSource).toContain("예정 ${formatMoney(revMonthPlanned)}")
  })

  it("revMonthTotal이 props 인터페이스에 선언돼 있다", () => {
    expect(revAuxSource).toMatch(/revMonthTotal:\s*number/)
  })
})

describe("SalesLedgerWorkbench — RevAuxAnalysisSection에 revMonthTotal을 배선한다(소스 스캔)", () => {
  it("revMonthScalars.total 파생값(revMonthTotal)을 prop으로 넘긴다 — 새 집계 아님", () => {
    expect(workbenchSource).toContain("const revMonthTotal = revMonthScalars.total")
    const callBlock = sliceBetween(workbenchSource, "<RevAuxAnalysisSection", "<RevMobileList")
    expect(callBlock).toContain("revMonthTotal={revMonthTotal}")
  })
})
