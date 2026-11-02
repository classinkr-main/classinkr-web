import { describe, expect, it } from "vitest"

import {
  DEFAULT_QUOTE_WORKSPACE_PREFERENCES,
  parseQuoteWorkspacePreferences,
  quoteWorkspaceStorageKey,
} from "@/lib/quote-workspace-preferences"

function session(values: Record<string, string>) {
  return { getItem: (key: string) => values[key] ?? null }
}

describe("quote workspace display preferences", () => {
  it("restores both hidden sections and individually hidden templates from a saved session", () => {
    const saved = { version: 1, showRecentQuotes: false, showTemplates: false, hiddenTemplateIds: ["board_86", "saved-template"] }
    expect(parseQuoteWorkspacePreferences(JSON.stringify(saved))).toEqual(saved)
  })

  it("uses separate storage for each account and normalizes email casing", () => {
    const first = quoteWorkspaceStorageKey(session({ admin_email: " SALES@EXAMPLE.COM " }))
    expect(first).toBe(quoteWorkspaceStorageKey(session({ admin_email: "sales@example.com" })))
    expect(first).not.toBe(quoteWorkspaceStorageKey(session({ admin_email: "other@example.com" })))
    expect(quoteWorkspaceStorageKey(session({}))).toBeNull()
    expect(quoteWorkspaceStorageKey(session({ admin_name: "담당자", admin_role: "ADMIN" }))).not.toBeNull()
  })

  it.each([null, "broken json", "null", "[]", '{"version":2,"showTemplates":false}'])("recovers safely from unsupported storage: %s", (raw) => {
    expect(parseQuoteWorkspacePreferences(raw)).toEqual(DEFAULT_QUOTE_WORKSPACE_PREFERENCES)
  })

  it("rejects malformed fields and bounds the saved ID list", () => {
    expect(parseQuoteWorkspacePreferences(JSON.stringify({
      version: 1, showRecentQuotes: "false", showTemplates: false,
      hiddenTemplateIds: [null, {}, "", "board_86", "board_86", "x".repeat(101)],
    }))).toEqual({ version: 1, showRecentQuotes: true, showTemplates: false, hiddenTemplateIds: ["board_86"] })
    expect(parseQuoteWorkspacePreferences(JSON.stringify({ version: 1, hiddenTemplateIds: Array.from({ length: 600 }, (_, i) => `template-${i}`) })).hiddenTemplateIds).toHaveLength(500)
  })
})
