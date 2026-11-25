import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
    findCurrentTurnStart,
    findQuestionAnchorId,
    isHandoffMeaningChip,
    latestMessageSignature,
    navigableSources,
    resolveVisibleSuggestions,
    shouldAnimateMessageLayout,
} from "@/components/ui/chatbot/message-visibility"
import {
    CHATBOT_COMPACT_MAX_REM,
    resolveChatbotViewport,
    resolveMobilePanelLayout,
} from "@/components/ui/chatbot/useChatbotViewport"
import type { ChatbotSource, ChatMessage } from "@/components/ui/chatbot/types"
import { WIDGET_HANDOFF_CHIP } from "@/lib/chatbot/widget-turn"

const source = (urlPath: string, title = "가이드"): ChatbotSource => ({
    title,
    urlPath,
    category: "docs",
    excerpt: "",
    score: 1,
})

const welcome: ChatMessage = {
    id: "welcome",
    role: "assistant",
    content: "안녕하세요",
    suggestedQuestions: ["a", "b", "c", "d", "e"],
}

describe("대화 목록 보이기(CX-12·CX-03·CX-19)", () => {
    it("지금 턴은 마지막 사용자 질문 뒤다", () => {
        expect(findCurrentTurnStart([welcome])).toBe(-1)
        expect(
            findCurrentTurnStart([
                welcome,
                { id: "u1", role: "user", content: "q1" },
                { id: "a1", role: "assistant", content: "a1" },
                { id: "u2", role: "user", content: "q2" },
                { id: "a2", role: "assistant", content: "a2" },
            ])
        ).toBe(3)
    })

    it("칩은 지금 턴의 답에만 보이고, 환영 칩은 질문 전에만 보인다", () => {
        expect(resolveVisibleSuggestions(welcome, { isCurrentTurn: true })).toEqual(["a", "b", "c", "d"])
        expect(resolveVisibleSuggestions(welcome, { isCurrentTurn: false })).toEqual([])
        const answer: ChatMessage = { id: "a1", role: "assistant", content: "x", suggestedQuestions: ["1", "2", "3", "4"] }
        expect(resolveVisibleSuggestions(answer, { isCurrentTurn: true })).toEqual(["1", "2", "3"])
        expect(resolveVisibleSuggestions(answer, { isCurrentTurn: false })).toEqual([])
        const question: ChatMessage = { id: "u", role: "user", content: "q", suggestedQuestions: ["x"] }
        expect(resolveVisibleSuggestions(question, { isCurrentTurn: true })).toEqual([])
    })

    it("상담 카드가 있는 답에서는 사람 연결 칩만 뺀다", () => {
        const answer: ChatMessage = {
            id: "a1",
            role: "assistant",
            content: "x",
            showHandoffCTA: true,
            suggestedQuestions: ["담당자 상담으로 이어주세요", "도입 상담 받고 싶어요", "상담원 연결해 주세요", "녹화본이 안 보여요"],
        }
        expect(resolveVisibleSuggestions(answer, { isCurrentTurn: true })).toEqual(["도입 상담 받고 싶어요", "녹화본이 안 보여요"])
        // 카드가 없으면 그대로 둔다(사람 연결 칩이 유일한 길일 수 있다).
        expect(resolveVisibleSuggestions({ ...answer, showHandoffCTA: false }, { isCurrentTurn: true })).toHaveLength(3)
    })

    it("사람 연결 칩을 가려낸다", () => {
        expect(isHandoffMeaningChip("담당자 상담으로 이어주세요")).toBe(true)
        expect(isHandoffMeaningChip("상담원 연결해 주세요")).toBe(true)
        expect(isHandoffMeaningChip(WIDGET_HANDOFF_CHIP)).toBe(true)
        expect(isHandoffMeaningChip("담당자가 확인해 주나요?")).toBe(false)
        expect(isHandoffMeaningChip("도입 상담 받고 싶어요")).toBe(false)
    })

    it("주소가 없는 출처는 건너뛴다", () => {
        const sources = [source("/docs/a"), source(""), { ...source("x"), urlPath: undefined as unknown as string }, source("https://classin.kr/b"), source("javascript:alert(1)")]
        expect(navigableSources(sources).map((item) => item.urlPath)).toEqual(["/docs/a", "https://classin.kr/b"])
        expect(navigableSources(undefined)).toEqual([])
    })

    it("새 답은 그 답을 낳은 질문 말풍선에 맞춘다", () => {
        const messages: ChatMessage[] = [
            welcome,
            { id: "u1", role: "user", content: "q1" },
            { id: "a1", role: "assistant", content: "a1" },
            { id: "n1", role: "assistant", content: "재촉" },
        ]
        expect(findQuestionAnchorId(messages, "a1")).toBe("u1")
        expect(findQuestionAnchorId(messages, "n1")).toBe("u1")
        expect(findQuestionAnchorId(messages, "welcome")).toBeNull()
        expect(findQuestionAnchorId(messages, "missing")).toBeNull()
    })

    it("layout 애니메이션은 최근 두 말풍선에만 켠다(CX-13)", () => {
        expect([0, 1, 2, 3, 4].map((index) => shouldAnimateMessageLayout(index, 5))).toEqual([false, false, false, true, true])
    })

    it("목록 끝 지문은 끝 말풍선이 바뀌거나 글이 늘면 달라진다", () => {
        const base: ChatMessage[] = [welcome, { id: "a", role: "assistant", content: "ab" }]
        const grown: ChatMessage[] = [welcome, { id: "a", role: "assistant", content: "abc" }]
        expect(latestMessageSignature(base)).not.toBe(latestMessageSignature(grown))
        expect(latestMessageSignature(base)).toBe(latestMessageSignature([...base]))
        expect(latestMessageSignature([])).toBe("0")
    })
})

describe("보이는 화면에 맞춘 대화창(CX-10)", () => {
    it("보통 휴대폰 화면은 compact 가 아니고 클래스 높이를 그대로 쓴다", () => {
        const viewport = resolveChatbotViewport({ innerHeight: 664, visualHeight: 664, rootFontSize: 16 })
        expect(viewport).toEqual({ height: 664, keyboardInset: 0, compact: false })
        expect(resolveMobilePanelLayout(viewport)).toEqual({ hideLauncher: false })
    })

    it("키보드가 올라오면 가려진 만큼 올리고 보이는 높이에 맞춘다", () => {
        const viewport = resolveChatbotViewport({ innerHeight: 664, visualHeight: 360, visualOffsetTop: 0, rootFontSize: 16 })
        expect(viewport).toEqual({ height: 360, keyboardInset: 304, compact: true })
        const layout = resolveMobilePanelLayout(viewport)
        expect(layout.hideLauncher).toBe(true)
        expect(layout.wrapperStyle).toMatchObject({ bottom: "304px" })
        expect(layout.panelStyle).toMatchObject({ height: "min(680px, calc(360px - 1rem))", marginBottom: 0 })
    })

    it("iOS 처럼 보이는 화면이 위로 밀려 있어도(offsetTop) 가려진 높이를 맞게 잰다", () => {
        const viewport = resolveChatbotViewport({ innerHeight: 664, visualHeight: 340, visualOffsetTop: 40 })
        expect(viewport.keyboardInset).toBe(284)
    })

    it("가로 모드·낮은 창은 compact 로 런처를 감추고 높이를 맞춘다", () => {
        const viewport = resolveChatbotViewport({ innerHeight: 342, visualHeight: 342, rootFontSize: 16 })
        expect(viewport).toEqual({ height: 342, keyboardInset: 0, compact: true })
        const layout = resolveMobilePanelLayout(viewport)
        expect(layout.hideLauncher).toBe(true)
        expect(String(layout.panelStyle?.height)).toContain("calc(342px - 1rem - env(safe-area-inset-bottom))")
    })

    it("글꼴 200%면 같은 화면도 낮은 화면으로 본다(rem 기준)", () => {
        expect(resolveChatbotViewport({ innerHeight: 640, visualHeight: 640, rootFontSize: 16 }).compact).toBe(false)
        expect(resolveChatbotViewport({ innerHeight: 640, visualHeight: 640, rootFontSize: 32 }).compact).toBe(true)
        expect(CHATBOT_COMPACT_MAX_REM * 16).toBe(544)
    })

    it("두 손가락 확대 중에는 키보드로 보지 않는다", () => {
        const viewport = resolveChatbotViewport({ innerHeight: 664, visualHeight: 300, visualOffsetTop: 200, scale: 2 })
        expect(viewport).toEqual({ height: 664, keyboardInset: 0, compact: false })
    })

    it("visualViewport 가 없으면 창 높이를 쓴다", () => {
        expect(resolveChatbotViewport({ innerHeight: 700 })).toEqual({ height: 700, keyboardInset: 0, compact: false })
    })
})

describe("위젯 셸의 모바일·접근성 배선", () => {
    const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8")
    const shell = read("components/ui/FloatingChatbot.tsx")
    const modal = read("components/ui/chatbot/useMobileChatbotModal.ts")
    const messageList = read("components/ui/chatbot/MessageList.tsx")

    it("휴대폰에서만 모달이다(aria-modal·inert·스크롤 잠금·뒤로가기)", () => {
        expect(shell).toContain('aria-modal={isModal ? "true" : "false"}')
        expect(shell).toContain("useModalBackground(isModal, rootRef)")
        expect(shell).toMatch(/useChatbotHistoryEntry\(\{\s*active: isModal,/)
        expect(modal).toContain("child.inert = true")
        expect(modal).toContain('html.style.overflow = "hidden"')
        expect(modal).toContain("target().history.pushState({ [HISTORY_STATE_KEY]: next }, \"\")")
    })

    it("링크로 떠나며 닫힐 때는 history 항목을 걷지 않는다(이동이 취소되지 않게)", () => {
        expect(shell).toContain("closedByNavigationRef.current = true")
        expect(shell).toContain("abandonHistoryEntry()")
        const closeBody = shell.match(/const closeChatbot = useCallback\(\(\) => \{([\s\S]*?)\n {4}\}, \[releaseHistoryEntry\]\)/)?.[1] ?? ""
        expect(closeBody).toContain("releaseHistoryEntry()")
    })

    it("대화 영역은 role=log 이고, 사용자 말풍선에는 화면 읽기용 화자 표시가 있다(CX-27)", () => {
        expect(shell).toContain('role="log"')
        expect(shell).toContain('aria-label="대화 내용"')
        expect(shell).toContain("overscroll-contain")
        expect(messageList).toContain('<span className="sr-only">내 질문: </span>')
    })
})
