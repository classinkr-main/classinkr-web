import { beforeAll, describe, expect, it } from "vitest"

import { compiledTone, convertNidaWord, toneTokenBag, toYoTone } from "@/lib/chatbot/answer-index/yo-tone"
import { lintYoConvert, sentenceTone, splitSentences, stripQuoted } from "@/scripts/answer-index/lib/style-audit-core"
import { renderCardTexts, type CardText } from "@/scripts/answer-index/lib/card-texts"

/**
 * 요체 변환(yo-tone.ts, R3 a1·규격 S7) 시험. 문장은 새로 쓴 것만 쓴다(실제 상담 글을 옮기지 않는다).
 * 지키는 것: 문장 끝 어미만 바꾼다, 인용·[ ]·영어·문장 끝이 아닌 자리는 그대로, 사전 밖 어간은 바꾸지 않고 알린다, 숫자·[ ]·영문·부정어 수 보존.
 */

const yo = (text: string) => toYoTone(text).text

describe("yo-tone: switch", () => {
  it("is yo by default and off for off/0/false/nida", () => {
    expect(compiledTone({})).toBe("yo")
    expect(compiledTone({ CHATBOT_COMPILED_TONE: "yo" })).toBe("yo")
    for (const value of ["off", "OFF", "0", "false", "nida"]) expect(compiledTone({ CHATBOT_COMPILED_TONE: value })).toBe("off")
  })
})

describe("yo-tone: conversion table (규격 S7)", () => {
  const cases: Array<[string, string]> = [
    // -합니다 · -됩니다 · -드립니다
    ["설정에서 확인합니다.", "설정에서 확인해요."],
    ["목록에 표시됩니다.", "목록에 표시돼요."],
    ["[저장]을 누르시면 됩니다.", "[저장]을 누르시면 돼요."],
    ["담당자가 연락드립니다.", "담당자가 연락드려요."],
    // -입니다: 받침으로 예요·이에요, 것입니다 → 거예요, 이-동사는 -여요
    ["체험은 무료입니다.", "체험은 무료예요."],
    ["기본값은 이 기준입니다.", "기본값은 이 기준이에요."],
    ["처음 한 번만 하면 되는 것입니다.", "처음 한 번만 하면 되는 거예요."],
    ["로그인 화면은 [관리자 페이지]입니다.", "로그인 화면은 [관리자 페이지]예요."],
    ["최대 인원은 100입니다.", "최대 인원은 100이에요."],
    ["저장 장치는 SSD입니다.", "저장 장치는 SSD예요."],
    ["시스템은 Android 11(메모리 4GB)입니다.", "시스템은 Android 11(메모리 4GB)이에요."],
    ["두께는 15mm입니다.", "두께는 15mm예요."],
    ["보드 시스템은 모두 Android 11(메모리 4GB, 저장 32GB)입니다.", "보드 시스템은 모두 Android 11(메모리 4GB, 저장 32GB)이에요."],
    ["적용 기기는 PC, Classin X입니다.", "적용 기기는 PC, Classin X예요."],
    ["불이 켜져 있으면 진행 중 입니다.", "불이 켜져 있으면 진행 중 이에요."],
    ["화면에 초록색 불이 보입니다.", "화면에 초록색 불이 보여요."],
    ["자료가 한곳에 모입니다.", "자료가 한곳에 모여요."],
    ["기록이 차례로 쌓입니다.", "기록이 차례로 쌓여요."],
    ["필요한 설명을 덧붙입니다.", "필요한 설명을 덧붙여요."],
    ["창 크기를 작게 줄입니다.", "창 크기를 작게 줄여요."],
    ["맨 아래가 한 줄입니다.", "맨 아래가 한 줄이에요."],
    ["화면 이름은 정보입니다.", "화면 이름은 정보예요."],
    ["그건 기능이 아닙니다.", "그건 기능이 아니에요."],
    // -습니다
    ["녹화본이 남아 있습니다.", "녹화본이 남아 있어요."],
    ["삭제한 자료는 되살릴 수 없습니다.", "삭제한 자료는 되살릴 수 없어요."],
    ["학생에게 알림이 가지 않습니다.", "학생에게 알림이 가지 않아요."],
    ["이미 확인했습니다.", "이미 확인했어요."],
    ["설정이 조금 어렵습니다.", "설정이 조금 어려워요."],
    ["처음에는 쉽습니다.", "처음에는 쉬워요."],
    ["녹음 파일을 듣습니다.", "녹음 파일을 들어요."],
    ["순서는 이렇습니다.", "순서는 이래요."],
    ["새로 만드는 편이 낫습니다.", "새로 만드는 편이 나아요."],
    ["학생 이름을 넣습니다.", "학생 이름을 넣어요."],
    ["버튼을 잡습니다.", "버튼을 잡아요."],
    ["선생님께 묻습니다.", "선생님께 물어요."],
    // 받침 없는 어간(사전·규칙)
    ["[확인]을 누릅니다.", "[확인]을 눌러요."],
    ["요금제를 고릅니다.", "요금제를 골라요."],
    ["화면마다 다릅니다.", "화면마다 달라요."],
    ["안내를 따릅니다.", "안내를 따라요."],
    ["메모를 씁니다.", "메모를 써요."],
    ["마이크를 끕니다.", "마이크를 꺼요."],
    ["설치가 몇 분 걸립니다.", "설치가 몇 분 걸려요."],
    ["설정 창을 엽니다.", "설정 창을 열어요."],
    ["코스를 새로 만듭니다.", "코스를 새로 만들어요."],
    ["이름이 바뀝니다.", "이름이 바뀌어요."],
    ["알림이 옵니다.", "알림이 와요."],
    ["화면을 다시 봅니다.", "화면을 다시 봐요."],
    ["권한을 줍니다.", "권한을 줘요."],
    ["학생을 반으로 나눕니다.", "학생을 반으로 나눠요."],
    ["기록이 지워집니다.", "기록이 지워져요."],
    ["오류를 고칩니다.", "오류를 고쳐요."],
    ["창이 닫힙니다.", "창이 닫혀요."],
    ["메모를 남깁니다.", "메모를 남겨요."],
    ["파일을 모읍니다.", "파일을 모아요."],
    ["벽에 브래킷을 답니다.", "벽에 브래킷을 달아요."],
    ["보호 잠금을 겁니다.", "보호 잠금을 걸어요."],
    ["곧 끝날 겁니다.", "곧 끝날 거예요."],
    ["결과를 알려 줍니다.", "결과를 알려 줘요."],
    ["파일을 보냅니다.", "파일을 보내요."],
    ["전원을 켭니다.", "전원을 켜요."],
    ["교실에 들어갑니다.", "교실에 들어가요."],
    ["수업이 끝납니다.", "수업이 끝나요."],
    // -겠습니다 · -십시오 · -바랍니다 · -습니까
    ["확인해 드리겠습니다.", "확인해 드릴게요."],
    ["다시 안내하겠습니다.", "다시 안내할게요."],
    ["미리 보면 좋겠습니다.", "미리 보면 좋겠어요."],
    ["한 번 더 확인하십시오.", "한 번 더 확인하세요."],
    ["전원을 끄지 마십시오.", "전원을 끄지 마세요."],
    ["설정을 확인하시기 바랍니다.", "설정을 확인해 주세요."],
    ["양식을 보내 주시기 바랍니다.", "양식을 보내 주세요."],
    ["[저장]을 누르시기 바랍니다.", "[저장]을 눌러 주세요."],
    ["녹화 파일이 있습니까?", "녹화 파일이 있나요?"],
    ["바로 적용됩니까?", "바로 적용되나요?"],
    ["기본값은 무엇입니까?", "기본값은 무엇인가요?"],
  ]

  it.each(cases)("%s → %s", (before, after) => {
    expect(yo(before)).toBe(after)
    expect(toYoTone(before).unconverted).toEqual([])
  })

  it("converts every sentence of a paragraph and keeps lines and list marks", () => {
    const text = "코스를 엽니다. [설정]을 누릅니다.\n\n1. 이름을 넣습니다.\n2. [저장]을 누릅니다.\n- 학생에게 알림이 갑니다."
    expect(yo(text)).toBe("코스를 열어요. [설정]을 눌러요.\n\n1. 이름을 넣어요.\n2. [저장]을 눌러요.\n- 학생에게 알림이 가요.")
    expect(toYoTone(text).changed).toBe(5)
  })
})

describe("yo-tone: what it never touches", () => {
  it("leaves screen text in quotes and brackets as it is", () => {
    expect(yo("'저장되었습니다'라는 안내가 뜹니다.")).toBe("'저장되었습니다'라는 안내가 떠요.")
    expect(yo('"다시 시도하십시오" 문구가 나옵니다.')).toBe('"다시 시도하십시오" 문구가 나와요.')
    expect(yo("「설치 안내입니다」 문서를 봅니다.")).toBe("「설치 안내입니다」 문서를 봐요.")
    expect(yo("[다음에 묻지 않습니다] 칸을 끕니다.")).toBe("[다음에 묻지 않습니다] 칸을 꺼요.")
  })

  it("leaves words that do not end a sentence, connectives and English text", () => {
    expect(yo("저장됩니다만 공유는 따로 해요.")).toBe("저장됩니다만 공유는 따로 해요.")
    expect(yo("그러니까 이 버튼을 눌러요.")).toBe("그러니까 이 버튼을 눌러요.")
    expect(yo("Click the Save button.")).toBe("Click the Save button.")
  })

  it("does not guess an unknown or two-way stem: it is left and reported (L18 경고)", () => {
    const result = toYoTone("필요한 물건은 매장에서 삽니다. 설정은 쉽습니다.")
    expect(result.text).toBe("필요한 물건은 매장에서 삽니다. 설정은 쉬워요.")
    expect(result.unconverted).toEqual(["삽니다"])
    expect(convertNidaWord("삽", "니다")).toBeNull()
    // 이르다(이르러·일러)처럼 갈래가 둘인 르 어간도 바꾸지 않는다.
    expect(convertNidaWord("이릅", "니다")).toBeNull()
    // 받침 앞 글자를 모르면(괄호 끝·소문자 영어) 이다를 고르지 않는다.
    expect(toYoTone("앱 이름은 classin입니다.").unconverted).toEqual(["입니다"])
  })

  it("keeps numbers, [ ] names, English tokens and the number of negations", () => {
    const text = "PC 버전 6.0.7에서는 [녹화]가 15분 뒤 멈추지 않습니다. 그건 오류가 아닙니다. 다시 로그인하지 마십시오."
    const result = toYoTone(text)
    expect(result.reverted).toBe(false)
    expect(result.text).toBe("PC 버전 6.0.7에서는 [녹화]가 15분 뒤 멈추지 않아요. 그건 오류가 아니에요. 다시 로그인하지 마세요.")
    expect(toneTokenBag(result.text)).toEqual(toneTokenBag(text))
  })
})

describe("yo-tone: every repository card (L9·L18)", () => {
  let cards: CardText[] = []
  beforeAll(async () => {
    cards = (await renderCardTexts({})).cards
  }, 60_000)

  it("changes only sentence endings: tokens kept, nothing reverted, and no mixed tone left outside quotes except unknown stems", () => {
    const reverted: string[] = []
    const tokenLost: string[] = []
    const mixed: string[] = []
    let unconverted = 0
    let changed = 0
    for (const card of cards) {
      // 정책 글은 렌더가 말투를 바꾸지 않는다(shapeOptionsFor). 나머지는 모두 바꾼다.
      if (card.kind === "policy" || card.policyGoverned) continue
      const result = toYoTone(card.text)
      if (result.reverted) reverted.push(card.id)
      if (JSON.stringify(toneTokenBag(result.text)) !== JSON.stringify(toneTokenBag(card.text))) tokenLost.push(card.id)
      // L18(e 점검기)은 '아닙니다 → 아니에요'를 부정어가 하나 는 것으로 센다(점검기 부정어 꼴에 '아닙'이 없다). 그 경우만 빼고 실패 0.
      const l18 = lintYoConvert(card.text, result.text).filter((finding) => finding.level === "fail" && !(finding.code === "token_negations" && card.text.includes("아닙")))
      if (l18.length > 0) tokenLost.push(`${card.id}:L18`)
      const tones = new Set(splitSentences(stripQuoted(result.text)).filter((sentence) => sentence.trim().length > 3).map(sentenceTone))
      if (tones.has("nida") && tones.has("yo") && result.unconverted.length === 0) mixed.push(card.id)
      unconverted += result.unconverted.length
      if (result.changed > 0) changed += 1
    }
    expect(reverted).toEqual([])
    expect(tokenLost).toEqual([])
    // 인용 밖 혼재가 남는 카드는 사전 밖 어간이 있는 카드뿐이다(여러 줄 인용처럼 점검기가 인용을 못 보는 것은 줄맞춤 뒤 문제라 여기선 줄 하나 인용만 쓴다).
    expect(mixed.length).toBeLessThanOrEqual(5)
    expect(unconverted).toBeLessThan(30)
    expect(changed).toBeGreaterThan(1000)
  })
})
