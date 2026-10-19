/**
 * 이름 검색 호출부의 담당 범위(2026-10-19 09-mooni 병합 검토 후속).
 *
 * 통합 목록 API 는 10월 기본 담당 계약(lib/admin/data-owner.ts dataOwnerFromParams — owner 생략=로그인 담당,
 * 명시적 빈 값=전체)이다. 기록 입력 고객 고르기(CrmCustomerPicker)·커맨드 팔레트 고객 검색은 담당 선택이 없는
 * 화면이라, 검색어가 있을 때 owner 를 빼면 동료 담당 고객이 이름을 정확히 쳐도 0건이 된다. 호출부가 전체(`owner=`)를
 * 밝히는지, 빈 검색어(피커 기본 목록)는 로그인 담당(`owner=__me`)인지 URL 로 고정한다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { commandPaletteCustomerSearchUrl } from "@/components/admin/crm/CrmCommandPalette"
import { customerPickerQuery } from "@/components/admin/crm/CrmCustomerPicker"

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\r\n/g, "\n")

/** start 앵커부터 end 앵커 직전까지 — 앵커가 없으면 조용히 통과하지 않고 실패한다. */
function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start)
  expect(from, `앵커 없음: ${start}`).toBeGreaterThanOrEqual(0)
  const to = source.indexOf(end, from + start.length)
  expect(to, `앵커 없음: ${end}`).toBeGreaterThan(from)
  return source.slice(from, to)
}

describe("CrmCustomerPicker 검색 범위", () => {
  it("검색어가 있으면 전체 담당(owner=)에서 찾는다 — 동료 담당 고객도 이름으로 연결", () => {
    const params = new URLSearchParams(customerPickerQuery("가나학원"))
    expect(params.get("q")).toBe("가나학원")
    expect(params.has("owner")).toBe(true)
    expect(params.get("owner")).toBe("")
    expect(params.get("limit")).toBe("8")
    expect(params.has("source")).toBe(false)
  })

  it("검색어가 비면 로그인 담당(owner=__me) 앞 8행", () => {
    const params = new URLSearchParams(customerPickerQuery(""))
    expect(params.get("owner")).toBe("__me")
    expect(params.has("q")).toBe(false)
    expect(params.get("limit")).toBe("8")
  })

  it("소스 제한은 두 경우 모두 그대로 싣는다", () => {
    const search = new URLSearchParams(customerPickerQuery("a b", "lead"))
    expect(search.get("q")).toBe("a b")
    expect(search.get("owner")).toBe("")
    expect(search.get("source")).toBe("lead")
    const empty = new URLSearchParams(customerPickerQuery("", "neo_account"))
    expect(empty.get("owner")).toBe("__me")
    expect(empty.get("source")).toBe("neo_account")
  })

  it("소스 계약 — 검색 effect 는 customerPickerQuery 로 만든 쿼리로만 통합 API 를 부른다", () => {
    const source = read("components/admin/crm/CrmCustomerPicker.tsx")
    const effect = sliceBetween(source, "const handle = setTimeout(async () => {", "}, 220)")
    expect(effect).toMatch(/\bconst query = customerPickerQuery\(term, sources\)/)
    expect(effect).toContain("adminFetchJsonCached<UnifiedResponse>(`/api/admin/crm/customers/unified?${query}`")
    // 캐시 키도 같은 쿼리(담당 범위 포함)로 갈린다.
    expect(effect).toContain("cacheKey: `picker:${query}`")
    // 통합 API 주소는 effect 의 그 한 곳뿐이다(담당을 빠뜨린 사본이 생기지 않게).
    expect(source.split("/api/admin/crm/customers/unified").length - 1).toBe(1)
  })
})

describe("CrmCommandPalette 고객 검색 범위", () => {
  it("전체 담당(owner=)에서 이름으로 찾는다", () => {
    const url = new URL(commandPaletteCustomerSearchUrl("가나 학원"), "http://x")
    expect(url.pathname).toBe("/api/admin/crm/customers/unified")
    expect(url.searchParams.get("q")).toBe("가나 학원")
    expect(url.searchParams.has("owner")).toBe(true)
    expect(url.searchParams.get("owner")).toBe("")
    expect(url.searchParams.get("limit")).toBe("6")
  })

  it("소스 계약 — 검색 effect 는 commandPaletteCustomerSearchUrl 로만 부른다", () => {
    const source = read("components/admin/crm/CrmCommandPalette.tsx")
    const effect = sliceBetween(source, "const handle = setTimeout(async () => {", "}, 200)")
    expect(effect).toMatch(/adminFetchJsonCached<UnifiedResponse>\(\s*commandPaletteCustomerSearchUrl\(term\),/)
    // 통합 API 주소는 헬퍼 안 한 곳뿐이다.
    expect(source.split("/api/admin/crm/customers/unified").length - 1).toBe(1)
  })
})
