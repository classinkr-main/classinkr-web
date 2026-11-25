import { describe, expect, it } from "vitest"

import {
    buildConsultationDraft,
    buildHandoffProfile,
    hasRedactedPlaceholder,
    isContentfulQuestion,
    alignHandoffButtonMention,
    redactHandoffText,
    redactSelfIdentifiedNames,
    selectConsultationSegment,
} from "@/components/ui/chatbot/consultation-draft"
import type { ChatMessage } from "@/components/ui/chatbot/types"

// 상담 연결 카드의 요약·채널톡 프로필(챗봇 점검 CX-03). 예시 대화는 점검 재현(conversation/handoff-long.json)의 흐름을 따라 이 시험을 위해 지었다.

const welcome: ChatMessage = { id: "welcome", role: "assistant", content: "안녕하세요. 무엇이든 물어보세요." }

function user(id: string, content: string): ChatMessage {
    return { id, role: "user", content }
}

function answer(id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
    return { id, role: "assistant", content, answerMode: "direct_answer", ...extra }
}

const cameraConversation: ChatMessage[] = [
    welcome,
    user("u1", "카메라가 안 켜져요"),
    answer("a1", "카메라 권한을 먼저 확인해 주세요."),
    user("u2", "해 봤는데 또 안 돼요"),
    answer("a2", "다른 앱이 카메라를 쓰고 있는지도 확인해 주세요."),
    user("u3", "상담원 연결해 주세요"),
    answer("a3", "담당자 상담으로 이어 드릴게요.\n1. 기기 이름\n2. 증상이 처음 생긴 날", {
        answerMode: "handoff",
        needsHandoff: true,
        showHandoffCTA: true,
        handoffIntent: "support",
    }),
]
const firstCard = cameraConversation[6]

describe("상담 요약 구간", () => {
    it("카드를 띄운 답까지만 쓰고, 앞서 물은 내용으로 실제 문제를 남긴다", () => {
        const draft = buildConsultationDraft(cameraConversation, firstCard)
        expect(draft).toContain("질문: 상담원 연결해 주세요")
        expect(draft).toContain("앞서 물은 내용:\n- 카메라가 안 켜져요\n- 해 봤는데 또 안 돼요")
        expect(draft).toContain("카메라")
    })

    it("다음 턴이 와도 앞 카드의 요약은 그대로다", () => {
        const before = buildConsultationDraft(cameraConversation, firstCard)
        const later = [
            ...cameraConversation,
            user("u4", "환불은 어떻게 해요?"),
            answer("a4", "결제 담당자가 확인해 드려요.", { showHandoffCTA: true, needsHandoff: true, handoffIntent: "support" }),
        ]
        expect(buildConsultationDraft(later, firstCard)).toBe(before)
        // 새 카드는 새 질문을 쓴다.
        const secondDraft = buildConsultationDraft(later, later[8])
        expect(secondDraft).toContain("질문: 환불은 어떻게 해요?")
        expect(secondDraft).toContain("- 카메라가 안 켜져요")
    })

    it("앞서 물은 내용은 내용 있는 질문 최대 3개, 맞장구·상담 연결 요청·중복은 뺀다", () => {
        const messages: ChatMessage[] = [
            welcome,
            user("u1", "녹화본은 어디서 받아요?"),
            answer("a1", "관리자 페이지에서 받을 수 있어요."),
            user("u2", "네"),
            answer("a2", "더 궁금한 점이 있으면 알려 주세요."),
            user("u3", "학생 계정 추가는요?"),
            answer("a3", "기관 관리자에서 추가해요."),
            user("u4", "녹화본은 어디서 받아요?"),
            answer("a4", "관리자 페이지에서 받을 수 있어요."),
            user("u5", "담당자 연결 부탁드려요"),
            answer("a5", "상담 연결해 드릴게요."),
            user("u6", "결제 영수증도 필요해요"),
            answer("a6", "결제 담당자가 확인해요."),
            user("u7", "수업 시간표는 어디서 바꿔요?"),
            answer("a7", "담당자에게 이어 드릴게요.", { showHandoffCTA: true, handoffIntent: "support" }),
        ]
        const draft = buildConsultationDraft(messages, messages[14])
        expect(draft).toContain("질문: 수업 시간표는 어디서 바꿔요?")
        // 같은 질문은 한 번만, 마지막으로 물은 자리에 둔다(오래된 것부터).
        expect(draft).toContain(
            "앞서 물은 내용:\n- 학생 계정 추가는요?\n- 녹화본은 어디서 받아요?\n- 결제 영수증도 필요해요"
        )
        expect(draft).not.toContain("- 네")
        expect(draft).not.toContain("- 담당자 연결 부탁드려요")
    })

    it("답 글의 줄바꿈을 유지한다(한 문단으로 뭉치지 않는다)", () => {
        const messages: ChatMessage[] = [
            welcome,
            user("u1", "전자칠판 화면이 안 나와요"),
            answer("a1", "**먼저 확인해 주세요**\n1. 전원 케이블\n2. 입력 소스\n그래도 안 나오면 아래 [실시간 상담 연결]로 알려 주세요.", {
                showHandoffCTA: true,
                needsHandoff: true,
                handoffIntent: "support",
            }),
        ]
        const draft = buildConsultationDraft(messages, messages[2])
        expect(draft).toContain(
            "챗봇 확인 내용:\n먼저 확인해 주세요\n1. 전원 케이블\n2. 입력 소스\n그래도 안 나오면 아래 [상담 연결]로 알려 주세요."
        )
    })

    it("카드를 띄운 답이 상담 연결 고정 문구면, 그 앞에서 실제로 안내한 답을 싣는다", () => {
        const draft = buildConsultationDraft(cameraConversation, firstCard)
        expect(draft).toContain("챗봇 확인 내용:\n다른 앱이 카메라를 쓰고 있는지도 확인해 주세요.")
        expect(draft).not.toContain("실시간")
    })

    it("실제로 안내한 답이 없으면 '챗봇 확인 내용' 줄을 뺀다", () => {
        const messages: ChatMessage[] = [
            welcome,
            user("u1", "상담원 연결해 주세요"),
            answer("a1", "네, 담당자 상담으로 이어 드릴게요. 아래 [실시간 상담 연결]을 눌러 주세요.", {
                answerMode: "handoff",
                showHandoffCTA: true,
            }),
        ]
        const draft = buildConsultationDraft(messages, messages[2])
        expect(draft).not.toContain("챗봇 확인 내용")
        expect(draft).toContain("질문: 상담원 연결해 주세요")
    })

    it("환영 인사와 오류 말풍선은 구간에서 뺀다", () => {
        const messages: ChatMessage[] = [
            welcome,
            user("u1", "카메라가 안 켜져요"),
            { id: "e1", role: "assistant", content: "인터넷 연결이 끊긴 것 같아요.", errorKind: "network" },
            answer("a1", "담당자에게 이어 드릴게요.", { showHandoffCTA: true }),
        ]
        const segment = selectConsultationSegment(messages, messages[3])
        expect(segment.map((message) => message.id)).toEqual(["u1", "a1"])
    })
})

describe("요약·프로필의 연락처·이름 가림", () => {
    const leak: ChatMessage[] = [
        welcome,
        user("u1", "연락처 010-2345-6789 남겨요. 학생 김민준 계정 비밀번호를 잊어버렸어요. 상담원 연결해 주세요"),
        answer("a1", "담당자 상담으로 이어 드릴게요.", { answerMode: "handoff", showHandoffCTA: true, handoffIntent: "support" }),
    ]

    it("요약에서 전화번호·이메일·이름을 가린다", () => {
        const draft = buildConsultationDraft(leak, leak[2])
        expect(draft).not.toContain("010-2345-6789")
        expect(draft).not.toContain("김민준")
        expect(draft).toContain("연락처 [전화번호] 남겨요. 학생 [이름] 계정 비밀번호를 잊어버렸어요.")
        expect(hasRedactedPlaceholder(draft)).toBe(true)
    })

    it("채널톡 프로필의 마지막 질문과 대화록도 가린다", () => {
        const profile = buildHandoffProfile(leak, leak[2], "session-1")
        expect(String(profile.lastQuestion)).not.toContain("010-2345-6789")
        expect(String(profile.lastQuestion)).not.toContain("김민준")
        expect(String(profile.chatbotTranscript)).not.toContain("010-2345-6789")
        expect(String(profile.chatbotTranscript)).toContain("고객: 연락처 [전화번호] 남겨요.")
        expect(profile.chatbotSessionId).toBe("session-1")
    })

    it("가림은 한 곳(HANDOFF_REDACT_CUSTOMER_PII·redact 옵션)에서 끌 수 있다", () => {
        const draft = buildConsultationDraft(leak, leak[2], { redact: false })
        expect(draft).toContain("010-2345-6789")
        expect(hasRedactedPlaceholder(draft)).toBe(false)
    })

    it("이메일을 가린다", () => {
        expect(redactHandoffText("메일은 kim@example.com 이에요")).toBe("메일은 [이메일] 이에요")
    })

    it("스스로 밝힌 이름을 가린다", () => {
        expect(redactSelfIdentifiedNames("제 이름은 홍길동이에요")).toBe("제 이름은 [이름]이에요")
        expect(redactSelfIdentifiedNames("성함: 박서연")).toBe("성함: [이름]")
        expect(redactSelfIdentifiedNames("저는 김민준입니다")).toBe("저는 [이름]입니다")
        expect(redactSelfIdentifiedNames("우리 반 이수민님이 못 들어와요")).toBe("우리 반 [이름]님이 못 들어와요")
        expect(redactSelfIdentifiedNames("학생 최지우 아이디가 막혔어요")).toBe("학생 [이름] 아이디가 막혔어요")
    })

    it("이름이 아닌 흔한 말은 가리지 않는다", () => {
        const untouched = [
            "이름이 변경이 안 돼요",
            "이름이 전부 깨져요",
            "이름은 어떻게 바꿔요?",
            "이름이 이상하게 나와요.",
            "저는 원장입니다",
            "저는 정회원이에요",
            "학생 전체가 못 들어와요",
            "학생 정보 계정 연결",
            "선생님 강의실 아이디가 뭐예요",
            "신청자님 확인 부탁드려요",
            "고객님 문의입니다",
            "아이 한명이 안 들어와요",
        ]
        for (const sentence of untouched) {
            expect(redactSelfIdentifiedNames(sentence)).toBe(sentence)
        }
    })
})

describe("내용 있는 질문", () => {
    it("맞장구와 상담 연결만 청하는 말은 내용이 없다", () => {
        for (const text of ["네", "알겠어요", "ㅇㅇ", "?", "상담원 연결해 주세요", "사람이랑 얘기하고 싶어요", "담당자에게 바로 물어보기"]) {
            expect(isContentfulQuestion(text)).toBe(false)
        }
    })

    it("상담 요청 속 문제는 내용으로 본다", () => {
        for (const text of ["카메라 안 켜져서 상담원 연결해주세요", "결제 상담 받고 싶어요", "카메라가 안 켜져요"]) {
            expect(isContentfulQuestion(text)).toBe(true)
        }
    })
})

describe("가린 뒤 자른다 · 챗봇 줄도 가린다", () => {
    it("자르는 경계에 걸친 전화번호·이메일이 반쯤 남지 않는다", () => {
        const phoneAtEdge = `${"가".repeat(190)} 010-1234-5678 로 연락 주세요`
        const draft = buildConsultationDraft([user("u1", phoneAtEdge), answer("a1", "확인했어요.")], answer("a1", "확인했어요."))
        expect(draft).not.toMatch(/010-1234|010-123/)

        const longPhone = `${"나".repeat(292)} 01012345678`
        const profile = buildHandoffProfile([user("u1", longPhone), answer("a1", "확인했어요.")], answer("a1", "확인했어요."))
        expect(profile.lastQuestion).not.toContain("010123")
        expect(profile.chatbotTranscript).not.toContain("010123")

        const emailAtEdge = `${"다".repeat(185)} parent.name@school.kr`
        const emailProfile = buildHandoffProfile([user("u1", emailAtEdge), answer("a1", "확인했어요.")], answer("a1", "확인했어요."))
        expect(emailProfile.lastQuestion).not.toContain("parent.name@")
        expect(emailProfile.chatbotTranscript).not.toContain("parent.name@")
        const emailDraft = buildConsultationDraft([user("u1", emailAtEdge), answer("a1", "확인했어요.")], answer("a1", "확인했어요."))
        expect(emailDraft).not.toContain("parent.name@")
    })

    it("챗봇이 고객 글을 되읊은 줄의 이름·연락처도 프로필 대화록과 요약에서 가린다", () => {
        const echo = answer("a1", "함께 물어보신 '제 이름은 홍길동이고 번호는 010-1234-5678'는 이 답에 담지 못했어요. 카메라 권한을 확인해 주세요.")
        const messages = [user("u1", "제 이름은 홍길동이고 번호는 010-1234-5678 카메라가 안 켜져요"), echo]
        const profile = buildHandoffProfile(messages, echo)
        expect(profile.chatbotTranscript).toContain("챗봇:")
        expect(profile.chatbotTranscript).not.toContain("홍길동")
        expect(profile.chatbotTranscript).not.toContain("010-1234-5678")
        const draft = buildConsultationDraft(messages, echo)
        expect(draft).toContain("챗봇 확인 내용")
        expect(draft).not.toContain("홍길동")
        expect(draft).not.toContain("010-1234-5678")
    })

    it("답 글의 버튼 이름을 화면의 실제 버튼 이름에 맞춘다", () => {
        const text = "아래 [실시간 상담 연결]을 누르시면 상담원이 이어서 확인해요."
        expect(alignHandoffButtonMention(text, "채팅으로 상담 남기기")).toBe("아래 [채팅으로 상담 남기기]을 누르시면 상담원이 이어서 확인해요.")
        expect(alignHandoffButtonMention(text, "실시간 상담 연결")).toBe(text)
    })
})
