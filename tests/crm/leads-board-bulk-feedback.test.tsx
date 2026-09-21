import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LeadRecord } from "@/lib/repositories/leads"

// leads-02·04·05·06 회귀 안전망 — 리드 보드의 벌크 피드백(청크 동시성·failedIds)·삭제 확인·URL 복원.
// 렌더 검증은 tests/crm/leads-board-render.test.tsx 와 같은 SSR 골격 방식(effect는 돌지 않는다).
const routerState = vi.hoisted(() => ({ search: "" }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/crm/customers/leads",
  useSearchParams: () => new URLSearchParams(routerState.search),
}))

import LeadsBoardClient, {
  BULK_CHUNK_SIZE,
  applySelectedLeadParam,
  runInChunks,
  summarizeLeadNames,
} from "@/components/admin/crm/leads/LeadsBoardClient"

beforeEach(() => {
  routerState.search = ""
})

describe("runInChunks — PATCH·DELETE 공용 동시성 정책", () => {
  it("8건씩 순차 청크로 보내고 실패한 id 목록을 함께 돌려준다", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `lead-${i}`)
    let inFlight = 0
    let maxInFlight = 0
    const order: string[] = []
    const result = await runInChunks(ids, async (id) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      order.push(id)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      if (id === "lead-3" || id === "lead-17") throw new Error(`실패 ${id}`)
      return id
    })

    expect(BULK_CHUNK_SIZE).toBe(8)
    expect(maxInFlight).toBeLessThanOrEqual(BULK_CHUNK_SIZE)
    expect(order).toEqual(ids)
    expect(result.succeeded).toHaveLength(18)
    expect(result.failedIds).toEqual(["lead-3", "lead-17"])
    expect(result.firstError?.message).toBe("실패 lead-3")
  })

  it("Error 가 아닌 거부 사유는 fallbackMessage 로 감싼다", async () => {
    const result = await runInChunks(["a"], async () => { throw "boom" }, { fallbackMessage: "요청 실패" })
    expect(result.failedIds).toEqual(["a"])
    expect(result.firstError?.message).toBe("요청 실패")
  })

  it("빈 목록이면 아무것도 호출하지 않는다", async () => {
    const fn = vi.fn(async (id: string) => id)
    const result = await runInChunks([], fn)
    expect(fn).not.toHaveBeenCalled()
    expect(result).toEqual({ succeeded: [], failedIds: [], firstError: null })
  })
})

describe("applySelectedLeadParam — 드로어 선택의 URL 반영", () => {
  it("선택된 리드를 ?lead= 에 쓰고 true 를 돌려준다", () => {
    const url = new URL("https://x.test/admin/crm/customers/leads?filter=new")
    expect(applySelectedLeadParam(url, "abc")).toBe(true)
    expect(url.searchParams.get("lead")).toBe("abc")
    expect(url.searchParams.get("filter")).toBe("new")
  })

  it("딥링크로 이미 같은 id 가 있으면 건드리지 않는다(중복 replaceState 방지)", () => {
    const url = new URL("https://x.test/leads?lead=abc")
    expect(applySelectedLeadParam(url, "abc")).toBe(false)
    expect(url.search).toBe("?lead=abc")
  })

  it("다른 리드를 클릭하면 값을 교체한다", () => {
    const url = new URL("https://x.test/leads?lead=abc")
    expect(applySelectedLeadParam(url, "def")).toBe(true)
    expect(url.searchParams.get("lead")).toBe("def")
  })

  it("선택이 없으면 아무것도 하지 않는다 — 삭제는 closeSelectedLead 의 몫", () => {
    const url = new URL("https://x.test/leads?lead=abc")
    expect(applySelectedLeadParam(url, null)).toBe(false)
    expect(url.searchParams.get("lead")).toBe("abc")
  })
})

describe("summarizeLeadNames — 삭제 확인 다이얼로그 대상 요약", () => {
  const lead = (id: string, name?: string): LeadRecord =>
    ({ id, name, timestamp: "2026-09-01T00:00:00Z", status: "new", source: "contact_page" }) as unknown as LeadRecord

  it("최대 5건 이름을 나열하고 나머지는 건수로 접는다", () => {
    const leads = Array.from({ length: 7 }, (_, i) => lead(`l${i}`, `이름${i}`))
    const text = summarizeLeadNames(leads, leads.map((l) => l.id))
    expect(text).toBe('"이름0", "이름1", "이름2", "이름3", "이름4" 외 2건')
  })

  it("목록에 없는 id 는 getLeadDisplayName 폴백으로 표시한다", () => {
    expect(summarizeLeadNames([lead("a", "홍길동")], ["a", "zzz"])).toBe('"홍길동", "이 리드"')
  })
})

describe("리드 보드 SSR — 피드백 골격", () => {
  it("토스트가 없을 때도 알림용 라이브 리전이 항상 마운트돼 있다", () => {
    const html = renderToStaticMarkup(<LeadsBoardClient />)
    const liveRegions = html.match(/role="status" aria-live="polite" aria-atomic="true"/g) ?? []
    expect(liveRegions.length).toBeGreaterThanOrEqual(1)
  })

  it("삭제 확인 다이얼로그를 위한 목록 섹션 포커스 착지점이 있다", () => {
    const html = renderToStaticMarkup(<LeadsBoardClient />)
    expect(html).toContain('tabindex="-1" aria-label="리드 목록"')
  })
})

describe("리드 보드 소스 계약 — window.confirm 금지(UX 규약 1)", () => {
  it("LeadsBoardClient 는 브라우저 confirm() 을 쓰지 않는다 — 비가역 동작은 DeleteConfirmDialog 로", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const source = readFileSync(resolve(process.cwd(), "components/admin/crm/leads/LeadsBoardClient.tsx"), "utf8")
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
    expect(code).not.toMatch(/\bconfirm\(/)
    expect(code).not.toMatch(/window\.confirm/)
    expect(code).toContain("irreversibleNote=\"연락 기록도 함께 삭제되며 되돌릴 수 없습니다.\"")
  })
})
