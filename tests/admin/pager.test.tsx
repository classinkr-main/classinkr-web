import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, it } from "vitest"

import Pager from "@/components/admin/ui/Pager"

/**
 * html 안에서 aria-label로 특정 버튼의 여는 태그만 뽑아 실제 disabled 속성 여부를 검사한다.
 * className에는 Tailwind의 `disabled:opacity-40` 같은 변형 셀렉터가 항상 섞여 있어 단순
 * "disabled" 문자열 포함 여부로는 판별할 수 없다 — React SSR이 렌더링하는 실제 boolean
 * 속성(`disabled=""`)만 확인한다.
 */
function isDisabled(html: string, ariaLabel: string): boolean {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${ariaLabel}"[^>]*>`))
  if (!match) throw new Error(`button with aria-label="${ariaLabel}" not found in: ${html}`)
  return /\sdisabled=""/.test(match[0])
}

describe("Pager", () => {
  it("total이 0 이하면 아무것도 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      <Pager offset={0} total={0} pageSize={50} onPrev={() => undefined} onNext={() => undefined} />
    )
    expect(html).toBe("")
  })

  it("N–M / 총 T건 라벨을 tabular-nums로 렌더링한다 (기본 단위 건)", () => {
    const html = renderToStaticMarkup(
      <Pager offset={0} total={128} pageSize={50} onPrev={() => undefined} onNext={() => undefined} />
    )
    expect(html).toContain("1–50 / 총 128건")
    expect(html).toContain("tabular-nums")
    expect(html).toContain('role="status"')
  })

  it("unit prop으로 단위를 바꿀 수 있다", () => {
    const html = renderToStaticMarkup(
      <Pager offset={0} total={7} pageSize={50} onPrev={() => undefined} onNext={() => undefined} unit="개" />
    )
    expect(html).toContain("1–7 / 총 7개")
  })

  it("마지막 페이지에서는 종료값이 total로 캡핑된다", () => {
    const html = renderToStaticMarkup(
      <Pager offset={100} total={128} pageSize={50} onPrev={() => undefined} onNext={() => undefined} />
    )
    expect(html).toContain("101–128 / 총 128건")
  })

  it("offset<=0이면 이전 버튼이 비활성화된다", () => {
    const html = renderToStaticMarkup(
      <Pager offset={0} total={128} pageSize={50} onPrev={() => undefined} onNext={() => undefined} />
    )
    expect(isDisabled(html, "이전 페이지")).toBe(true)
    expect(isDisabled(html, "다음 페이지")).toBe(false)
  })

  it("offset+pageSize>=total이면 다음 버튼이 비활성화된다", () => {
    const html = renderToStaticMarkup(
      <Pager offset={100} total={128} pageSize={50} onPrev={() => undefined} onNext={() => undefined} />
    )
    expect(isDisabled(html, "다음 페이지")).toBe(true)
    expect(isDisabled(html, "이전 페이지")).toBe(false)
  })

  it("disabled prop이 true면 이전/다음 모두 비활성화된다", () => {
    const html = renderToStaticMarkup(
      <Pager offset={50} total={128} pageSize={50} onPrev={() => undefined} onNext={() => undefined} disabled />
    )
    expect(isDisabled(html, "이전 페이지")).toBe(true)
    expect(isDisabled(html, "다음 페이지")).toBe(true)
  })
})
