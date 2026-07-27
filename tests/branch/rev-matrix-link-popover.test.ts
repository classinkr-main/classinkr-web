// REV 매트릭스 1열 미니멀 리팩터링(Ledger-1a, 2026-07-18 운영자 피드백) 규약 검증.
//  - 1열 항상 보이는 것 = (그룹 셰브론) + 고객명 + 서브라인 + 미연결 트리거뿐.
//  - 미연결 표시는 원클릭 직행 칩 → 2단계 공개(컴팩트 트리거 → 팝오버 → 매칭 인박스 딥링크).
//  - ⓘ 계보 배지는 우측 레일 행 상세 헤더 아래 뮤트 라인으로 이동.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 소스 스캔 관례를 따른다
// (branch-hero-gauges-error-prop.test.ts 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const revMatrixPath = join(process.cwd(), "components/admin/branch/ledger/RevMatrix.tsx")
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

// CRLF 정규화: autocrlf 체크아웃(Windows)에서도 여러 줄 "\n" 스캔 패턴·경계 slice가 일치하도록
// (tests/db/hardware-sheet-import-inbound-costing-migration.test.ts와 동일 관례).
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

describe("NeedsLinkChip — 미연결 2단계 공개(트리거 → 팝오버 → 매칭 인박스)", () => {
  it("트리거는 aria-expanded/aria-haspopup 버튼, 팝오버는 role=dialog + 매칭 인박스 딥링크(도달 가능성 유지)", () => {
    const chip = sliceBetween(read(revMatrixPath), "export function NeedsLinkChip", "export function NeedsLinkBadge")
    expect(chip).toContain("aria-expanded={open}")
    expect(chip).toContain('aria-haspopup="dialog"')
    expect(chip).toContain('role="dialog"')
    // 기존 원클릭 직행이 2단계가 되어도 목적지 딥링크는 그대로 — 매칭 인박스 ?name= 프리필.
    expect(chip).toContain("/admin/crm/matching?name=${encodeURIComponent(customer)}")
    expect(chip).toContain("매칭 인박스에서 연결")
    // 칩·팝오버 클릭이 행 선택(onSelect/onOpen)으로 전파되지 않는다.
    expect(chip).toContain("stopPropagation()")
  })

  it("문서 리스너는 열려 있을 때만 부착(외부 클릭 닫기), Escape로 닫고 트리거로 포커스 복귀", () => {
    const chip = sliceBetween(read(revMatrixPath), "export function NeedsLinkChip", "export function NeedsLinkBadge")
    const guardAt = chip.indexOf("if (!open) return")
    const mousedownAt = chip.indexOf('document.addEventListener("mousedown"')
    expect(guardAt).toBeGreaterThan(-1)
    expect(mousedownAt).toBeGreaterThan(guardAt)
    expect(chip).toContain('event.key === "Escape"')
    expect(chip).toContain('document.removeEventListener("mousedown"')
    expect(chip).toContain("triggerRef.current?.focus()")
  })

  it("팝오버 open 상태는 워크벤치가 그룹키/행ID 1개만 든다(동시 다중 열림 금지)", () => {
    const source = read(workbenchPath)
    expect(source).toContain("const [revLinkPopoverKey, setRevLinkPopoverKey] = useState<string | null>(null)")
    expect(source).toContain("prev === key ? null : key")
    // 그룹 소계행은 그룹키, 단독 딜행은 행ID 기준으로 열림을 판정한다.
    expect(source).toContain("linkPopoverOpen={revLinkPopoverKey === group.key}")
    expect(source).toContain("linkPopoverOpen={revLinkPopoverKey === row.id}")
  })

  it("팝오버가 sticky 1열(z-10)·sticky 푸터(z-20) 위에 뜨도록 열린 셀만 z-30 승격(그룹·딜행 동일 규약)", () => {
    const source = read(revMatrixPath)
    const elevations = source.split('linkPopoverOpen ? "z-30" : "z-10"').length - 1
    expect(elevations).toBe(2)
  })
})

describe("1열 다이어트 — 딜행·그룹 소계행은 이름+서브라인+트리거만", () => {
  it("딜행 1열: ⓘ 계보 배지·HW ↗ 링크·SW/HW 라벨이 없고 NeedsLinkChip만 남는다", () => {
    const dealRow = sliceBetween(read(revMatrixPath), "export const RevMatrixDealRow", "export const RevMatrixCategoryRow")
    expect(dealRow).toContain("<NeedsLinkChip")
    expect(dealRow).not.toContain("cursor-help") // ⓘ 계보 배지의 고유 클래스
    expect(dealRow).not.toContain("/admin/hardware?customer=") // HW ↗ 역링크(카테고리 합산행·레일에 유지)
    expect(dealRow).not.toContain("productCategoryMeta(productCategory)") // SW/HW 텍스트 라벨
  })

  it("그룹 소계행 1열: 건수 필·장부 필·불일치 아이콘이 없고 NeedsLinkChip만 남는다", () => {
    const groupRow = sliceBetween(read(revMatrixPath), "export const RevMatrixGroupRow", "export const RevMatrixDealRow")
    expect(groupRow).toContain("<NeedsLinkChip")
    expect(groupRow).not.toContain("<NeedsLinkBadge")
    expect(groupRow).not.toContain("group.hasDraft &&") // 장부 필
    expect(groupRow).not.toContain("<AlertTriangle") // 불일치 아이콘(딜행 월 셀·레일 그룹 요약에 유지)
    expect(groupRow).not.toContain(">{group.rows.length}</span>") // 건수 필(aria-label의 건수 안내는 유지)
  })

  it("계보(시트 N행·원천)는 우측 레일 행 상세 헤더 아래 뮤트 라인으로 이동, sheetRow 없으면 생략", () => {
    const source = read(workbenchPath)
    expect(source).toContain("{selectedRow.sheetRow != null && (")
    expect(source).toContain("시트 '2. REV' ${selectedRow.sheetRow}행 · 원천 ${revRowSourceLabel}")
  })

  it("우측 레일(상세 단계)의 미연결 배지는 원클릭 직행 링크를 유지한다(팝오버 아님)", () => {
    const badge = sliceBetween(read(revMatrixPath), "export function NeedsLinkBadge", "const MATRIX_PASTE_PREVIEW_LIMIT")
    expect(badge).toContain("/admin/crm/matching?name=${encodeURIComponent(customer)}")
    expect(badge).not.toContain("aria-haspopup")
    // 레일 사용처(그룹 요약)가 실제로 남아 있다.
    expect(read(workbenchPath)).toContain("<NeedsLinkBadge customer={selectedGroup.customer} />")
  })
})
