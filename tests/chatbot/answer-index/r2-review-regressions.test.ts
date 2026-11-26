import { beforeAll, describe, expect, it } from "vitest"

import type { CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { decide } from "@/lib/chatbot/answer-index/decide"
import { getAnswerIndex } from "@/lib/chatbot/answer-index/load"

/**
 * R2 검토(품질-6·품질-7) 회귀 시험: 저장소 자료(data/answer-index)로 결정형 판정을 고정한다(모델·네트워크 없음, 정해 둔 답 표 없이 decide 만).
 * 문장은 이 파일에서 새로 썼다(실제 상담 글·평가 묶음 글을 옮기지 않는다).
 */

let index: CompiledAnswerIndex

beforeAll(() => {
  index = getAnswerIndex()
}, 60_000)

describe("R2 review regressions on the repository data", () => {
  it("does not answer a fragment with a card that misses the asked action (head concept guard)", () => {
    const decision = decide(index, "수강생이 코스를 나간 뒤에도 녹화본을 볼 수 있는지, 강사 계정을 탈퇴하려면 어떻게 하는지 알려 주세요")
    expect(decision.segments).toHaveLength(2)
    // 탈퇴를 묻는 조각은 아이디 형식 안내 같은 엉뚱한 카드로 답하지 않는다.
    expect(decision.segments?.[1]?.card ?? null).not.toBe("doc:/docs/start/password-change-pc#3/which-id-is-mine")
  })

  it("keeps the matching card for a fragment whose head is an object, not an action", () => {
    const decision = decide(index, "숙제 제출하고 채점하는 기능도 되나요?")
    expect(decision.segments?.[0]).toMatchObject({ kind: "answer", card: "doc:/docs/student/course-submit-activity#2/homework-submit" })
  })

  it("answers the main clause after a situation clause instead of a gap on the situation word", () => {
    expect(decide(index, "졸업 논문 준비하는 대학원생인데, 화면 공유는 어떻게 하나요?")).toMatchObject({
      kind: "answer",
      card: "doc:/docs/software/classroom-tools#2/screen-share-memo",
    })
    // 조사 + 관형형으로 꾸미는 낱말('팩스로 받은')은 그 공백 카드로 가지 않는다.
    expect(decide(index, "팩스로 받은 명단을 엑셀로 올릴 수 있나요?").card).not.toBe("gap:company/fax-post")
  })

  it("gives the topic gap answer when the question's content words are the gap card itself", () => {
    expect(decide(index, "수업 채팅 기록도 저장되나요?")).toMatchObject({ kind: "gap", card: "gap:classroom/chat-export" })
    expect(decide(index, "직원 수가 몇 명인 회사예요?")).toMatchObject({ kind: "gap", card: "gap:company/headcount-revenue" })
  })

  it("does not give a word-coverage gap answer over a card that covers the question, or on a modifier", () => {
    expect(decide(index, "집에 있는 텔레비전으로도 수업할 수 있나요").card).not.toBe("gap:classroom/tv-cast")
    expect(decide(index, "대리점 마진은 얼마예요?").card).not.toBe("gap:company/reseller")
  })
})
