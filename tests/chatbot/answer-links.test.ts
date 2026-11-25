import { describe, expect, it } from "vitest"

import { extractAnswerLinks, stripAnswerAddresses } from "@/lib/chatbot/answer-links"

const answer =
    "데모와 쇼룸 방문은 홈페이지 문의 페이지(/contact)나 쇼룸 예약(/showroom)에서도 바로 신청할 수 있어요. " +
    "자세한 방법은 [PC 설치 가이드](/docs/start/pc-install)를 보세요. 도움말: https://docs.channel.io/classinkorea/ko/articles/abc."

describe("extractAnswerLinks", () => {
    it("turns addresses into labelled link buttons", () => {
        expect(extractAnswerLinks(answer)).toEqual([
            { href: "/docs/start/pc-install", label: "PC 설치 가이드", external: false },
            { href: "/contact", label: "문의하기", external: false },
            { href: "/showroom", label: "쇼룸 예약", external: false },
            { href: "https://docs.channel.io/classinkorea/ko/articles/abc", label: "도움말 문서", external: true },
        ])
    })

    it("skips links already shown as source cards and duplicates", () => {
        const links = extractAnswerLinks("문의(/contact) 또는 다시 문의(/contact). 가이드 /docs/a 참고", ["/docs/a"])
        expect(links.map((link) => link.href)).toEqual(["/contact"])
    })

    it("labels unknown hosts by domain and caps the number of buttons", () => {
        const many = "a(/contact) b(/showroom) c(/pricing) d(/faq) e(/download)"
        expect(extractAnswerLinks(many)).toHaveLength(4)
        expect(extractAnswerLinks("기사 https://www.newswire.co.kr/newsRead.php?no=1")[0].label).toBe("newswire.co.kr")
    })
})

describe("stripAnswerAddresses", () => {
    it("removes address text so only the sentence remains", () => {
        expect(stripAnswerAddresses("문의 페이지(/contact)나 쇼룸 예약(/showroom)에서 신청하세요.")).toBe(
            "문의 페이지나 쇼룸 예약에서 신청하세요."
        )
        expect(stripAnswerAddresses("자세한 내용은 (https://classin.com/kr/a) 참고하세요.")).toBe("자세한 내용은 참고하세요.")
    })

    it("hides a half-streamed address at the end", () => {
        expect(stripAnswerAddresses("문의 페이지(/conta")).toBe("문의 페이지")
        expect(stripAnswerAddresses("도움말 (https://docs.chan")).toBe("도움말")
    })
})
