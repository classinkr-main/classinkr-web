"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Info } from "lucide-react"

import type { ChoiceCard, DenyCard, ReadCard } from "@/lib/admin-ai/types"
import { aiButtonClass, CardNote, CardShell } from "./CardShell"

/** 조회(R0) 결과 — 확인 절차가 없고 하단에는 화면 열기만 둔다. */
export function ReadCardView({ card }: { card: ReadCard }) {
  const table = card.table

  return (
    <CardShell
      icon={card.icon}
      title={card.title}
      target={card.target}
      riskCode="R0"
      riskName="조회"
      tone="neutral"
      footer={
        card.openLabel && card.openHref ? (
          <div className="flex flex-wrap gap-1.5">
            <Link href={card.openHref} className={aiButtonClass("secondary")}>
              {card.openLabel}
            </Link>
          </div>
        ) : undefined
      }
    >
      {table ? (
        <table className="w-full border-collapse text-[12px] tabular-nums">
          <thead>
            <tr>
              {table.head.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={`py-[3px] text-[11px] font-semibold text-[#A39E98] ${
                    index === 0 || table.textual ? "text-left" : "text-right"
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.join("|")}>
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`border-t border-[#F0F0EC] py-[5px] ${
                      index === 0 || table.textual ? "text-left" : "text-right"
                    } ${table.warnColumn === index ? "text-[#A8741A]" : "text-[#111110]"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {card.log ? (
        <ul className="text-[12px]">
          {card.log.map((entry) => (
            <li
              key={`${entry.when}-${entry.text}`}
              className="grid grid-cols-[58px_minmax(0,1fr)] gap-2 border-t border-[#F0F0EC] py-[5px]"
            >
              <time className="text-[#A39E98]">{entry.when}</time>
              <span className="text-[#111110]">{entry.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {card.note ? (
        <CardNote icon={<Info className="h-3 w-3" aria-hidden="true" />}>{card.note}</CardNote>
      ) : null}
    </CardShell>
  )
}

/** 거절(R4)·권한 없음 — 실행하지 않고 해당 화면을 안내한다. */
export function DenyCardView({ card }: { card: DenyCard }) {
  return (
    <CardShell
      icon="lock"
      title={card.title}
      target={card.target}
      riskCode="R4"
      riskName="금지"
      tone="dark"
      footer={
        card.openLabel && card.openHref ? (
          <div className="flex flex-wrap gap-1.5">
            <Link href={card.openHref} className={aiButtonClass("secondary")}>
              {card.openLabel}
            </Link>
            <Link href="/admin/ai?tab=catalog" className={aiButtonClass("ghost")}>
              오더 카탈로그
            </Link>
          </div>
        ) : undefined
      }
    >
      <p className="text-[12px] text-[#615D59]">{card.text}</p>
    </CardShell>
  )
}

/** 대상이 모호할 때 — 추측하지 않고 되묻는다. */
export function ChoiceCardView({
  card,
  onPick,
}: {
  card: ChoiceCard
  onPick?: (label: string) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)

  return (
    <CardShell icon="help" title={card.title} target={card.target} tone="neutral">
      <div className="flex flex-col gap-1.5">
        {card.options.map((option, index) => {
          const on = picked === index
          const dim = picked !== null && !on
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={on}
              disabled={picked !== null}
              onClick={() => {
                setPicked(index)
                onPick?.(option.label)
              }}
              className={`flex w-full items-center gap-2 rounded-lg border px-[11px] py-[9px] text-left text-[12px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
                on
                  ? "border-[#084734] font-semibold text-[#111110] shadow-[inset_0_0_0_1px_#084734]"
                  : dim
                    ? "border-[#E8E8E4] font-medium text-[#A39E98]"
                    : "border-[#E8E8E4] font-semibold text-[#111110] hover:border-[#BDEFD8]"
              }`}
            >
              {option.label}
              <small className="font-normal text-[#A39E98]">{option.meta}</small>
              {on ? <Check className="ml-auto h-3.5 w-3.5 text-[#084734]" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
      {card.note ? (
        <CardNote icon={<Info className="h-3 w-3" aria-hidden="true" />}>{card.note}</CardNote>
      ) : null}
    </CardShell>
  )
}
