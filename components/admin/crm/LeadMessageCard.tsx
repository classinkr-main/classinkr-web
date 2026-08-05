"use client"

import { Braces, MapPin, Megaphone, MessageSquare } from "lucide-react"

import { parseLeadMessage } from "@/lib/crm/lead-message"

const DUPLICATE_CONTACT_FIELDS = new Set([
  "full_name", "name", "company_name", "company", "organization",
  "phone_number", "phone", "email", "email_address",
])

export default function LeadMessageCard({ message }: { message: string | null | undefined }) {
  const parsed = parseLeadMessage(message)
  if (!parsed) return null

  if (parsed.kind === "plain") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-black/[0.08] bg-[#F6F5F4] p-3">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/35" />
        <p className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#1a1a1a]/70">{parsed.raw}</p>
      </div>
    )
  }

  const answers = parsed.answers.filter((item) => !DUPLICATE_CONTACT_FIELDS.has(item.key))

  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
      <div className="flex items-center gap-2 border-b border-black/[0.06] bg-[#ECFDF5] px-3 py-2.5">
        <Megaphone className="h-4 w-4 text-[#084734]" />
        <p className="text-[12px] font-bold text-[#084734]">Meta Lead Ads</p>
        <span className="ml-auto text-[10px] font-medium text-[#084734]/55">구조화 표시</span>
      </div>

      <div className="space-y-3 p-3">
        {parsed.attribution.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {parsed.attribution.map((item) => (
              <div key={item.key} className={item.key === "campaign" ? "sm:col-span-2" : ""}>
                <dt className="text-[10px] font-semibold text-[#1a1a1a]/35">{item.label}</dt>
                <dd className="mt-0.5 break-words text-[12px] font-medium leading-5 text-[#111110]">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {answers.length > 0 ? (
          <div className="border-t border-black/[0.06] pt-3">
            <p className="mb-2 text-[10px] font-semibold text-[#1a1a1a]/35">추가 제출 응답</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              {answers.map((item, index) => (
                <div key={`${item.key}:${index}`} className="rounded-lg bg-[#F6F5F4] px-2.5 py-2">
                  <dt className="flex items-center gap-1 text-[10px] font-semibold text-[#1a1a1a]/40">
                    {item.key === "city" || item.key === "region" ? <MapPin className="h-3 w-3" /> : null}
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 break-words text-[12px] font-semibold text-[#111110]">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <details className="border-t border-black/[0.06] pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-[#1a1a1a]/45 marker:hidden">
            <Braces className="h-3.5 w-3.5" />
            기술 정보·원문 보기
          </summary>
          <div className="mt-2 space-y-2">
            {parsed.identifiers.length > 0 ? (
              <dl className="grid gap-1 text-[11px] sm:grid-cols-3">
                {parsed.identifiers.map((item) => (
                  <div key={item.key} className="min-w-0 rounded-md bg-[#F6F5F4] px-2 py-1.5">
                    <dt className="text-[#1a1a1a]/35">{item.label}</dt>
                    <dd className="truncate font-mono text-[#1a1a1a]/65" title={item.value}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#111110] p-3 text-[10px] leading-5 text-white/70">
              {parsed.raw}
            </pre>
          </div>
        </details>
      </div>
    </div>
  )
}
