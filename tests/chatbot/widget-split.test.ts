import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import { createComposerDraftStore } from "@/components/ui/chatbot/ChatComposer"

// 위젯 나누기(B0): 입력 상태를 ChatComposer 로 내리고 목록을 memo 로 감싸 글자를 칠 때 목록이 다시 그려지지 않게 했다.
// 입력 글은 셸이 든 저장소에 남아 창을 닫았다 열어도, 밖에서 prefill 로 넣어도 이어진다.

describe("ChatComposer 입력 저장소", () => {
  it("값을 바꾸면 구독자에게 알리고, 같은 값이면 알리지 않는다", () => {
    const store = createComposerDraftStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    expect(store.get()).toBe("")
    store.set("녹화는 어떻게 하나요")
    expect(store.get()).toBe("녹화는 어떻게 하나요")
    expect(listener).toHaveBeenCalledTimes(1)

    store.set("녹화는 어떻게 하나요")
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.set("")
    expect(store.get()).toBe("")
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("구독자가 없어도(창이 닫혀 입력창이 없을 때) 값을 들고 있다", () => {
    const store = createComposerDraftStore()
    store.set("prefill 질문")
    expect(store.get()).toBe("prefill 질문")
  })
})

describe("위젯 셸과 모듈 배선", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8")
  const shell = read("components/ui/FloatingChatbot.tsx")
  const messageList = read("components/ui/chatbot/MessageList.tsx")
  const composer = read("components/ui/chatbot/ChatComposer.tsx")

  it("셸은 입력 상태를 들지 않고, 저장소만 만들어 ChatComposer 에 넘긴다", () => {
    expect(shell).not.toMatch(/const \[input, setInput\]/)
    expect(shell).toContain("const [draftStore] = useState(createComposerDraftStore)")
    expect(shell).toContain("draftStore={draftStore}")
    expect(composer).toContain("useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get)")
  })

  it("목록은 memo 로 감싸고, 셸이 넘기는 콜백은 고정돼 있다", () => {
    expect(messageList).toContain("export const MessageList = memo(function MessageList(")
    expect(shell).toContain("const closeAfterInChatNavigation = useCallback(")
    expect(read("components/ui/chatbot/useChatbotConversation.ts")).toContain(
      "const stableSendQuestion = useCallback((question: string) => sendQuestionRef.current(question), [])"
    )
  })
})
