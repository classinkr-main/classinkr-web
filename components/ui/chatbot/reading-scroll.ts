// 답을 받는 동안·다시 열 때 대화 목록을 어디에 둘지 정하는 순수 함수(CX-12 읽기 흐름). DOM 을 만지지 않는다.
// 셸(FloatingChatbot)이 목록을 재어 넘기고, 돌려받은 scrollTop 과 방식만 적용한다(시험: tests/chatbot/reading-scroll.test.ts).
import { CHAT_NEAR_BOTTOM_THRESHOLD_PX } from "@/components/ui/chatbot-input-autosize"

/** 새 답을 맞출 때 기준 말풍선 위에 남기는 여백. */
export const ANSWER_SCROLL_TOP_OFFSET_PX = 12
/** 질문 말풍선이 목록 높이의 이 비율보다 길면 질문 대신 답 머리를 맞춘다(긴 질문이 답을 밀어내지 않게). */
export const QUESTION_ANCHOR_MAX_RATIO = 0.5
/** 맞춘 자리로 보는 오차. */
const ANCHOR_SLACK_PX = 2
/** '이어서 읽기'로 한 화면 내릴 때 앞 화면의 끝 줄을 이만큼 남긴다(어디까지 읽었는지 잇게). */
export const CONTINUE_READING_OVERLAP_PX = 72

/**
 * 목록을 움직이는 방식.
 * - follow: 맨 아래를 따라간다. 질문을 보낸 뒤 답 머리가 오기 전에만 쓴다(보낸 질문과 기다림 말풍선이 보이게).
 * - anchor: 새 답을 낳은 질문(긴 질문이면 답 머리)을 목록 위 12px 에 맞춘다. 셸이 목록 아래에 읽을 자리(resolveReadingRoomMinHeight)를
 *   비워 두므로 답이 짧아도 바로 맞추고 hold 로 넘어간다. 자리가 없으면 그만큼만 올리고, 자리가 생기면 맞춘다.
 * - hold: 목록을 움직이지 않는다. 답이 길어져도 답 머리는 그 자리에 있고, 사용자가 읽으며 스스로 내려간다.
 *
 * 예전에는 맞춤이 끝나면 '맨 아래 근처면 따라가기'가 다시 이겨, 답이 길어질수록 답 머리가 목록 위로 밀려 나갔다.
 * 사용자가 맨 아래 문턱(45px) 안으로 내려오거나 '새 답변'을 눌러도 따라가기로 바꾸지 않는다 — 흐르는 글 끝을 따라가 답 머리가 밀려 나갔다.
 */
export type ReadingScrollMode = "follow" | "anchor" | "hold"

export interface ReadingScrollInput {
    mode: ReadingScrollMode
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    /** anchor 대상 머리의 목록 안 위치(보이는 목록 위 끝에서 px). 대상이 아직 그려지지 않았으면 null. */
    anchorTop: number | null
    /** 답을 받는 중인지. 다 받은 렌더(끝 meta)에서는 한 번 맞추거나 따라간 뒤 hold 로 넘어간다. */
    isSending: boolean
}

export interface ReadingScrollDecision {
    /** 둘 scrollTop. null 이면 건드리지 않는다. */
    scrollTop: number | null
    /** 다음 렌더부터 쓸 방식. */
    mode: ReadingScrollMode
}

export function resolveReadingScroll(input: ReadingScrollInput): ReadingScrollDecision {
    const maxTop = Math.max(0, input.scrollHeight - input.clientHeight)
    const moveTo = (top: number, mode: ReadingScrollMode): ReadingScrollDecision => ({
        scrollTop: Math.abs(top - input.scrollTop) > 1 ? top : null,
        mode,
    })

    if (input.mode === "follow") return moveTo(maxTop, input.isSending ? "follow" : "hold")

    if (input.mode === "anchor") {
        if (input.anchorTop === null) return { scrollTop: null, mode: input.isSending ? "anchor" : "hold" }
        const desired = input.scrollTop + input.anchorTop - ANSWER_SCROLL_TOP_OFFSET_PX
        const reached = desired <= maxTop + ANCHOR_SLACK_PX
        return moveTo(Math.min(Math.max(0, Math.round(desired)), maxTop), reached || !input.isSending ? "hold" : "anchor")
    }

    return { scrollTop: null, mode: "hold" }
}

/**
 * 새 답이 생겼을 때 맞출 대상. 질문 말풍선이 목록 높이의 절반을 넘거나 질문이 없으면(위젯이 붙인 말풍선 등) 답 머리를 맞춘다.
 */
export function pickAnchorTarget(questionHeight: number | null, clientHeight: number): "question" | "answer" {
    if (questionHeight === null) return "answer"
    return questionHeight <= clientHeight * QUESTION_ANCHOR_MAX_RATIO ? "question" : "answer"
}

export interface UserScrollInput {
    mode: ReadingScrollMode
    /** 사용자가 움직인 양. 아래로 +, 위로 −. */
    delta: number
    nearBottom: boolean
    isSending: boolean
}

/**
 * 사용자가 목록을 직접 움직인 뒤의 방식. 사용자가 움직이면 맞춤(anchor)은 끝나고 그 자리를 존중한다(hold).
 * 답을 받는 중에 맨 아래 문턱(45px) 안으로 내려와도 따라가기로 바꾸지 않는다 — 예전에는 짧게 한 번 내린 것만으로 흐르는 글 끝을
 * 따라가 답 머리가 밀려 나갔다. 아래에 더 이어지는 글은 '아래로 이어서 읽기' 표시가 알린다.
 * 셸이 켠 따라가기(보낸 뒤 답 머리가 오기 전)는 맨 아래에 머무는 동안만 잇고, 조금이라도 위로 올리면 바로 멈춘다 —
 * 손가락으로 천천히 끌 때 문턱 안이라고 다시 끌려 내려가지 않게.
 */
export function resolveModeAfterUserScroll(input: UserScrollInput): ReadingScrollMode {
    if (!input.isSending || !input.nearBottom) return "hold"
    return input.mode === "follow" && input.delta >= 0 ? "follow" : "hold"
}

export interface ReadingRoomInput {
    /** 내려갈 수 있어야 하는 scrollTop(맞춘 질문 머리가 목록 위 12px 에 오는 자리). 0 이하면 자리를 두지 않는다. */
    roomTop: number
    clientHeight: number
    /** 목록의 위아래 안쪽 여백 합(scrollHeight 에 들어간다). */
    paddingY: number
}

/**
 * 목록 내용(말풍선 묶음)의 최소 높이. 짧은 답에서도 질문 머리를 목록 위 12px 에 바로 맞출 수 있게 아래에 빈 읽을 자리를 둔다.
 * 답·출처·칩·상담 카드는 이 자리 안에서 자라므로 끝 meta 가 붙어도 목록이 움직이지 않는다 — 예전에는 짧은 답이 끝날 때
 * 맞출 자리가 그제야 생겨 목록이 약 200px 미끄러져 올라갔다. 내용이 더 길면 최소 높이는 아무 일도 하지 않는다.
 * 목록 높이가 바뀌면(키보드·창 크기·입력창) 다시 잰다. null 이면 최소 높이를 지운다.
 */
export function resolveReadingRoomMinHeight(input: ReadingRoomInput): number | null {
    if (!(input.roomTop > 0) || !(input.clientHeight > 0)) return null
    return Math.max(0, Math.ceil(input.roomTop + input.clientHeight - Math.max(0, input.paddingY)))
}

export interface ContinueHintInput {
    hasUserMessages: boolean
    /** '새 답변' 버튼이 떠 있는지(둘은 같이 띄우지 않는다). */
    jumpToLatestShown: boolean
    /** 맨 아래를 따라가는 중이거나 셸이 부드럽게 옮기는 중인지('새 답변'·맞춤). 자리가 곧 바뀌므로 띄우지 않는다. */
    following: boolean
    /** 보이는 목록 아래로 더 내려갈 수 있는 px. */
    remainingBelow: number
    /** 마지막 말풍선 머리가 보이는 목록 아래 끝보다 위에 있는지 — 지금 읽는 답이 아래로 이어지는 경우만 알린다. */
    lastHeadAboveFold: boolean
}

/**
 * '아래로 이어서 읽기' 표시. 답 머리에 맞춰 둔 채 답이 길어지면 아래 글이 화면 밖에 남는데, 휴대폰은 스크롤 막대가 보이지 않아
 * 더 있는지 알기 어렵다. 지금 읽는 답이 아래로 이어질 때만 보이고, 맨 아래 문턱 안이면 숨긴다.
 */
export function shouldShowContinueHint(input: ContinueHintInput): boolean {
    return (
        input.hasUserMessages &&
        !input.jumpToLatestShown &&
        !input.following &&
        input.lastHeadAboveFold &&
        input.remainingBelow > CHAT_NEAR_BOTTOM_THRESHOLD_PX
    )
}

export interface SavedListScroll {
    top: number
    /** 그때 목록 끝의 지문(latestMessageSignature). 닫힌 동안 대화가 바뀌었는지 가른다. */
    signature: string
}

export type ReopenScrollPlan = { kind: "top" } | { kind: "restore"; top: number } | { kind: "anchor-last-question" }

/**
 * 창을 다시 열 때 목록 자리. 아직 질문이 없으면 환영 말풍선 머리부터(맨 위). 닫은 뒤 대화가 그대로면 읽던 자리로 돌아간다.
 * 닫힌 동안 대화가 바뀌었거나(받던 답이 끝남·새로고침 뒤 복원) 읽던 자리가 없으면 마지막 질문을 맞춘다 — 마지막 턴이 짧으면 맨 아래와 같다.
 */
export function resolveReopenScroll(input: {
    hasUserMessages: boolean
    saved: SavedListScroll | null
    signature: string
}): ReopenScrollPlan {
    if (!input.hasUserMessages) return { kind: "top" }
    if (input.saved && input.saved.signature === input.signature) return { kind: "restore", top: input.saved.top }
    return { kind: "anchor-last-question" }
}
