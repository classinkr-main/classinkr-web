import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  LinkifiedText,
  flattenAssistantMarkdownLinks,
  isSiteLinkPath,
  prepareAssistantDisplayText,
  resolveAssistantLinkHref,
  tokenizeAssistantText,
} from "@/components/ui/chatbot/MessageText"
import { sanitizeVisibleAssistantText } from "@/components/ui/chatbot/MessageList"

// CX-17: 답 글 속 사이트 경로·이 사이트 주소는 사이트 안 링크로, 외부 주소는 새 창 링크로 그린다.
// 예전에는 https 주소와 /docs 경로를 문장 중간에서 지워 'API 문서()를 보셔야 해요'·'에서 요금 안내를…'처럼 문장이 끊겼다.

const links = (text: string) =>
  tokenizeAssistantText(text).filter((token) => token.kind === "link")

describe("답 글 링크 조각 나누기", () => {
  it("괄호 안 사이트 경로를 사이트 안 링크로 만든다", () => {
    expect(tokenizeAssistantText("문의 페이지(/contact)에서 견적을 받아요")).toEqual([
      { kind: "text", text: "문의 페이지(" },
      { kind: "link", text: "/contact", href: "/contact", external: false },
      { kind: "text", text: ")에서 견적을 받아요" },
    ])
    expect(links("쇼룸 예약(/showroom)을 해 주세요")).toEqual([
      { kind: "link", text: "/showroom", href: "/showroom", external: false },
    ])
    expect(links("설치는 /docs/start/pc-install 을 보세요")[0]).toMatchObject({ href: "/docs/start/pc-install", external: false })
  })

  it("이 사이트 주소는 경로만 남겨 사이트 안 링크로, 외부 주소는 새 창 링크로 둔다", () => {
    expect(tokenizeAssistantText("https://classin.co.kr/pricing 에서 요금 안내를 보세요")).toEqual([
      { kind: "link", text: "https://classin.co.kr/pricing", href: "/pricing", external: false },
      { kind: "text", text: " 에서 요금 안내를 보세요" },
    ])
    expect(tokenizeAssistantText("공식 API 문서(https://docs.eeo.cn/api/en/)를 보셔야 해요.")).toEqual([
      { kind: "text", text: "공식 API 문서(" },
      { kind: "link", text: "https://docs.eeo.cn/api/en/", href: "https://docs.eeo.cn/api/en/", external: true },
      { kind: "text", text: ")를 보셔야 해요." },
    ])
  })

  it("마크다운 링크는 이름을 링크 글자로 쓴다", () => {
    expect(tokenizeAssistantText("설치는 [PC 설치 안내](/docs/start/pc-install)를 보세요")).toEqual([
      { kind: "text", text: "설치는 " },
      { kind: "link", text: "PC 설치 안내", href: "/docs/start/pc-install", external: false },
      { kind: "text", text: "를 보세요" },
    ])
  })

  it("주소 뒤 한글 조사·문장부호는 링크에 넣지 않는다", () => {
    expect(tokenizeAssistantText("자세한 건 /showroom.")).toEqual([
      { kind: "text", text: "자세한 건 " },
      { kind: "link", text: "/showroom", href: "/showroom", external: false },
      { kind: "text", text: "." },
    ])
    expect(links("문서는 https://docs.eeo.cn/api/en/를 보세요")[0]).toMatchObject({ text: "https://docs.eeo.cn/api/en/" })
  })

  it("공개 경로가 아니거나 낱말 한가운데의 빗금은 글자로 둔다", () => {
    for (const text of [
      "and/or 로 고르세요",
      "24/7 운영",
      "학생/학부모 계정",
      "관리 화면 /admin 은 직원용이에요",
      "/api/chatbot 은 내부 주소예요",
      "https://classin.co.kr/admin 은 직원용이에요",
      "javascript:alert(1)",
      "[눌러 보세요](javascript:alert(1))",
      "/contactless 결제",
    ]) {
      expect(links(text)).toEqual([])
    }
  })

  it("원본 이미지 주소와 계정 정보가 든 주소는 링크로 만들지 않는다", () => {
    expect(resolveAssistantLinkHref("https://cdn.example.com/a.png")).toBeNull()
    expect(resolveAssistantLinkHref("/docs/start/shot.webp")).toBeNull()
    expect(resolveAssistantLinkHref("https://user:pw@example.com/x")).toBeNull()
    expect(resolveAssistantLinkHref("https://www.classin.co.kr/download?os=win#mac")).toEqual({
      href: "/download?os=win#mac",
      external: false,
    })
  })

  it("공개 경로 목록", () => {
    expect(isSiteLinkPath("/contact")).toBe(true)
    expect(isSiteLinkPath("/docs/start/pc-install")).toBe(true)
    expect(isSiteLinkPath("/images/a.png")).toBe(false)
    expect(isSiteLinkPath("/checkout")).toBe(false)
  })
})

describe("답 글 다듬기", () => {
  it("주소·경로는 문장 중간에서 지우지 않는다(CX-17)", () => {
    expect(sanitizeVisibleAssistantText("- https://classin.co.kr/pricing 에서 요금 안내를 보세요")).toBe(
      "- https://classin.co.kr/pricing 에서 요금 안내를 보세요"
    )
    expect(sanitizeVisibleAssistantText("공식 API 문서(https://docs.eeo.cn/api/en/)를 보셔야 해요.")).toBe(
      "공식 API 문서(https://docs.eeo.cn/api/en/)를 보셔야 해요."
    )
    expect(sanitizeVisibleAssistantText("설치 문서(/docs/start/pc-install)를 보세요")).toBe("설치 문서(/docs/start/pc-install)를 보세요")
  })

  it("복사·낭독 평문은 마크다운 링크의 이름만 남긴다", () => {
    expect(sanitizeVisibleAssistantText("[PC 설치 안내](/docs/start/pc-install)를 보세요")).toBe("PC 설치 안내를 보세요")
    expect(flattenAssistantMarkdownLinks("[공식 문서](https://docs.eeo.cn/api/en/)")).toBe("공식 문서")
  })

  it("원본 이미지·내부 표지·굵게·출처 줄은 예전처럼 지운다", () => {
    const raw = [
      "화면을 보세요 ![캡처](https://cdn.example.com/a.png) 그다음",
      "그림(/images/docs/step1.png)처럼 눌러요 [image_2]",
      "**설정** 화면에서 바꿔요 https://cdn.example.com/shot.jpg",
      "출처: 내부 문서",
    ].join("\n")
    const out = prepareAssistantDisplayText(raw)
    expect(out).toBe("화면을 보세요 그다음\n그림처럼 눌러요\n설정 화면에서 바꿔요")
    expect(out).not.toMatch(/\(\s*\)/)
  })
})

describe("LinkifiedText", () => {
  it("사이트 안 링크는 본문 링크, 외부 링크는 새 창·noopener·화면 읽기 안내를 단다", () => {
    const html = renderToStaticMarkup(
      <LinkifiedText text="문의(/contact) 또는 문서(https://docs.eeo.cn/api/en/)를 보세요" />
    )
    expect(html).toMatch(/<a class="link-body" href="\/contact">\/contact<\/a>/)
    expect(html).toContain('href="https://docs.eeo.cn/api/en/" target="_blank" rel="noopener noreferrer" class="link-body"')
    expect(html).toContain('<span class="sr-only"> (새 창)</span>')
    expect(html).toContain(")를 보세요")
  })
})
