import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import {
  CHATBOT_DESKTOP_MEDIA_QUERY,
  shouldCloseChatbotAfterLinkClick,
  type ChatLinkClick,
} from "@/components/ui/chatbot-link-navigation"

const plainLeftClick: ChatLinkClick = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
}

describe("CHATBOT_DESKTOP_MEDIA_QUERY", () => {
  it("matches the DESIGN.md mobile boundary (< 48rem) and Tailwind md", () => {
    expect(CHATBOT_DESKTOP_MEDIA_QUERY).toBe("(min-width: 48rem)")
  })
})

describe("shouldCloseChatbotAfterLinkClick", () => {
  it("closes on a plain left click on mobile", () => {
    expect(shouldCloseChatbotAfterLinkClick(plainLeftClick, false)).toBe(true)
  })

  it("keeps the dialog open on desktop", () => {
    expect(shouldCloseChatbotAfterLinkClick(plainLeftClick, true)).toBe(false)
  })

  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)(
    "keeps the dialog open when %s opens the link elsewhere",
    (key) => {
      expect(shouldCloseChatbotAfterLinkClick({ ...plainLeftClick, [key]: true }, false)).toBe(false)
    }
  )

  it("keeps the dialog open on a middle or right click", () => {
    expect(shouldCloseChatbotAfterLinkClick({ ...plainLeftClick, button: 1 }, false)).toBe(false)
    expect(shouldCloseChatbotAfterLinkClick({ ...plainLeftClick, button: 2 }, false)).toBe(false)
  })

  it("keeps the dialog open when navigation was prevented", () => {
    expect(shouldCloseChatbotAfterLinkClick({ ...plainLeftClick, defaultPrevented: true }, false)).toBe(false)
  })
})

describe("FloatingChatbot wiring", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")
  const source = read("components/ui/FloatingChatbot.tsx")
  const messageList = read("components/ui/chatbot/MessageList.tsx")

  it("passes the close-after-navigation handler to source links and the contact bridge", () => {
    expect(source).toContain("closeAfterInChatNavigation={closeAfterInChatNavigation}")
    expect(messageList).toContain("<SourceLinks sources={message.sources} onNavigate={closeAfterInChatNavigation} />")
    expect(messageList).toMatch(/<ConsultationBridge[\s\S]*?onNavigate=\{closeAfterInChatNavigation\}[\s\S]*?\/>/)
    expect(messageList).toContain("onClick={(event) => onNavigate?.(event)}")
  })

  it("decides with the desktop media query and keeps the conversation state", () => {
    const body =
      source.match(/const closeAfterInChatNavigation = useCallback\(\(click: ChatLinkClick\) => \{([\s\S]*?)\n {4}\}, \[\]\)/)?.[1] ?? ""
    expect(body).not.toBe("")
    expect(body).toContain("window.matchMedia(CHATBOT_DESKTOP_MEDIA_QUERY).matches")
    expect(body).toContain("shouldCloseChatbotAfterLinkClick(click, isDesktop)")
    expect(body).toContain("setIsOpen(false)")
    expect(body).not.toContain("setMessages")
    expect(body).not.toContain("setSessionId")
    expect(body).not.toContain("focus()")
  })
})
