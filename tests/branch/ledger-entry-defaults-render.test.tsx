import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import SalesLedgerWorkbench from "@/components/admin/branch/SalesLedgerWorkbench"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => vi.useRealTimers())

describe("매출장부 첫 화면", () => {
  it("로그인한 담당자를 선택하고 지난 상반기는 종합 한 칸으로 접어 렌더한다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-20T01:00:00Z"))
    const html = renderToStaticMarkup(<SalesLedgerWorkbench defaultManager="Junhyuk" />)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>내 담당<\/button>/)
    expect(html).toContain("Junhyuk · 개인 목표와 데이터")
    expect(html).toContain("4~9월 종합")
    expect(html).not.toContain("종합 접기")
  })
})
