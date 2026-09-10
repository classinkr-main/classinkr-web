"use client"

import Link from "next/link"
import { ArrowUpRight, Plus } from "lucide-react"

import type { SourceHealth } from "@/lib/admin-calendar/health"
import type { EventSource } from "@/lib/calendar-data"

import { getSourceOption } from "./event-style"

/**
 * 소스 연결 상태 표시 (2026-08-19).
 *
 * 원칙: 파스텔 틴트 채움 금지 — 상태는 뉴트럴 바탕 위에서 도트(소스색)와
 * 텍스트 색(danger/warning)으로만 말한다. 넓은 면은 항상 뉴트럴이다.
 * 끊긴 소스만 나열한다 — 정상 소스까지 늘어놓으면 경고가 묻힌다.
 */

const STATUS_TEXT: Record<SourceHealth["status"], string> = {
  ok: "text-[#1a1a1a]/35",
  stale: "text-[#A8741A]",
  dead: "text-[#B43E3E]",
}

/** 수리 링크의 행동 라벨 — 소스마다 "어디로 가는지"를 말한다 */
const ACTION_LABEL: Partial<Record<EventSource, string>> = {
  event: "행사 관리",
  notion: "노션 열기",
  partner: "파트너 운영",
}

function sourceLabel(source: EventSource): string {
  return getSourceOption(source)?.label ?? source
}

function sourceDot(source: EventSource): string {
  return getSourceOption(source)?.dot ?? "#A39E98"
}

/** 끊긴 소스만 요약하는 한 줄 스트립 — 기간에 일정이 있는데 일부 소스가 죽어 있을 때 */
export function SourceHealthStrip({ broken }: { broken: SourceHealth[] }) {
  if (broken.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#e8e8e4] bg-white px-4 py-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/35">
        연결
      </span>
      {broken.map((item) => {
        const external = item.href?.startsWith("http")
        return (
          <span key={item.source} className="inline-flex items-center gap-1.5 text-[11px]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: sourceDot(item.source) }}
            />
            <span className="font-medium text-[#3a3733]">{sourceLabel(item.source)}</span>
            <span className={`font-medium ${STATUS_TEXT[item.status]}`} title={item.detail}>
              {item.headline}
            </span>
            {item.href && (
              <Link
                href={item.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                aria-label={`${sourceLabel(item.source)} ${ACTION_LABEL[item.source] ?? "열기"}`}
                className="text-[#1a1a1a]/30 transition-colors hover:text-[#111110]"
              >
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </span>
        )
      })}
    </div>
  )
}

/**
 * 기간에 표시할 일정이 0건일 때 빈 격자 대신 서는 수리 패널.
 * 빈 화면은 "일정이 없다"만 말하지만, 이 패널은 "왜 없는지·어디서 고치는지"를 말한다.
 */
export function CalendarRepairPanel({
  rangeLabel,
  broken,
  holidayNote,
  onCreate,
}: {
  rangeLabel: string
  broken: SourceHealth[]
  /** 기간 안 공휴일 안내(예: "공휴일 1건은 정상 표시 중 · 8/15 광복절") */
  holidayNote?: string
  onCreate: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-5 py-12 text-center">
      <div>
        <p className="text-[14px] font-semibold text-[#111110]">
          {rangeLabel}에 표시할 일정이 0건입니다
        </p>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-[12px] leading-5 text-[#1a1a1a]/45">
          {broken.length > 0
            ? `일정이 없어서가 아니라 소스 ${broken.length}개가 끊겨 있기 때문입니다. 각 원본에서 되살릴 수 있습니다.`
            : "이 기간에 등록된 일정이 없습니다."}
        </p>
      </div>

      {broken.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-1.5 text-left">
          {broken.map((item) => {
            const external = item.href?.startsWith("http")
            return (
              <div
                key={item.source}
                className="flex items-center gap-2.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px]"
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: sourceDot(item.source) }}
                />
                <span className="shrink-0 font-semibold text-[#3a3733]">
                  {sourceLabel(item.source)}
                </span>
                <span className={`min-w-0 truncate text-[11px] ${STATUS_TEXT[item.status]}`}>
                  {item.headline}
                  {item.detail && <span className="text-[#1a1a1a]/35"> · {item.detail}</span>}
                </span>
                {item.source === "calendar" ? (
                  <button
                    type="button"
                    onClick={onCreate}
                    className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#084734] transition-colors hover:text-[#065c41]"
                  >
                    <Plus className="h-3 w-3" />
                    첫 일정
                  </button>
                ) : item.href ? (
                  <Link
                    href={item.href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#084734] transition-colors hover:text-[#065c41]"
                  >
                    {ACTION_LABEL[item.source] ?? "열기"}
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {holidayNote && <p className="text-[11px] text-[#1a1a1a]/35">{holidayNote}</p>}
    </div>
  )
}
