// 매출 장부 입력 속도 라운드 4(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §2.3·§4
// P0-3): 집계 키인 고객명이 자유 입력이라 표기 흔들림("OO학원"/"OO 학원")이 정규화 키는 같은데
// 새 행을 만들어 집계를 쪼갠다. 담당자 datalist(품질 감사 2026-09-10 #7)와 동일하게 "추천만 하고
// 차단하지 않는" 패턴을 고객명에 적용한 순수 헬퍼(customer-suggest.ts)를 직접 구동하고, 레일·
// 워크벤치 배선은 다른 소스 스캔 테스트(weekly-confidence.test.ts 등)와 동일한 관례로 검증한다.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { buildCustomerOptions, findCustomerSpellingMatch } from "@/components/admin/branch/ledger/customer-suggest"

const railPath = join(process.cwd(), "components/admin/branch/ledger/InputRailSection.tsx")
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

// CRLF 정규화: autocrlf 체크아웃(Windows)에서도 스캔 패턴이 일치하도록(기존 소스 스캔 테스트와 동일 관례).
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

describe("buildCustomerOptions — 레일 고객/계정 datalist 후보", () => {
  it("유일·정렬(ko)·빈 문자열 제외", () => {
    expect(
      buildCustomerOptions([
        { customer: "나학원" },
        { customer: "가학원" },
        { customer: "나학원" },
        { customer: "" },
        { customer: null },
        { customer: undefined },
      ]),
    ).toEqual(["가학원", "나학원"])
  })

  it("행이 비어 있으면 빈 배열이다", () => {
    expect(buildCustomerOptions([])).toEqual([])
  })
})

describe("findCustomerSpellingMatch — 정규화 키는 같고 표기만 다른 기존 후보", () => {
  const options = buildCustomerOptions([{ customer: "OO학원" }, { customer: "다른학원" }])

  it("공백 차이만 있으면 canonical(기존 표기)을 돌려준다", () => {
    expect(findCustomerSpellingMatch("OO 학원", options)).toEqual({ canonical: "OO학원" })
  })

  it("대소문자 차이만 있으면 canonical을 돌려준다", () => {
    expect(findCustomerSpellingMatch("oo학원", options)).toEqual({ canonical: "OO학원" })
  })

  it("괄호 표기 차이만 있으면 canonical을 돌려준다", () => {
    expect(findCustomerSpellingMatch("OO(학원)", options)).toEqual({ canonical: "OO학원" })
  })

  it("트림 기준 완전 동일 문자열이면 null(이미 기존 표기라 경고가 불필요)", () => {
    expect(findCustomerSpellingMatch("OO학원", options)).toBeNull()
    expect(findCustomerSpellingMatch("  OO학원  ", options)).toBeNull()
  })

  it("빈 입력이거나 공백뿐이면 null", () => {
    expect(findCustomerSpellingMatch("", options)).toBeNull()
    expect(findCustomerSpellingMatch("   ", options)).toBeNull()
  })

  it("정규화 키가 다른 입력이면 null", () => {
    expect(findCustomerSpellingMatch("전혀다른곳", options)).toBeNull()
  })

  it("후보 목록이 비어 있으면 항상 null", () => {
    expect(findCustomerSpellingMatch("아무학원", [])).toBeNull()
  })

  it("정규화 키가 같은 후보가 여럿이면 배열 순서상 첫 번째를 돌려준다", () => {
    // buildCustomerOptions가 정렬해 넘긴다는 계약이므로, 여기서는 그 계약대로 이미 정렬된
    // 배열을 그대로 주고(정렬 자체는 위 buildCustomerOptions 스위트가 검증) 동점 처리만 본다.
    const tied = ["Alpha Center", "alpha-center"]
    expect(findCustomerSpellingMatch("ALPHACENTER", tied)).toEqual({ canonical: "Alpha Center" })
  })

  it("구분 기호뿐인 입력은 정규화 키가 빈 문자열이 되어 매칭하지 않는다", () => {
    expect(findCustomerSpellingMatch("---", ["...", "OO학원"])).toBeNull()
  })
})

describe("InputRailSection — 고객/계정 datalist + 표기 맞추기 배선(소스 스캔)", () => {
  const source = read(railPath)

  it("고객/계정 input에 datalist(자유 입력 유지)를 단다", () => {
    expect(source).toContain('list="input-rail-customer-options"')
    expect(source).toContain('<datalist id="input-rail-customer-options">')
    expect(source).toContain("customerOptions.map((name) => <option key={name} value={name} />)")
  })

  it("findCustomerSpellingMatch로 인라인 경고 + 원클릭 표기 맞추기를 제공한다", () => {
    expect(source).toContain("findCustomerSpellingMatch(draftForm.customer, customerOptions)")
    expect(source).toContain("그 표기로 맞추기")
    // 저장을 막지 않는 안내라 alert가 아니라 status다(LOCK_WARNING_TEXT 등 기존 alert 경고와 구분).
    // 이 블록으로 범위를 좁히는 이유: 파일 아래쪽 저장 피드백(feedback)도 role="status"를 쓰므로,
    // 전체 소스에 대한 toContain만으로는 이 블록이 실제로 status인지 증명하지 못한다.
    const start = source.indexOf("customerSpellingMatch && (")
    expect(start, "고객 표기 경고 블록 시작 마커 누락").toBeGreaterThan(-1)
    const end = source.indexOf("그 표기로 맞추기", start)
    expect(end, "고객 표기 경고 블록 끝 마커 누락").toBeGreaterThan(start)
    expect(source.slice(start, end)).toContain('role="status"')
  })

  it("원클릭 버튼은 draftForm.customer를 canonical로 교체할 뿐 다른 필드는 건드리지 않는다", () => {
    expect(source).toContain(
      "onClick={() => setDraftForm((current) => ({ ...current, customer: customerSpellingMatch.canonical }))}",
    )
  })
})

describe("SalesLedgerWorkbench — customerOptions 배선(소스 스캔)", () => {
  const source = read(workbenchPath)

  it("managerOptions와 동일한 rows에서 customerOptions를 계산한다", () => {
    expect(source).toContain("const customerOptions = useMemo(() => buildCustomerOptions(rows), [rows])")
  })

  it("InputRailSection에 넘기는 inputRailProps에 customerOptions를 함께 담는다", () => {
    const propsIndex = source.indexOf("const inputRailProps = {")
    expect(propsIndex).toBeGreaterThan(-1)
    const propsEnd = source.indexOf("\n  }", propsIndex)
    const propsBlock = source.slice(propsIndex, propsEnd)
    expect(propsBlock).toContain("managerOptions,")
    expect(propsBlock).toContain("customerOptions,")
  })
})
