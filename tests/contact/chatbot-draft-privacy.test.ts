import { describe, expect, it, vi } from "vitest"
import { consumeContactDraft, saveContactDraft, stripContactPrefill } from "@/lib/contact/draft"

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

describe("chatbot contact draft", () => {
  it("transfers a draft once without encoding it in a URL", () => {
    const storage = memoryStorage()
    expect(saveContactDraft(storage, "학생 문의 내용")).toBe(true)
    expect(consumeContactDraft(storage)).toBe("학생 문의 내용")
    expect(consumeContactDraft(storage)).toBeNull()
  })

  it("reports unavailable storage instead of silently losing the draft", () => {
    const storage = memoryStorage()
    storage.setItem = vi.fn(() => { throw new Error("unavailable") })
    expect(saveContactDraft(storage, "문의")).toBe(false)
  })

  it("strips legacy prefill while preserving other parameters and fragment", () => {
    expect(stripContactPrefill("https://example.com/contact?source=chatbot&prefill=private&topic=support#contact-form"))
      .toBe("/contact?source=chatbot&topic=support#contact-form")
  })
})
