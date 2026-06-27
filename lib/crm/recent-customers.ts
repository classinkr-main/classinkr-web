// Client-only recency list of CRM customers/leads the operator recently opened,
// used to pre-fill the 기록 입력 대상 picker (plan §5.4). Persisted in localStorage.

export interface RecentCustomer {
  key: string
  name: string
  sourceLabel: string
  source: "lead" | "neo_account"
}

const STORAGE_KEY = "crm:recent-customers"
const MAX_RECENTS = 8

export function getRecentCustomers(): RecentCustomer[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is RecentCustomer =>
          item &&
          typeof item.key === "string" &&
          typeof item.name === "string" &&
          (item.source === "lead" || item.source === "neo_account")
      )
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

export function pushRecentCustomer(entry: RecentCustomer): void {
  if (typeof window === "undefined") return
  if (!entry.key || !entry.name) return
  try {
    const existing = getRecentCustomers().filter((item) => item.key !== entry.key)
    const next = [entry, ...existing].slice(0, MAX_RECENTS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable (private mode / quota) — recents are best-effort.
  }
}

// unified row key is `lead:{id}` / `neo:{accountId}`; entityId is everything after the first colon.
export function entityIdFromCustomerKey(key: string): string {
  const idx = key.indexOf(":")
  return idx >= 0 ? key.slice(idx + 1) : key
}
