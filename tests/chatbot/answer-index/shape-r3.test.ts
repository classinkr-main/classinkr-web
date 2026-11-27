import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  compiledArrowMode,
  compiledForm,
  contentSignature,
  findWidgetBreaks,
  MENU_RENAMES,
  moreStepsLine,
  renameMenus,
  shapeAnswer,
  shapeLayout,
  shapeOptionsFor,
  unifyNotation,
} from "@/lib/chatbot/answer-index/shape"
import { LEGACY_MENU_NAMES, lintAnswer } from "@/scripts/answer-index/lib/style-audit-core"

/**
 * R3 a1 답 꼴(shape.ts) 시험: 경로 기호 →, 「」는 문서 제목만, 옛 메뉴 이름 → 현행명, 줄 앞 ※ 떼기, 요체(다듬기 ⑤), 6단계 자르기, 두 문장 마무리 줄,
 * 그리고 축약 변환본 71장(fixtures/r3-compressed-cards.json) 렌더 전수. 문장은 새로 쓴 것만 쓴다. 스위치는 옵션으로 직접 넘긴다(환경과 무관).
 */

const R3 = { arrow: "arrow", tone: "yo", form: "r3" } as const
const R2 = { arrow: "gt", tone: "off", form: "r2" } as const

describe("shape r3: switches", () => {
  it("defaults to the R3 notation and form, and goes back to R2 with gt / r2", () => {
    expect(compiledArrowMode({})).toBe("arrow")
    expect(compiledArrowMode({ CHATBOT_COMPILED_ARROW: "gt" })).toBe("gt")
    expect(compiledForm({})).toBe("r3")
    expect(compiledForm({ CHATBOT_COMPILED_FORM: "r2" })).toBe("r2")
    // 정책 글·말투 잠금은 말투를 바꾸지 않는다. 나머지는 CHATBOT_COMPILED_TONE.
    expect(shapeOptionsFor("policy", { env: {} }).tone).toBe("off")
    expect(shapeOptionsFor("fixed", { env: {}, toneLocked: true }).tone).toBe("off")
    expect(shapeOptionsFor("doc", { env: {} })).toMatchObject({ tone: "yo", arrow: "arrow", form: "r3", keepClosings: false })
    expect(shapeOptionsFor("doc", { env: { CHATBOT_COMPILED_TONE: "off", CHATBOT_COMPILED_ARROW: "gt", CHATBOT_COMPILED_FORM: "r2" } })).toMatchObject({ tone: "off", arrow: "gt", form: "r2" })
  })
})

describe("shape r3: notation (규격 S3·S5)", () => {
  it("joins menu paths with → and keeps 「」 only for a document title", () => {
    expect(unifyNotation("'수업 관리' 메뉴에서 「수업 분석」 템플릿을 고르고 [저장] → [확인]을 눌러요.", "arrow")).toBe("[수업 관리] 메뉴에서 [수업 분석] 템플릿을 고르고 [저장] → [확인]을 눌러요.")
    expect(unifyNotation("자세한 순서는 「코스 만들기」 문서에 있어요. 『녹화 설정』 가이드도 봐요.", "arrow")).toBe("자세한 순서는 「코스 만들기」 문서에 있어요. 「녹화 설정」 가이드도 봐요.")
    expect(unifyNotation("PC 앱 왼쪽 아래 프로필 > [계정 및 설정] > [기기 테스트]에서 확인해요.", "arrow")).toBe("PC 앱 왼쪽 아래 프로필 → [계정 및 설정] → [기기 테스트]에서 확인해요.")
    expect(unifyNotation("업데이트 -> 캐시 삭제 -> 재설치 순서로 해요.", "arrow")).toBe("업데이트 → 캐시 삭제 → 재설치 순서로 해요.")
    expect(unifyNotation("경로: 코스 > 좌측 사이드바 > [AI 튜터]", "arrow")).toBe("경로: 코스 → 좌측 사이드바 → [AI 튜터]")
    // 따옴표 안 화면 문구, 괄호와 닿지 않은 비교 기호는 그대로.
    expect(unifyNotation("요금 기준은 '결제 개요 > 수수료 규칙' 화면에 있어요. 5 > 3 처럼 써요.", "arrow")).toBe("요금 기준은 '결제 개요 > 수수료 규칙' 화면에 있어요. 5 > 3 처럼 써요.")
    // gt 는 R2 그대로.
    expect(unifyNotation("[저장] → [확인] 「수업 분석」", "gt")).toBe("[저장] > [확인] [수업 분석]")
  })

  it("renames the old menu name to the current one inside [ ] and in paths only (옛 이름은 동의어로만)", () => {
    expect(MENU_RENAMES.map((entry) => entry.legacy)).toEqual(LEGACY_MENU_NAMES.map((entry) => entry.legacy))
    expect(renameMenus("[기관 관리] → [코스 관리]")).toBe("[학사 관리] → [코스 관리]")
    expect(renameMenus("경로: 관리자 대시보드 → 기관 관리 → [교사]")).toBe("경로: 관리자 대시보드 → 학사 관리 → [교사]")
    expect(renameMenus("경로: 관리자 대시보드 → 기관 관리")).toBe("경로: 관리자 대시보드 → 학사 관리")
    // 낱말 '기관 관리자'와 일반 문장 속 '기관 관리'는 그대로.
    expect(renameMenus("기관 관리자만 볼 수 있어요. 기관 관리 업무가 늘었어요.")).toBe("기관 관리자만 볼 수 있어요. 기관 관리 업무가 늘었어요.")
    expect(shapeLayout("경로: 관리자 대시보드 > [기관 관리] > [코스 관리]", "arrow", "r3")).toBe("경로: [관리자 대시보드] → [학사 관리] → [코스 관리]")
    expect(shapeLayout("경로: 관리자 대시보드 > [기관 관리] > [코스 관리]", "gt", "r2")).toBe("경로: [관리자 대시보드] > [기관 관리] > [코스 관리]")
  })

  it("drops a leading ※ (also after a list mark) and keeps one in the middle of a line", () => {
    expect(unifyNotation("※ 올리는 동안에는 창을 닫지 마세요.\n- ※ 학생에게는 보이지 않아요.\n가격은 ※표시를 봐요.", "arrow")).toBe(
      "올리는 동안에는 창을 닫지 마세요.\n- 학생에게는 보이지 않아요.\n가격은 ※표시를 봐요."
    )
  })
})

describe("shape r3: 요체·단계·마무리 줄", () => {
  it("turns 니다체 into 요체 as step ⑤ and records it; tone off keeps the text", () => {
    const text = "아래 순서대로 따라 하시면 됩니다.\n\n1. 코스를 엽니다.\n2. [저장]을 누릅니다."
    const result = shapeAnswer(text, R3)
    expect(result.text).toBe("1. 코스를 열어요.\n2. [저장]을 눌러요.")
    expect(result.removedLeads).toEqual(["아래 순서대로 따라 하시면 돼요."])
    expect(result.toned).toBe(3)
    expect(shapeAnswer(text, { ...R3, tone: "off" }).text).toBe("1. 코스를 엽니다.\n2. [저장]을 누릅니다.")
  })

  it("cuts a numbered list of six or more steps to five and adds the document line right after it", () => {
    const text = `코스는 이렇게 만들어요.\n\n${Array.from({ length: 7 }, (_v, at) => `${at + 1}. ${at + 1}번째 단계예요.`).join("\n")}\n\n만든 뒤에는 학생을 넣어요.`
    const result = shapeAnswer(text, { ...R3, steps: { max: 5, title: "코스 만들기" } })
    expect(result.text).toBe(
      `코스는 이렇게 만들어요.\n\n${Array.from({ length: 5 }, (_v, at) => `${at + 1}. ${at + 1}번째 단계예요.`).join("\n")}\n\n${moreStepsLine("코스 만들기")}\n\n만든 뒤에는 학생을 넣어요.`
    )
    expect(result.removedSteps).toEqual(["6. 6번째 단계예요.", "7. 7번째 단계예요."])
    expect(lintAnswer(result.text, { arrow: "arrow" }).filter((finding) => finding.rule === "L6" || finding.rule === "L7")).toEqual([])
    // 제목을 모르면 자르지 않는다.
    expect(shapeAnswer(text, R3).text).toContain("7. 7번째 단계예요.")
  })

  it("keeps a two-sentence closing line on one line under r3 and splits it under r2 (규격 S6, 설계 §3-4)", () => {
    const closing = '그래도 안 되면 "상담원 연결"이라고 남겨 주세요. 수업 이름과 발생 시각을 함께 알려 주시면 담당자가 기록을 확인해 드려요.'
    const text = `카메라 전원부터 확인해 주세요.\n\n${closing}`
    expect(shapeAnswer(text, { ...R3, keepClosings: true }).text).toBe(text)
    expect(shapeAnswer(text, { ...R2, keepClosings: true }).text).toBe(`카메라 전원부터 확인해 주세요.\n\n${closing.replace(". ", ".\n")}`)
  })

  it("keeps a lead line and the bullets that end its block together (위젯 '리드 + 목록'), but not next to a numbered list", () => {
    const ask = "HDMI는 띄우는 쪽에 따라 단자가 달라요.\n\n어느 화면이 안 나오나요?\n- 노트북 화면을 칠판에 띄울 때\n- 칠판 화면을 TV에 띄울 때"
    expect(shapeAnswer(ask, { ...R3, keepClosings: true }).text).toBe(ask)
    expect(findWidgetBreaks(ask)).toEqual([])
    expect(shapeAnswer(ask, { ...R2, keepClosings: true }).text).toBe(ask.replace("나오나요?\n-", "나오나요?\n\n-"))
    const withSteps = "먼저 확인해요.\n- 전원\n- 케이블\n\n1. 켜요.\n2. 눌러요."
    expect(shapeAnswer(withSteps, R3).text).toBe("먼저 확인해요.\n전원\n케이블\n\n1. 켜요.\n2. 눌러요.")
  })

  it("keeps the characters apart from R3 normalizations (어미·메뉴 이름·※), list marks and line breaks", () => {
    const samples = [
      "※ 주의: 업로드 중에는 창을 닫으면 안 됩니다.\n\n경로: 관리자 대시보드 > [기관 관리] > [코스 관리] 에서 코스를 고릅니다.",
      "'저장되었습니다'라는 안내가 뜹니다. 그 뒤 [확인]을 누릅니다. 화면이 닫히면 끝입니다. 다시 열려면 「코스 만들기」 문서를 봅니다.",
      "1) 설치합니다.\n\n2) 로그인합니다.\n\n- 확인할 것: 버전입니다.",
    ]
    for (const text of samples) {
      const result = shapeAnswer(text, R3)
      expect(contentSignature(result.text)).toBe(contentSignature(text))
      expect(findWidgetBreaks(result.text)).toEqual([])
    }
  })
})

interface CompressedCard {
  id: string
  role: "base" | "branch" | "clarify"
  topic: string
  text: string
}

describe("shape r3: every compressed card (변환본 71장 렌더 전수, 설계 §6 a1)", () => {
  const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "r3-compressed-cards.json"), "utf8")) as { cards: CompressedCard[] }

  it("has the 71 cards", () => {
    expect(fixture.cards).toHaveLength(71)
  })

  it("renders every card as a fixed text answer with no change: →·「」·line breaks·two-sentence closing kept, L7·L8·L9·L13·L17 0", () => {
    const changed: string[] = []
    const fails: string[] = []
    for (const card of fixture.cards) {
      // FIX(text) fixed 카드로 실을 때 respond.ts 가 거는 다듬기(사람 글이라 끝맺음을 지우지 않는다).
      const result = shapeAnswer(card.text, shapeOptionsFor("fixed", { env: {} }))
      if (result.text !== card.text) changed.push(card.id)
      for (const finding of lintAnswer(result.text, { kind: "fixed", arrow: "arrow" })) {
        if (finding.level === "fail" && ["L7", "L8", "L9", "L13", "L17"].includes(finding.rule)) fails.push(`${card.id}:${finding.rule}:${finding.code}`)
      }
    }
    expect(changed).toEqual([])
    expect(fails).toEqual([])
  })

  it("would rewrite them under the R2 switches (→ to >, lead + bullets apart, closing split) — the reason R3 flips shape", () => {
    const changed = fixture.cards.filter((card) => shapeAnswer(card.text, { ...R2, keepClosings: true }).text !== card.text)
    expect(changed.length).toBeGreaterThan(30)
  })
})
