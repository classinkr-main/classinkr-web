import "server-only"
import { getCachedAllCampaigns } from "@/lib/repositories/marketing"

export interface CampaignSummary {
  recent: Array<{ id: string|number; subject: string; sentAt: string|undefined; recipientCount: number; openCount: number; openPct: number }>
  count_30d: number
  avg_open_pct: number
}

export async function summarizeCampaigns(now: Date): Promise<CampaignSummary> {
  // 60초 캐시(getCachedAllCampaigns) — summary 라우트는 초단위 신선도가 필요 없다.
  const all = await getCachedAllCampaigns()
  const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - 30)
  const recent = all
    .filter((c) => c.sentAt && new Date(c.sentAt) >= cutoff)
    .map((c) => {
      const recipients = Number((c as { recipientCount?: number }).recipientCount ?? 0)
      const opens = Number(c.openCount ?? 0)
      const openPct = recipients > 0 ? (opens / recipients) * 100 : 0
      return { id: c.id, subject: c.subject, sentAt: c.sentAt, recipientCount: recipients, openCount: opens, openPct }
    })
  const avg = recent.length ? recent.reduce((s, r) => s + r.openPct, 0) / recent.length : 0
  return { recent, count_30d: recent.length, avg_open_pct: avg }
}
