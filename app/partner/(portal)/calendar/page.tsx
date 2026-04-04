"use client"

import React, { useEffect, useState } from "react"
import {
  CalendarDays,
  CircleDollarSign,
  FileClock,
  MapPinned,
  RefreshCw,
  Users,
  Wrench,
} from "lucide-react"

import { PortalNav } from "@/components/partner-portal/PortalNav"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PartnerReadMode } from "@/lib/partner-portal/repositories/partner-read"
import type { CalendarEvent, CalendarSourceType } from "@/lib/partner-portal/types"

type CalendarFilter = "all" | CalendarSourceType

type PartnerCalendarPayload = {
  mode: PartnerReadMode
  events: CalendarEvent[]
}

const FILTERS: { value: CalendarFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "installation", label: "설치" },
  { value: "meeting", label: "미팅" },
  { value: "document_due", label: "문서 기한" },
  { value: "internal", label: "내부 일정" },
]

const DEMO_EVENTS: CalendarEvent[] = [
  {
    id: "demo-calendar-1",
    partner_account_id: "demo-account",
    customer_id: "demo-customer-1",
    deal_id: "demo-deal-1",
    source_type: "installation",
    source_id: "demo-install-1",
    starts_at: "2026-04-20T09:00:00+09:00",
    ends_at: "2026-04-20T17:00:00+09:00",
    timezone: "Asia/Seoul",
    title: "강남메가스터디학원 설치",
    description: "전자칠판 4대, T1 2대, 벽걸이 설치",
    status: "active",
    created_by: null,
    created_at: "2026-04-03T09:00:00Z",
    updated_at: "2026-04-03T09:00:00Z",
  },
  {
    id: "demo-calendar-2",
    partner_account_id: "demo-account",
    customer_id: "demo-customer-1",
    deal_id: "demo-deal-2",
    source_type: "meeting",
    source_id: "demo-meeting-1",
    starts_at: "2026-04-16T14:00:00+09:00",
    ends_at: "2026-04-16T15:00:00+09:00",
    timezone: "Asia/Seoul",
    title: "추가 계약 범위 조정 미팅",
    description: "본관 추가 설치 관 확장 여부 확인",
    status: "active",
    created_by: null,
    created_at: "2026-04-02T05:00:00Z",
    updated_at: "2026-04-02T05:00:00Z",
  },
  {
    id: "demo-calendar-3",
    partner_account_id: "demo-account",
    customer_id: "demo-customer-2",
    deal_id: "demo-deal-3",
    source_type: "document_due",
    source_id: "demo-quote-1",
    starts_at: "2026-04-12T10:00:00+09:00",
    ends_at: "2026-04-12T11:00:00+09:00",
    timezone: "Asia/Seoul",
    title: "견적 링크 만료 전 확인",
    description: "리더스입시학원 추가 견적 링크 확인",
    status: "active",
    created_by: null,
    created_at: "2026-04-01T01:00:00Z",
    updated_at: "2026-04-01T01:00:00Z",
  },
  {
    id: "demo-calendar-4",
    partner_account_id: "demo-account",
    customer_id: null,
    deal_id: null,
    source_type: "internal",
    source_id: "demo-internal-1",
    starts_at: "2026-04-18T09:30:00+09:00",
    ends_at: "2026-04-18T10:00:00+09:00",
    timezone: "Asia/Seoul",
    title: "설치팀 콜 체크",
    description: "주말 설치 가능 인력 최종 확인",
    status: "active",
    created_by: null,
    created_at: "2026-04-01T01:00:00Z",
    updated_at: "2026-04-01T01:00:00Z",
  },
]

function readJson<T>(url: string) {
  return fetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }

    return (await response.json()) as T
  })
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

function formatTimeRange(start: string, end: string) {
  return `${new Date(start).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${new Date(end).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

function sourceLabel(source: CalendarSourceType) {
  switch (source) {
    case "installation":
      return "설치"
    case "meeting":
      return "미팅"
    case "document_due":
      return "문서 기한"
    case "internal":
      return "내부 일정"
    default:
      return source
  }
}

function sourceTone(source: CalendarSourceType) {
  switch (source) {
    case "installation":
      return "bg-amber-50 text-amber-700 border-amber-200"
    case "meeting":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "document_due":
      return "bg-violet-50 text-violet-700 border-violet-200"
    case "internal":
      return "bg-slate-100 text-slate-700 border-slate-200"
    default:
      return "bg-white text-[#1a1a1a]/60 border-[#e8e8e4]"
  }
}

function groupEvents(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>()

  for (const event of events) {
    const key = new Date(event.starts_at).toISOString().slice(0, 10)
    const existing = groups.get(key)
    if (existing) {
      existing.push(event)
      continue
    }
    groups.set(key, [event])
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, items]) => ({
      date,
      items: [...items].sort(
        (left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
      ),
    }))
}

export default function PartnerCalendarPage() {
  const [mode, setMode] = useState<PartnerReadMode>("demo")
  const [events, setEvents] = useState<CalendarEvent[]>(DEMO_EVENTS)
  const [filter, setFilter] = useState<CalendarFilter>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const payload = await readJson<PartnerCalendarPayload>("/api/partner/calendar")
        if (!alive) return

        setMode(payload.mode ?? "demo")
        setEvents(payload.events.length > 0 ? payload.events : DEMO_EVENTS)
      } catch {
        if (!alive) return

        setMode("demo")
        setEvents(DEMO_EVENTS)
        setError("연결된 계정이 없어 데모 일정으로 전환했습니다.")
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  const visibleEvents = filter === "all"
    ? events
    : events.filter((event) => event.source_type === filter)

  const groupedEvents = groupEvents(visibleEvents)
  const installationCount = events.filter((event) => event.source_type === "installation").length
  const meetingCount = events.filter((event) => event.source_type === "meeting").length
  const documentCount = events.filter((event) => event.source_type === "document_due").length

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1a1a1a]">
      <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <Card className="border-[#e8e8e4] bg-white shadow-none">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#1a1a1a]/15 bg-[#1a1a1a] text-white">
                  {mode === "demo" ? "DEMO" : "LIVE"}
                </Badge>
                <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/50">
                  Shared Calendar
                </Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1a1a1a] lg:text-4xl">
                파트너 포털 캘린더
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/50">
                설치, 미팅, 문서 기한을 한 화면에서 보고 관리자 캘린더와 같은 일정 원본을 함께 확인합니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1a1a1a]/50">
                <StatChip icon={<CalendarDays className="h-3.5 w-3.5" />} label={`전체 일정 ${events.length}건`} />
                <StatChip icon={<Wrench className="h-3.5 w-3.5" />} label={`설치 ${installationCount}건`} />
                <StatChip icon={<Users className="h-3.5 w-3.5" />} label={`미팅 ${meetingCount}건`} />
                <StatChip icon={<FileClock className="h-3.5 w-3.5" />} label={`문서 기한 ${documentCount}건`} />
              </div>
            </div>
            <div className="space-y-3">
              <PortalNav />
              <div className="flex flex-wrap justify-end gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-2.5 text-sm text-[#1a1a1a]/60">
                  <CircleDollarSign className="h-4 w-4" />
                  설치와 문서 일정이 같은 흐름으로 연결됩니다
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] hover:bg-[#f7f7f5]"
                >
                  새로고침
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="gap-4 pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-[#1a1a1a]">일정 목록</CardTitle>
                  <p className="mt-1 text-sm text-[#1a1a1a]/45">
                    거래 단계와 바로 연결되는 설치/미팅/문서 기한을 한 곳에서 확인합니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFilter(item.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        filter === item.value
                          ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                          : "border-[#e8e8e4] bg-[#f7f7f5] text-[#1a1a1a]/60 hover:bg-white hover:text-[#1a1a1a]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-2xl bg-[#f0f0ec]" />
                  ))}
                </div>
              ) : groupedEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-10 text-center text-sm text-[#1a1a1a]/45">
                  선택한 조건의 일정이 없습니다.
                </div>
              ) : (
                <div className="space-y-5">
                  {groupedEvents.map((group) => (
                    <section key={group.date} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#1a1a1a]">
                            {formatDateLabel(group.items[0].starts_at)}
                          </p>
                          <p className="text-xs text-[#1a1a1a]/45">{group.items.length}건 예정</p>
                        </div>
                        <div className="h-px flex-1 bg-[#efefeb]" />
                      </div>
                      <div className="space-y-3">
                        {group.items.map((event) => (
                          <div
                            key={event.id}
                            className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2 py-1 text-xs font-medium ${sourceTone(event.source_type)}`}>
                                    {sourceLabel(event.source_type)}
                                  </span>
                                  <span className="text-xs text-[#1a1a1a]/45">
                                    {formatTimeRange(event.starts_at, event.ends_at)}
                                  </span>
                                </div>
                                <p className="mt-3 text-base font-semibold text-[#1a1a1a]">{event.title}</p>
                                <p className="mt-1 text-sm text-[#1a1a1a]/55">
                                  {event.description ?? "세부 메모가 아직 없습니다."}
                                </p>
                              </div>
                              <div className="min-w-[180px] rounded-xl border border-[#ecece8] bg-white px-3 py-3 text-sm text-[#1a1a1a]/60">
                                <div className="flex items-center gap-2">
                                  <MapPinned className="h-4 w-4 text-[#1a1a1a]/30" />
                                  {event.timezone}
                                </div>
                                <p className="mt-2 text-xs text-[#1a1a1a]/45">
                                  거래 ID: {event.deal_id ?? "-"}
                                </p>
                                <p className="mt-1 text-xs text-[#1a1a1a]/45">
                                  상태: {event.status}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#1a1a1a]">운영 메모</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[#1a1a1a]/60">
                <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                  일정 수정은 파트너 포털에서 하더라도 관리자 캘린더와 같은 원본을 바라보게 됩니다.
                </div>
                <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                  설치가 하루를 넘길 수 있으므로 시작/종료 시각과 시간대를 함께 표시합니다.
                </div>
                <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                  이후 단계에서는 일정 클릭 시 거래 상세와 연결하고, 수정 로그도 함께 남기게 됩니다.
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#1a1a1a]">빠른 보기</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <QuickRow
                  icon={<Wrench className="h-4 w-4 text-amber-600" />}
                  label="설치 일정"
                  value={`${installationCount}건`}
                />
                <QuickRow
                  icon={<Users className="h-4 w-4 text-blue-600" />}
                  label="미팅 일정"
                  value={`${meetingCount}건`}
                />
                <QuickRow
                  icon={<FileClock className="h-4 w-4 text-violet-600" />}
                  label="문서 기한"
                  value={`${documentCount}건`}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#e8e8e4] bg-white px-3 py-1.5">
      {icon}
      {label}
    </div>
  )
}

function QuickRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-[#1a1a1a]/60">
        {icon}
        {label}
      </div>
      <span className="text-sm font-semibold text-[#1a1a1a]">{value}</span>
    </div>
  )
}
