// 서버 1단계 검토(2026-11) 동작-2·동작-3·동작-7 재현 시험 — 쉼표 없는 복합 질문, 조회 재현율, 미끼 낱말, 링크 갈래.
import { describe, expect, it } from "vitest"

import { linksBlock } from "@/lib/admin-ai/server/contact"
import { routeMessage, routeMessageDetailed, type RouteDecision } from "@/lib/admin-ai/server/router"

import { COMPOUND_NO_COMMA, DECOY_MORE, READ_RECALL } from "../fixtures/server-questions"

const label = (d: RouteDecision) =>
  d.branch === "write" ? `write:${d.write}` : d.branch === "read" && d.read?.kind === "tool" ? `read:${d.read.tool}` : d.branch

describe("복합 질문 — 쉼표 없는 이음·A랑 B·명령 둘(동작-2)", () => {
  it.each(COMPOUND_NO_COMMA)("%s", (text, expected) => {
    const decisions = routeMessage(text)
    expect(decisions.map((d) => d.clarify ? `${label(d)}?` : label(d))).toEqual(expected)
  })

  it("끊은 앞 조각은 원형 꼬리로 되돌려 보여 준다", () => {
    expect(routeMessage("요금제 차이 설명해 주고, 견적 목록도 보여 줘")[0].text).toBe("요금제 차이 설명해 줘")
    expect(routeMessage("환불 규정 알려 주고 담당자도 알려 줘")[0].text).toBe("환불 규정 알려 줘")
    expect(routeMessage("견적 목록이랑 딜 목록 보여 줘")[0].text).toBe("견적 목록 보여 줘")
  })

  it("조각이 상한을 넘으면 버린 조각을 알려 준다", () => {
    const { decisions, dropped } = routeMessageDetailed("녹화는 어떻게 해? 재고는? 담당은? 링크는? 방문자는?")
    expect(decisions).toHaveLength(4)
    expect(dropped).toEqual(["방문자는?"])
    expect(decisions[3].text).toBe("링크는?")
  })

  it("묻는 말에 끼인 시키는 동사는 쓰기로 가지 않는다", () => {
    for (const text of ["견적 초안 만들고 나서 어디서 확인해?", "출고 예정 등록하고 견적은 얼마야?", "고객이 견적 초안 만들고 보내 달라는데 어떻게 해?"]) {
      for (const decision of routeMessage(text)) expect(decision.branch, text).not.toBe("write")
    }
  })
})

describe("조회 재현율(동작-3)", () => {
  it.each(READ_RECALL)("%s → %s", (text, target) => {
    const decisions = routeMessage(text)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].branch, text).toBe("read")
    const read = decisions[0].read
    expect(read?.kind === "tool" ? read.tool : read?.topic).toBe(target)
  })
})

describe("미끼 낱말·링크 갈래(동작-3·동작-7)", () => {
  it.each(DECOY_MORE)("%s → %s", (text, branch) => {
    const decisions = routeMessage(text)
    expect(decisions.map((d) => d.branch)).toEqual([branch])
    expect(decisions[0].clarify, text).toBeUndefined()
  })

  it("어드민 화면을 물으면 어드민 링크를, 공개 페이지를 물으면 공개 링크를 앞에 낸다", () => {
    const hw = linksBlock("HW 재고 화면 링크 줘")
    expect(hw?.kind === "links" ? hw.card.items[0].linkId : null).toBe("admin:hardware")
    const pricing = linksBlock("공개 요금 페이지 주소 알려 줘")
    expect(pricing?.kind === "links" ? pricing.card.items[0].linkId : null).toMatch(/^public:/)
  })

  it("낱말 하나만 겨우 맞는 링크는 내지 않는다", () => {
    expect(linksBlock("우주선 발사 관제 화면 링크")).toBeNull()
  })
})
