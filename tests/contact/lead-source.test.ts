import { describe, expect, it } from "vitest"
import { resolveContactLeadSource } from "@/lib/contact/lead-source"

describe("resolveContactLeadSource — /contact?source= → 리드 source", () => {
  it.each([
    ["chatbot", "chatbot"],
    [" Chatbot ", "chatbot"],
    ["seminar", "contact_page"],
    ["event", "contact_page"],
    ["demo_modal", "contact_page"],
    ["", "contact_page"],
    [null, "contact_page"],
    [undefined, "contact_page"],
  ] as Array<[string | null | undefined, string]>)("%j → %s", (param, expected) => {
    expect(resolveContactLeadSource(param)).toBe(expected)
  })
})
