import type { LeadPayload } from "@/app/api/lead/route"

export async function submitLead(data: Omit<LeadPayload, "timestamp">) {
  const res = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, timestamp: "" }),
  })

  if (!res.ok) {
    throw new Error("제출에 실패했습니다. 다시 시도해주세요.")
  }

  return res.json()
}
