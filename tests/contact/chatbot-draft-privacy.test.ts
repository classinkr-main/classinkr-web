import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import { stashContactPrefill, takeContactPrefill } from "@/lib/tracking-paths"

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("chatbot contact draft", () => {
  it("transfers a draft once without encoding it in a URL", () => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage() })
    expect(stashContactPrefill("학생 문의 내용")).toBe(true)
    expect(takeContactPrefill()).toBe("학생 문의 내용")
    expect(takeContactPrefill()).toBeNull()
  })

  it("reports unavailable storage instead of silently losing the draft", () => {
    const storage = memoryStorage()
    storage.setItem = vi.fn(() => { throw new Error("unavailable") })
    vi.stubGlobal("window", { sessionStorage: storage })
    expect(stashContactPrefill("문의")).toBe(false)
  })

  it("keeps the chatbot on the page with a notice when the draft cannot be stored", () => {
    const source = readFileSync(path.join(process.cwd(), "components/ui/FloatingChatbot.tsx"), "utf8")
    expect(source).toContain("if (stashContactPrefill(draft)) return")
    expect(source).toContain("event.preventDefault()")
    expect(source).not.toMatch(/prefill:\s*draft/)
  })
})
