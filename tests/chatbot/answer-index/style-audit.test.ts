import { describe, expect, it } from "vitest"

import { analyzeStyle, endingTone, judgeFirstLine, summarizeStyle } from "@/scripts/answer-index/lib/style-audit-core"

describe("첫 줄 결론 판정", () => {
  it("내용 없는 리드·예고·공감·긴 문장·예/아니오 불일치를 가린다", () => {
    expect(judgeFirstLine("이렇게 하면 돼요.", null)).toBe("empty_lead")
    expect(judgeFirstLine("아래 순서대로 따라 하시면 됩니다.", null)).toBe("empty_lead")
    expect(judgeFirstLine("두 가지를 알려드릴게요.", null)).toBe("empty_lead")
    expect(judgeFirstLine("다음 단계를 확인해 주세요:", null)).toBe("announce")
    expect(judgeFirstLine("불편을 드려 죄송합니다.", null)).toBe("empathy")
    expect(judgeFirstLine("가".repeat(61), null)).toBe("too_long")
    expect(judgeFirstLine("[코스 관리]에서 코스를 만들 수 있어요.", null)).toBe("conclusion")
    expect(judgeFirstLine("[코스 관리]에서 만들 수 있어요.", ["yesno"])).toBe("yesno_miss")
    expect(judgeFirstLine("네, 막을 수 있어요.", ["yesno"])).toBe("conclusion")
  })

  it("카드 lead 가 있으면 그것이 첫 문장이다", () => {
    const record = analyzeStyle({ text: "배경 설명 문장입니다. 이어지는 글입니다.", lead: "이렇게 하면 돼요." })
    expect(record.firstSentence).toBe("이렇게 하면 돼요.")
    expect(record.firstLine).toBe("empty_lead")
  })
})

describe("줄 모양 판정", () => {
  it("줄바꿈 0·긴 줄·경로 붙음", () => {
    const flat = analyzeStyle({ text: "코스는 [기관 관리]에서 만듭니다. 경로: [기관 관리] > [코스 관리]. " + "가나다라 ".repeat(30) })
    expect(flat.noNewline).toBe(true)
    expect(flat.longLine120).toBe(true)
    expect(flat.pathStuck).toBe(true)
    const tidy = analyzeStyle({ text: "코스는 여기서 만들어요.\n경로: [기관 관리] > [코스 관리]" })
    expect(tidy.noNewline).toBe(false)
    expect(tidy.pathStuck).toBe(false)
    expect(tidy.longLine60).toBe(false)
  })

  it("목록 표시 섞임·번호 항목 3문장·끝맺음 두 줄", () => {
    const mixed = analyzeStyle({
      text: "1) 하나를 눌러요. 둘을 눌러요. 셋을 눌러요.\n- 그다음 저장해요.\n그래도 안 되면 상담원 연결이라고 남겨 주세요.\n궁금하시면 언제든 말씀해 주세요.",
    })
    expect(mixed.listKinds).toEqual(["1)", "-"])
    expect(mixed.listMix).toBe(true)
    expect(mixed.longNumberedItem).toBe(true)
    expect(mixed.closingLines).toBe(2)
  })

  it("말투 혼재와 표기 흔들림", () => {
    expect(endingTone("눌러 주세요.")).toBe("yo")
    expect(endingTone("눌러야 합니다.")).toBe("nida")
    const record = analyzeStyle({ text: "메뉴로 이동합니다. 저장을 눌러요. 설정 → 권한 순서예요. **굵게**" })
    expect(record.toneMixed).toBe(true)
    expect(record.notation).toMatchObject({ arrow: true, bold: true, corner: false })
  })
})

describe("요약", () => {
  it("첫 줄 결론 비율과 줄바꿈 0 비율", () => {
    const records = [
      analyzeStyle({ text: "[설정]에서 켜요.\n1. 켜요.\n2. 저장해요." }),
      analyzeStyle({ text: "이렇게 하면 돼요. " + "가".repeat(100) }),
    ]
    const summary = summarizeStyle(records)
    expect(summary).toMatchObject({ n: 2, firstLineConclusionRatio: 50, noNewline: 1, noNewlineRatio: 50 })
    expect(summary.firstLine.empty_lead).toBe(1)
  })
})
