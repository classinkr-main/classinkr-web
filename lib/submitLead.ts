import type { LeadPayload } from "@/lib/lead-types"
import { collectLeadAttribution } from "@/lib/marketing-attribution"

export { collectLeadAttribution } from "@/lib/marketing-attribution"

// website는 스팸 봇 감지용 honeypot 필드 — 서버에서 채워진 제출을 무시한다
export async function submitLead(data: Omit<LeadPayload, "timestamp"> & { website?: string }) {
  const res = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      ...collectLeadAttribution(),
    }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || "제출에 실패했습니다. 다시 시도해주세요.")
  }

  return payload
}
