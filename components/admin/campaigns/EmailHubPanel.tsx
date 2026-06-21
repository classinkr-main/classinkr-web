"use client"

import Link from "next/link"
import { ArrowRight, CheckCircle2, Mail, Plus, Send, Users } from "lucide-react"

const KRW = new Intl.NumberFormat("ko-KR")

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export interface EmailHubStats {
  totalSubscribers: number
  activeSubscribers: number
  unsubscribed: number
  sentCampaigns: number
  totalCampaigns: number
  newThisMonth: number
  recentCampaigns: Array<{
    id: string | number
    subject: string
    sentAt: string | null
    recipientCount: number
    status: "draft" | "sent" | "failed"
  }>
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <span className={`inline-flex rounded-xl p-2 ${iconBg}`}>{icon}</span>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">{label}</p>
      <p className="mt-1 text-[22px] font-bold leading-none tracking-[-0.02em] text-[#111110]">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</p>}
    </div>
  )
}

function StatusPill({ status }: { status: "draft" | "sent" | "failed" }) {
  if (status === "sent") {
    return (
      <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#084734]">
        발송됨
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        실패
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/55">
      초안
    </span>
  )
}

export default function EmailHubPanel({ stats }: { stats: EmailHubStats | null }) {
  if (!stats) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-16 text-center text-[13px] text-[#1a1a1a]/30">
        이메일 채널 현황을 불러오는 중입니다.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-3.5 w-3.5" />}
          iconBg="bg-[#f0f0ec] text-[#1a1a1a]/55"
          label="전체 구독자"
          value={KRW.format(stats.totalSubscribers)}
          hint={`이번달 +${stats.newThisMonth}명`}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          iconBg="bg-[#ECFDF5] text-[#084734]"
          label="활성 구독자"
          value={KRW.format(stats.activeSubscribers)}
          hint="발송 가능 대상"
        />
        <KpiCard
          icon={<Send className="h-3.5 w-3.5" />}
          iconBg="bg-[#f0f0ec] text-[#1a1a1a]/55"
          label="발송 캠페인"
          value={`${stats.sentCampaigns}건`}
          hint={`전체 ${stats.totalCampaigns}건`}
        />
        <KpiCard
          icon={<Mail className="h-3.5 w-3.5" />}
          iconBg="bg-[#f0f0ec] text-[#1a1a1a]/55"
          label="수신거부"
          value={`${stats.unsubscribed}명`}
          hint="보존 중인 상태"
        />
      </div>

      {/* Recent campaigns */}
      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[14px] font-semibold text-[#111110]">최근 발송 캠페인</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
              최근 5건 · 전체 관리는 이메일 마케팅에서
            </p>
          </div>
          <Link
            href="/admin/marketing"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#084734] hover:underline"
          >
            전체 이력
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {stats.recentCampaigns.length === 0 ? (
          <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">발송된 캠페인이 없습니다.</p>
        ) : (
          <div className="divide-y divide-[#f0f0ec]">
            {stats.recentCampaigns.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#111110]">{c.subject}</p>
                  <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                    {formatDate(c.sentAt)} · {KRW.format(c.recipientCount)}명
                  </p>
                </div>
                <StatusPill status={c.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick action buttons */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/marketing"
          className="group flex items-center justify-between rounded-2xl border border-[#e8e8e4] bg-white p-4 transition-colors hover:border-[#084734]/20 hover:bg-[#ECFDF5]/30 sm:p-5"
        >
          <div>
            <p className="text-[13px] font-semibold text-[#111110]">이메일 마케팅 허브</p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
              구독자 관리 · 이메일 발송 · 이력
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#084734] transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/admin/marketing"
          className="group flex items-center justify-between rounded-2xl border border-[#084734] bg-[#084734] p-4 transition-colors hover:bg-[#063d2a] sm:p-5"
        >
          <div>
            <p className="text-[13px] font-semibold text-white">새 이메일 캠페인 작성</p>
            <p className="mt-1 text-[11px] text-white/60">
              활성 {KRW.format(stats.activeSubscribers)}명에게 발송
            </p>
          </div>
          <Plus className="h-4 w-4 text-white transition-transform group-hover:scale-110" />
        </Link>
      </div>

      {/* Tag distribution if available */}
      {stats.activeSubscribers > 0 && (
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#111110]">이메일 구독자 현황</h2>
            <div className="flex items-center gap-3 text-[12px] text-[#1a1a1a]/45">
              <span>활성 {Math.round((stats.activeSubscribers / Math.max(stats.totalSubscribers, 1)) * 100)}%</span>
              <span>·</span>
              <span>수신거부 {Math.round((stats.unsubscribed / Math.max(stats.totalSubscribers, 1)) * 100)}%</span>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
            <div
              className="h-full rounded-full bg-[#084734]"
              style={{
                width: `${Math.round((stats.activeSubscribers / Math.max(stats.totalSubscribers, 1)) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[12px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#084734]" />
              <span className="text-[#1a1a1a]/55">활성 {KRW.format(stats.activeSubscribers)}명</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f0f0ec]" />
              <span className="text-[#1a1a1a]/55">수신거부 {KRW.format(stats.unsubscribed)}명</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
