import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  DEMO_ANSWER_CARD,
  DEMO_CONTACT_CARD,
  DEMO_LINKS_CARD,
} from "@/lib/admin-ai/demo-answer-fixtures"
import { buildDemoTurn, matchDemoScenario } from "@/lib/admin-ai/demo-scenarios"
import {
  contactCheckStatus,
  CONTACT_STALE_DAYS,
  isContactEmpty,
  isCustomerSafeAnswer,
} from "@/lib/admin-ai/answers"
import { copyText } from "@/lib/admin-ai/copy"
import { getLinkById } from "@/lib/admin-ai/links"
import { buildAdminAiAnnouncement } from "@/lib/admin-ai/a11y"
import {
  INITIAL_ADMIN_AI_STATE,
  reduceAdminAi,
  type AdminAiState,
} from "@/lib/admin-ai/store"
import type { AnswerCard, ContactCard, LinksCard } from "@/lib/admin-ai/types"
import {
  AnswerCardView,
  ContactCardView,
  LinksCardView,
} from "@/components/admin/ai/cards/AnswerCards"
import { AdminAiConversation } from "@/components/admin/ai/AdminAiConversation"
import { DenyCardView } from "@/components/admin/ai/cards/InfoCards"

// jsdom 이 저장소에 없다 — 정적 마크업으로 "무엇이 그려지는가"를 고정한다.
// 복사 버튼을 눌렀을 때의 동작(성공·실패 폴백)은 copyText 의 순수 시험과 브라우저 점검으로 나눠 본다.

const TARGET = { label: "시험", meta: "시험용" }
const NOW = new Date("2026-11-25T09:00:00+09:00").getTime()

const confirmedAnswer: AnswerCard = {
  title: "공개 가격 안내",
  target: TARGET,
  answer: "가격표 페이지의 요금제를 기준으로 안내합니다.",
  confidence: "confirmed",
  sources: [{ title: "가격표", where: "요금제 표", kind: "public", status: "confirmed", externalUse: true }],
}

describe("답 카드", () => {
  it("확정이고 근거가 모두 확정·외부 사용 가능이면 '고객에게 그대로 말해도 됨'", () => {
    const html = renderToStaticMarkup(<AnswerCardView card={confirmedAnswer} />)
    expect(isCustomerSafeAnswer(confirmedAnswer)).toBe(true)
    expect(html).toContain("확정")
    expect(html).toContain("고객에게 그대로 말해도 됨")
    expect(html).not.toContain("내부용 — 그대로 보내지 마세요")
    expect(html).toContain("가격표")
    expect(html).toContain("요금제 표")
    expect(html).toContain("공개 문서")
  })

  it("근거에 사내 문서·상담 사례·확인 필요가 하나라도 섞이면 고객에게 말하지 말라고 한다", () => {
    const variants: AnswerCard[] = [
      { ...confirmedAnswer, confidence: "needs-check" },
      { ...confirmedAnswer, sources: [{ ...confirmedAnswer.sources[0], externalUse: false, kind: "internal" }] },
      { ...confirmedAnswer, sources: [{ ...confirmedAnswer.sources[0], status: "needs-check" }] },
      { ...confirmedAnswer, sources: [...confirmedAnswer.sources, { title: "상담 사례 2건", kind: "consultation", status: "confirmed", externalUse: false }] },
    ]
    for (const card of variants) {
      expect(isCustomerSafeAnswer(card)).toBe(false)
      expect(renderToStaticMarkup(<AnswerCardView card={card} />)).toContain("내부용 — 그대로 보내지 마세요")
    }
  })

  it("근거가 없으면 지어내지 않고 그렇다고 말하며 고객 전달 불가다", () => {
    const card: AnswerCard = { ...confirmedAnswer, sources: [] }
    const html = renderToStaticMarkup(<AnswerCardView card={card} />)
    expect(isCustomerSafeAnswer(card)).toBe(false)
    expect(html).toContain("확인된 근거가 없습니다")
    expect(html).toContain("내부용 — 그대로 보내지 마세요")
  })

  it("고객 문안은 CS 코파일럿에서 만든다 — 하단에 코파일럿 열기", () => {
    const html = renderToStaticMarkup(<AnswerCardView card={confirmedAnswer} />)
    expect(html).toContain('href="/admin/cs-chatbot"')
    expect(html).toContain("CS 코파일럿 열기")
  })

  it("근거의 문서 열기는 링크 목록의 어드민 화면일 때만 그려진다", () => {
    const withDocs = renderToStaticMarkup(<AnswerCardView card={DEMO_ANSWER_CARD} />)
    expect(withDocs).toContain('href="/admin/docs"')
    const forged: AnswerCard = {
      ...confirmedAnswer,
      sources: [{ ...confirmedAnswer.sources[0], linkId: "https://evil.example/x" }],
    }
    const html = renderToStaticMarkup(<AnswerCardView card={forged} />)
    expect(html).not.toContain("evil.example")
    expect(html).not.toContain("문서 열기")
    // 고객용 공개 주소는 근거 줄에 붙지 않는다.
    const publicSource: AnswerCard = {
      ...confirmedAnswer,
      sources: [{ ...confirmedAnswer.sources[0], linkId: "public:pricing" }],
    }
    expect(renderToStaticMarkup(<AnswerCardView card={publicSource} />)).not.toContain("문서 열기")
  })

  it("시안 모드에서는 '시안 — 실제로 실행되지 않습니다' 띠가 붙는다", () => {
    expect(renderToStaticMarkup(<AnswerCardView card={confirmedAnswer} />)).toContain("시안 — 실제로 실행되지 않습니다")
  })
})

describe("링크 카드", () => {
  const card: LinksCard = {
    title: "링크",
    target: TARGET,
    items: [{ linkId: "public:pricing" }, { linkId: "admin:crm" }, { linkId: "admin:settings-tab-members" }],
  }

  it("고객용은 공개 주소를 보이고 '고객용 주소 복사'와 새 탭 보기를 둔다", () => {
    const html = renderToStaticMarkup(<LinksCardView card={{ ...card, items: [{ linkId: "public:pricing" }] }} />)
    const pricing = getLinkById("public:pricing")
    expect(pricing?.audience).toBe("customer")
    expect(html).toContain("고객용 · 공개 주소")
    expect(html).toContain("고객용 주소 복사")
    expect(html).toContain('href="https://classin.co.kr/pricing"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain("내부용")
  })

  it("내부용은 '열기'와 경로 복사만 있고 고객용 복사 버튼·고객용 주소가 없다", () => {
    const html = renderToStaticMarkup(<LinksCardView card={{ ...card, items: [{ linkId: "admin:crm" }] }} />)
    expect(html).toContain("내부용 · 고객에게 보내지 마세요")
    expect(html).toContain('href="/admin/crm"')
    expect(html).toContain("경로 복사")
    expect(html).not.toContain("고객용 주소 복사")
    expect(html).not.toContain("고객용 · 공개 주소")
    expect(html).not.toContain('target="_blank"')
  })

  it("필요 역할이 있는 화면은 뱃지로 알린다", () => {
    const html = renderToStaticMarkup(<LinksCardView card={{ ...card, items: [{ linkId: "admin:settings-tab-members" }] }} />)
    expect(html).toContain("필요 역할 · SUPER_ADMIN")
  })

  it("목록에 없는 id 는 그 줄을 그리지 않고 문자열 주소를 지어 그리지도 않는다", () => {
    const forged: LinksCard = {
      ...card,
      items: [
        { linkId: "https://evil.example/phish" },
        { linkId: "/admin/crm" },
        { linkId: "javascript:alert(1)" },
        { linkId: "admin:crm" },
      ],
    }
    const html = renderToStaticMarkup(<LinksCardView card={forged} />)
    expect(html).not.toContain("evil.example")
    expect(html).not.toContain("javascript:")
    expect(html.match(/<li[ >]/g)?.length).toBe(1)

    const none = renderToStaticMarkup(<LinksCardView card={{ ...card, items: [{ linkId: "nope" }] }} />)
    expect(none).toContain("목록에 있는 링크를 찾지 못했습니다")
    expect(none).not.toMatch(/<li[ >]/)
  })

  it("고객용과 내부용을 한 카드에 섞어도 줄마다 구분된다", () => {
    const html = renderToStaticMarkup(<LinksCardView card={DEMO_LINKS_CARD} />)
    expect(html).toContain("고객용 · 공개 주소")
    expect(html).toContain("내부용 · 고객에게 보내지 마세요")
    expect(html).toContain("제품 소개서")
    expect(html.match(/고객용 주소 복사/g)?.length).toBe(2)
    expect(html.match(/경로 복사/g)?.length).toBe(1)
  })
})

describe("담당자 카드", () => {
  const filled: ContactCard = {
    title: "카메라 담당",
    target: TARGET,
    primary: { role: "카메라 담당(본사)", channel: "사내 메신저 본사 지원 방" },
    backup: { role: "본사 CS 1차(본사)" },
    prepare: ["캡처", "모델명"],
    checkedAt: "2026-11-10",
  }

  it("1차·대리·준비해 갈 것·연락 채널·확인일을 그린다", () => {
    const html = renderToStaticMarkup(<ContactCardView card={filled} now={NOW} />)
    expect(html).toContain("1차")
    expect(html).toContain("카메라 담당(본사)")
    expect(html).toContain("사내 메신저 본사 지원 방")
    expect(html).toContain("대리")
    expect(html).toContain("본사 CS 1차(본사)")
    expect(html).toContain("준비해 갈 것")
    expect(html).toContain("캡처")
    expect(html).toContain("확인일")
    expect(html).toContain("2026-11-10")
    expect(html).not.toContain("확인 오래됨")
    expect(html).not.toContain("담당표 미입력")
  })

  it("확인일이 90일을 넘으면 '확인 오래됨'을 단다", () => {
    const html = renderToStaticMarkup(<ContactCardView card={{ ...filled, checkedAt: "2026-08-01" }} now={NOW} />)
    expect(html).toContain("확인 오래됨")
    expect(contactCheckStatus("2026-08-01", NOW)).toBe("stale")
  })

  it("확인일이 없으면 '확인일 미입력'을 정직하게 보인다", () => {
    const html = renderToStaticMarkup(<ContactCardView card={{ ...filled, checkedAt: undefined }} now={NOW} />)
    expect(html).toContain("확인일 미입력")
    expect(html).not.toContain("확인 오래됨")
  })

  it("담당표에 줄이 없으면 '담당표 미입력'이고 1차·대리 자리를 만들지 않는다", () => {
    const empty: ContactCard = { title: "세금계산서 담당", target: TARGET }
    expect(isContactEmpty(empty)).toBe(true)
    const html = renderToStaticMarkup(<ContactCardView card={empty} now={NOW} />)
    expect(html).toContain("담당표 미입력")
    expect(html).toContain("추측해서 사람을 알려 드리지 않습니다")
    expect(html).not.toContain(">1차<")
    expect(html).not.toContain("확인일")
  })

  it("확인일 판정 경계 — 90일 이내·초과·잘못된 값·없음", () => {
    const day = 24 * 60 * 60 * 1000
    const base = new Date("2026-08-27T00:00:00+09:00").getTime()
    expect(contactCheckStatus("2026-08-27", base + CONTACT_STALE_DAYS * day)).toBe("fresh")
    expect(contactCheckStatus("2026-08-27", base + (CONTACT_STALE_DAYS + 1) * day)).toBe("stale")
    expect(contactCheckStatus("2026/08/27", NOW)).toBe("invalid")
    expect(contactCheckStatus("2026-13-45", NOW)).toBe("invalid")
    expect(contactCheckStatus(undefined, NOW)).toBe("missing")
    expect(contactCheckStatus("2027-01-01", NOW)).toBe("fresh")
  })
})

describe("시안 자료와 시안 시나리오", () => {
  it("시안 자료에 사람 이름이 없다 — 역할 이름만", () => {
    for (const person of [DEMO_CONTACT_CARD.primary, DEMO_CONTACT_CARD.backup]) {
      expect(person).toBeTruthy()
      expect(person && "name" in person).toBe(false)
      expect(person?.role).toMatch(/\(본사\)$/)
    }
    expect(JSON.stringify(DEMO_CONTACT_CARD)).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}|@/)
  })

  it("시안 정책 답은 확정이 아니며 고객에게 그대로 말하지 말라고 한다", () => {
    expect(DEMO_ANSWER_CARD.confidence).toBe("needs-check")
    expect(isCustomerSafeAnswer(DEMO_ANSWER_CARD)).toBe(false)
    expect(DEMO_ANSWER_CARD.answer).toContain("실제 규정이 아닙니다")
  })

  it("'가격표 링크'는 링크 카드로, '카메라 담당 누구'는 담당자 카드로 간다 — 오더 카드가 아니다", () => {
    expect(matchDemoScenario("가격표 링크")).toBe("link")
    expect(matchDemoScenario("카메라 담당 누구")).toBe("who")
    expect(matchDemoScenario("견적 할인 되나")).toBe("knowledge")
    const link = buildDemoTurn("link", { now: 1, orderId: "x" })
    const who = buildDemoTurn("who", { now: 1, orderId: "x" })
    const ask = buildDemoTurn("knowledge", { now: 1, orderId: "x" })
    expect(link.order).toBeUndefined()
    expect(who.order).toBeUndefined()
    expect(ask.order).toBeUndefined()
    expect(link.blocks.map((block) => block.kind)).toEqual(["text", "links"])
    expect(who.blocks.map((block) => block.kind)).toEqual(["text", "contact"])
    expect(ask.blocks.map((block) => block.kind)).toEqual(["text", "answer"])
  })

  it("시안 링크 카드의 모든 줄이 링크 목록에서 풀린다", () => {
    for (const item of DEMO_LINKS_CARD.items) expect(getLinkById(item.linkId), item.linkId).toBeTruthy()
  })

  it("대화 화면이 세 카드를 그리고 스크린리더 알림에 카드 제목이 들어간다", () => {
    const turn = (key: "link" | "who" | "knowledge", index: number): AdminAiState =>
      [
        { type: "ask" as const, userId: `u${index}`, assistantId: `a${index}`, text: `질문 ${index}` },
        {
          type: "turn-done" as const,
          assistantId: `a${index}`,
          now: NOW,
          result: buildDemoTurn(key, { now: NOW, orderId: `o${index}` }),
        },
      ].reduce(reduceAdminAi, INITIAL_ADMIN_AI_STATE)

    const links = turn("link", 1)
    expect(renderToStaticMarkup(<AdminAiConversation state={links} />)).toContain("고객용 주소 복사")
    expect(buildAdminAiAnnouncement(links)).toContain("링크 3개")
    const who = turn("who", 2)
    expect(renderToStaticMarkup(<AdminAiConversation state={who} />)).toContain("카메라 담당(본사)")
    expect(buildAdminAiAnnouncement(who)).toContain("카메라 담당(본사)")
    const ask = turn("knowledge", 3)
    expect(renderToStaticMarkup(<AdminAiConversation state={ask} />)).toContain("내부용 — 그대로 보내지 마세요")
    expect(buildAdminAiAnnouncement(ask)).toContain("견적 할인 승인 규칙")
  })
})

describe("거절 카드의 화면 링크", () => {
  const card = {
    title: "삭제는 오더로 실행하지 않습니다",
    target: TARGET,
    text: "해당 화면에서 직접 합니다.",
    openLabel: "고객 화면 열기",
  }

  it("링크 목록에 있는 어드민 화면만 열기 버튼이 된다", () => {
    const ok = renderToStaticMarkup(<DenyCardView card={{ ...card, openHref: "/admin/crm/customers/unified" }} />)
    expect(ok).toContain('href="/admin/crm/customers/unified"')
    expect(ok).toContain("고객 화면 열기")
    for (const bad of ["https://evil.example/x", "/admin/없는-화면", "javascript:alert(1)", undefined]) {
      const html = renderToStaticMarkup(<DenyCardView card={{ ...card, openHref: bad }} />)
      expect(html, String(bad)).not.toContain("고객 화면 열기")
      expect(html, String(bad)).not.toContain("evil.example")
    }
  })

  it("시안 삭제 거절 카드는 금지 오더 표(링크 목록)의 화면으로 연다", () => {
    const turn = buildDemoTurn("delete", { now: 1, orderId: "x" })
    const block = turn.blocks.find((item) => item.kind === "deny")
    expect(block && block.kind === "deny" && block.card.openHref).toBe("/admin/crm/customers/unified")
  })
})

describe("클립보드 복사", () => {
  it("성공하면 true 이고 값을 그대로 쓴다", async () => {
    const written: string[] = []
    const ok = await copyText("https://classin.co.kr/pricing", {
      writeText: async (text) => {
        written.push(text)
      },
    })
    expect(ok).toBe(true)
    expect(written).toEqual(["https://classin.co.kr/pricing"])
  })

  it("거절·예외·클립보드 없음은 false — 화면이 주소를 직접 고르게 폴백한다", async () => {
    expect(await copyText("x", { writeText: async () => Promise.reject(new Error("denied")) })).toBe(false)
    expect(
      await copyText("x", {
        writeText: () => {
          throw new Error("sync")
        },
      })
    ).toBe(false)
    expect(await copyText("x", undefined)).toBe(false)
  })
})

describe("오더 카드 열기 링크 — 링크 목록 밖 주소는 그리지 않는다(F7)", () => {
  const base = buildDemoTurn("task", { now: NOW, orderId: "o1" }).order!
  const done = (href: string) => ({ ...base, state: "done" as const, target: { ...base.target, href } })

  it("목록 밖 주소는 열기 링크가 없다", async () => {
    const { OrderCard } = await import("@/components/admin/ai/cards/OrderCard")
    const html = renderToStaticMarkup(<OrderCard order={done("https://evil.example")} now={NOW} onAction={() => undefined} preview />)
    expect(html).not.toContain("evil.example")
  })

  it("목록에 있는 주소는 그린다", async () => {
    const { OrderCard } = await import("@/components/admin/ai/cards/OrderCard")
    const html = renderToStaticMarkup(<OrderCard order={done("/admin/crm")} now={NOW} onAction={() => undefined} preview />)
    expect(html).toContain('href="/admin/crm"')
  })
})

describe("묻기 링크 카드 — 만들기 동작 주소를 열지 않는다(F5)", () => {
  it("시안 링크 카드의 줄은 새로 만들기·action= 주소가 아니다", () => {
    for (const item of DEMO_LINKS_CARD.items) {
      const entry = getLinkById(item.linkId)
      expect(entry, item.linkId).toBeDefined()
      const href = entry && "href" in entry ? String(entry.href) : ""
      expect(href, item.linkId).not.toMatch(/action=|\/new(?:$|[?#])/)
    }
  })
})
