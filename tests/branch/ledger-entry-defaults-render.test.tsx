import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import SalesLedgerWorkbench from "@/components/admin/branch/SalesLedgerWorkbench"

let search = ""
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

afterEach(() => {
  vi.useRealTimers()
  search = ""
})

// 탭 줄의 탭 id(패널 id sales-ledger-lens-panel 은 뺀다).
const lensTabIds = (html: string) =>
  Array.from(html.matchAll(/id="sales-ledger-lens-([a-z]+)"/g)).map((match) => match[1]).filter((id) => id !== "panel")

describe("매출장부 첫 화면", () => {
  it("기본 탭은 장부(A안)이고 로그인한 담당자 범위로 연다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-20T01:00:00Z"))
    const html = renderToStaticMarkup(<SalesLedgerWorkbench defaultManager="Junhyuk" />)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>내 담당<\/button>/)
    expect(html).toMatch(/id="sales-ledger-lens-ledger"[^>]*aria-selected="true"/)
    // 2026-11-23: 첫 화면은 건별 시트다 — 요약 띠·상태 줄은 "요약·필터 펼치기" 뒤로 접혀 처음엔 그리지 않는다.
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>건별<\/button>/)
    expect(html).toMatch(/aria-expanded="false"[^>]*>요약·필터 펼치기/)
    expect(html).not.toContain('aria-label="장부 요약"')
    expect(html).not.toContain("KR Team")
    // 들어오면 "이번 달 계 · 공백 제외"가 걸려 있고, 첫 줄의 전부 풀기에 걸린 수가 보인다.
    expect(html).toContain("10월 계 공백 제외")
    expect(html).toMatch(/필터 전부 풀기<span[^>]*>1<\/span>/)
  })

  it("탭 줄은 DSH · 장부 순서이고, 간소 계정에게 보드·콕핏은 보이지 않는다", () => {
    const html = renderToStaticMarkup(<SalesLedgerWorkbench defaultManager="Junhyuk" />)
    const tabs = lensTabIds(html)
    expect(tabs).toEqual(["dsh", "ledger"])
  })

  it("숨긴 렌즈도 주소(?lens=board)로 열면 탭 줄에 남는다", () => {
    search = "lens=board"
    const html = renderToStaticMarkup(<SalesLedgerWorkbench defaultManager="Junhyuk" />)
    const tabs = lensTabIds(html)
    expect(tabs).toEqual(["dsh", "ledger", "board"])
    expect(html).toMatch(/id="sales-ledger-lens-board"[^>]*aria-selected="true"/)
  })

  it("REV 탭은 로그인한 담당자를 선택하고 지난 상반기는 종합 한 칸으로 접어 렌더한다", () => {
    search = "lens=rev"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-20T01:00:00Z"))
    const html = renderToStaticMarkup(<SalesLedgerWorkbench defaultManager="Junhyuk" />)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>내 담당<\/button>/)
    // 주차 검수는 장부 탭 안의 보기다 — 장부 탭이 선택돼 보이고, 보기 선택에 현재 위치(주차 검수)가 남는다.
    expect(html).toMatch(/id="sales-ledger-lens-ledger"[^>]*aria-selected="true"/)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>주차 검수<\/button>/)
    expect(html).toContain("4~9월 종합")
    expect(html).not.toContain("종합 접기")
  })
})
