import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants } from "@/components/ui/card"

// cva 전환 전(4c9e509c) Card 출력을 그대로 박제했다. 어드민·checkout·미이관 공개 소비처가 이 출력에 기대므로 바뀌면 안 된다
const SH = "shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px]"
const L = `rounded-xl border border-black/[0.08] bg-white text-[#111110] ${SH}`

const legacyCases: [string, () => ReactElement, string][] = [
  ["기본", () => <Card />, `<div class="${L}"></div>`],
  ["children·임의 속성", () => <Card id="x" data-x="1">hi</Card>, `<div class="${L}" id="x" data-x="1">hi</div>`],
  ["className 덧붙임", () => <Card className="p-4" />, `<div class="${L} p-4"></div>`],
  ["CaseStudies 활성", () => <Card className="overflow-hidden border bg-white transition-shadow duration-200 border-[#084734]/30 shadow-[0_28px_90px_rgba(17,17,16,0.16)]" />, `<div class="rounded-xl text-[#111110] ${SH} overflow-hidden border bg-white transition-shadow duration-200 border-[#084734]/30 shadow-[0_28px_90px_rgba(17,17,16,0.16)]"></div>`],
  ["CaseStudies 비활성", () => <Card className="overflow-hidden border bg-white transition-shadow duration-200 border-black/[0.08] shadow-sm" />, `<div class="rounded-xl text-[#111110] ${SH} overflow-hidden border bg-white transition-shadow duration-200 border-black/[0.08] shadow-sm"></div>`],
  ["checkout 성공·실패", () => <Card className="overflow-hidden rounded-[32px] border-[rgba(8,71,52,0.08)] shadow-[0_18px_50px_rgba(23,72,52,0.08)]" />, `<div class="border bg-white text-[#111110] ${SH} overflow-hidden rounded-[32px] border-[rgba(8,71,52,0.08)] shadow-[0_18px_50px_rgba(23,72,52,0.08)]"></div>`],
  ["contact 폼", () => <Card className="flex h-full w-full flex-col items-center overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.03)] md:rounded-[2rem]" />, `<div class="text-[#111110] ${SH} flex h-full w-full flex-col items-center overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.03)] md:rounded-[2rem]"></div>`],
  ["KeyUseCases(style)", () => <Card className="overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white rounded-[2rem]" style={{ boxShadow: "rgba(0,0,0,0.04) 0px 4px 18px" }} />, `<div class="text-[#111110] ${SH} overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white rounded-[2rem]" style="box-shadow:rgba(0,0,0,0.04) 0px 4px 18px"></div>`],
  ["하위 부품 조합", () => (
      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-[30px]">t</CardTitle>
          <CardDescription>d</CardDescription>
        </CardHeader>
        <CardContent>c</CardContent>
        <CardFooter>f</CardFooter>
      </Card>
    ), `<div class="${L}"><div class="flex flex-col space-y-1.5 p-6 items-center text-center"><h3 class="font-bold tracking-[-0.25px] text-[#111110] text-[30px]">t</h3><p class="text-sm leading-relaxed text-[#615D59]">d</p></div><div class="p-6 pt-0">c</div><div class="flex items-center p-6 pt-0">f</div></div>`],
]

describe("Card legacy 출력 불변", () => {
  it.each(legacyCases)("%s", (_label, render, expected) => {
    expect(renderToStaticMarkup(render())).toBe(expected)
  })

  it("family=legacy 를 명시해도 기본과 같고 data-card 가 없다", () => {
    const explicit = renderToStaticMarkup(<Card family="legacy" className="p-4" />)
    expect(explicit).toBe(renderToStaticMarkup(<Card className="p-4" />))
    expect(explicit).not.toContain("data-card")
    expect(cardVariants()).toBe(L)
  })
})

describe("Card 공개 family", () => {
  it("data-card 표지를 달고 legacy 그림자·hex 를 쓰지 않는다", () => {
    for (const family of ["plain", "index", "case", "plan"] as const) {
      const html = renderToStaticMarkup(<Card family={family} />)
      expect(html).toContain(`data-card="${family}"`)
      expect(html).not.toContain("shadow-")
      expect(html).not.toContain("#111110")
    }
  })

  it("plan featured 만 먹선 테두리를 받는다", () => {
    expect(cardVariants({ family: "plan", featured: true })).toContain("border-line-ink")
    expect(cardVariants({ family: "index", featured: true })).not.toContain("border-line-ink")
  })
})
