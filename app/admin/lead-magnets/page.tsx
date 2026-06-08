import { CheckCircle2, FileText, MapPin, Megaphone, ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"

import { getLeadMagnetStatusLabel, leadMagnets, type LeadMagnetStatus } from "@/lib/lead-magnets"

function statusTone(status: LeadMagnetStatus) {
  if (status === "review") return "border-amber-100 bg-amber-50 text-amber-700"
  if (status === "unlisted") return "border-sky-100 bg-sky-50 text-sky-700"
  return "border-[#e8e8e4] bg-[#f5f5f2] text-[#1a1a1a]/50"
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-5 shadow-[0_1px_0_rgba(17,17,16,0.02)]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/40">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{value}</p>
      <p className="mt-2 text-[11px] text-[#1a1a1a]/40">{hint}</p>
    </div>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
      <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
        <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
        {description && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{description}</p>}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

export default function AdminLeadMagnetsPage() {
  const placementCount = leadMagnets.reduce((total, item) => total + item.suggestedPlacements.length, 0)
  const checklistCount = leadMagnets.reduce((total, item) => total + item.checklistBullets.length, 0)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e8e8e4] bg-white px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/55">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin preview only
          </div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-[#111110]">
            리드 마그넷 프리뷰
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#1a1a1a]/50">
            공개 배포 전 검토용 자료입니다. 이 페이지는 관리자 라우트 안에서 정적 데이터만 렌더링하며 외부 API를 호출하지 않습니다.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="자료" value={leadMagnets.length} hint="검토 중인 리드 마그넷" />
        <MetricCard label="체크 항목" value={checklistCount} hint="전체 체크리스트 문항" />
        <MetricCard label="배치 후보" value={placementCount} hint="블로그, 제품, 후속 CTA" />
      </div>

      <SectionCard title="자료 카드" description="각 자료의 대상, 상태, 톤, CTA를 빠르게 확인합니다.">
        <div className="grid gap-4 lg:grid-cols-2">
          {leadMagnets.map((item) => (
            <article
              key={item.slug}
              className="rounded-2xl border border-[#e8e8e4] bg-[#FAFAF8] p-5 transition-all hover:border-[#c8c8c4] hover:bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium text-[#1a1a1a]/35">{item.slug}</p>
                  <h2 className="mt-1 text-[18px] font-semibold leading-snug tracking-[-0.02em] text-[#111110]">
                    {item.title}
                  </h2>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}
                >
                  {getLeadMagnetStatusLabel(item.status)}
                </span>
              </div>

              <div className="mt-5 grid gap-3 text-[12px] text-[#1a1a1a]/55">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/35">Audience</p>
                  <p>{item.audience}</p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/35">Source</p>
                  <p>{item.sourceDetail}</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-[#e8e8e4] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/35">CTA</p>
                <p className="mt-2 text-[12px] font-medium text-[#084734]">{item.ctaCopy.eyebrow}</p>
                <p className="mt-1 text-[15px] font-semibold text-[#111110]">{item.ctaCopy.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">{item.ctaCopy.body}</p>
                <div className="mt-3 inline-flex rounded-lg bg-[#084734] px-3 py-2 text-[12px] font-semibold text-white">
                  {item.ctaCopy.buttonLabel}
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        {leadMagnets.map((item) => (
          <SectionCard key={item.slug} title={item.title} description={item.audience}>
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-4">
                  <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#111110]">
                    <Megaphone className="h-4 w-4 text-[#084734]" />
                    블로그 톤
                  </div>
                  <p className="text-[12px] leading-5 text-[#1a1a1a]/55">{item.blogTone}</p>
                </div>
                <div className="rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-4">
                  <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#111110]">
                    <FileText className="h-4 w-4 text-[#B85C33]" />
                    가이드 톤
                  </div>
                  <p className="text-[12px] leading-5 text-[#1a1a1a]/55">{item.guideTone}</p>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#111110]">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  체크리스트
                </div>
                <ul className="space-y-2">
                  {item.checklistBullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex gap-3 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5 text-[12px] leading-5 text-[#1a1a1a]/60"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#084734]" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#111110]">
                  <MapPin className="h-4 w-4 text-sky-600" />
                  추천 배치
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.suggestedPlacements.map((placement) => (
                    <span
                      key={placement}
                      className="rounded-full border border-[#e8e8e4] bg-[#f5f5f2] px-3 py-1.5 text-[11px] font-medium text-[#1a1a1a]/55"
                    >
                      {placement}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  )
}
