import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  analyzeStyle,
  arrowModeFromEnv,
  cardChars,
  checkCardShape,
  clarifyOptionsOf,
  endingTone,
  judgeFirstLine,
  legacyMenuNamesIn,
  lintAlreadyTried,
  lintAnswer,
  lintCompound,
  lintYoConvert,
  segmentShapeOfTrace,
  summarizeLint,
  summarizeStyle,
  triedActionsOf,
  type LintFinding,
} from "@/scripts/answer-index/lib/style-audit-core"

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

// ─── R3 lint(답 꼴 규격 5절 L1~L18) ───

const rulesOf = (findings: readonly LintFinding[], level?: "fail" | "warn") => Array.from(new Set(findings.filter((finding) => !level || finding.level === level).map((finding) => `${finding.rule}:${finding.code}`)))

describe("R3 lint 단일 답", () => {
  it("인사로 시작하는 첫 줄은 greeting(L1)", () => {
    expect(judgeFirstLine("안녕하세요, 클래스인입니다.", null)).toBe("greeting")
    expect(rulesOf(lintAnswer("안녕하세요. 녹화는 [수업 기록]에서 봐요."))).toContain("L1:greeting")
  })

  it("규격 꼴(첫 줄 결론 → 번호 단계 → 조건부 마무리 한 줄)은 걸리는 것이 없다", () => {
    const text = [
      "녹화본은 [코스] → [수업 기록]에서 다시 볼 수 있어요.",
      "",
      "1. 코스를 열어요.",
      "2. [수업 기록]을 눌러요.",
      "3. 볼 수업을 골라요.",
      "",
      '그래도 안 되면 "상담원 연결"이라고 남겨 주세요. 수업 이름과 발생 시각을 함께 알려 주시면 담당자가 기록을 확인해 드려요.',
    ].join("\n")
    expect(lintAnswer(text)).toEqual([])
  })

  it("줄 길이(L3)·문장 중간 줄바꿈(L4)·덩이(L5)", () => {
    expect(rulesOf(lintAnswer(`[설정]에서 켜요.\n${"가".repeat(121)}`), "fail")).toContain("L3:line_120")
    expect(rulesOf(lintAnswer(`[설정]에서 켜요.\n${"나".repeat(70)}.`), "warn")).toContain("L3:line_60")
    expect(rulesOf(lintAnswer(`[설정]에서 켜요.\n\n1. ${"다".repeat(85)}`), "warn")).toContain("L3:step_80")
    expect(rulesOf(lintAnswer("녹화본은 수업이 끝나고,\n몇 분 뒤 올라와요."))).toContain("L4:mid_break")
    expect(rulesOf(lintAnswer("녹화본은 수업이 끝나고 몇 분 뒤 올라와요.\n학생도 같은 곳에서 봐요."))).not.toContain("L4:mid_break")
    expect(rulesOf(lintAnswer(["가요.", "나요.", "다요.", "라요.", "마요."].join("\n\n")), "warn")).toContain("L5:blocks_4")
  })

  it("목록(L6): 섞임·항목 세 문장·6단계·단일 번호", () => {
    expect(rulesOf(lintAnswer("[설정]에서 켜요.\n\n1. 하나를 눌러요.\n\n- 둘을 눌러요."))).toContain("L6:list_mix")
    expect(rulesOf(lintAnswer("[설정]에서 켜요.\n\n1. 하나요. 둘이요. 셋이요.\n2. 넷이요."))).toContain("L6:item_sentences_3")
    const six = ["[설정]에서 켜요.", "", ...Array.from({ length: 6 }, (_, at) => `${at + 1}. ${at + 1}번을 눌러요.`)].join("\n")
    expect(rulesOf(lintAnswer(six))).toContain("L6:steps_6")
    expect(rulesOf(lintAnswer("[설정]에서 켜요.\n\n1. 저장을 눌러요."))).toContain("L6:single_numbered")
  })

  it("표기(L7): 화살표 판정은 스위치로 뒤집고, 「」는 문서 제목일 때만 둔다", () => {
    const gt = "경로는 [관리자 페이지] > [학사 관리]예요."
    const arrow = "경로는 [관리자 페이지] → [학사 관리]예요."
    expect(rulesOf(lintAnswer(gt))).toContain("L7:path_gt")
    expect(rulesOf(lintAnswer(arrow))).not.toContain("L7:path_gt")
    expect(rulesOf(lintAnswer(arrow, { arrow: "gt" }))).toContain("L7:path_arrow")
    expect(rulesOf(lintAnswer(gt, { arrow: "gt" }))).not.toContain("L7:path_gt")
    expect(arrowModeFromEnv({ CHATBOT_COMPILED_ARROW: "gt" })).toBe("gt")
    expect(arrowModeFromEnv({})).toBe("arrow")
    expect(rulesOf(lintAnswer("자세한 순서는 「코스 만들기」 문서에 있어요."))).toEqual([])
    expect(rulesOf(lintAnswer("「허용」을 켜요."))).toContain("L7:corner_not_title")
    expect(rulesOf(lintAnswer("**굵게** 써요. `코드`예요."))).toEqual(expect.arrayContaining(["L7:bold", "L7:backtick"]))
  })

  it("옛 메뉴 이름(L8)은 [ ] 안·경로 안에서만 센다", () => {
    expect(legacyMenuNamesIn("[기관 관리] → [코스 관리]")).toEqual(["기관 관리"])
    expect(legacyMenuNamesIn("경로: 관리자 대시보드 > 기관 관리 > 코스")).toEqual(["기관 관리"])
    expect(legacyMenuNamesIn("기관 관리자 계정으로 들어가요.")).toEqual([])
    expect(rulesOf(lintAnswer("[기관 관리]에서 바꿔요."))).toContain("L8:legacy_menu")
  })

  it("말투 혼재(L9)는 인용 밖만 보고, toneLocked·영어 답은 보지 않는다", () => {
    expect(rulesOf(lintAnswer("저장을 눌러요. 설정이 바뀝니다."))).toContain("L9:tone_mixed")
    expect(rulesOf(lintAnswer("'연결할 수 없습니다'가 뜨면 다시 실행해 주세요. 최신 버전이면 돼요."))).not.toContain("L9:tone_mixed")
    expect(rulesOf(lintAnswer("저장을 눌러요. 설정이 바뀝니다.", { toneLocked: true }))).not.toContain("L9:tone_mixed")
  })

  it("끝맺음(L10)·주의 접두(L11)·본문 링크(L12)", () => {
    expect(rulesOf(lintAnswer('[설정]에서 켜요.\n\n그래도 안 되면 "상담원 연결"이라고 남겨 주세요.\n궁금하시면 언제든 말씀해 주세요.'))).toContain("L10:closing_2")
    expect(rulesOf(lintAnswer('지운 영상은 바로 "상담원 연결"이라고 남겨 주세요.\n지운 날짜를 알려 주시면 담당자가 확인해 드려요.'))).not.toContain("L10:closing_2")
    expect(rulesOf(lintAnswer("[설정]에서 켜요.\n감사합니다."))).toContain("L10:closing_thanks")
    expect(rulesOf(lintAnswer("[설정]에서 켜요.\n※ 저장을 꼭 눌러요."), "warn")).toContain("L11:caution_prefix")
    expect(rulesOf(lintAnswer("주의: 창을 닫지 마세요."), "warn")).toContain("L11:caution_prefix")
    expect(rulesOf(lintAnswer("자세한 건 https://example.com 에서 봐요."))).toContain("L12:url")
    expect(rulesOf(lintAnswer("[안내](/docs/a) 문서를 봐요."))).toContain("L12:markdown_link")
    expect(rulesOf(lintAnswer("스크린샷을 참고해 주세요."))).toContain("L12:screenshot_ref")
  })

  it("받을 정보(L14)·공백 답(L15)·위젯 깨짐(L17)", () => {
    expect(rulesOf(lintAnswer("아이디를 채팅에 적어 주세요."))).toContain("L14:pii_request")
    expect(rulesOf(lintAnswer('"상담원 연결"이라고 남기고 수업 이름, 날짜, 시각, 기기, 화면 사진을 알려 주세요.'))).toContain("L14:ask_items_4")
    expect(rulesOf(lintAnswer('"상담원 연결"이라고 남기고 수업 이름과 날짜·시각, 유선·Wi-Fi 여부를 알려 주시면 확인해 드려요.'))).not.toContain("L14:ask_items_4")
    const gap = "그 내용은 공개 안내에서 확인되지 않았어요. 확인되지 않은 내용을 추측해 말씀드리지 않을게요.\n\n가\n나\n다\n라"
    expect(rulesOf(lintAnswer(gap, { kind: "gap" }))).toEqual(expect.arrayContaining(["L15:gap_lines_4", "L15:gap_guess"]))
    expect(rulesOf(lintAnswer("[설정]에서 켜요.\n1. 저장해요.\n2. 닫아요."))).toContain("L17:widget_break")
  })
})

describe("R3 lint 복합·이미 해 본 것·요체 변환", () => {
  it("L13: 머리 수 + 묶임 = 조각 수, 번호 순서, 머리 단독 덩이, 결론 줄, 알림 자리", () => {
    const good = "1. 녹화 다시 보기\n수업이 끝나면 [코스] → [수업 기록]에서 볼 수 있어요.\n- [수업 기록]을 눌러요\n\n2. \"출입 단말기 연동\"\n공개 안내에는 없는 내용이라 상담으로 확인해 드릴게요."
    expect(lintCompound(good, { segments: 2 })).toEqual([])
    expect(lintAnswer(good, { segments: 2 }).filter((finding) => finding.level === "fail")).toEqual([])
    expect(rulesOf(lintCompound(good, { segments: 3 }))).toContain("L13:head_count")
    expect(lintCompound(good, { segments: 3, bound: 1 })).toEqual([])
    expect(rulesOf(lintCompound("2. 녹화\n볼 수 있어요.\n\n1. 삭제\n지울 수 있어요.", { segments: 2 }))).toContain("L13:head_order")
    expect(rulesOf(lintCompound("1. 녹화\n\n수업 기록에서 봐요.\n\n2. 삭제\n지울 수 있어요.", { segments: 2 }))).toContain("L13:head_alone")
    expect(rulesOf(lintCompound("1. 녹화\n- 수업 기록을 눌러요\n\n2. 삭제\n지울 수 있어요.", { segments: 2 }))).toContain("L13:no_conclusion")
    expect(rulesOf(lintCompound("1. 녹화\n볼 수 있어요.\n\n2. 삭제\n지울 수 있어요.\n\n이 내용은 따로 한 번 더 물어봐 주세요.", { segments: 2 }))).toContain("L13:notice_outside")
    // R2 【주제】 꼴도 같은 규칙으로 본다.
    expect(lintCompound("【녹화】\n볼 수 있어요.\n\n【두 번째 질문】\n이 내용은 따로 한 번 더 물어봐 주세요.", { segments: 2 })).toEqual([])
    expect(lintCompound("하나만 답했어요.", { segments: 1 })).toEqual([])
  })

  it("흔적에서 조각 수와 같은 카드로 묶인 조각 수를 센다", () => {
    expect(segmentShapeOfTrace({ segments: [{ kind: "answer", card: "a" }, { kind: "answer", card: "a" }, { kind: "retry", card: null }] })).toEqual({ segments: 3, bound: 1 })
    expect(segmentShapeOfTrace({ segments: 2 })).toEqual({ segments: 2, bound: 0 })
    expect(segmentShapeOfTrace(null)).toEqual({ segments: 1, bound: 0 })
  })

  it("L16: 이미 해 봤다는 동작을 첫 행동으로 다시 시키면 실패", () => {
    const question = "알림이 안 와요. 앱도 이미 지웠다 다시 깔았어요."
    expect(triedActionsOf(question)).toEqual(["reinstall"])
    expect(triedActionsOf("앱을 다시 설치하려면 어떻게 해요?")).toEqual([])
    expect(rulesOf(lintAlreadyTried(question, "앱을 삭제한 뒤 다시 설치해 주세요."))).toEqual(["L16:repeat_tried"])
    expect(lintAlreadyTried(question, "알림은 [설정] → [알림]에서 확인할 수 있어요.\n- 기기 알림 허용이 켜져 있는지")).toEqual([])
  })

  it("L18: 요체 변환 전후 숫자·[ ]·영문·부정어가 같아야 하고, 남은 니다체는 경고", () => {
    expect(lintYoConvert("[저장]을 누르면 2분 뒤 PC에 반영됩니다.", "[저장]을 누르면 2분 뒤 PC에 반영돼요.")).toEqual([])
    expect(rulesOf(lintYoConvert("3개까지 올릴 수 없습니다.", "3개까지 올릴 수 있어요."), "fail")).toContain("L18:token_negations")
    expect(rulesOf(lintYoConvert("[저장]을 누릅니다.", "저장을 눌러요."), "fail")).toContain("L18:token_brackets")
    expect(rulesOf(lintYoConvert("설정을 고릅니다.", "설정을 고릅니다."), "warn")).toContain("L18:unconverted")
  })

  it("요약은 규칙마다 실패·경고가 있는 글 수를 센다", () => {
    const summary = summarizeLint([lintAnswer("저장을 눌러요. 설정이 바뀝니다."), lintAnswer("[설정]에서 켜요.")])
    expect(summary.n).toBe(2)
    expect(summary.rules.L9).toMatchObject({ fail: 1, warn: 0, codes: { tone_mixed: 1 } })
    expect(summary.rules.L3.fail).toBe(0)
  })
})

describe("R3 카드 꼴(V-14)과 축약 변환본 71장", () => {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests/chatbot/answer-index/fixtures/r3-compressed-cards.json"), "utf8")) as {
    cards: { id: string; role: "base" | "branch" | "clarify"; topic: string; chars: number; text: string }[]
  }

  it("변환본 71장(답 카드 68 + 되묻기 3)은 카드 꼴 오류 0, lint 실패 0이다", () => {
    expect(fixture.cards).toHaveLength(71)
    expect(fixture.cards.filter((card) => card.role === "clarify")).toHaveLength(3)
    for (const card of fixture.cards) {
      expect(cardChars(card.text), card.id).toBe(card.chars)
      expect(checkCardShape(card.text).filter((finding) => finding.level === "error"), card.id).toEqual([])
      expect(lintAnswer(card.text, { kind: "fixed" }).filter((finding) => finding.level === "fail"), card.id).toEqual([])
    }
  })

  it("되묻기 카드 3장은 선택지 2~3개·25자 이하이고 하한 경고가 없다", () => {
    for (const card of fixture.cards.filter((item) => item.role === "clarify")) {
      const options = clarifyOptionsOf(card.text)
      expect(options?.length, card.id).toBeGreaterThanOrEqual(2)
      expect(options?.length, card.id).toBeLessThanOrEqual(3)
      expect(checkCardShape(card.text).map((finding) => finding.code), card.id).not.toContain("chars_short")
    }
  })

  it("변환본은 →·「문서 제목」 꼴이라 gt 스위치에서는 화살표 판정이 뒤집힌다", () => {
    const arrowCards = fixture.cards.filter((card) => card.text.includes("→"))
    expect(arrowCards.length).toBeGreaterThan(10)
    for (const card of arrowCards) expect(rulesOf(lintAnswer(card.text, { arrow: "gt" })), card.id).toContain("L7:path_arrow")
  })

  it("꼴 한도를 넘으면 오류: 첫 줄 60·단계 줄 80·줄 120·단계 4개·300자(4단계 350자)·선택지 3개·25자", () => {
    const codes = (text: string) => checkCardShape(text).filter((finding) => finding.level === "error").map((finding) => finding.code)
    expect(codes(`${"가".repeat(61)}요.`)).toContain("first_line_60")
    expect(codes(`첫 줄이에요.\n\n1. ${"나".repeat(80)}`)).toContain("step_line_80")
    expect(codes(`첫 줄이에요.\n${"다".repeat(121)}`)).toContain("line_120")
    expect(codes(["첫 줄이에요.", "", ...Array.from({ length: 5 }, (_, at) => `${at + 1}. 눌러요.`)].join("\n"))).toContain("steps_4")
    expect(codes(`첫 줄이에요.\n${"라마바사아 ".repeat(55)}`)).toContain("chars_300")
    const four = ["첫 줄이에요.", "", ...Array.from({ length: 4 }, (_, at) => `${at + 1}. ${"자".repeat(76)}`), "", `${"차".repeat(58)}요.`].join("\n")
    expect(codes(four)).toContain("chars_350")
    expect(codes("어느 쪽인가요?\n- 하나\n- 둘\n- 셋\n- 넷")).toContain("clarify_options")
    expect(codes(`어느 쪽인가요?\n- ${"차".repeat(26)}\n- 둘`)).toContain("clarify_option_25")
    expect(checkCardShape("짧은 카드예요.").map((finding) => `${finding.level}:${finding.code}`)).toContain("warning:chars_short")
  })
})
