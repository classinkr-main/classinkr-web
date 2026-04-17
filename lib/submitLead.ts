import type { LeadPayload } from "@/lib/lead-types"

export async function submitLead(data: Omit<LeadPayload, "timestamp">) {
  const res = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || "제출에 실패했습니다. 다시 시도해주세요.")
  }

  return payload
}
