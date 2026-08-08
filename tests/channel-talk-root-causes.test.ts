import { describe, expect, it } from "vitest"

import {
  deriveChannelRootCauseCandidates,
  deriveChannelRootCauseCandidatesForConversation,
  redactChannelTalkCaseText,
} from "@/lib/channel-talk-root-causes"
import type {
  ChannelConversationMessage,
  ChannelConversationRecord,
} from "@/lib/repositories/channel-conversations"

function message(
  id: string,
  author: ChannelConversationMessage["author"],
  text: string,
  minute: number
): ChannelConversationMessage {
  return {
    id,
    author,
    text,
    at: `2026-08-06T06:${String(minute).padStart(2, "0")}:00.000Z`,
  }
}

function conversation(
  id: string,
  transcript: ChannelConversationMessage[]
): ChannelConversationRecord {
  return {
    id,
    userChatId: id,
    state: "closed",
    tags: [],
    messageCount: transcript.length,
    firstAskedAt: transcript[0]?.at,
    lastMessageAt: transcript.at(-1)?.at,
    syncedAt: "2026-08-06T07:00:00.000Z",
    transcript,
  }
}

describe("channel talk root-cause candidates", () => {
  it("connects a customer hypothesis confirmed by an agent to the resolution and outcome", () => {
    const record = conversation("chat-replay", [
      message("m1", "customer", "학생이 1강 다시보기가 안 뜬다고 합니다. 첫 사진도 확인해 주세요.", 1),
      message("m2", "agent", "해당 학생이 수업 종료 후 코스에 가입했나요?", 2),
      message("m3", "customer", "아, 수업 후 가입된 학생들은 이전 수업을 못 보는군요.", 3),
      message("m4", "agent", "네 맞습니다.", 4),
      message(
        "m5",
        "agent",
        "관리자 대시보드에서 이전 수업 데이터 설정을 활성화하고 학생을 탈퇴 후 다시 추가해 주세요.",
        5
      ),
      message("m6", "customer", "이제 정상적으로 잘 보입니다.", 6),
    ])

    const candidates = deriveChannelRootCauseCandidatesForConversation(record)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      candidateKey: "late_joiner_replay:m1",
      ruleId: "late_joiner_replay",
      conversationId: "chat-replay",
      symptom: "학생이 1강 다시보기가 안 뜬다고 합니다. 첫 사진도 확인해 주세요.",
      actualCause: "아, 수업 후 가입된 학생들은 이전 수업을 못 보는군요.",
      causeState: "confirmed",
      outcomeStatus: "customer_confirmed_resolved",
      hasVisualEvidenceMention: true,
      occurredAt: "2026-08-06T06:01:00.000Z",
    })
    expect(candidates[0].diagnosticQuestions[0]).toBe(
      "해당 학생이 수업 종료 후 코스에 가입했나요?"
    )
    expect(candidates[0].resolution).toContain("이전 수업 데이터 설정을 활성화")
    expect(candidates[0].evidenceMessageIds).toEqual(["m1", "m3", "m4", "m5", "m6"])
    expect(candidates[0].suggestedTags).toEqual(
      expect.arrayContaining(["channel_talk_root_cause", "replay", "confirmed"])
    )
  })

  it("supports multiple independent issues in one conversation", () => {
    const record = conversation("chat-multi", [
      message("r1", "customer", "녹화가 중간에 끝났어요.", 1),
      message("r2", "agent", "교사 퇴장 후 재입장 때문에 녹화가 중단된 것으로 보입니다.", 2),
      message("r3", "agent", "교사 계정 재입장 여부를 확인해 주세요.", 3),
      message("r4", "agent", "교사 계정을 다시 입장해 수업을 이어가 주세요.", 4),
      message("s1", "customer", "추가로 대리 등록 SMS도 안 와요.", 5),
      message("s2", "agent", "현재 발송 전환 여부를 확인할 필요가 있습니다.", 6),
    ])

    const candidates = deriveChannelRootCauseCandidatesForConversation(record)

    expect(candidates.map((candidate) => candidate.ruleId)).toEqual([
      "recording_interruption",
      "sms_delivery",
    ])
    expect(candidates[0].causeState).toBe("confirmed")
    expect(candidates[0].outcomeStatus).toBe("solution_provided")
    expect(candidates[1].causeState).toBe("suspected")
    expect(candidates[1].outcomeStatus).toBe("unknown")
    expect(new Set(candidates.map((candidate) => candidate.candidateKey)).size).toBe(2)
  })

  it("keeps unresolved causes and distinguishes a failed outcome after a proposed solution", () => {
    const record = conversation("chat-unresolved", [
      message("u1", "customer", "아이폰에서 숙제가 깨져 보여요.", 1),
      message("u2", "agent", "앱을 최신 버전으로 업데이트해 주세요.", 2),
      message("u3", "customer", "업데이트했는데 아직 안 보여요.", 3),
    ])

    const [candidate] = deriveChannelRootCauseCandidatesForConversation(record)

    expect(candidate.causeState).toBe("unresolved")
    expect(candidate.actualCause).toBeNull()
    expect(candidate.outcomeStatus).toBe("still_unresolved")
    expect(candidate.resolution).toContain("업데이트")
    expect(candidate.evidenceMessageIds).toEqual(["u1", "u2", "u3"])
  })

  it("redacts PII from every derived text field", () => {
    const record = conversation("chat-pii", [
      message(
        "p1",
        "customer",
        "010-1234-5678로 로그인 인증 문자가 안 와요. user@example.com",
        1
      ),
      message("p2", "agent", "비밀번호: Secret123을 변경하고 다시 로그인해 주세요.", 2),
    ])

    const [candidate] = deriveChannelRootCauseCandidatesForConversation(record)
    const serialized = JSON.stringify(candidate)

    expect(serialized).not.toContain("010-1234-5678")
    expect(serialized).not.toContain("user@example.com")
    expect(serialized).not.toContain("Secret123")
    expect(candidate.symptom).toContain("[phone]")
    expect(candidate.symptom).toContain("[email]")
    expect(candidate.resolution).toContain("비밀번호 [redacted]")
    expect(redactChannelTalkCaseText("카드 1234 5678 9012 3456")).toContain("[payment_number]")
  })

  it("filters by since, sorts newest first, and applies a limit without writing data", () => {
    const older = conversation("older", [
      {
        id: "o1",
        author: "customer",
        text: "로그인이 안 돼요",
        at: "2026-07-01T00:00:00.000Z",
      },
    ])
    const newer = conversation("newer", [
      message("n1", "customer", "결제가 안 돼요", 10),
    ])

    expect(
      deriveChannelRootCauseCandidates([older, newer], {
        since: "2026-08-01T00:00:00.000Z",
        limit: 1,
      }).map((candidate) => candidate.conversationId)
    ).toEqual(["newer"])
  })

  it("keeps candidate keys lowercase, storage-safe, and within 120 characters", () => {
    const longUnsafeId = `Message / 고객 ${"X".repeat(180)}`
    const [candidate] = deriveChannelRootCauseCandidatesForConversation(
      conversation("기관/대화", [
        message(longUnsafeId, "customer", "로그인이 안 돼요", 1),
      ])
    )

    expect(candidate.candidateKey).toMatch(/^[a-z0-9:_-]+$/)
    expect(candidate.candidateKey.length).toBeLessThanOrEqual(120)
    expect(candidate.candidateKey.startsWith("login_access:")).toBe(true)
  })
})
