import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  compiledShapeEnabled,
  contentSignature,
  findWidgetBreaks,
  isClosingLine,
  isEmptyLeadSentence,
  shapeAnswer,
  shapeOptionsFor,
  shapeLayout,
  unifyNotation,
} from "@/lib/chatbot/answer-index/shape"
import { findSafetyViolations } from "@/lib/chatbot/answer-index/safety-rules"

/**
 * 답 꼴 다듬기(shape.ts) 시험. 새로 쓴 문장만 쓴다(실제 상담 글을 옮기지 않는다).
 * 지키는 것: 글자·순서 불변(contentSignature), 위젯 규칙(빈 줄로 덩이, 줄이 전부 "1." 이거나 전부 "-" 일 때만 목록), 빈 리드·겹친 끝맺음만 삭제.
 * 아래 R2 시험은 R3 스위치를 모두 끈 상태(CHATBOT_COMPILED_ARROW=gt, CHATBOT_COMPILED_TONE=off, CHATBOT_COMPILED_FORM=r2)에서 R2 기대값을 바이트까지 지킨다.
 * R3 꼴(→·「문서 제목」·현행 메뉴 이름·요체)은 shape-r3.test.ts 가 본다.
 */
beforeAll(() => {
  vi.stubEnv("CHATBOT_COMPILED_ARROW", "gt")
  vi.stubEnv("CHATBOT_COMPILED_TONE", "off")
  vi.stubEnv("CHATBOT_COMPILED_FORM", "r2")
})
afterAll(() => vi.unstubAllEnvs())

describe("shape: switch", () => {
  it("is on by default and off for off/0/false", () => {
    expect(compiledShapeEnabled({})).toBe(true)
    expect(compiledShapeEnabled({ CHATBOT_COMPILED_SHAPE: "on" })).toBe(true)
    for (const value of ["off", "OFF", "0", "false"]) expect(compiledShapeEnabled({ CHATBOT_COMPILED_SHAPE: value })).toBe(false)
  })
})

describe("shape: empty lead and announce", () => {
  it("recognizes only the known empty lead sentences", () => {
    for (const sentence of [
      "이렇게 하면 돼요.",
      "아래 순서대로 따라 하시면 됩니다.",
      "두 가지 나눠서 답드릴게요.",
      "세 가지 각각 답드릴게요.",
      "두 가지 답드릴게요.",
    ])
      expect(isEmptyLeadSentence(sentence)).toBe(true)
    for (const sentence of ["네, 할 수 있어요.", "이렇게 하면 돼요, 단 한 번만 눌러요.", "녹화는 [수업 설정]에서 켜요.", "두 가지 모두 계약 내용에 따라 달라요."])
      expect(isEmptyLeadSentence(sentence)).toBe(false)
  })

  it("drops the empty lead in front of a conclusion and records it", () => {
    const result = shapeAnswer("이렇게 하면 돼요. 코스 구성원 목록에서 학생 이름을 눌러 [삭제]를 고르면 코스에서 바로 빠집니다. 삭제한 학생은 나중에 다시 초대할 수 있습니다.")
    expect(result.text).toBe("코스 구성원 목록에서 학생 이름을 눌러 [삭제]를 고르면 코스에서 바로 빠집니다.\n삭제한 학생은 나중에 다시 초대할 수 있습니다.")
    expect(result.removedLeads).toEqual(["이렇게 하면 돼요."])
    // 걷고 난 글이 짧으면 한 줄 그대로(줄 나누기는 60자 넘는 문단만).
    expect(shapeAnswer("이렇게 하면 돼요. 목록에서 눌러요. 다시 초대해요.").text).toBe("목록에서 눌러요. 다시 초대해요.")
  })

  it("keeps a lone empty lead (nothing follows) and the yes/no lead", () => {
    expect(shapeAnswer("이렇게 하면 돼요.").text).toBe("이렇게 하면 돼요.")
    expect(shapeAnswer("네, 할 수 있어요. 수업 설정에서 켭니다.").removedLeads).toEqual([])
  })

  it("drops the guide announce and starts at the first step", () => {
    const result = shapeAnswer("아래 순서대로 따라 하시면 됩니다.\n\n1. 코스에 들어갑니다.\n2. [새로 만들기]를 누릅니다.")
    expect(result.text).toBe("1. 코스에 들어갑니다.\n2. [새로 만들기]를 누릅니다.")
  })

  it("drops the 'two answers' announce before a numbered pair", () => {
    const result = shapeAnswer("두 가지 나눠서 답드릴게요.\n\n1) 설치: 앱 스토어에서 받습니다.\n\n2) 로그인: 가입한 번호로 들어갑니다.")
    expect(result.text).toBe("1. 설치: 앱 스토어에서 받습니다.\n2. 로그인: 가입한 번호로 들어갑니다.")
  })
})

describe("shape: lines and lists (widget rules)", () => {
  it("puts a blank line between a lead sentence and a numbered list so the list is not drawn raw", () => {
    const before = "아래 단계를 따라 해요.\n1. 코스를 엽니다.\n2. 저장을 누릅니다."
    expect(findWidgetBreaks(before)).toHaveLength(1)
    const after = shapeLayout(before)
    expect(after).toBe("아래 단계를 따라 해요.\n\n1. 코스를 엽니다.\n2. 저장을 누릅니다.")
    expect(findWidgetBreaks(after)).toEqual([])
  })

  it("gathers blank-line separated '1)' '2)' items into one numbered block and renumbers from 1", () => {
    expect(shapeLayout("1) 가나다 항목입니다.\n\n2) 라마바 항목입니다.\n\n3) 사아자 항목입니다.")).toBe("1. 가나다 항목입니다.\n2. 라마바 항목입니다.\n3. 사아자 항목입니다.")
    // 번호가 이어지지 않는 별도 목록은 합치지 않는다.
    expect(shapeLayout("1. 첫째입니다.\n2. 둘째입니다.\n\n설명 한 줄입니다.\n\n1. 다시 첫째입니다.\n2. 다시 둘째입니다.")).toBe(
      "1. 첫째입니다.\n2. 둘째입니다.\n\n설명 한 줄입니다.\n\n1. 다시 첫째입니다.\n2. 다시 둘째입니다."
    )
  })

  it("uses one marker kind: bullets stay '-' alone, and lose their mark (one line each) when the answer also has a numbered list", () => {
    expect(shapeLayout("확인할 것이에요.\n• 하나입니다.\n• 둘입니다.")).toBe("확인할 것이에요.\n\n- 하나입니다.\n- 둘입니다.")
    expect(shapeLayout("1. 순서 하나입니다.\n2. 순서 둘입니다.\n\n함께 확인할 것\n- 점검 하나입니다.\n- 점검 둘입니다.")).toBe(
      "1. 순서 하나입니다.\n2. 순서 둘입니다.\n\n함께 확인할 것\n점검 하나입니다.\n점검 둘입니다."
    )
    expect(shapeLayout("①첫째 조건입니다.\n② 둘째 조건입니다.")).toBe("1. 첫째 조건입니다.\n2. 둘째 조건입니다.")
  })

  it("turns a single-item numbered list into a plain sentence (the widget would draw it as '1.' anyway)", () => {
    expect(shapeLayout("앞 설명입니다.\n\n3. 홀로 남은 항목입니다.")).toBe("앞 설명입니다.\n\n홀로 남은 항목입니다.")
  })

  it("puts one sentence per line in a long paragraph and leaves short ones", () => {
    const long = "네트워크는 괜찮은데 화면이 잘리거나 깨져 보이면 컴퓨터에 부담이 큰 경우예요. 켜 둔 프로그램을 먼저 닫아요. 그래도 느리면 최신 버전으로 업데이트해요."
    expect(shapeLayout(long)).toBe(
      "네트워크는 괜찮은데 화면이 잘리거나 깨져 보이면 컴퓨터에 부담이 큰 경우예요.\n켜 둔 프로그램을 먼저 닫아요.\n그래도 느리면 최신 버전으로 업데이트해요."
    )
    expect(shapeLayout("짧아요. 둘이에요.")).toBe("짧아요. 둘이에요.")
  })

  it("does not split inside versions or decimals", () => {
    const text = "6.0.7 이후 버전은 첫 로그인 때 역할을 고르는 화면이 나오고, 메모리는 1.5배 넘게 쓰지 않아요. 그다음 홈으로 가요."
    expect(shapeLayout(text)).toBe("6.0.7 이후 버전은 첫 로그인 때 역할을 고르는 화면이 나오고, 메모리는 1.5배 넘게 쓰지 않아요.\n그다음 홈으로 가요.")
  })

  it("does not break lines inside a list item (a continuation line would break the widget list)", () => {
    const text = "1. 첫 단계에서는 [시작]을 누릅니다. 그러면 창이 열립니다. 창에서 이름을 넣고 저장까지 마칩니다.\n2. 둘째 단계입니다."
    expect(shapeLayout(text)).toBe(text)
    expect(findWidgetBreaks(shapeLayout(text))).toEqual([])
  })

  it("separates a stuck 경로 line and keeps what follows on its own line", () => {
    expect(shapeLayout("QR 코드는 앱으로 찍어요. 경로: 앱 홈 오른쪽 위 [+] > [QR 코드 스캔]")).toBe("QR 코드는 앱으로 찍어요.\n경로: 앱 홈 오른쪽 위 [+] > [QR 코드 스캔]")
    expect(shapeLayout("경로: [드라이브] > [새로 만들기] [폴더]는 안에 새 폴더를 만들어요.")).toBe("경로: [드라이브] > [새로 만들기]\n[폴더]는 안에 새 폴더를 만들어요.")
    expect(shapeLayout("경로: 관리자 대시보드 > [결제] > [통계 다운로드]")).toBe("경로: [관리자 대시보드] > [결제] > [통계 다운로드]")
  })
})

describe("shape: notation", () => {
  it("unifies quoted names, corner brackets and arrows between menu names, nothing else", () => {
    expect(unifyNotation("'수업 관리' 메뉴에서 「수업 분석」 템플릿을 고르고 [저장] → [확인]을 눌러요.")).toBe("[수업 관리] 메뉴에서 [수업 분석] 템플릿을 고르고 [저장] > [확인]을 눌러요.")
    // 일반 인용, 메뉴 뒤가 아닌 따옴표, 괄호 없는 화살표는 그대로.
    expect(unifyNotation("학생에게 '올려도 돼요?'라고 물어보세요. 시작 시간 → 마감 시간을 넣어요.")).toBe("학생에게 '올려도 돼요?'라고 물어보세요. 시작 시간 → 마감 시간을 넣어요.")
    expect(unifyNotation("**굵게** 적힌 글")).toBe("굵게 적힌 글")
  })
})

describe("shape: closing lines", () => {
  const closing = ["그래도 안 되면 담당자 상담으로 이어 드릴게요.", '궁금하시면 "상담원 연결"이라고 남겨 주세요.']

  it("recognizes short closing lines only", () => {
    for (const line of closing) expect(isClosingLine(line)).toBe(true)
    expect(isClosingLine("1. 상담 연결을 누릅니다.")).toBe(false)
    expect(isClosingLine("녹화는 [수업 설정]에서 켜요.")).toBe(false)
  })

  it("keeps the last of two closing lines at the end and records the removed one", () => {
    const result = shapeAnswer(`녹화는 [수업 설정]에서 켜요.\n\n${closing.join("\n")}`)
    expect(result.text).toBe(`녹화는 [수업 설정]에서 켜요.\n\n${closing[1]}`)
    expect(result.removedClosings).toEqual([closing[0]])
  })

  it("removes only closing-template lines: a fact line that looks like a closing stays (R2 검토 회귀-3)", () => {
    // 사실·단서가 든 상담 안내 두 줄은 둘 다 남는다.
    const facts = "해외 카드 결제는 공개 안내에 없어요. 결제 담당자가 확인해 드려야 해요.\n아래 상담 연결로 남겨 주시면 확인해 드립니다."
    expect(shapeAnswer(`요금 안내입니다.\n\n${facts}`).removedClosings).toEqual([])
    // 사실 줄 + 틀 줄이면 틀 줄만 지운다(사실 줄이 맨 끝이 아니어도).
    const mixed = shapeAnswer("녹화는 [수업 설정]에서 켜요.\n\n필요하면 녹화 예시를 담당자에게 보내 확인을 요청해 주세요.\n따라 하다 막히는 부분이 있으면 담당자 상담으로 이어 드릴게요.")
    expect(mixed.removedClosings).toEqual(["따라 하다 막히는 부분이 있으면 담당자 상담으로 이어 드릴게요."])
    expect(mixed.text).toContain("필요하면 녹화 예시를 담당자에게 보내 확인을 요청해 주세요.")
    // 사람이 쓴 글·공백 답은 끝맺음을 지우지 않는다.
    for (const kind of ["policy", "fixed", "gap"]) expect(shapeOptionsFor(kind).keepClosings).toBe(true)
    for (const kind of ["doc", "howto"]) expect(shapeOptionsFor(kind).keepClosings).toBe(false)
  })

  it("splits a lone numbered item into one sentence per line unless the text holds inline list marks (품질-14)", () => {
    const lone = shapeAnswer("1. 내가 학생으로 들어간 수업은 [수업 기록]에서 날짜를 고른 뒤 영상을 눌러 다시 봅니다. 보이지 않으면 담당 선생님께 녹화 여부를 물어봅니다.")
    expect(lone.text).toBe("내가 학생으로 들어간 수업은 [수업 기록]에서 날짜를 고른 뒤 영상을 눌러 다시 봅니다.\n보이지 않으면 담당 선생님께 녹화 여부를 물어봅니다.")
    const inline = shapeAnswer("1) 설치: 앱 스토어에서 받아 설치하고 실행해 주세요. 2) 가입: 앱을 열고 [회원 가입]을 눌러 번호로 가입해 주세요.")
    expect(findWidgetBreaks(inline.text)).toEqual([])
  })

  it("leaves a single closing line and the 'keepClosings' option alone", () => {
    expect(shapeAnswer(`설명입니다.\n\n${closing[0]}`).removedClosings).toEqual([])
    expect(shapeAnswer(`설명입니다.\n\n${closing.join("\n")}`, { keepClosings: true }).text).toContain(closing[0])
  })
})

describe("shape: character preservation", () => {
  const samples = [
    "이렇게 하면 돼요. 네트워크는 괜찮은데 화면이 잘리거나 깨져 보이면 컴퓨터에 부담이 큰 경우예요. 켜 둔 프로그램을 닫아요. 그래도 느리면 업데이트해요.",
    "아래 순서대로 따라 하시면 됩니다.\n\n1. '새 EDX 만들기' 창에서 [이름]을 입력합니다. (창 안내문: '파일을 만들어 주세요')\n2. [만들기]를 클릭합니다.\n\n함께 확인할 것\n- 3단계 주의할 점: 편집이 불가능합니다.\n- 이름과 주소 두 가지를 넣습니다.",
    "두 가지 나눠서 답드릴게요.\n\n1) 인식 여부: 공개 안내에 정리돼 있지 않아요. 모델에 따라 달라요.\n\n2) 마이크 지정: 교실 설정의 [마이크]에서 고르세요.",
    "활동은 코스에서 만들어요. 경로: 코스 > 과정 탭 > [새로 만들기] [새로 만들기]를 누르면 창이 열리고 수업, 숙제, 시험을 고를 수 있어요.\n\n궁금하시면 '상담원 연결'이라고 남겨 주세요.",
    "버전 6.0.7 이후 설치 파일(classin_win_install_6.0.5.3911_x64 (1).exe)을 받아요. 크기는 1.5GB예요. v6.0.7 기준이에요.",
  ]

  it.each(samples.map((text, at) => [at, text] as const))("sample %i keeps the same characters before and after (only the removed lead/closing differ)", (_at, text) => {
    const layout = shapeLayout(text)
    expect(contentSignature(layout)).toBe(contentSignature(text))
    const result = shapeAnswer(text)
    let expected = contentSignature(text)
    for (const removed of [...result.removedLeads, ...result.removedClosings]) expected = expected.replace(contentSignature(removed), "")
    expect(contentSignature(result.text)).toBe(expected)
    expect(findWidgetBreaks(result.text)).toEqual([])
  })

  it("never introduces a safety violation the original did not have", () => {
    for (const text of samples) {
      const before = new Set(findSafetyViolations(text).map((rule) => rule.key))
      for (const rule of findSafetyViolations(shapeAnswer(text).text)) expect(before.has(rule.key)).toBe(true)
    }
    // 원문이 이미 가진 위반(금액 숫자)은 다듬었다고 되돌리지 않는다.
    const priced = "이렇게 하면 돼요. 한 달에 12,000원이에요. 정확한 금액은 상담에서 확인해요."
    const result = shapeAnswer(priced)
    expect(result.reverted).toBe(false)
    expect(result.text.startsWith("한 달에 12,000원이에요.")).toBe(true)
  })
})

describe("shape: widget break finder", () => {
  it("flags number lines mixed with other lines but not lead + bullets", () => {
    expect(findWidgetBreaks("설명입니다.\n1. 하나\n2. 둘")).toHaveLength(1)
    expect(findWidgetBreaks("1. 하나\n2. 둘\n맺음 문장입니다.")).toHaveLength(1)
    expect(findWidgetBreaks("설명입니다.\n- 하나\n- 둘")).toEqual([])
    expect(findWidgetBreaks("- 하나\n- 둘\n맺음 문장입니다.")).toHaveLength(1)
    expect(findWidgetBreaks("1. 하나\n2. 둘\n\n설명입니다.")).toEqual([])
  })
})
