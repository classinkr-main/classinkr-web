import { describe, expect, it, vi } from "vitest"

import { createChatbotHistoryEntry } from "@/components/ui/chatbot/useMobileChatbotModal"

// 휴대폰 대화창이 쌓는 history 항목(CX-11) — 이동·새로고침 뒤 뒤로가기가 한 번 헛돌지 않는지.
// 브라우저 history 를 흉내 낸 가짜로 센다. back() 은 실제처럼 한 박자 늦게 popstate 를 낸다.

function createFakeHistory() {
  const entries: Array<{ state: unknown; label: string }> = [{ state: null, label: "doc" }]
  let index = 0
  const listeners = new Set<(state: unknown) => void>()
  const history = {
    get state() {
      return entries[index].state
    },
    pushState(state: unknown) {
      entries.splice(index + 1)
      entries.push({ state, label: "pushed" })
      index += 1
    },
    back() {
      if (index === 0) return
      index -= 1
      const state = entries[index].state
      queueMicrotask(() => listeners.forEach((listener) => listener(state)))
    },
  }
  return {
    history: history as unknown as History,
    onPop: (listener: (state: unknown) => void) => listeners.add(listener),
    // 다른 페이지로 이동(Next 가 자기 상태를 넣은 새 항목을 쌓는다)
    navigate(label: string) {
      entries.splice(index + 1)
      entries.push({ state: { __NA: true }, label })
      index += 1
    },
    // 사용자가 누른 뒤로가기 한 번
    async pressBack() {
      history.back()
      await Promise.resolve()
      await Promise.resolve()
    },
    get label() {
      return entries[index].label
    },
    get index() {
      return index
    },
  }
}

function setup(active = true) {
  const fake = createFakeHistory()
  const onBack = vi.fn()
  let isActive = active
  const entry = createChatbotHistoryEntry({ isActive: () => isActive, onBack }, { history: fake.history })
  fake.onPop((state) => entry.handlePopState(state))
  return { fake, entry, onBack, setActive: (value: boolean) => (isActive = value) }
}

describe("휴대폰 대화창 history 항목", () => {
  it("열면 항목을 쌓고, 뒤로가기 한 번이면 창만 닫는다", async () => {
    const { fake, entry, onBack } = setup()
    entry.push()
    expect(fake.index).toBe(1)
    await fake.pressBack()
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(fake.index).toBe(0)
  })

  it("닫기 버튼(release)은 쌓은 항목을 걷는다", async () => {
    const { fake, entry, onBack, setActive } = setup()
    entry.push()
    setActive(false)
    entry.release()
    await Promise.resolve()
    await Promise.resolve()
    expect(fake.index).toBe(0)
    expect(onBack).not.toHaveBeenCalled()
  })

  it("창 안 링크로 떠났다가 뒤로 오면, 남은 항목에서 한 번 더 물러서서 뒤로가기 한 번이 헛돌지 않는다", async () => {
    const { fake, entry, setActive } = setup()
    entry.push()
    setActive(false)
    entry.abandon()
    fake.navigate("/contact")
    expect(fake.index).toBe(2)

    await fake.pressBack()
    await Promise.resolve()
    expect(fake.label).toBe("doc")
    expect(fake.index).toBe(0)
  })

  it("창을 연 채 새로고침하면(기억은 사라지고 항목만 남는다) 마운트 때 그 항목을 걷는다", async () => {
    const first = setup()
    first.entry.push()
    // 새로고침: 같은 history, 새 컨트롤러(창은 닫힌 채 시작)
    const onBack = vi.fn()
    const reloaded = createChatbotHistoryEntry({ isActive: () => false, onBack }, { history: first.fake.history })
    first.fake.onPop((state) => reloaded.handlePopState(state))
    expect(first.fake.index).toBe(1)

    reloaded.cleanupStale()
    await Promise.resolve()
    await Promise.resolve()
    expect(first.fake.index).toBe(0)
    expect(onBack).not.toHaveBeenCalled()
  })
})
