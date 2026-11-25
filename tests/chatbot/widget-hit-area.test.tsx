import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChatbotTeaser } from "@/components/ui/ChatbotTeaser"
import { CHATBOT_HIT_AREA_32_CLASS, CHATBOT_HIT_AREA_CLASS } from "@/components/ui/chatbot-hit-area"

// 위젯의 작은 버튼은 보이는 크기를 두고 투명한 ::before 로 누르는 영역만 44px 로 넓힌다.
// 실제 누름 영역(elementFromPoint)은 브라우저에서 확인했고, 여기서는 클래스가 빠지거나 되돌아가지 않는지 본다.

function buttonClass(html: string, ariaLabel: string): string {
  const tag = html.match(new RegExp(`<button[^>]*aria-label="${ariaLabel}"[^>]*>`))?.[0]
  if (!tag) throw new Error(`aria-label="${ariaLabel}" 버튼이 없다: ${html}`)
  const className = tag.match(/class="([^"]*)"/)?.[1]
  if (className === undefined) throw new Error(`class 가 없다: ${tag}`)
  return className
}

describe("chatbot hit area classes", () => {
  // absolute ::before 는 padding 상자 기준이라 보더 1px 버튼은 5px 를 내밀어야 보더 바깥 4px(= 44px)가 된다.
  it("보더 1px 인 36px 버튼은 padding 상자에서 5px, 보더 없는 32px 버튼은 6px 를 넓혀 44px 가 된다", () => {
    expect(CHATBOT_HIT_AREA_CLASS).toBe("relative before:absolute before:-inset-[5px]")
    expect(CHATBOT_HIT_AREA_32_CLASS).toBe("relative before:absolute before:-inset-1.5")
    expect(36 - 2 + 5 * 2).toBe(44)
    expect(32 + 6 * 2).toBe(44)
  })
})

describe("ChatbotTeaser 닫기 버튼", () => {
  const html = renderToStaticMarkup(<ChatbotTeaser text="t" onOpen={() => {}} onDismiss={() => {}} />)

  it("보이는 크기 32px 에 누르는 영역 44px, 아이콘 색은 --fg-muted 토큰이다", () => {
    const classes = buttonClass(html, "알림 닫기").split(/\s+/)
    expect(classes).toEqual(expect.arrayContaining(["h-8", "w-8", "relative", "before:absolute", "before:-inset-1.5", "text-fg-muted"]))
  })

  it("장식 전용 색 #A39E98 을 쓰지 않는다", () => {
    expect(html).not.toMatch(/#A39E98/i)
  })
})

describe("FloatingChatbot 작은 버튼", () => {
  // 위젯은 셸(FloatingChatbot.tsx)과 components/ui/chatbot/ 모듈로 나뉘어 있다. 버튼이 어느 파일로 옮겨도 함께 본다.
  const widgetFiles = [
    "components/ui/FloatingChatbot.tsx",
    ...readdirSync(join(process.cwd(), "components/ui/chatbot")).map((name) => `components/ui/chatbot/${name}`),
  ]
  const source = widgetFiles.map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n")

  it("음소거·닫기·도움됨·도움 안 됨·답변 복사에 누름 영역 클래스를 쓴다", () => {
    const uses = source.match(/^\s*CHATBOT_HIT_AREA_CLASS,?\s*$/gm) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(5)
  })

  it("32px(h-8 w-8) 버튼이 남지 않는다", () => {
    expect(source.split("h-8 w-8").length - 1).toBe(0)
  })
})
