// 서버 1단계 검토(2026-11) 동작-2·동작-6·동작-8 재현 시험 — 복합 질문의 겉모양, 넘친 조각 안내, 조각별 시간 상한, 쓰기 둘.
import { describe, expect, it } from "vitest"

import { collectTurn, type TurnInput } from "@/lib/admin-ai/server/orchestrator"
import { previewWriteTurn } from "@/lib/admin-ai/server/writes"
import type { AiBlock } from "@/lib/admin-ai/types"

import { STAFF_ACTOR, fakeDeps } from "./fakes"

const NOW = Date.parse("2026-11-25T01:00:00Z")
const turn = (text: string): TurnInput => ({ text, context: null, actor: STAFF_ACTOR, now: NOW })
const kinds = (blocks: AiBlock[]) => blocks.map((block) => block.kind)

describe("복합 질문의 겉모양(동작-8)", () => {
  it("근거 없는 조각이 둘이어도 담당자·코파일럿 카드는 한 번만 낸다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("크롬북 지원돼? 아이패드는?"), deps)
    expect(kinds(result.blocks)).toEqual(["answer", "contact", "links", "answer"])
  })

  it("뒤 조각이 담당자를 따로 물으면 앞 조각의 담당자 카드는 빼고 뒤 카드만 낸다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("크롬북 지원돼? 이거 본사 누구한테 물어?"), deps)
    expect(kinds(result.blocks)).toEqual(["answer", "links", "contact"])
  })

  it("답 카드 대상 줄은 잘린 어미가 아니라 원형이다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("요금제 차이 설명해 주고, 견적 목록도 보여 줘"), deps)
    const answer = result.blocks.find((block) => block.kind === "answer")
    expect(answer?.kind === "answer" ? answer.card.target.label : "").toBe("요금제 차이 설명해 줘")
  })
})

describe("질문 하나도 말없이 버리지 않는다(동작-2)", () => {
  it("쉼표 없는 두 질문에 둘 다 답한다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("환불 규정 알려 주고 담당자도 알려 줘"), deps)
    expect(kinds(result.blocks)).toEqual(["answer", "contact"])
  })

  it("조각 상한을 넘으면 끝에 다시 물어 달라는 한 줄을 낸다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("녹화는 어떻게 해? 재고는? 담당은? 링크는? 방문자는?"), deps)
    const last = result.blocks.at(-1)
    expect(last?.kind).toBe("text")
    expect(last?.kind === "text" ? last.text : "").toContain("방문자는?")
    expect(last?.kind === "text" ? last.text : "").toContain("다시 물어봐")
  })

  it("시키는 말 둘이면 첫 오더만 만들고 둘째는 '하나씩' 글로 알린다", async () => {
    const { deps, execute } = fakeDeps()
    deps.previewWrite = (kind, ctx) => previewWriteTurn(kind, ctx, { ops: deps.ops, ticketSecret: "x".repeat(40), sub: "user-1", newId: () => "local-1" })
    const customer = { path: "/admin/crm/customers/unified", label: "고객", entity: { type: "customer" as const, id: "cust-1", label: "고객 기관(샘플)" } }
    const result = await collectTurn({ ...turn("T1 카메라 2대 내일 출고 예정 등록하고, 견적 초안도 만들어 줘"), context: customer }, deps)
    expect(result.orders).toHaveLength(1)
    const texts = result.blocks.filter((block) => block.kind === "text").map((block) => (block.kind === "text" ? block.text : ""))
    expect(texts.some((text) => text.includes("한 번에 하나"))).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("조각별 시간 상한(동작-6)", () => {
  it("멈춘 조회 조각은 시간 초과 카드(화면 링크)로 끝나고 다음 조각은 답한다", async () => {
    const { deps } = fakeDeps()
    deps.ops = { ...deps.ops, run: () => new Promise(() => {}) }
    deps.segmentTimeoutMs = 30
    const result = await collectTurn(turn("T1 재고 몇 대야? 카메라 담당 누구야?"), deps)
    expect(kinds(result.blocks)).toEqual(["deny", "contact"])
    const deny = result.blocks[0]
    expect(deny.kind === "deny" ? deny.card.text : "").toContain("시간이 넘었습니다")
    expect(deny.kind === "deny" ? deny.card.openHref : "").toBe("/admin/hardware")
  })
})
