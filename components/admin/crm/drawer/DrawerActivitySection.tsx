"use client"

// 활동 타임라인 + 특이사항 피드 섹션 — 탭·필터 상태는 부모(드로어 본체)가 소유한다.
// Customer360Drawer.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { MergedTimelineItem } from "@/lib/crm/compass-timeline"
import { eventSourceIcon, eventSourceLabel } from "../event-source-meta"
import { CompassTimelineRow, formatDate } from "./shared"

export type C360ActivityTab = "timeline" | "feed"
export type C360ActivitySource = "all" | "manual_note" | "meeting_minutes"

export default function DrawerActivitySection({
  data,
  activityTab,
  onActivityTabChange,
  activitySource,
  onActivitySourceChange,
  feedRows,
  mergedActivity,
  eventsExpanded,
  eventsLoading,
  onLoadMoreEvents,
  targetType,
  entityId,
}: {
  data: Customer360
  activityTab: C360ActivityTab
  onActivityTabChange: (tab: C360ActivityTab) => void
  activitySource: C360ActivitySource
  onActivitySourceChange: (source: C360ActivitySource) => void
  feedRows: Customer360["activity"]["rows"]
  mergedActivity: Array<MergedTimelineItem<Customer360["activity"]["rows"][number]>>
  eventsExpanded: boolean
  eventsLoading: boolean
  onLoadMoreEvents: () => void
  targetType: string
  entityId: string
}) {
  return (
    <section id="c360-activity" className="scroll-mt-2 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div role="tablist" aria-label="고객 활동 보기" className="mb-3 inline-flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
        {(
          [
            {
              key: "timeline",
              // Compass 병합분까지 세야 탭 숫자와 실제로 보이는 줄 수가 어긋나지 않는다.
              label: `타임라인${
                data.activity.summary.total + data.compass.entries.length > 0
                  ? ` ${data.activity.summary.total + data.compass.entries.length}`
                  : ""
              }`,
            },
            { key: "feed", label: `특이사항 피드${feedRows.length > 0 ? ` ${feedRows.length}` : ""}` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activityTab === tab.key}
            onClick={() => onActivityTabChange(tab.key)}
            className={`h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${
              activityTab === tab.key ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 출처 필터 — 타임라인에서 메모/회의록만 빠르게 추림. 피드(위험 전용)에는 비표시. */}
      {activityTab === "timeline" ? (
        <div role="group" aria-label="고객 활동 출처 필터" className="mb-3 inline-flex flex-wrap gap-1">
          {(
            [
              { key: "all", label: "전체" },
              { key: "manual_note", label: "메모" },
              { key: "meeting_minutes", label: "회의록" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              aria-pressed={activitySource === opt.key}
              onClick={() => onActivitySourceChange(opt.key)}
              className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
                activitySource === opt.key
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                  : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#111110] hover:text-[#111110]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 연결이 끊긴 것과 활동이 없는 것을 구분해 말한다 */}
      {data.compass.down ? (
        <p className="mb-2 border-l-2 border-[#B85C33] px-2.5 py-1.5 text-[12px] text-[#1a1a1a]/55">
          Compass 연결이 끊겨 마케팅 활동을 병합하지 못했습니다.
        </p>
      ) : null}

      {mergedActivity.length === 0 ? (
        <p className="text-[12px] text-[#1a1a1a]/40">
          {activityTab === "feed"
            ? "특이사항(위험) 기록이 없습니다."
            : activitySource === "manual_note"
              ? "메모가 없습니다."
              : activitySource === "meeting_minutes"
                ? "회의록이 없습니다."
                : "기록된 활동이 없습니다."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {mergedActivity.map((item) => {
            if (item.kind === "compass") {
              return <CompassTimelineRow key={item.entry.id} entry={item.entry} />
            }
            const event = item.event
            // 메모·회의록은 본문이 핵심 — 클램프 없이 펼쳐 보여주고, 그 외는 요약 2줄로 압축.
            const isMemo = event.sourceType === "manual_note" || event.sourceType === "meeting_minutes"
            const memoText = event.body ?? event.summary
            const author = event.ownerName ?? event.createdBy
            return (
              <li key={event.id} className="flex gap-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                    event.sentiment === "risk" ? "bg-[#FEF3EE] text-[#B85C33]" : "bg-[#fafaf8] text-[#1a1a1a]/45"
                  }`}
                >
                  {eventSourceIcon(event.sourceType)}
                </span>
                <div className="min-w-0 flex-1 border-b border-[#f5f5f2] pb-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[#1a1a1a]/45">
                      {eventSourceLabel(event.sourceType)}
                    </span>
                    <span className="text-[11px] text-[#1a1a1a]/35">{formatDate(event.occurredAt)}</span>
                    {author ? <span className="text-[11px] text-[#1a1a1a]/35">· {author}</span> : null}
                    {event.sentiment === "risk" ? (
                      <span className="rounded bg-[#FEF3EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#B85C33]">위험</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] font-semibold text-[#111110]">{event.title}</p>
                  {isMemo ? (
                    memoText ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-[#1a1a1a]/55">{memoText}</p>
                    ) : null
                  ) : event.summary || event.body ? (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-[#1a1a1a]/55">{event.summary ?? event.body}</p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {activityTab === "timeline" &&
      !eventsExpanded &&
      data.activity.summary.total > data.activity.rows.length ? (
        <button
          type="button"
          onClick={onLoadMoreEvents}
          disabled={eventsLoading}
          aria-busy={eventsLoading}
          className="mt-2.5 inline-flex w-full items-center justify-center rounded-lg border border-[#e8e8e4] bg-white py-2 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] disabled:opacity-50"
        >
          {eventsLoading ? "불러오는 중..." : "전체 활동 보기 (최대 50)"}
        </button>
      ) : null}
      {/* 활동 페이지 딥링크 — 이 고객으로 필터된 전체 활동(드로어 밖 상세 동선) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href={`/admin/crm/activity?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(entityId)}`}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] transition-colors hover:underline"
        >
          이 고객 활동 전체보기
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        {/* 전화가 일치한 Compass 리드가 있을 때만 — 없으면 링크를 지어내지 않는다. */}
        {data.compass.href ? (
          <a
            href={data.compass.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2F5D8C] transition-colors hover:underline"
          >
            Compass 리드 열기
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </section>
  )
}
