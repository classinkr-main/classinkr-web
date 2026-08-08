import { getAnonymousId } from "@/lib/consent/consent"
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
      // 분석 동의가 있을 때만 값이 나온다(getAnonymousId 가 동의를 확인한다).
      // 이 값으로 제출 전 익명 활동이 리드에 소급 귀속된다.
      anonymousId: getAnonymousId(),
    }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || "제출에 실패했습니다. 다시 시도해주세요.")
  }

  return payload
}
