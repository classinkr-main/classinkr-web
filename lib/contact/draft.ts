const CONTACT_DRAFT_KEY = "classin:chatbot-contact-draft"

/** Store only on explicit navigation; a failed write must not navigate silently. */
export function saveContactDraft(storage: Storage, draft: string): boolean {
  try {
    storage.setItem(CONTACT_DRAFT_KEY, draft)
    return true
  } catch {
    return false
  }
}

export function consumeContactDraft(storage: Storage): string | null {
  try {
    const draft = storage.getItem(CONTACT_DRAFT_KEY)
    storage.removeItem(CONTACT_DRAFT_KEY)
    return draft?.trim() || null
  } catch {
    return null
  }
}

/** Keep all other parameters and the anchor on previously shared links. */
export function stripContactPrefill(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.delete("prefill")
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
