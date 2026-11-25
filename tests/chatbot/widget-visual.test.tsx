import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { createRef } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChatbotTeaser } from "@/components/ui/ChatbotTeaser"
import { FEEDBACK_FAILED_NOTICE, FEEDBACK_SAVED_NOTICE, MessageList } from "@/components/ui/chatbot/MessageList"
import type { ChatMessage } from "@/components/ui/chatbot/types"

// B4 시각 정리(CX-14·CX-15·CX-16·CX-25·CX-06): 챗봇 위젯이 DESIGN.md 의 공개 지면 규칙(불투명 면·토큰 색·13px 글자)을 따르는지.
// 화면 측정(배경 alpha 1·backdrop-filter none·최소 글자 13px·강제 색상 경계)은 브라우저에서 했고, 여기서는 되돌아가지 않게 막는다.

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8")
const widgetFiles = [
  "components/ui/FloatingChatbot.tsx",
  "components/ui/ChatbotTeaser.tsx",
  ...readdirSync(join(process.cwd(), "components/ui/chatbot")).map((name) => `components/ui/chatbot/${name}`),
]
// 주석은 빼고 본다(예전 모습을 설명하는 주석이 있다).
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
const sources = widgetFiles.map((file) => ({ file, text: code(file) }))

describe("챗봇 위젯 면·색·글자 규칙", () => {
  it("색 리터럴(#hex·rgba)을 쓰지 않는다 — 토큰 유틸만(CX-15)", () => {
    for (const { file, text } of sources) {
      expect(text.match(/(?<=[\s"'(:,[{])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi), file).toBeNull()
      expect(text.match(/(?:bg|text|border|shadow|from|via|to)-\[[^\]]*rgba?\(/g), file).toBeNull()
    }
  })

  it("반투명 유리·blur·그라데이션·흰/검정 팔레트 면을 쓰지 않는다(CX-14)", () => {
    for (const { file, text } of sources) {
      expect(text.match(/backdrop-(?:blur|filter)|mix-blend|drop-shadow-\[|linear-gradient|(?<![\w-])blur-(?:sm|md|lg|xl|2xl|3xl|\[)/g), file).toBeNull()
      expect(text.match(/(?<![\w-])(?:bg|text|border|ring)-(?:white|black)(?:\/|\b)/g), file).toBeNull()
    }
  })

  it("글자 크기는 토큰(13px 이상)만 쓴다 — 9~12px 리터럴·text-xs 없음(CX-16)", () => {
    for (const { file, text } of sources) {
      expect(text.match(/(?<![\w-])text-\[\d+(?:\.\d+)?px\]/g), file).toBeNull()
      expect(text.match(/(?<![\w-])text-xs(?![\w-])/g), file).toBeNull()
    }
  })

  it("휴대폰 딤은 scrim 토큰이고 패널은 불투명 paper + 1px 선 + Deep Shadow 다", () => {
    const shell = code("components/ui/FloatingChatbot.tsx")
    expect(shell).toContain("touch-none bg-surface-scrim md:hidden")
    expect(shell).toMatch(/rounded-\[26px\] border border-line-strong bg-surface-paper text-fg-ink shadow-deep/)
  })

  it("런처에 '실시간 상담 대기'처럼 읽히는 핑 점·후광이 없다(CX-06)", () => {
    const shell = code("components/ui/FloatingChatbot.tsx")
    expect(shell).not.toContain("animate-ping")
    expect(shell).not.toContain("CHATBOT_MOTION.ambient")
    expect(code("components/ui/chatbot/ChatbotHeader.tsx")).not.toMatch(/opacity: \[1, 0\.45, 1\]/)
  })

  it("입력 포커스는 테두리 위에 겹친 한 선이고, 비활성 전송은 skeleton 면이다(CX-16)", () => {
    const composer = code("components/ui/chatbot/ChatComposer.tsx")
    expect(composer).toContain("focus-within:border-fg-accent focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-fg-accent")
    expect(composer).not.toContain("outline-offset-2")
    expect(composer).toContain("disabled:bg-surface-skeleton")
    expect(composer).not.toMatch(/opacity: isSubmitBlocked/)
  })
})

describe("티저", () => {
  const html = renderToStaticMarkup(<ChatbotTeaser text="이 문서 관련해서 더 궁금한 점, 바로 물어보세요." onOpen={() => {}} onDismiss={() => {}} />)

  it("불투명 sheet 면·Deep Shadow, 글자는 13px 토큰이다", () => {
    expect(html).toContain("bg-surface-sheet")
    expect(html).toContain("shadow-deep")
    expect(html).toMatch(/class="[^"]*text-note[^"]*text-fg-body[^"]*"/)
    expect(html).not.toMatch(/backdrop-blur|text-\[12\.5px\]/)
  })
})

describe("대화 목록 그리기", () => {
  const messages: ChatMessage[] = [
    { id: "welcome", role: "assistant", content: "안녕하세요", suggestedQuestions: ["무료 체험이 있나요?"] },
    { id: "u1", role: "user", content: "요금이 궁금해요" },
    {
      id: "a1",
      role: "assistant",
      content: "문의 페이지(/contact)에서 견적을 받아요.\n\n- 세부 규격은 공식 API 문서(https://docs.eeo.cn/api/en/)를 보셔야 해요.",
      answerEventId: "e1",
      sessionId: "s1",
      sources: [{ title: "요금 안내", urlPath: "/docs", category: "docs", excerpt: "", score: 1 }],
      suggestedQuestions: ["도입 기간은 얼마나 걸려요?"],
    },
  ]
  const html = renderToStaticMarkup(
    <MessageList
      messages={messages}
      sessionId="s1"
      isSending={false}
      isStreaming={false}
      isSlow={false}
      cooldownSeconds={0}
      shouldReduceMotion
      sendQuestion={async () => {}}
      onRetry={() => {}}
      closeAfterInChatNavigation={() => {}}
      bottomRef={createRef<HTMLDivElement>()}
    />
  )

  it("피드백 버튼은 aria-pressed 를 갖고, 감사·실패 안내 영역(role=status)이 처음부터 있다(CX-25)", () => {
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="도움됨"/)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="도움 안 됨"/)
    expect(html).toMatch(/<div role="group" aria-label="이 답변이 도움이 됐나요\?"/)
    expect(html).toMatch(/<p role="status" class="text-note text-fg-muted"><\/p>/)
    expect(FEEDBACK_SAVED_NOTICE).toBe("의견 고마워요")
    expect(FEEDBACK_FAILED_NOTICE).toBe("저장하지 못했어요")
  })

  it("답 글 속 사이트 경로·외부 주소를 링크로 그리고 문장을 끊지 않는다(CX-17)", () => {
    expect(html).toContain('<a class="link-body" href="/contact">/contact</a>)에서 견적을 받아요.')
    expect(html).toContain('href="https://docs.eeo.cn/api/en/" target="_blank" rel="noopener noreferrer"')
    expect(html).toContain(")를 보셔야 해요.")
  })

  it("'추천' 표시는 알약이 아니라 점 + 글자이고, 칩·출처는 불투명 면이다(CX-16·CX-14)", () => {
    expect(html).toMatch(/<span class="status-dot" aria-hidden="true"><\/span>추천/)
    expect(html).toMatch(/<button[^>]*class="[^"]*border-line-strong bg-surface-sheet[^"]*text-label[^"]*"[^>]*><span>도입 기간은 얼마나 걸려요\?<\/span>/)
    expect(html).not.toMatch(/rounded-full bg-fg-accent px-1\.5/)
  })
})
