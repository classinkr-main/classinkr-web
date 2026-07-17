import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, it } from "vitest"

import ShowMore, { deriveVisibleState, useVisibleCount } from "@/components/admin/ui/ShowMore"

describe("deriveVisibleState (순수 함수)", () => {
  it("rawVisible이 total을 넘으면 total로 클램프한다", () => {
    expect(deriveVisibleState(999, 30, 10)).toEqual({ visible: 30, canMore: false, canCollapse: true })
  })

  it("아직 다 펼치지 않았으면 canMore=true", () => {
    expect(deriveVisibleState(50, 128, 50)).toEqual({ visible: 50, canMore: true, canCollapse: false })
  })

  it("initial보다 펼쳐졌으면 canCollapse=true", () => {
    expect(deriveVisibleState(100, 128, 50)).toEqual({ visible: 100, canMore: true, canCollapse: true })
  })

  it("initial과 같으면 canCollapse=false", () => {
    expect(deriveVisibleState(50, 128, 50)).toMatchObject({ canCollapse: false })
  })

  it("total이 0이면 visible=0, canMore=false", () => {
    expect(deriveVisibleState(50, 0, 50)).toEqual({ visible: 0, canMore: false, canCollapse: false })
  })
})

describe("useVisibleCount (마운트 시점 스모크 테스트)", () => {
  function Harness({ total, step, initial }: { total: number; step: number; initial?: number }) {
    const state = useVisibleCount(total, step, initial)
    return (
      <div
        data-visible={state.visible}
        data-can-more={String(state.canMore)}
        data-can-collapse={String(state.canCollapse)}
      />
    )
  }

  it("초기 visible은 min(initial ?? step, total)이다", () => {
    const html = renderToStaticMarkup(<Harness total={128} step={50} />)
    expect(html).toContain('data-visible="50"')
    expect(html).toContain('data-can-more="true"')
    expect(html).toContain('data-can-collapse="false"')
  })

  it("total이 initial보다 작으면 visible이 total로 클램프된다", () => {
    const html = renderToStaticMarkup(<Harness total={12} step={50} />)
    expect(html).toContain('data-visible="12"')
    expect(html).toContain('data-can-more="false"')
  })

  it("initial을 별도로 지정하면 그 값을 쓴다", () => {
    const html = renderToStaticMarkup(<Harness total={128} step={50} initial={10} />)
    expect(html).toContain('data-visible="10"')
  })
})

describe("ShowMore", () => {
  it("더보기 (N개 더) 라벨을 렌더링한다 — N=min(step, total-visible)", () => {
    const html = renderToStaticMarkup(
      <ShowMore visible={50} total={128} step={50} onMore={() => undefined} />
    )
    expect(html).toContain("더보기")
    expect(html).toContain("(50개 더)")
    expect(html).toContain("tabular-nums")
  })

  it("남은 항목이 step보다 적으면 N은 남은 항목 수다", () => {
    const html = renderToStaticMarkup(
      <ShowMore visible={100} total={128} step={50} onMore={() => undefined} />
    )
    expect(html).toContain("(28개 더)")
  })

  it("onCollapse를 넘기지 않으면 접기 버튼이 없다", () => {
    const html = renderToStaticMarkup(
      <ShowMore visible={100} total={128} step={50} onMore={() => undefined} />
    )
    expect(html).not.toContain("접기")
  })

  it("onCollapse를 넘기면 접기 버튼이 함께 뜬다", () => {
    const html = renderToStaticMarkup(
      <ShowMore visible={100} total={128} step={50} onMore={() => undefined} onCollapse={() => undefined} />
    )
    expect(html).toContain("접기")
    expect(html).toContain("더보기")
  })

  it("더 보여줄 게 없고 onCollapse도 없으면 아무것도 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      <ShowMore visible={128} total={128} step={50} onMore={() => undefined} />
    )
    expect(html).toBe("")
  })

  it("더 보여줄 게 없어도 onCollapse가 있으면 접기 버튼만 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ShowMore visible={128} total={128} step={50} onMore={() => undefined} onCollapse={() => undefined} />
    )
    expect(html).toContain("접기")
    expect(html).not.toContain("더보기")
  })
})
