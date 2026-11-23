import { describe, expect, it } from "vitest"

import { curatedTextHash } from "@/lib/chatbot/answer-index/curated"
import { collectLegacyVotes, legacyAnswerIds } from "@/lib/chatbot/answer-index/legacy-votes"
import { CURATED_MODULES_WITHOUT_RUNTIME, type CuratedModule } from "@/lib/chatbot/answer-index/types"
import { findBasicQuickAnswers } from "@/lib/chatbot/quick-answers-basics"
import { findFieldQuickAnswer } from "@/lib/chatbot/quick-answers-field"
import { buildInventory } from "@/scripts/answer-index/lib/inventory"

/**
 * KEEP 카드 대조(curated.ts)와 옛 정규식 표(legacy-votes.ts).
 * curatedTextHash 는 inventory 가 적는 textHash 와 같은 글로 만들어야 한다(V-2 와 load 가 같은 기준으로 본다).
 */

describe("curatedTextHash", () => {
  it("matches the inventory textHash for every answer callable by id (field, basics, self, symptom, guide)", async () => {
    const inventory = await buildInventory({ computeHits: false })
    const callable = inventory.entries.filter((entry) => ["field", "basics", "self", "symptom", "guide"].includes(entry.module))
    expect(callable.length).toBeGreaterThan(1000)
    const mismatched = callable.filter(
      (entry) => curatedTextHash({ module: entry.module as CuratedModule, id: entry.sourceId, textHash: "" }) !== entry.textHash
    )
    expect(mismatched.map((entry) => entry.id)).toEqual([])
  }, 120_000)

  it("returns null for svc and template answers (not callable by id at runtime) and unknown ids", () => {
    expect(curatedTextHash({ module: "svc", id: "showroom", textHash: "" })).toBeNull()
    expect(curatedTextHash({ module: "template", id: "x", textHash: "" })).toBeNull()
    expect(curatedTextHash({ module: "field", id: "no-such-answer", textHash: "" })).toBeNull()
  })

  it("every inventory answer of the modules verify V-2 rejects (CURATED_MODULES_WITHOUT_RUNTIME) is uncallable by id at runtime", async () => {
    expect([...CURATED_MODULES_WITHOUT_RUNTIME].sort()).toEqual(["svc", "template"])
    const inventory = await buildInventory({ computeHits: false })
    const uncallable = inventory.entries.filter((entry) => CURATED_MODULES_WITHOUT_RUNTIME.includes(entry.module as CuratedModule))
    expect(uncallable.length).toBeGreaterThan(0)
    const callable = uncallable.filter((entry) => curatedTextHash({ module: entry.module as CuratedModule, id: entry.sourceId, textHash: "" }) !== null)
    expect(callable.map((entry) => entry.id)).toEqual([])
  }, 120_000)
})

describe("collectLegacyVotes", () => {
  const question = "결제 취소하라는 문자 받았는데 링크 눌러도 되나요? 저는 결제한 적이 없어요"

  it("lists old answer ids the legacy matchers hit, in inventory id form", () => {
    const field = findFieldQuickAnswer(question.toLowerCase())
    const ids = legacyAnswerIds(question, { gateOriginal: "policy:academy-payment" })
    expect(ids[0]).toBe("policy:academy-payment")
    if (field) expect(ids).toContain(`field:${field.id}`)
    for (const entry of findBasicQuickAnswers("회사 대표가 누구예요?")) {
      expect(legacyAnswerIds("회사 대표가 누구예요?")).toContain(`basics:${entry.id}`)
    }
    expect(legacyAnswerIds("카메라가 안 켜져요").some((id) => id.startsWith("symptom:"))).toBe(true)
  })

  it("maps old ids to card ids through legacy-alias and drops null or unknown ones", () => {
    const ids = legacyAnswerIds("카메라가 안 켜져요")
    const symptomId = ids.find((id) => id.startsWith("symptom:"))!
    expect(collectLegacyVotes("카메라가 안 켜져요", null, { [symptomId]: "howto:camera", "field:x": null })).toEqual(["howto:camera"])
    expect(collectLegacyVotes("카메라가 안 켜져요", null, { [symptomId]: null })).toEqual([])
  })

  it("computes nothing when there is no alias table", () => {
    expect(collectLegacyVotes("카메라가 안 켜져요", null, {})).toEqual([])
  })
})
