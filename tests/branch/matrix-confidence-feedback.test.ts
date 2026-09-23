// 확도 선택기 UI 즉시 개선 3건(UX 감사 2026-09-20) 회귀 검증.
//   - 같은 "확도 3단 고르기"가 14~40px 여섯 크기로 흩어져 있었고, 가장 많이 쓰는 매트릭스 셀
//     팝오버가 가장 작았다(버튼 높이 ≈14px, WCAG 2.5.8 최소 24px의 58%).
//   - 편집 중 확도를 바꿔도 input이 무색이었고, 커밋 후 pending 셀은 어떤 확도를 골랐든 항상
//     같은 앰버였다("골랐는데 셀에서 확인할 길이 없다").
// 로직·저장 계약은 무변경, 시각만 바뀐다 — 이 저장소 관례(소스 스캔, React 렌더 하네스 없음)를
// 따른다(weekly-confidence.test.ts·rev-matrix-link-popover.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const revMatrixPath = join(process.cwd(), "components/admin/branch/ledger/RevMatrix.tsx")
const railPath = join(process.cwd(), "components/admin/branch/ledger/InputRailSection.tsx")
const cockpitPath = join(process.cwd(), "components/admin/branch/ledger/CockpitEditor.tsx")
const gridPath = join(process.cwd(), "components/admin/branch/ledger/WeeklyAmountGrid.tsx")

// CRLF 정규화(autocrlf 체크아웃에서도 스캔 패턴이 일치하도록) — 기존 테스트들과 동일 관례.
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

// 컴포넌트 경계 slice — 마커가 없으면 -1 slice로 조용히 파일 전체를 훑는 약화를 막기 위해 즉시 실패.
function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커 누락: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `끝 마커 누락: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

const revMatrixSource = read(revMatrixPath)
const popoverSlice = sliceBetween(
  revMatrixSource,
  "const RevMatrixEditPopover = memo(function RevMatrixEditPopover({",
  "const RevMatrixMonthCell = memo(function RevMatrixMonthCell({",
)
const monthCellSlice = sliceBetween(
  revMatrixSource,
  "const RevMatrixMonthCell = memo(function RevMatrixMonthCell({",
  "const RevMatrixWeekCell = memo(function RevMatrixWeekCell({",
)
const weekCellSlice = sliceBetween(
  revMatrixSource,
  "const RevMatrixWeekCell = memo(function RevMatrixWeekCell({",
  "function RevMatrixWeekCells({",
)

describe("① 매트릭스 편집 input — 확도색 테두리 + 팝오버 확대", () => {
  it("월 셀·주 셀 편집 input 둘 다 CONFIDENCE_TOKENS[editConfidence].color 테두리(border-2)를 쓴다", () => {
    for (const cell of [monthCellSlice, weekCellSlice]) {
      expect(cell).toContain("CONFIDENCE_TOKENS[editConfidence].color")
      expect(cell).toContain("border-2")
    }
  })

  it("팝오버는 role=radiogroup/radio + aria-checked로 색 외에도 상태를 전한다", () => {
    expect(popoverSlice).toContain('role="radiogroup"')
    expect(popoverSlice).toContain('role="radio"')
    expect(popoverSlice).toContain("aria-checked={active}")
  })

  it("팝오버 위치(z-40)는 유지된다(링크칩 z-30 서열 — 재배치는 다음 라운드)", () => {
    expect(popoverSlice).toContain("absolute left-0 top-full z-40")
  })

  it("붙여넣기 다이얼로그 확도 버튼은 min-h-9로 최소 타깃을 키운다", () => {
    expect(revMatrixSource).toContain("min-h-9 rounded-md px-3 py-1.5 text-[11px] font-bold transition")
  })
})

describe("② pending(미검수) 마커·텍스트 — 확도 무관 앰버 고정 제거", () => {
  it("월 셀: 하드코딩 앰버가 사라지고 CONFIDENCE_TOKENS[pending.confidence] 조회로 바뀐다", () => {
    expect(monthCellSlice).not.toContain("bg-[#A8741A]")
    expect(monthCellSlice).not.toContain('"font-bold text-[#7A520F]"')
    expect(monthCellSlice).not.toContain("shadow-[inset_0_-2px_0_0_#A8741A]")
    expect(monthCellSlice).toContain("CONFIDENCE_TOKENS[pending.confidence]")
  })

  it("주 셀: 확도는 슬롯(weeklyConfidence[weekIndex]) 우선 pendingConfidence로 조회하고 하드코딩 앰버가 없다", () => {
    expect(weekCellSlice).not.toContain("bg-[#A8741A]")
    expect(weekCellSlice).not.toContain('"font-bold text-[#7A520F]"')
    expect(weekCellSlice).not.toContain("shadow-[inset_0_-2px_0_0_#A8741A]")
    expect(weekCellSlice).toContain("pendingConfidence")
    expect(weekCellSlice).toContain("pending.weeklyConfidence?.[weekIndex] ?? pending.confidence")
  })

  it("MATRIX_TONE 등 pending과 무관한 기존 리터럴(예: 월합계만 표시)은 그대로 남는다", () => {
    // isMonthOnly 표시는 pending이 아니다 — font-semibold 조합은 손대지 않았어야 한다.
    expect(weekCellSlice).toContain('"font-semibold text-[#7A520F]"')
  })
})

describe("③ 레일·콕핏·주차그리드 확도 버튼 최소 타깃 통일(min-h-11 md:min-h-* 관행)", () => {
  it("InputRailSection 확도 3버튼은 min-h-11 md:min-h-9", () => {
    expect(read(railPath)).toContain("min-h-11 md:min-h-9")
  })

  it("CockpitEditor 확도 버튼도 동일 관행(min-h-11 md:min-h-9)으로 맞춘다", () => {
    expect(read(cockpitPath)).toContain("min-h-11 md:min-h-9")
  })

  it("WeeklyAmountGrid rail 변형 seg는 h-8 w-9이고 라벨 축약(option.label.slice(0, 1))은 유지한다", () => {
    const grid = read(gridPath)
    expect(grid).toContain("h-8 w-9")
    expect(grid).toContain("option.label.slice(0, 1)")
    // cockpit 변형(h-10)은 이번 작업 대상이 아니다 — 그대로 유지되는지도 함께 확인.
    expect(grid).toContain("h-10 rounded-md px-2.5 text-[11px] font-bold transition")
  })
})
