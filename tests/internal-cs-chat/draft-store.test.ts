import { describe, expect, it } from "vitest"

import {
  createDraftStore,
  DRAFT_STORE_KEY,
  DRAFT_TTL_MS,
  draftHasContent,
  emptyDraft,
  NEW_DRAFT_KEY,
  reconcileReviewTarget,
} from "@/components/admin/cs-chat/draft-store"
import { reviewApprovalState } from "@/components/admin/cs-chat/ops-desk"

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

describe("draft-store (대화별 작업 초안)", () => {
  it("대화마다 입력·최종 답·메모·체크를 따로 담는다", () => {
    const storage = memoryStorage()
    const store = createDraftStore({ getStorage: () => storage })
    store.set("c3", { ...emptyDraft(), composer: "C3 질문", finalDraft: "C3 최종", attachmentNames: ["a.png"] })
    store.set("c2", { ...emptyDraft(), reviewNote: "C2 메모", checks: { customer: true, evidence: false, externalScope: false, warnings: false } })

    expect(store.get("c3").composer).toBe("C3 질문")
    expect(store.get("c3").attachmentNames).toEqual(["a.png"])
    expect(store.get("c2").composer).toBe("")
    expect(store.get("c2").reviewNote).toBe("C2 메모")
    expect(store.get("c2").checks.customer).toBe(true)
    // 다른 탭(새 인스턴스)이 같은 저장소를 읽어도 대화별로 나뉘어 복원된다.
    const reopened = createDraftStore({ getStorage: () => storage })
    expect(reopened.get("c3").finalDraft).toBe("C3 최종")
    expect(reopened.get("c2").composer).toBe("")
  })

  it("값이 모두 비면 그 대화의 칸을 지운다", () => {
    const storage = memoryStorage()
    const store = createDraftStore({ getStorage: () => storage })
    store.set("c1", { ...emptyDraft(), composer: "글" })
    expect(storage.data.has(DRAFT_STORE_KEY)).toBe(true)
    store.set("c1", emptyDraft())
    expect(storage.data.has(DRAFT_STORE_KEY)).toBe(false)
    expect(draftHasContent(store.get("c1"))).toBe(false)
  })

  it("마지막 활동 12시간 뒤에는 모든 초안이 만료된다", () => {
    const storage = memoryStorage()
    let now = 1_000_000
    const store = createDraftStore({ getStorage: () => storage, now: () => now })
    store.set("c1", { ...emptyDraft(), composer: "남은 글" })
    now += DRAFT_TTL_MS - 1000
    expect(store.get("c1").composer).toBe("남은 글")
    // 활동이 있으면 만료가 밀린다.
    store.set("c1", { ...emptyDraft(), composer: "남은 글 2" })
    now += DRAFT_TTL_MS + 1
    expect(store.get("c1").composer).toBe("")
    // 새 탭이 만료된 저장소를 읽으면 비우고 시작한다.
    const reopened = createDraftStore({ getStorage: () => storage, now: () => now })
    expect(reopened.get("c1").composer).toBe("")
  })

  it("깨진 JSON·옛 버전·엉뚱한 모양은 빈 저장소로 시작한다", () => {
    for (const raw of ["{not json", JSON.stringify({ v: 99, savedAt: Date.now(), byConversation: {} }), "null", "[]", JSON.stringify({ v: 1 })]) {
      const store = createDraftStore({ getStorage: () => memoryStorage({ [DRAFT_STORE_KEY]: raw }) })
      expect(store.get("c1")).toEqual(emptyDraft())
      expect(store.anyContent()).toBe(false)
    }
  })

  it("저장된 값이 일부 깨져 있어도 안전한 모양으로 읽는다", () => {
    const raw = JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      byConversation: { c1: { composer: 7, attachmentNames: ["a.png", 3], finalDraft: "ok", checks: { customer: "yes" } } },
    })
    const store = createDraftStore({ getStorage: () => memoryStorage({ [DRAFT_STORE_KEY]: raw }) })
    const draft = store.get("c1")
    expect(draft.composer).toBe("")
    expect(draft.attachmentNames).toEqual(["a.png"])
    expect(draft.finalDraft).toBe("ok")
    expect(draft.checks.customer).toBe(false)
  })

  it("저장소 접근이 막혀도(throw) 메모리로 동작한다", () => {
    const blocked = {
      getItem: () => { throw new Error("denied") },
      setItem: () => { throw new Error("denied") },
      removeItem: () => { throw new Error("denied") },
    }
    const store = createDraftStore({ getStorage: () => blocked })
    expect(() => store.set("c1", { ...emptyDraft(), composer: "막힌 저장소" })).not.toThrow()
    expect(store.get("c1").composer).toBe("막힌 저장소")
    expect(store.anyContent()).toBe(true)
    expect(() => store.remove("c1")).not.toThrow()
    expect(store.get("c1").composer).toBe("")
  })

  it("저장소 자체를 못 얻어도(null·접근 예외) 동작한다", () => {
    for (const getStorage of [() => null, () => { throw new Error("no storage") }]) {
      const store = createDraftStore({ getStorage: getStorage as () => null })
      store.set(NEW_DRAFT_KEY, { ...emptyDraft(), composer: "새 화면 글" })
      expect(store.get(NEW_DRAFT_KEY).composer).toBe("새 화면 글")
    }
  })

  it("첨부는 이름만 저장한다(바이트·File 은 담지 않는다)", () => {
    const storage = memoryStorage()
    const store = createDraftStore({ getStorage: () => storage })
    store.set("c1", { ...emptyDraft(), attachmentNames: ["screen.png"] })
    const raw = storage.data.get(DRAFT_STORE_KEY) ?? ""
    expect(raw).toContain("screen.png")
    expect(raw).not.toContain("data:")
  })

  it("맥락 비우기 대기 표시는 대화별로 남는다", () => {
    const store = createDraftStore({ getStorage: () => memoryStorage() })
    store.set("c1", { ...emptyDraft(), resetPending: true })
    expect(store.get("c1").resetPending).toBe(true)
    expect(store.get("c2").resetPending).toBe(false)
  })
})

// 검토(동작-1): 새 질문·Pro 재검토로 검토 대기 초안이 A → B 로 바뀌면 A 를 보고 켠 체크로 B 를 승인할 수 없어야 한다.
describe("reconcileReviewTarget (검토 대기 초안이 바뀔 때)", () => {
  const ticked = { customer: true, evidence: true, externalScope: true, warnings: true }

  it("초안 A 에서 켠 체크는 새 대기 초안 B 에서 비워지고 승인 버튼이 꺼진다", () => {
    const draftA = { reviewTargetId: "msg-a", finalDraft: "A 를 보고 쓴 고객용 답입니다.", reviewNote: "A 메모", checks: ticked }
    expect(reviewApprovalState({ checks: draftA.checks, warningCount: 0, hasPending: true, finalDraft: draftA.finalDraft, original: "A 원문" }).canApprove).toBe(true)

    const next = reconcileReviewTarget(draftA, "msg-b")
    expect(next.changed).toBe(true)
    expect(next.reviewTargetId).toBe("msg-b")
    expect(next.reviewNote).toBe("")
    expect(next.carriedFinalDraft).toBe(true)
    expect(reviewApprovalState({ checks: next.checks, warningCount: 0, hasPending: true, finalDraft: draftA.finalDraft, original: "B 원문" }).canApprove).toBe(false)
  })

  it("같은 대기 초안이면(같은 대화 다시 불러오기) 아무것도 바꾸지 않는다", () => {
    const draft = { reviewTargetId: "msg-a", finalDraft: "쓰던 글", reviewNote: "메모", checks: ticked }
    const same = reconcileReviewTarget(draft, "msg-a")
    expect(same.changed).toBe(false)
    expect(same.checks).toBe(ticked)
    expect(same.reviewNote).toBe("메모")
  })

  it("처음 보는 대기 초안이거나 대기 초안이 사라지면 체크를 비우되 이어 쓴 글 안내는 띄우지 않는다", () => {
    expect(reconcileReviewTarget({ reviewTargetId: null, finalDraft: "", reviewNote: "", checks: ticked }, "msg-a")).toMatchObject({ changed: true, carriedFinalDraft: false })
    expect(reconcileReviewTarget({ reviewTargetId: "msg-a", finalDraft: "글", reviewNote: "", checks: ticked }, null)).toMatchObject({ changed: true, carriedFinalDraft: false, reviewTargetId: null })
  })

  it("검토 대상 id 를 저장소에 담고, 깨진 값은 null 로 읽는다", () => {
    const store = createDraftStore({ getStorage: () => null })
    store.set("c1", { ...emptyDraft(), finalDraft: "글", reviewTargetId: "msg-a" })
    expect(store.get("c1").reviewTargetId).toBe("msg-a")
    const broken = memoryStorage({
      [DRAFT_STORE_KEY]: JSON.stringify({ v: 1, savedAt: Date.now(), byConversation: { c2: { finalDraft: "x", reviewTargetId: 42 } } }),
    })
    expect(createDraftStore({ getStorage: () => broken }).get("c2").reviewTargetId).toBeNull()
  })
})

