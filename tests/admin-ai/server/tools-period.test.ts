// 서버 1단계 검토(2026-11) 동작-4·동작-8 재현 시험 — 기간 말, 숫자의 조건, 상태 코드 이름표.
import { describe, expect, it } from "vitest"

import { collectTurn, type TurnInput } from "@/lib/admin-ai/server/orchestrator"
import { periodOf } from "@/lib/admin-ai/server/tools"
import type { AiBlock } from "@/lib/admin-ai/types"

import { STAFF_ACTOR, fakeDeps } from "./fakes"

// 2026-11-25 10:00 KST(수)
const NOW = Date.parse("2026-11-25T01:00:00Z")
const turn = (text: string): TurnInput => ({ text, context: null, actor: STAFF_ACTOR, now: NOW })
const firstText = (blocks: AiBlock[]) => (blocks[0]?.kind === "text" ? blocks[0].text : "")

describe("기간 말 해석(KST)", () => {
  it.each([
    ["오늘 출고", { from: "2026-11-25", to: "2026-11-25" }],
    ["어제 출고된 거", { from: "2026-11-24", to: "2026-11-24" }],
    ["이번 주 입출고", { from: "2026-11-23", to: "2026-11-25" }],
    ["지난주 출고", { from: "2026-11-16", to: "2026-11-22" }],
    ["이번 달 견적", { from: "2026-11-01", to: "2026-11-25" }],
    ["지난달 출고", { from: "2026-10-01", to: "2026-10-31" }],
    ["최근 3일 출고", { from: "2026-11-23", to: "2026-11-25" }],
  ])("%s", (text, range) => {
    expect(periodOf(text, NOW)).toMatchObject(range)
  })

  it("해석하지 못하는 기간은 unsupported, 기간 말이 없으면 null", () => {
    expect(periodOf("3분기 견적 합계", NOW)).toBe("unsupported")
    expect(periodOf("견적 목록", NOW)).toBeNull()
  })
})

describe("조회 요약의 조건(동작-4)", () => {
  it("기간을 거르지 못하는 견적 목록은 합계를 결론으로 내지 않고 조건을 밝힌다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("이번 달 견적 합계 얼마야"), deps)
    const text = firstText(result.blocks)
    expect(text).toContain("이번 달")
    expect(text).toContain("견적 화면")
    expect(text).not.toMatch(/합계\s*₩/)
  })

  it("기간 말이 없으면 몇 건 기준인지 밝힌다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("견적 목록 보여 줘"), deps)
    expect(firstText(result.blocks)).toBe("견적 1건(최근 갱신 10건까지), 합계 ₩1,100,000(VAT 포함 금액 기준)입니다.")
  })

  it("입출고는 기간으로 걸러 건수를 낸다", async () => {
    const { deps, run } = fakeDeps()
    const result = await collectTurn(turn("이번 달 출고 내역 보여 줘"), deps)
    expect(run.mock.calls[0][1]).toEqual({ limit: 100 })
    expect(firstText(result.blocks)).toBe("이번 달(11월 1일~11월 25일) 입출고는 1건입니다.")
    const read = result.blocks[1]
    expect(read.kind === "read" ? read.card.table?.rows : []).toHaveLength(1)
  })

  it("기간 안에 기록이 없으면 없다고 말한다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("어제 출고된 거 있어?"), deps)
    expect(firstText(result.blocks)).toBe("어제(11월 24일) 입출고 기록이 없습니다.")
  })

  it("방문 비교는 한 구간만 단정하지 않고 화면으로 안내한다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("지난주 방문자랑 이번 주 방문자 비교"), deps)
    const text = firstText(result.blocks)
    expect(text).toContain("비교")
    expect(text).toContain("방문자 화면")
  })

  it("방문자 기간이 도구 구간과 다르면 실제로 본 구간을 밝힌다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("이번 달 방문자 몇 명이야?"), deps)
    expect(firstText(result.blocks)).toContain("최근 30일")
    expect(firstText(result.blocks)).toContain("이번 달")
  })
})

describe("상태 칸은 한국어 이름표(동작-8)", () => {
  it("견적·딜·입출고 상태 코드를 이름표로 바꾼다", async () => {
    const { deps } = fakeDeps()
    const quotes = await collectTurn(turn("견적 목록 보여 줘"), deps)
    const deals = await collectTurn(turn("딜 목록 보여 줘"), deps)
    const moves = await collectTurn(turn("입출고 내역 보여 줘"), deps)
    const cell = (blocks: AiBlock[], col: number) => (blocks[1]?.kind === "read" ? blocks[1].card.table?.rows[0][col] : undefined)
    expect(cell(quotes.blocks, 2)).toBe("초안")
    expect(cell(deals.blocks, 2)).toBe("제안")
    expect(cell(moves.blocks, 3)).toBe("예정")
  })
})
