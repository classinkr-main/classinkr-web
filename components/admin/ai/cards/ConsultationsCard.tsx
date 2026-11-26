"use client"

import Link from "next/link"
import { Info } from "lucide-react"

import { getLinkById, isAllowedAdminHref } from "@/lib/admin-ai/links"
import { adminAiStore } from "@/lib/admin-ai/store"
import type { ConsultationListItem, ConsultationSource, ConsultationsCard } from "@/lib/admin-ai/types"
import { aiButtonClass, CardNote, CardShell, PreviewBand } from "./CardShell"

// 상담 내역(R0) — 맨 위 결론 한 줄, 그 아래 목록(날짜·출처·상태·누가·요지·[열기]). 아무것도 바꾸지 않는다.
// [열기]는 링크 관문(isAllowedAdminHref — 등록된 화면 + 허용된 쿼리 키 + 꼴이 맞는 id)을 지난 주소만 그린다.

const SOURCE_LABEL: Record<ConsultationSource, string> = { channel_talk: "채널톡", internal_cs: "내부 CS" }

function ItemRow({ item }: { item: ConsultationListItem }) {
  const href = item.href && isAllowedAdminHref(item.href) ? item.href : undefined
  return (
    <li className="flex flex-col gap-1 border-t border-[#F0F0EC] py-[7px] first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#615D59]">
        {item.date ? <time dateTime={item.date}>{item.date}</time> : <span>날짜 없음</span>}
        <span className="rounded-md border border-[#E8E8E4] bg-[#F6F5F4] px-[6px] py-[1px] font-semibold">
          {SOURCE_LABEL[item.source]}
        </span>
        <span className="rounded-md border border-[#E8E8E4] px-[6px] py-[1px] font-semibold text-[#31302E]">{item.status}</span>
        {item.who ? <span className="font-semibold text-[#111110]">{item.who}</span> : null}
      </div>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[12px] leading-[1.45] text-[#31302E]">{item.summary ?? "요지 없음"}</p>
        {href ? (
          <Link href={href} className={`${aiButtonClass("ghost")} !px-2 !py-[3px] shrink-0`}>
            열기
          </Link>
        ) : null}
      </div>
    </li>
  )
}

export function ConsultationsCardView({ card }: { card: ConsultationsCard }) {
  const preview = adminAiStore.mode === "demo"
  const open = card.openLinkId ? getLinkById(card.openLinkId) : undefined
  const openable = open?.audience === "internal" ? open : undefined

  return (
    <CardShell
      icon="search"
      title={card.title}
      target={card.target}
      riskCode="R0"
      riskName="조회"
      tone="neutral"
      footer={
        openable ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={openable.href} className={aiButtonClass("secondary")}>
              상담 화면 열기
            </Link>
            {card.moreCount ? <span className="text-[11px] text-[#615D59]">나머지 {card.moreCount}건은 화면에서</span> : null}
          </div>
        ) : undefined
      }
    >
      {preview ? <PreviewBand /> : null}
      <p className="text-[13px] font-semibold leading-[1.55] text-[#111110]">{card.headline}</p>
      {card.items.length > 0 ? (
        <section aria-label="상담 목록">
          <ul>
            {card.items.map((item) => (
              <ItemRow key={`${item.source}:${item.id}`} item={item} />
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-[11px] leading-[1.45] text-[#A39E98]">찾은 조건 · {card.basis}</p>
      {card.note ? <CardNote icon={<Info className="h-3 w-3" aria-hidden="true" />}>{card.note}</CardNote> : null}
    </CardShell>
  )
}
