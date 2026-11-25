import { describe, expect, it } from "vitest"

import { selectInternalCsKnowledge } from "@/lib/internal-cs-chat/knowledge"
import { buildMatchHaystack, matchesKeyword } from "@/lib/internal-cs-chat/match-text"

function ids(question: string) {
  return selectInternalCsKnowledge(question).entries.map((entry) => entry.id)
}

// R19: 구어체·조사·코드 꼴이 달라도 맞는 지식에 닿아야 한다. 아래 질문은 이 시험을 위해 새로 쓴 회귀 고정 질문이다.
describe("curated knowledge matching normalization (R19 regression questions)", () => {
  it.each([
    ["56번 코드로 튕긴대요", "network-interruption-diagnostics"],
    ["코드56 뜨면서 수업에서 나가요", "network-interruption-diagnostics"],
    ["57번 에러가 뜨고 강제로 나가져요", "network-interruption-diagnostics"],
    ["수업 중에 자꾸 끊겨서 학부모님이 항의하세요", "network-interruption-diagnostics"],
    ["선생님 화면 최대화가 풀려요", "network-interruption-diagnostics"],
    ["고객이 녹화가 안 된다고 합니다", "recording-error-diagnostics"],
    ["수업 녹화가안돼요", "recording-error-diagnostics"],
    ["어제 수업 녹화본이 없다는 연락이 왔어요", "recording-error-diagnostics"],
    ["4001 에러가 떴대요", "recording-error-diagnostics"],
    ["카메라가 안 잡힌다고 하세요", "camera-network-troubleshooting"],
    ["회원가입 문자 발송 단가가 얼마예요?", "messaging-sms-cost"],
    ["엔터프라이즈 구독에 문자 몇 건 포함돼요?", "messaging-sms-inclusion"],
  ])("%s -> %s", (question, expected) => {
    expect(ids(question)).toContain(expected)
  })

  it("does not map a code number the keyword does not carry (560 is not 56)", () => {
    expect(ids("560번 코드가 뜬대요")).not.toContain("network-interruption-diagnostics")
  })

  it("keeps short ASCII keywords on word boundaries (plan is not lan)", () => {
    expect(ids("business plan review")).not.toContain("board-install-safety")
    expect(ids("LAN 선이 빠져 있어요")).toContain("board-install-safety")
  })
})

describe("matchesKeyword", () => {
  it("normalizes code forms, particles and spacing", () => {
    expect(matchesKeyword(buildMatchHaystack("56번 코드로 튕겨요", "keep"), "코드 56")).toBe(true)
    expect(matchesKeyword(buildMatchHaystack("녹화가 안 돼요", "keep"), "녹화 안 됨")).toBe(true)
    expect(matchesKeyword(buildMatchHaystack("녹화안됨", "keep"), "녹화 안 됨")).toBe(true)
    expect(matchesKeyword(buildMatchHaystack("카메라 설정", "keep"), "코드 56")).toBe(false)
  })
})
