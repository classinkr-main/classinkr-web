"use client"

/**
 * MessageLogTable — SMS/카카오 발송 로그 (GET /api/admin/messaging/logs)
 *
 * 채널·상태 필터 칩, 상태 뱃지, 마스킹 수신자, 에러 확장행, limit/offset 페이지네이션.
 * 백엔드 트랙 미배포 시 조용히 "준비중" 상태로 강등.
 */

import { Fragment, useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminFetch } from "@/lib/admin-client"
import {
  unwrapMessagingData,
  type MessagingLog,
  type MessagingLogsResult,
} from "@/lib/messaging-client-types"

const PAGE_SIZE = 50

type ChannelFilter = "all" | "sms" | "kakao"
type StatusFilter = "all" | "sent" | "failed" | "simulated"

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; logs: MessagingLog[]; total: number }
  | { kind: "unavailable"; message: string }

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function statusMeta(status: string): {
  label: string
  tone: "success" | "danger" | "neutral"
  Icon: typeof CheckCircle2
} {
  switch (status) {
    case "sent":
      return { label: "성공", tone: "success", Icon: CheckCircle2 }
    case "failed":
      return { label: "실패", tone: "danger", Icon: XCircle }
    case "simulated":
      return { label: "시뮬레이션", tone: "neutral", Icon: AlertTriangle }
    default:
      return { label: status || "—", tone: "neutral", Icon: AlertTriangle }
  }
}

function channelMeta(channel: string): { label: string; Icon: typeof MessageSquare } {
  if (channel === "kakao") return { label: "카카오", Icon: MessageCircle }
  if (channel === "sms") return { label: "문자", Icon: MessageSquare }
  return { label: channel || "—", Icon: MessageSquare }
}

export default function MessageLogTable() {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [refreshing, setRefreshing] = useState(false)
  const [channel, setChannel] = useState<ChannelFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (channel !== "all") params.set("channel", channel)
      if (status !== "all") params.set("status", status)
      params.set("limit", String(PAGE_SIZE))
      params.set("offset", String(offset))

      const res = await adminFetch(`/api/admin/messaging/logs?${params.toString()}`)
      if (!res.ok) {
        setState({
          kind: "unavailable",
          message:
            res.status === 404
              ? "발송 로그 API가 아직 준비되지 않았습니다."
              : `로그를 불러오지 못했습니다. (${res.status})`,
        })
        return
      }
      const json = await res.json().catch(() => null)
      const data = unwrapMessagingData<MessagingLogsResult>(json)
      if (!data || !Array.isArray(data.logs)) {
        setState({ kind: "unavailable", message: "로그 응답 형식을 확인해주세요." })
        return
      }
      setState({ kind: "ready", logs: data.logs, total: data.total ?? data.logs.length })
    } catch {
      setState({ kind: "unavailable", message: "발송 로그를 불러오지 못했습니다." })
    } finally {
      setRefreshing(false)
    }
  }, [channel, status, offset])

  useEffect(() => {
    void load()
  }, [load])

  // 필터 변경 시 오프셋 리셋
  useEffect(() => {
    setOffset(0)
  }, [channel, status])

  return (
    <div className="space-y-3">
      {/* 필터 행 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            options={[
              { value: "all", label: "전체 채널" },
              { value: "sms", label: "문자" },
              { value: "kakao", label: "카카오" },
            ]}
            value={channel}
            onChange={(v) => setChannel(v as ChannelFilter)}
          />
          <FilterGroup
            options={[
              { value: "all", label: "전체 상태" },
              { value: "sent", label: "성공" },
              { value: "failed", label: "실패" },
              { value: "simulated", label: "시뮬" },
            ]}
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/45 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] sm:self-auto"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {/* 본문 */}
      {state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#e8e8e4] bg-white py-12 text-[12px] text-[#1a1a1a]/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          발송 로그를 불러오는 중...
        </div>
      ) : state.kind === "unavailable" ? (
        <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
          <p className="text-[13px] font-medium text-[#111110]">{state.message}</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">
            SMS·카카오 발송 로그는 발송 백엔드가 배포되면 여기에서 채널·상태별로 확인할 수 있습니다.
          </p>
        </div>
      ) : state.logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
          <p className="text-[13px] font-medium text-[#111110]">발송 로그가 없습니다.</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">
            SMS·카카오 발송을 진행하면 채널·상태·결과가 이곳에 기록됩니다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e8e4] bg-[#FAFAF8]">
                  <th className="px-4 py-3 text-left font-medium text-[#1a1a1a]/50 whitespace-nowrap">채널</th>
                  <th className="px-4 py-3 text-left font-medium text-[#1a1a1a]/50 whitespace-nowrap">상태</th>
                  <th className="px-4 py-3 text-left font-medium text-[#1a1a1a]/50">수신자</th>
                  <th className="px-4 py-3 text-left font-medium text-[#1a1a1a]/50 whitespace-nowrap hidden md:table-cell">템플릿/코드</th>
                  <th className="px-4 py-3 text-left font-medium text-[#1a1a1a]/50 whitespace-nowrap hidden sm:table-cell">시각</th>
                  <th className="w-8 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {state.logs.map((log) => {
                  const sm = statusMeta(log.status)
                  const cm = channelMeta(log.channel)
                  const isExpanded = expandedId === log.id
                  const hasContext =
                    !!log.context && Object.keys(log.context).length > 0
                  const hasDetail = !!log.error || hasContext
                  const StatusIcon = sm.Icon
                  const ChannelIcon = cm.Icon
                  return (
                    <Fragment key={log.id}>
                      <tr
                        className={`border-b border-[#f0f0ec] transition-colors ${
                          hasDetail ? "cursor-pointer hover:bg-[#FAFAF8]/60" : ""
                        }`}
                        onClick={() => hasDetail && setExpandedId(isExpanded ? null : log.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#1a1a1a]/70">
                            <ChannelIcon className="h-3.5 w-3.5 text-[#1a1a1a]/40" />
                            {cm.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusPill tone={sm.tone} label={sm.label} Icon={StatusIcon} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-[#111110]">{log.recipient}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="font-mono text-[11px] text-[#1a1a1a]/45">
                            {log.templateId ?? log.statusCode ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[11px] text-[#1a1a1a]/40 hidden sm:table-cell">
                          {fmtDate(log.createdAt)}
                        </td>
                        <td className="px-2 py-3 text-center">
                          {hasDetail ? (
                            isExpanded ? (
                              <ChevronDown className="mx-auto h-3.5 w-3.5 text-[#1a1a1a]/30" />
                            ) : (
                              <ChevronRight className="mx-auto h-3.5 w-3.5 text-[#1a1a1a]/20" />
                            )
                          ) : null}
                        </td>
                      </tr>
                      {isExpanded && hasDetail && (
                        <tr className="border-b border-[#f0f0ec] bg-[#FAFAF8]">
                          <td colSpan={6} className="px-4 py-3">
                            {log.error && (
                              <div className="mb-2 flex items-start gap-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B43E3E]" />
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-[#8F2C2C]">오류 메시지</p>
                                  <p className="mt-0.5 break-all font-mono text-[11px] text-[#8F2C2C]">
                                    {log.error}
                                    {log.statusCode && (
                                      <span className="ml-1 text-[#8F2C2C]/60">({log.statusCode})</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            )}
                            {hasContext && (
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#1a1a1a]/40">
                                  컨텍스트
                                </p>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-white px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[#1a1a1a]/55">
                                  {JSON.stringify(log.context, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between border-t border-[#f0f0ec] px-4 py-2.5">
            <p className="text-[11px] text-[#1a1a1a]/40">
              {offset + 1}–{offset + state.logs.length} / 총 {state.total}건
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0 || refreshing}
                className="h-7 px-2.5 text-[11px]"
              >
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={offset + state.logs.length >= state.total || refreshing}
                className="h-7 px-2.5 text-[11px]"
              >
                다음
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────

function FilterGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            value === opt.value
              ? "border-[#111110] bg-[#111110] text-white"
              : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:border-[#c8c8c4] hover:text-[#111110]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function StatusPill({
  tone,
  label,
  Icon,
}: {
  tone: "success" | "danger" | "neutral"
  label: string
  Icon: typeof CheckCircle2
}) {
  const style =
    tone === "success"
      ? "bg-[#ECFDF5] text-[#084734]"
      : tone === "danger"
        ? "bg-[#FCE9E9] text-[#8F2C2C]"
        : "bg-[#f0f0ec] text-[#1a1a1a]/55"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
