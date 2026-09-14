"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Skeleton } from "@/components/admin/viz"
import { COUNT, PCT1 } from "@/components/admin/campaigns/event-format"
import { adminFetchJsonCached } from "@/lib/admin-client"
import type { EmailCampaign } from "@/lib/marketing-types"

// 이메일 캠페인 성과 요약 — 상세 › 메시지 성과. 메시지 탭(MarketingHub)이 쓰는 같은 URL
// (/api/admin/email)을 같은 TTL 로 읽어 두 화면이 같은 목록을 본다. 발송·작성은 메시지 탭에서.
//
// 정직 규칙: 오픈율 = openCount ÷ recipientCount(추적 픽셀 기반 — 이미지 차단 클라이언트는 빠진다).
// 클릭 수는 2026-08-18 이후 캠페인에만 있다 — 없는 캠페인은 "—"(미수집)이지 0 이 아니다.
// 문자·카카오 대량 발송은 아직 없어 여기서 다루지 않는다(있는 것처럼 보이지 않게).

const LIST_TTL_MS = 60_000
const RECENT_COUNT = 5

const DATE = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" })

function ratePct(numerator: number | undefined, denominator: number): number | null {
  if (numerator == null || denominator <= 0) return null
  return (numerator / denominator) * 100
}

export function EmailPerformanceCard({ messagesHref }: { messagesHref: string }) {
  const [campaigns, setCampaigns] = useState<EmailCampaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    adminFetchJsonCached<{ campaigns?: EmailCampaign[] } | null>("/api/admin/email", undefined, {
      ttlMs: LIST_TTL_MS,
      staleIfError: true,
    })
      .then((data) => {
        if (ignore) return
        setCampaigns(data?.campaigns ?? [])
        setError(null)
      })
      .catch((e: unknown) => {
        if (ignore) return
        setError(e instanceof Error ? e.message : "이메일 캠페인 조회 실패")
      })
    return () => {
      ignore = true
    }
  }, [])

  const sent = useMemo(
    () =>
      (campaigns ?? [])
        .filter((campaign) => campaign.status === "sent")
        .sort((a, b) => new Date(b.sentAt ?? b.createdAt).getTime() - new Date(a.sentAt ?? a.createdAt).getTime()),
    [campaigns]
  )
  const recent = sent.slice(0, RECENT_COUNT)
  const totals = useMemo(() => {
    const recipients = recent.reduce((sum, campaign) => sum + campaign.recipientCount, 0)
    const opens = recent.reduce((sum, campaign) => sum + (campaign.openCount ?? 0), 0)
    const tracked = recent.filter((campaign) => campaign.openCount != null)
    return { recipients, openRate: tracked.length > 0 ? ratePct(opens, recipients) : null }
  }, [recent])

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="이메일 캠페인 성과">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-[#111110]">이메일 캠페인 · 최근 {RECENT_COUNT}건</h3>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            오픈율 = 추적 픽셀 ÷ 수신자 · 클릭은 추적 링크가 있는 캠페인만 · 문자·카카오 대량 발송은 아직 없음
          </p>
        </div>
        <Link href={messagesHref} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline">
          발송·이력 → 메시지 <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {campaigns == null && !error ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[38px] w-full rounded-lg" />
          ))}
        </div>
      ) : error && campaigns == null ? (
        <p className="text-[12px] text-[#1a1a1a]/55">{error}</p>
      ) : recent.length === 0 ? (
        <p className="rounded-xl bg-[#fafaf8] py-6 text-center text-[12px] text-[#A39E98]">발송 완료된 이메일 캠페인이 없습니다.</p>
      ) : (
        <>
          <p className="mb-2 text-[11.5px] tabular-nums text-[#615D59]">
            수신자 합 {COUNT.format(totals.recipients)} · 평균 오픈율{" "}
            {totals.openRate != null ? `${PCT1.format(totals.openRate)}%` : "—"}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-[480px] w-full text-[12px] tabular-nums">
              <thead className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                <tr className="border-b border-[#f0f0ec]">
                  <th className="pb-2 pr-3 text-left">제목</th>
                  <th className="px-3 pb-2 text-right">발송일</th>
                  <th className="px-3 pb-2 text-right">수신자</th>
                  <th className="px-3 pb-2 text-right">오픈율</th>
                  <th className="pb-2 pl-3 text-right">클릭률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {recent.map((campaign) => {
                  const openRate = ratePct(campaign.openCount, campaign.recipientCount)
                  const clickRate = ratePct(campaign.clickCount, campaign.recipientCount)
                  const sentAt = campaign.sentAt ?? campaign.createdAt
                  return (
                    <tr key={campaign.id}>
                      <td className="max-w-[280px] truncate py-2 pr-3 text-left font-medium text-[#111110]">{campaign.subject}</td>
                      <td className="px-3 py-2 text-right text-[#615D59]">{DATE.format(new Date(sentAt))}</td>
                      <td className="px-3 py-2 text-right">{COUNT.format(campaign.recipientCount)}</td>
                      <td className="px-3 py-2 text-right">{openRate != null ? `${PCT1.format(openRate)}%` : "—"}</td>
                      <td className="py-2 pl-3 text-right">{clickRate != null ? `${PCT1.format(clickRate)}%` : "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
