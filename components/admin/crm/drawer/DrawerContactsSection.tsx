"use client"

// 연락처 · 리스크 섹션. Customer360Drawer.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { MapPin, User2 } from "lucide-react"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import CrmContactValue from "../CrmContactValue"
import LeadMessageCard from "../LeadMessageCard"
import { CONFIDENCE_LABEL, SectionTitle, SERVICE_RISK_CLASS, SERVICE_RISK_LABEL } from "./shared"

export default function DrawerContactsSection({ data }: { data: Customer360 }) {
  const header = data.header
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <SectionTitle icon={<User2 className="h-3.5 w-3.5" />}>연락처 · 리스크</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <p className="text-[11px] font-semibold text-[#1a1a1a]/35">전화</p>
          <CrmContactValue value={data.contacts?.phone} className="font-medium text-[#111110]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#1a1a1a]/35">이메일</p>
          <p className={`truncate font-medium ${data.contacts?.email ? "text-[#111110]" : "text-[#1a1a1a]/35"}`}>
            {data.contacts?.email ?? "이메일 미확인"}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-[11px] font-semibold text-[#1a1a1a]/35">지역</p>
          <p className="inline-flex items-center gap-1 font-semibold text-[#084734]">
            <MapPin className="h-3.5 w-3.5" />
            {header?.region ?? "지역 미지정"}
          </p>
        </div>
        {data.contacts?.extra.map((field) => (
          <div key={`${field.label}:${field.value}`} className="col-span-2">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{field.label}</p>
            <p className="font-medium text-[#111110]">{field.value}</p>
          </div>
        ))}
      </div>
      {data.contacts?.message ? (
        <div className="mt-3 border-t border-[#f0f0ec] pt-3">
          <p className="mb-2 text-[11px] font-semibold text-[#1a1a1a]/35">제출 메시지</p>
          <LeadMessageCard message={data.contacts.message} />
        </div>
      ) : null}
      {data.serviceRisk ? (
        <div className="mt-3 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#1a1a1a]/45">서비스(NEO)</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  SERVICE_RISK_CLASS[data.serviceRisk.level] ?? SERVICE_RISK_CLASS.normal
                }`}
              >
                {SERVICE_RISK_LABEL[data.serviceRisk.level] ?? data.serviceRisk.level}
              </span>
            </div>
            <span className="text-[10px] text-[#1a1a1a]/35">
              {data.serviceRisk.freshnessLabel ?? "NEO 정보 없음"} · {CONFIDENCE_LABEL[data.serviceRisk.confidence]}
            </span>
          </div>
          {data.serviceRisk.reasons.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {data.serviceRisk.reasons.map((reason) => (
                <li key={reason.code} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                  {reason.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {data.risk.reasons.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {data.risk.reasons.map((reason) => (
            <li key={reason} className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">
              {reason}
            </li>
          ))}
        </ul>
      ) : data.serviceRisk ? null : (
        <p className="mt-3 text-[12px] text-[#1a1a1a]/40">특이 리스크 신호 없음</p>
      )}
    </section>
  )
}
