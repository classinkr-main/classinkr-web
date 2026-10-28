export interface QuoteWorkspacePreferences {
  version: 1
  showRecentQuotes: boolean
  showTemplates: boolean
  hiddenTemplateIds: string[]
}

export const DEFAULT_QUOTE_WORKSPACE_PREFERENCES: QuoteWorkspacePreferences = {
  version: 1,
  showRecentQuotes: true,
  showTemplates: true,
  hiddenTemplateIds: [],
}

export const QUOTE_WORKSPACE_PREVIEW_LIMIT = 3

/** 개인 화면 설정만 저장한다. 견적 내용·로그인 토큰은 저장하지 않는다. */
export function quoteWorkspaceStorageKey(session: Pick<Storage, "getItem">): string | null {
  const email = session.getItem("admin_email")?.trim().toLowerCase()
  const name = session.getItem("admin_name")?.trim()
  const role = session.getItem("admin_role")?.trim()
  const identity = email || (name && role ? `${role}:${name}` : null)
  return identity ? `classin:quote-workspace:v1:${encodeURIComponent(identity)}` : null
}

export function parseQuoteWorkspacePreferences(raw: string | null): QuoteWorkspacePreferences {
  if (!raw) return DEFAULT_QUOTE_WORKSPACE_PREFERENCES
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_QUOTE_WORKSPACE_PREFERENCES
    const saved = value as Record<string, unknown>
    if (saved.version !== 1) return DEFAULT_QUOTE_WORKSPACE_PREFERENCES
    return {
      version: 1,
      showRecentQuotes: typeof saved.showRecentQuotes === "boolean" ? saved.showRecentQuotes : true,
      showTemplates: typeof saved.showTemplates === "boolean" ? saved.showTemplates : true,
      hiddenTemplateIds: Array.isArray(saved.hiddenTemplateIds)
        ? [...new Set(saved.hiddenTemplateIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100))].slice(0, 500)
        : [],
    }
  } catch {
    return DEFAULT_QUOTE_WORKSPACE_PREFERENCES
  }
}
