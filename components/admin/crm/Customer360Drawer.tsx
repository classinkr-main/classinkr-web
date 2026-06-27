"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Coins,
  ExternalLink,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  StickyNote,
  User2,
  X,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { pushRecentCustomer } from "@/lib/crm/recent-customers"
import { CS_MOTIONS, type CsMotion } from "@/lib/crm/cs-motions"
import type { Customer360, Customer360Severity } from "@/lib/repositories/crm-customer-360"
import type { CrmDealStage } from "@/lib/repositories/crm-deals"
import type { CrmTaskType } from "@/lib/repositories/crm-tasks"

const DEAL_STAGE_OPTIONS: Array<{ value: CrmDealStage; label: string }> = [
  { value: "consult", label: "상담" },
  { value: "demo", label: "데모" },
  { value: "quote", label: "견적" },
  { value: "decision", label: "의사결정" },
  { value: "order", label: "오더/설치" },
  { value: "won", label: "완료" },
  { value: "lost", label: "실패" },
]

const DEAL_STAGE_LABEL: Record<CrmDealStage, string> = {
  consult: "상담",
  demo: "데모",
  quote: "견적",
  decision: "의사결정",
  order: "오더/설치",
  won: "완료",
  lost: "실패",
}

interface Props {
  customerKey: string | null
  name?: string | null
  onClose: () => void
}

const SEVERITY_CLASS: Record<Customer360Severity, string> = {
  critical: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
  high: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  medium: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  low: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
}

const SEVERITY_LABEL: Record<Customer360Severity, string> = {
  critical: "긴급",
  high: "높음",
  medium: "주의",
  low: "안정",
}

const SERVICE_RISK_LABEL: Record<string, string> = {
  urgent: "긴급",
  soon: "임박",
  watch: "주시",
  normal: "정상",
}

const SERVICE_RISK_CLASS: Record<string, string> = {
  urgent: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
  soon: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  watch: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  normal: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
}

const CONFIDENCE_LABEL: Record<string, string> = { high: "신뢰 높음", medium: "신뢰 보통", low: "신뢰 낮음" }

const TASK_TYPE_OPTIONS: Array<{ value: CrmTaskType; label: string }> = [
  { value: "call", label: "전화" },
  { value: "kakao", label: "카카오" },
  { value: "email", label: "이메일" },
  { value: "meeting", label: "미팅" },
  { value: "quote", label: "견적" },
  { value: "demo", label: "데모" },
  { value: "install", label: "설치" },
  { value: "renewal", label: "갱신" },
  { value: "cs_checkin", label: "CS 점검" },
  { value: "data_fix", label: "데이터 정리" },
  { value: "other", label: "기타" },
]

const EVENT_SOURCE_LABEL: Record<string, string> = {
  manual_note: "메모",
  meeting_minutes: "회의록",
  recording: "녹음",
  calendar_event: "캘린더",
  lead_contact_log: "리드 연락",
  external_crm: "외부 CRM",
  sheet: "시트",
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date)
}

function formatDay(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date)
}

function formatAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("ko-KR").format(value)
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/45">
      {icon}
      {children}
    </h3>
  )
}

export default function Customer360Drawer({ customerKey, name, onClose }: Props) {
  const [data, setData] = useState<Customer360 | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskType, setTaskType] = useState<CrmTaskType>("call")
  const [taskDue, setTaskDue] = useState("")
  const [dealTitle, setDealTitle] = useState("")
  const [dealStage, setDealStage] = useState<CrmDealStage>("consult")
  const [dealAmount, setDealAmount] = useState("")

  const url = customerKey ? `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/360` : null

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      if (!url) return
      setLoading(true)
      setError(null)
      try {
        const next = await adminFetchJsonCached<Customer360>(options?.force ? `${url}?_=${Date.now()}` : url, undefined, {
          cacheKey: url,
          ttlMs: 15_000,
          staleWhileRevalidateMs: 60_000,
          force: options?.force,
        })
        setData(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : "고객 정보를 불러오지 못했습니다.")
      } finally {
        setLoading(false)
      }
    },
    [url]
  )

  useEffect(() => {
    // 고객이 바뀌면 이전 고객의 데이터/폼 입력이 새 드로어에 잔존하지 않게 초기화한다.
    setData(null)
    setError(null)
    setNote("")
    setTaskTitle("")
    setTaskType("call")
    setTaskDue("")
    setDealTitle("")
    setDealStage("consult")
    setDealAmount("")
    if (customerKey) void load()
  }, [customerKey, load])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    if (data?.found && data.header && customerKey) {
      pushRecentCustomer({
        key: customerKey,
        name: data.header.name,
        sourceLabel: data.header.sourceLabel,
        source: data.source,
      })
    }
  }, [data, customerKey])

  const header = data?.header
  const displayName = header?.name ?? name ?? "고객"
  const targetType = data?.source ?? (customerKey?.startsWith("neo:") ? "neo_account" : "lead")
  const entityId = data?.entityId ?? (customerKey ? customerKey.slice(customerKey.indexOf(":") + 1) : "")

  const refetch = useCallback(async () => {
    if (url) clearAdminRequestCache()
    await load({ force: true })
  }, [load, url])

  const handleAddNote = useCallback(async () => {
    const body = note.trim()
    if (!body || !customerKey) return
    setActingId("note")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/events", {
        method: "POST",
        body: JSON.stringify({ targetType, targetId: entityId, targetLabel: displayName, sourceType: "manual_note", body }),
      })
      setNote("")
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모 저장에 실패했습니다.")
    } finally {
      setActingId(null)
    }
  }, [note, customerKey, targetType, entityId, displayName, refetch])

  const handleAddTask = useCallback(async () => {
    const title = taskTitle.trim()
    if (!title || !customerKey) return
    setActingId("task")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          taskType,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          dueAt: taskDue ? new Date(taskDue).toISOString() : undefined,
          assignToMe: true,
        }),
      })
      setTaskTitle("")
      setTaskDue("")
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "할 일 저장에 실패했습니다.")
    } finally {
      setActingId(null)
    }
  }, [taskTitle, taskType, customerKey, targetType, entityId, displayName, taskDue, refetch])

  const handleCsMotion = useCallback(
    async (motion: CsMotion) => {
      if (!customerKey) return
      setActingId(`cs:${motion.key}`)
      setError(null)
      try {
        await adminFetchJson("/api/admin/crm/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: motion.title,
            taskType: motion.taskType,
            targetType,
            targetId: entityId,
            targetLabel: displayName,
            assignToMe: true,
          }),
        })
        await refetch()
      } catch (err) {
        setError(err instanceof Error ? err.message : "CS 할 일 생성에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [customerKey, targetType, entityId, displayName, refetch]
  )

  const handleCompleteTask = useCallback(
    async (taskId: string) => {
      setActingId(`task:${taskId}`)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "complete", outcome: "고객 360에서 완료" }),
        })
        await refetch()
      } catch (err) {
        setError(err instanceof Error ? err.message : "할 일 완료에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [refetch]
  )

  const handleAddDeal = useCallback(async () => {
    const title = dealTitle.trim()
    if (!title || !customerKey) return
    setActingId("deal")
    setError(null)
    try {
      await adminFetchJson("/api/admin/crm/deals-lite", {
        method: "POST",
        body: JSON.stringify({
          title,
          stage: dealStage,
          targetType,
          targetId: entityId,
          targetLabel: displayName,
          expectedAmount: dealAmount ? Number(dealAmount.replace(/[^\d.-]/g, "")) : undefined,
          assignToMe: true,
        }),
      })
      setDealTitle("")
      setDealAmount("")
      setDealStage("consult")
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "딜 저장에 실패했습니다.")
    } finally {
      setActingId(null)
    }
  }, [dealTitle, dealStage, dealAmount, customerKey, targetType, entityId, displayName, refetch])

  const handleDealStage = useCallback(
    async (dealId: string, stage: CrmDealStage) => {
      setActingId(`deal:${dealId}`)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/deals-lite/${encodeURIComponent(dealId)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "stage", stage }),
        })
        await refetch()
      } catch (err) {
        setError(err instanceof Error ? err.message : "딜 단계 변경에 실패했습니다.")
      } finally {
        setActingId(null)
      }
    },
    [refetch]
  )

  const money = data?.money
  const moneyVisible = useMemo(() => money?.available ?? false, [money])

  if (!customerKey) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#e8e8e4] bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-[#111110] px-2 py-0.5 text-[11px] font-semibold text-white">
                {header?.sourceLabel ?? (targetType === "neo_account" ? "고객" : "리드")}
              </span>
              {header?.statusLabel ? (
                <span className="rounded-full bg-[#fafaf8] px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/55">
                  {header.statusLabel}
                </span>
              ) : null}
              {data?.risk ? (
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[data.risk.severity]}`}>
                  리스크 {SEVERITY_LABEL[data.risk.severity]}
                </span>
              ) : null}
            </div>
            <h2 className="truncate text-[18px] font-bold text-[#111110]">{displayName}</h2>
            <p className="mt-0.5 truncate text-[12px] text-[#1a1a1a]/45">
              <User2 className="mr-1 inline h-3 w-3" />
              {header?.ownerName ?? "담당 미배정"}
              {header?.priorityReason ? ` · ${header.priorityReason}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
              aria-label="새로고침"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 space-y-5 overflow-y-auto bg-[#f5f5f2] p-5">
          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {data?.health.warnings.length ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{data.health.warnings.join(" ")}</span>
            </div>
          ) : null}

          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-[#1a1a1a]/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              고객 정보를 불러오는 중입니다...
            </div>
          ) : null}

          {/* contacts + risk */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<User2 className="h-3.5 w-3.5" />}>연락처 · 리스크</SectionTitle>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">전화</p>
                  <p className="font-medium text-[#111110]">{data.contacts?.phone ?? "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">이메일</p>
                  <p className="truncate font-medium text-[#111110]">{data.contacts?.email ?? "-"}</p>
                </div>
                {data.contacts?.extra.map((field) => (
                  <div key={`${field.label}:${field.value}`} className="col-span-2">
                    <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{field.label}</p>
                    <p className="font-medium text-[#111110]">{field.value}</p>
                  </div>
                ))}
              </div>
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
          ) : null}

          {/* money */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<Coins className="h-3.5 w-3.5" />}>돈흐름</SectionTitle>
              {targetType === "lead" ? (
                <p className="text-[12px] text-[#1a1a1a]/40">리드 단계 · 연결된 딜 없음</p>
              ) : moneyVisible ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[#fafaf8] p-3">
                      <p className="text-[11px] font-semibold text-[#1a1a1a]/35">잔액 합계</p>
                      <p className="mt-1 text-[15px] font-bold text-[#111110]">{formatAmount(money?.totalBalance)}</p>
                    </div>
                    <div className="rounded-xl bg-[#fafaf8] p-3">
                      <p className="text-[11px] font-semibold text-[#1a1a1a]/35">오더 합계</p>
                      <p className="mt-1 text-[15px] font-bold text-[#111110]">{formatAmount(money?.totalOrderAmount)}</p>
                    </div>
                  </div>
                  {money?.eeoAccounts.length ? (
                    <div className="space-y-1.5">
                      {money.eeoAccounts.slice(0, 4).map((eeo) => (
                        <div key={eeo.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="truncate font-medium text-[#111110]">{eeo.name}</span>
                          <span className="shrink-0 text-[#1a1a1a]/45">
                            잔액 {formatAmount(eeo.balance)} · 만료 {formatDay(eeo.expireAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-[12px] text-[#1a1a1a]/40">표시할 돈흐름 데이터가 없습니다.</p>
              )}
            </section>
          ) : null}

          {/* deals (Deal Lite) */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<Briefcase className="h-3.5 w-3.5" />}>
                딜 {data.deals.summary.total > 0 ? `(${data.deals.summary.total})` : ""}
              </SectionTitle>
              <div className="mb-3 space-y-1.5">
                {data.deals.rows.length === 0 ? (
                  <p className="text-[12px] text-[#1a1a1a]/40">진행 중인 딜이 없습니다.</p>
                ) : (
                  data.deals.rows.map((deal) => (
                    <div key={deal.id} className="rounded-xl bg-[#fafaf8] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[12px] font-semibold text-[#111110]">{deal.title}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            deal.status === "won"
                              ? "bg-[#ECFDF5] text-[#084734]"
                              : deal.status === "lost"
                                ? "bg-[#FEF3EE] text-[#B85C33]"
                                : "bg-white text-[#1a1a1a]/55"
                          }`}
                        >
                          {DEAL_STAGE_LABEL[deal.stage]}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-[#1a1a1a]/45">
                          {deal.expectedAmount != null ? `${formatAmount(deal.expectedAmount)} · ` : ""}
                          {deal.expectedCloseAt ? `예상 ${formatDay(deal.expectedCloseAt)}` : "종료일 미정"}
                        </p>
                        {deal.status === "open" ? (
                          <select
                            value={deal.stage}
                            onChange={(event) => void handleDealStage(deal.id, event.target.value as CrmDealStage)}
                            disabled={actingId === `deal:${deal.id}`}
                            className="h-7 rounded-lg border border-[#e8e8e4] bg-white px-1.5 text-[11px] font-semibold text-[#111110] outline-none disabled:opacity-50"
                            aria-label="딜 단계"
                          >
                            {DEAL_STAGE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[#f0f0ec] pt-3">
                <input
                  value={dealTitle}
                  onChange={(event) => setDealTitle(event.target.value)}
                  placeholder="새 딜 제목"
                  className="h-9 min-w-[140px] flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                />
                <input
                  value={dealAmount}
                  onChange={(event) => setDealAmount(event.target.value)}
                  inputMode="numeric"
                  placeholder="예상금액"
                  className="h-9 w-24 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                />
                <select
                  value={dealStage}
                  onChange={(event) => setDealStage(event.target.value as CrmDealStage)}
                  className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                >
                  {DEAL_STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleAddDeal()}
                  disabled={!dealTitle.trim() || actingId === "deal"}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  딜 추가
                </button>
              </div>
            </section>
          ) : null}

          {/* open tasks + quick add */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<ListChecks className="h-3.5 w-3.5" />}>
                열린 할 일 {data.tasks.summary.total > 0 ? `(${data.tasks.summary.total})` : ""}
              </SectionTitle>
              <div className="mb-3 space-y-1.5">
                {data.tasks.rows.length === 0 ? (
                  <p className="text-[12px] text-[#1a1a1a]/40">열린 할 일이 없습니다.</p>
                ) : (
                  data.tasks.rows.map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#fafaf8] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-[#111110]">{task.title}</p>
                        <p className="text-[11px] text-[#1a1a1a]/40">
                          <CalendarClock className="mr-1 inline h-3 w-3" />
                          {task.dueAt ? formatDay(task.dueAt) : "기한 없음"}
                          {task.ownerNameSnapshot ? ` · ${task.ownerNameSnapshot}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCompleteTask(task.id)}
                        disabled={actingId === `task:${task.id}`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#D7EBDD] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        완료
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-2 border-t border-[#f0f0ec] pt-3">
                <input
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="새 할 일 제목"
                  className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    value={taskType}
                    onChange={(event) => setTaskType(event.target.value as CrmTaskType)}
                    className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {TASK_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(event) => setTaskDue(event.target.value)}
                    className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddTask()}
                    disabled={!taskTitle.trim() || actingId === "task"}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    내 할 일로 추가
                  </button>
                </div>
              </div>
              <div className="mt-3 border-t border-[#f0f0ec] pt-3">
                <p className="mb-1.5 text-[11px] font-semibold text-[#1a1a1a]/45">고객 성공(CS) 동선 · 원클릭</p>
                <div className="flex flex-wrap gap-1.5">
                  {CS_MOTIONS.map((motion) => (
                    <button
                      key={motion.key}
                      type="button"
                      onClick={() => void handleCsMotion(motion)}
                      disabled={actingId === `cs:${motion.key}`}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 text-[11px] font-semibold text-[#1a1a1a]/65 transition-colors hover:border-[#084734] hover:text-[#084734] disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      {motion.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* activity timeline + quick note */}
          {data ? (
            <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
              <SectionTitle icon={<ClipboardList className="h-3.5 w-3.5" />}>
                활동 타임라인 {data.activity.summary.total > 0 ? `(${data.activity.summary.total})` : ""}
              </SectionTitle>
              <div className="mb-3 flex flex-col gap-2 border-b border-[#f0f0ec] pb-3">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="빠른 메모 입력 후 저장"
                  rows={2}
                  className="rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-2 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
                />
                <button
                  type="button"
                  onClick={() => void handleAddNote()}
                  disabled={!note.trim() || actingId === "note"}
                  className="inline-flex h-9 items-center justify-center gap-1 self-end rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-40"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                  메모 저장
                </button>
              </div>
              {data.activity.rows.length === 0 ? (
                <p className="text-[12px] text-[#1a1a1a]/40">기록된 활동이 없습니다.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.activity.rows.map((event) => (
                    <li key={event.id} className="border-l-2 border-[#e8e8e4] pl-3">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-[#fafaf8] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/55">
                          {EVENT_SOURCE_LABEL[event.sourceType] ?? event.sourceType}
                        </span>
                        <span className="text-[11px] text-[#1a1a1a]/35">{formatDate(event.occurredAt)}</span>
                        {event.sentiment === "risk" ? (
                          <span className="rounded bg-[#FEF3EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#B85C33]">위험</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] font-semibold text-[#111110]">{event.title}</p>
                      {event.summary || event.body ? (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-[#1a1a1a]/55">{event.summary ?? event.body}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {/* escape hatch to full source screen */}
          {header || name ? (
            <Link
              href={
                targetType === "neo_account"
                  ? `/admin/crm/customers/accounts?account=${encodeURIComponent(entityId)}`
                  : `/admin/crm/customers/leads?lead=${encodeURIComponent(entityId)}`
              }
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
            >
              원본 화면 열기
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
