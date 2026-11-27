import { createRef } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MessageList } from "@/components/ui/chatbot/MessageList"
import {
  findAnswerHeadBlocks,
  isAnswerHeadLabel,
  parseAnswerHeadLine,
  prepareAssistantDisplayText,
  splitAnswerBlocks,
} from "@/components/ui/chatbot/MessageText"
import type { ChatMessage } from "@/components/ui/chatbot/types"

// 복합 답 "1. 주제" 머리 줄만 굵게 그린다(answer-heads.ts). 오탐 0 이 먼저다: 카드 안 번호 단계는 머리로 잡지 않는다.
// 답 꼴의 정본은 답 색인 답 조립(번호 머리: "n. 이름" + 바로 아래 결론 줄 + "-" 단계, 물음 사이 빈 줄)과 legacy 생성 지시문의 복합 질문 줄이다.

const heads = (text: string) => findAnswerHeadBlocks(splitAnswerBlocks(text))

const RETRY = "이 내용은 따로 한 번 더 물어봐 주세요."
const NOTFOUND = "이 부분은 공개 안내에서 바로 찾지 못했어요."
const CLOSING = '더 궁금한 점은 "상담원 연결"이라고 말씀해 주시면 이어서 도와드릴게요.'

// 답 색인 번호 머리 꼴(결론 줄·점 단계·넘친 단계 안내·알림 조각·끝맺음).
const COMPOUND = [
  "1. 수업 중 학생 채팅 막기\n네, 할 수 있어요. 수업 중에 [채팅 금지] 버튼을 누르면 학생 채팅을 막을 수 있어요.\n경로: 교실 → [도구] → [채팅 금지]",
  "2. 녹화 파일 내려받기\n녹화 파일은 수업 기록에서 내려받아요.\n- [수업 기록]을 열어요.\n- [녹화]에서 파일을 골라요.\n- [내려받기]를 눌러요.",
  "이어지는 순서는 이 질문만 따로 물어봐 주세요.",
  `3. "보안 인증 있나요"\n${NOTFOUND}`,
  CLOSING,
].join("\n\n")

describe("복합 답 번호 머리 고르기", () => {
  it("번호 머리 꼴 복합 답의 머리 덩이를 순서대로 고른다(결론 줄·점 단계·알림 조각·따옴표 이름)", () => {
    expect(heads(COMPOUND)).toEqual([0, 1, 3])
    // 모든 조각이 알림이어도 번호 머리다.
    expect(heads([`1. "출석부를 엑셀로 받을 수 있나요"\n${RETRY}`, `2. "보안 인증 있나요"\n${NOTFOUND}`, CLOSING].join("\n\n"))).toEqual([0, 1])
    // 첫 단계를 결론 줄로 올린 조각, 공백 카드 관련 문장 덩이가 뒤따르는 조각.
    expect(
      heads(
        [
          "1. 가\n결론 줄이에요.\n- 코스를 열어요.\n- [설정]을 눌러요.",
          "2. 외부 출결 기기·시스템 연동\n공개 안내에는 없는 내용이에요.",
          "공개 안내에는 이런 내용이 있어요:\n교실 출결은 학원이 쓰는 출결 방식으로 따로 관리해요.",
          "3. 푸시 알림\n이 부분은 공개 안내에서 바로 찾지 못했어요.",
        ].join("\n\n")
      )
    ).toEqual([0, 1, 3])
  })

  it("legacy 생성 답처럼 앞에 리드 문단이 있거나 머리가 굵게 표시(**)돼 온 답도 고른다", () => {
    const legacy = [
      "두 가지를 나눠서 안내해 드릴게요.",
      "1. 수업 녹화 켜기\n녹화는 수업을 만들 때 설정에서 켜요.\n- [강의실 관리] → [수업 만들기]로 들어가요.",
      "2. 학생 출석 확인\n출석은 수업이 끝난 뒤 수업 기록에서 확인해요.",
    ].join("\n\n")
    expect(heads(legacy)).toEqual([1, 2])
    expect(heads(prepareAssistantDisplayText("**1. 수업 녹화 켜기**\n설정에서 켜요.\n\n**2. 출결 확인**\n수업 기록에서 봐요."))).toEqual([0, 1])
  })

  it("카드 안 번호 단계는 머리가 아니다 — 한 덩이 번호 목록, 문장 단계, 경로 단계", () => {
    // 번호 목록 한 덩이(위젯은 <ol> 로 그린다).
    expect(heads("[수업] 화면에서 바꿔요.\n\n1. [설정] → [수업] 열기\n2. [녹화]를 켜요.\n3. [저장]을 눌러요.")).toEqual([])
    // 단계마다 덧붙인 줄이 있고 빈 줄로 나뉜 문장 단계.
    expect(heads("1. 학생 앱을 설치해요.\n앱스토어에서 ClassIn 을 찾아요.\n\n2. 받은 번호로 로그인해요.\n인증코드가 문자로 와요.")).toEqual([])
    // 마침표 없이 끝나는 요체 단계·경로 단계.
    expect(heads("1. 학생 앱을 설치해요\n앱스토어에서 찾아요.\n\n2. 로그인해요\n번호로 들어와요.")).toEqual([])
    expect(heads("1. [설정] → [수업] 열기\n화면 오른쪽 위에 있어요.\n\n2. [녹화] 켜기\n바로 저장돼요.")).toEqual([])
    expect(heads("1. 설정 > 수업 열기\n오른쪽 위에 있어요.\n\n2. 녹화 켜기\n바로 저장돼요.")).toEqual([])
  })

  it("한 답 안 번호 덩이가 모두 1, 2, … 머리일 때만 고른다(번호가 건너뛰거나 단계 덩이가 섞이면 하나도 고르지 않는다)", () => {
    // 머리 하나뿐(복합 답은 둘 이상).
    expect(heads("1. 수업 녹화 켜기\n설정에서 켜요.")).toEqual([])
    // "1." 이 빠지고 "2." 만 있다.
    expect(heads("네, 담당자 상담으로 이어 드릴게요.\n\n2. 어떤 요금제\n이 내용은 따로 한 번 더 물어봐 주세요.")).toEqual([])
    // 번호가 건너뛴다.
    expect(heads("1. 녹화 켜기\n설정에서 켜요.\n\n3. 출석 확인\n기록에서 봐요.")).toEqual([])
    // 머리 줄만 있는 덩이(둘째 줄 없음)·둘째 줄이 번호 줄인 덩이.
    expect(heads("1. 녹화 켜기\n\n2. 출석 확인\n기록에서 봐요.")).toEqual([])
    expect(heads("1. 녹화 켜기\n2. 출석 확인\n\n3. 요금\n상담으로 안내해요.")).toEqual([])
    // 머리 꼴 사이에 번호 단계 목록 덩이가 섞인다.
    expect(heads("1. 녹화 켜기\n설정에서 켜요.\n\n1. [설정]을 열어요.\n2. [녹화]를 켜요.\n\n2. 출석 확인\n기록에서 봐요.")).toEqual([])
    // "1)" 꼴은 머리 꼴이 아니다.
    expect(heads("1) 녹화 켜기\n설정에서 켜요.\n\n2) 출석 확인\n기록에서 봐요.")).toEqual([])
  })

  it("FAQ 제목을 주제로 둔 카드처럼 손님 물음 꼴(부정·바람·물음·고장 상태)로 끝나는 이름은 요체여도 머리다", () => {
    for (const label of [
      "로그인이 안 되거나 인증번호가 오지 않아요",
      "교사 비활성화가 안 돼요",
      "PC·태블릿 카메라가 수업에서 안 보여요",
      "나중에 들어온 학생이 지난 수업 다시보기를 못 봐요",
      "수업 녹화가 안 됐어요 / 녹화 파일이 없어요",
      "닉네임을 바꾸고 싶어요",
      "원격 지원을 받으려면 어떻게 하나요",
      "전자칠판 터치·화면이 이상해요",
      "수업 중 끊기거나 튕기거나 화면이 멈춰요",
    ]) {
      expect(isAnswerHeadLabel(label), label).toBe(true)
    }
    // 단계 줄의 요체 끝은 여전히 머리가 아니다('들어가요'·'안내해요'는 단계에도 온다).
    for (const label of ["[설정]으로 들어가요", "학부모님께 안내해요", "[저장]을 눌러요", "받은 번호로 로그인해요", "녹화가 시작돼요"]) {
      expect(isAnswerHeadLabel(label), label).toBe(false)
    }
    expect(
      heads(
        [
          "1. 로그인이 안 되거나 인증번호가 오지 않아요\n휴대폰 번호는 맨 앞 0을 빼고 넣어 주세요.\n- 나라 번호 +82를 골라요.",
          "2. 전자칠판 유선 인터넷이 연결되지 않아요\n랜선이 꽂힌 단자부터 봐요.",
          CLOSING,
        ].join("\n\n")
      )
    ).toEqual([0, 1])
  })

  it("흐르는 동안: 머리 줄만 온 끝 덩이도 머리로 세어, 앞 머리 굵기가 꺼졌다 켜지지 않는다", () => {
    const full = "1. 카메라 연결\n전원을 확인해 주세요.\n- 랜선을 봐요\n\n2. 출석부 내려받기\n출석 화면에서 받아요.\n\n3. 요금 안내\n요금제 화면을 봐요.\n\n" + CLOSING
    const series: number[][] = []
    for (let at = 1; at <= full.length; at += 1) series.push(findAnswerHeadBlocks(splitAnswerBlocks(full.slice(0, at)), { streaming: at < full.length }))
    // 한 번 머리로 센 덩이는 끝까지 머리다.
    series.forEach((now, at) => {
      if (at > 0) for (const block of series[at - 1]) expect(now, full.slice(0, at + 1)).toContain(block)
    })
    expect(series.at(-1)).toEqual([0, 1, 2])
    // 둘째 머리 줄 첫 글자부터 앞 머리와 함께 센다. 셋째 머리가 '3. 요'까지만 와도 앞 머리는 그대로다.
    const upTo = (tail: string) => full.slice(0, full.indexOf(tail) + tail.length)
    expect(findAnswerHeadBlocks(splitAnswerBlocks(upTo("2. 출")), { streaming: true })).toEqual([0, 1])
    expect(findAnswerHeadBlocks(splitAnswerBlocks(upTo("3. 요")), { streaming: true })).toEqual([0, 1, 2])
    // 다 온 글에서는 머리 줄만 있는 덩이가 머리가 아니다(규칙 1).
    expect(findAnswerHeadBlocks(splitAnswerBlocks(upTo("3. 요")))).toEqual([])
    // 흐르는 동안에도 끝 덩이만 너그럽다: 머리 하나뿐·경로 기호·번호 건너뜀·앞 덩이가 단계면 세지 않는다.
    expect(findAnswerHeadBlocks(splitAnswerBlocks("1. 카메라 연결\n전원을 봐요.\n\n2. 출"), { streaming: true })).toEqual([0, 1])
    expect(findAnswerHeadBlocks(splitAnswerBlocks("1. 카메라 연결"), { streaming: true })).toEqual([])
    expect(findAnswerHeadBlocks(splitAnswerBlocks("1. 카메라 연결\n전원을 봐요.\n\n2. [설정] → [수"), { streaming: true })).toEqual([])
    expect(findAnswerHeadBlocks(splitAnswerBlocks("1. 카메라 연결\n전원을 봐요.\n\n3. 출"), { streaming: true })).toEqual([])
    const steps = "앱부터 설치해요.\n\n1. 학생 앱을 설치해요\n앱스토어에서 찾아요.\n\n2. 로그인해요\n번호로 들어와요."
    for (let at = 1; at <= steps.length; at += 1) {
      expect(findAnswerHeadBlocks(splitAnswerBlocks(steps.slice(0, at)), { streaming: at < steps.length }), steps.slice(0, at)).toEqual([])
    }
  })

  it("이름 규칙: 짧은 명사구만 머리 이름이다", () => {
    for (const label of ["수업 중 학생 채팅 막기", "인증코드 안 올 때", "[학생 대리 등록] 옵션이 안 보일 때", "교실마다 다 볼 필요", "AI 카메라가 하는 일 개요", "첫 번째 질문", '"출석부를 엑셀로 받을 수 있나요"', "아이디가 맞는데도 수업이 안 보일 때:"]) {
      expect(isAnswerHeadLabel(label), label).toBe(true)
    }
    for (const label of ["학생 앱을 설치해요.", "학생 앱을 설치해요", "로그인합니다", "네, 가능해요", "아래 순서대로 해 주세요:", "[설정] → [수업] 열기", "설정 -> 수업", "녹화가 되나요?", "끝까지 따라 해 보세요!", "a".repeat(31), ""]) {
      expect(isAnswerHeadLabel(label), label).toBe(false)
    }
    expect(parseAnswerHeadLine("2. 녹화 파일 내려받기")).toEqual({ n: 2, label: "녹화 파일 내려받기" })
    expect(parseAnswerHeadLine("2) 녹화 파일 내려받기")).toBeNull()
    expect(parseAnswerHeadLine("녹화 파일 내려받기")).toBeNull()
  })

  it("덩이 나누기는 위젯 그리기와 같다(빈 줄로 덩이, 줄 앞뒤 공백·빈 줄·'권장 순서:' 꼬리표 줄 뺌)", () => {
    expect(splitAnswerBlocks("  가\n  나 \n\n\n권장 순서:\n- 다\n\n")).toEqual([["가", "나"], ["- 다"]])
    expect(splitAnswerBlocks("   ")).toEqual([])
  })
})

describe("복합 답 머리 그리기", () => {
  const render = (content: string, role: ChatMessage["role"] = "assistant", isStreaming = false) =>
    renderToStaticMarkup(
      <MessageList
        messages={[
          { id: "u1", role: "user", content: "질문" },
          { id: "a1", role, content, answerEventId: "e1", sessionId: "s1" },
        ]}
        sessionId="s1"
        isSending={isStreaming}
        isStreaming={isStreaming}
        isSlow={false}
        cooldownSeconds={0}
        shouldReduceMotion
        sendQuestion={async () => {}}
        onRetry={() => {}}
        closeAfterInChatNavigation={() => {}}
        bottomRef={createRef<HTMLDivElement>()}
      />
    )

  it("머리 줄만 굵게(색·크기는 본문 그대로), 결론 줄·점 단계는 머리 없을 때와 같은 꼴로, 둘째 머리부터 위를 조금 띄운다", () => {
    const html = render(COMPOUND)
    const headLines = [...html.matchAll(/<p class="([^"]*)" data-chat-answer-head="">([^<]*)<\/p>/g)].map((match) => [match[1], match[2]])
    expect(headLines).toEqual([
      ["font-semibold", "1. 수업 중 학생 채팅 막기"],
      ["font-semibold", "2. 녹화 파일 내려받기"],
      ["font-semibold", "3. &quot;보안 인증 있나요&quot;"],
    ])
    // 첫 머리 덩이는 위 여백이 없고, 다음 머리 덩이부터 pt-1.5.
    expect(html).toContain('<div><p class="font-semibold" data-chat-answer-head="">1. ')
    expect(html).toContain('<div class="pt-1.5"><p class="font-semibold" data-chat-answer-head="">2. ')
    // 결론 줄은 굵지 않은 문단, 단계는 점 목록.
    expect(html).toContain("<p>네, 할 수 있어요. 수업 중에 [채팅 금지] 버튼을 누르면 학생 채팅을 막을 수 있어요.\n경로: 교실 → [도구] → [채팅 금지]</p>")
    expect(html).toMatch(/data-chat-answer-head="">2\. 녹화 파일 내려받기<\/p><div class="space-y-2"><p>녹화 파일은 수업 기록에서 내려받아요\.<\/p><ul/)
    // 굵기 말고 색·크기 클래스를 머리 줄에 더하지 않는다.
    expect(html).not.toMatch(/data-chat-answer-head=""[^>]*class=|class="[^"]*(?:text-|font-bold)[^"]*" data-chat-answer-head/)
  })

  it("흐르는 중 머리 줄만 온 끝 덩이는 굵게, 커서는 그 줄 끝에 둔다(빈 문단 없음)", () => {
    const partial = "1. 수업 녹화 켜기\n녹화는 설정에서 켜요.\n\n2. 학생 출"
    const html = render(partial, "assistant", true)
    expect(html).toContain('<div><p class="font-semibold" data-chat-answer-head="">1. 수업 녹화 켜기</p>')
    expect(html).toMatch(/<div class="pt-1\.5"><p class="font-semibold" data-chat-answer-head="">2\. 학생 출<span[^>]*aria-hidden="true"[^>]*><\/span><\/p><\/div>/)
    expect(html).not.toContain("<p></p>")
    // 다 온 글이면 머리 줄만 있는 덩이는 머리가 아니어서 굵게가 없다.
    expect(render(partial)).not.toContain("data-chat-answer-head")
  })

  it("번호 단계 답·사용자 글에는 머리 굵게가 없다", () => {
    const steps = render("1. 학생 앱을 설치해요.\n앱스토어에서 찾아요.\n\n2. 받은 번호로 로그인해요.\n인증코드가 와요.")
    expect(steps).not.toContain("data-chat-answer-head")
    expect(render("[수업] 화면에서 바꿔요.\n\n1. [설정] → [수업] 열기\n2. [녹화]를 켜요.")).toMatch(/<ol class="space-y-2"><li/)
    expect(render("1. 녹화 켜기\n설정에서 켜요.\n\n2. 출석 확인\n기록에서 봐요.", "user")).not.toContain("data-chat-answer-head")
  })
})
