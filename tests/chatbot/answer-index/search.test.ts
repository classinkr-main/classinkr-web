import { describe, expect, it } from "vitest"

import type { AnswerIndexUnit, InventoryEntry, SiteFact } from "@/lib/chatbot/answer-index/types"
import { sentenceHash } from "@/lib/chatbot/answer-index/hash"
import { formatSearchHit, formatUnit, parseQuery, searchAnswerIndex } from "@/scripts/answer-index/lib/search-core"

// 자료 에이전트가 쓰는 전문 검색(§5.4): 결과에 출처 id·문장 번호·경로·영역이 있어야 근거를 단다.

const sentence = (i: number, text: string, flags: AnswerIndexUnit["sentences"][number]["flags"] = []) => ({ i, text, hash: sentenceHash(text), flags })

const units: AnswerIndexUnit[] = [
  {
    unitId: "doc:/docs/teacher/course-members#4",
    kind: "section",
    path: "/docs/teacher/course-members",
    docTitle: "코스 - 구성원 초대, 변경, 퇴장",
    heading: "구성원 강제 퇴장시키기",
    sectionIndex: 4,
    area: "course",
    docCategory: "teacher",
    docSlug: "course-members",
    sentences: [sentence(0, "[구성원]을 눌러 팝업을 엽니다."), sentence(1, "이름을 확인한 뒤 [멤버 삭제]를 누릅니다."), sentence(2, "아래 순서대로 따라 하시면 됩니다.", ["meta"])],
  },
  {
    unitId: "doc:/docs/student/chat#1",
    kind: "section",
    path: "/docs/student/chat",
    docTitle: "채팅으로 소통하기",
    heading: "채팅 금지",
    sectionIndex: 1,
    area: "classroom",
    docCategory: "student",
    docSlug: "chat",
    sentences: [sentence(0, "선생님이 채팅 금지를 켜면 학생은 메시지를 보낼 수 없습니다.")],
  },
]
const siteFacts: SiteFact[] = [{ id: "site:app/privacy/page.tsx:575", path: "app/privacy/page.tsx", line: 575, text: "전화: 02-6958-8566", hash: sentenceHash("전화: 02-6958-8566") }]
const inventory = [{ id: "field:member-remove", area: "course", text: "멤버 삭제는 코스 설정에서 해요.", textAlternatives: [], sourceFile: "lib/chatbot/quick-answers-field.ts", sourceLine: 10, docPath: null, textHash: "0".repeat(16) }] as unknown as InventoryEntry[]

describe("search", () => {
  it("띄어쓰기·문장부호를 무시하고, 결과에 단위 id·문장 번호·경로·영역·표시를 싣는다", () => {
    const hits = searchAnswerIndex({ units, siteFacts, inventory }, "멤버삭제")
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      source: "unit",
      id: "doc:/docs/teacher/course-members#4",
      i: 1,
      path: "/docs/teacher/course-members",
      heading: "구성원 강제 퇴장시키기",
      area: "course",
      text: "이름을 확인한 뒤 [멤버 삭제]를 누릅니다.",
      hash: sentenceHash("이름을 확인한 뒤 [멤버 삭제]를 누릅니다."),
      flags: [],
    })
    expect(formatSearchHit(hits[0])).toContain("doc:/docs/teacher/course-members#4 #1 (course)")
  })

  it("낱말은 모두 들어야 하고(--any 는 하나라도), 절 제목도 낱말로 본다", () => {
    expect(searchAnswerIndex({ units, siteFacts, inventory }, "구성원 팝업").map((hit) => hit.i)).toEqual([0])
    expect(searchAnswerIndex({ units, siteFacts, inventory }, "채팅 퇴장").length).toBe(0)
    expect(searchAnswerIndex({ units, siteFacts, inventory }, "채팅 퇴장", { mode: "any" }).length).toBeGreaterThan(0)
    // 절 제목 '강제 퇴장시키기'에 '퇴장'이 있으니 그 절 문장도 걸린다.
    expect(searchAnswerIndex({ units, siteFacts, inventory }, "퇴장 멤버").map((hit) => hit.id)).toEqual(["doc:/docs/teacher/course-members#4"])
  })

  it("공개 페이지 문장은 site id 와 파일:줄을, 정해 둔 답은 --in inventory 로만 낸다", () => {
    const site = searchAnswerIndex({ units, siteFacts, inventory }, "전화")
    expect(site[0]).toMatchObject({ source: "site", id: "site:app/privacy/page.tsx:575", path: "app/privacy/page.tsx:575" })
    expect(searchAnswerIndex({ units, siteFacts, inventory }, "코스 설정").some((hit) => hit.source === "inventory")).toBe(false)
    const fromInventory = searchAnswerIndex({ units, siteFacts, inventory }, "코스 설정", { sources: ["inventory"] })
    expect(fromInventory[0]).toMatchObject({ source: "inventory", id: "field:member-remove", path: "lib/chatbot/quick-answers-field.ts:10" })
  })

  it("영역으로 거르고, 따옴표 구를 한 낱말로 본다", () => {
    expect(searchAnswerIndex({ units, siteFacts, inventory }, "누릅니다", { area: "classroom" })).toHaveLength(0)
    expect(parseQuery('"멤버 삭제" 코스')).toEqual(["멤버삭제", "코스"])
  })

  it("단위 보기는 번호 붙은 문장과 표시·해시를 보인다", () => {
    const text = formatUnit(units[0])
    expect(text).toContain("  2. 아래 순서대로 따라 하시면 됩니다. {meta}")
    expect(text).toContain(`[${units[0].sentences[0].hash}]`)
  })
})
