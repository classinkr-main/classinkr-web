"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ClipboardPaste,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import type { PublicEvent } from "@/lib/types/public-events"

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface CaptureBatch {
  id: string
  status: string
  publicEventId: string | null
  rowCount: number
  eventCreatedCount: number
  taskCreatedCount: number
  leadCreatedCount: number
}

// GET /batches 목록 항목 — 이어하기·취소 대상 미완료 배치
interface OpenCaptureBatch extends CaptureBatch {
  sourceLabel: string | null
  createdAt: string
}

interface CaptureRow {
  id: string
  rowIndex: number
  organizationName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  regionLabel: string | null
  activityType: string
  memo: string | null
  matchStatus: string
  matchedTargetType: string | null
  matchedTargetLabel: string | null
  attendeeOrigin: string | null
  selected: boolean
  applyStatus: string
}

interface ApplySummary {
  eventCreated: number
  taskCreated: number
  leadCreated: number
  applied: number
  failed: number
  skipped: number
  reviewRemaining: number
}

type Mode = "table" | "text"
type Step = "compose" | "review" | "done"

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const MATCH_LABEL: Record<string, { label: string; tone: string; origin: string }> = {
  confirmed_lead: { label: "리드 확정", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", origin: "리드 출신" },
  confirmed_customer: { label: "고객 확정", tone: "border-sky-200 bg-sky-50 text-sky-700", origin: "기존/파트너 고객" },
  new_lead_candidate: { label: "신규 리드", tone: "border-amber-200 bg-amber-50 text-amber-700", origin: "행사 신규" },
  multiple_candidates: { label: "다중 후보", tone: "border-purple-200 bg-purple-50 text-purple-700", origin: "검토 후 결정" },
  needs_review: { label: "검토 필요", tone: "border-[#e8e8e4] bg-[#f6f5f4] text-[#1a1a1a]/55", origin: "미상" },
  duplicate_in_batch: { label: "중복", tone: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/40", origin: "—" },
}

function matchMeta(status: string) {
  return MATCH_LABEL[status] ?? MATCH_LABEL.needs_review
}

const BATCH_STATUS_LABEL: Record<string, string> = {
  draft: "입력 전",
  parsed: "검토 중",
  reviewed: "검토 완료",
  partial_failed: "일부 실패",
}

function batchDateLabel(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

// 행별 출신 지정 — "" = 자동 도출(apply 시), 그 외 = 수동 override(파트너 고객 등)
const ORIGIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "자동" },
  { value: "ad_lead", label: "광고 리드" },
  { value: "site_lead", label: "홈페이지 리드" },
  { value: "kr_team_lead", label: "KR 팀 리드" },
  { value: "new_lead", label: "행사 신규" },
  { value: "existing_customer", label: "기존 고객" },
  { value: "partner_customer", label: "파트너 고객" },
]

function eventDateLabel(event: PublicEvent) {
  const d = new Date(event.startsAt)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

const PLACEHOLDER = `엑셀/구글시트에서 복사한 표를 그대로 붙여넣으세요.
기관명\t담당자\t연락처\t이메일
○○학원\t김선생\t010-1234-5678\tkim@example.com
△△캠퍼스\t이원장\t010-2222-3333\tlee@example.com`

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────────

export default function CaptureInboxClient({ initialEventId = "" }: { initialEventId?: string }) {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId)
  const [mode, setMode] = useState<Mode>("table")
  const [rawText, setRawText] = useState("")

  const [step, setStep] = useState<Step>("compose")
  const [batch, setBatch] = useState<CaptureBatch | null>(null)
  const [rows, setRows] = useState<CaptureRow[]>([])
  const [summary, setSummary] = useState<ApplySummary | null>(null)

  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewOnly, setReviewOnly] = useState(false)

  // 이탈/새로고침으로 남은 미완료 배치 — 이어하기·취소 대상
  const [openBatches, setOpenBatches] = useState<OpenCaptureBatch[]>([])
  const [openBatchBusyId, setOpenBatchBusyId] = useState<string | null>(null)

  useEffect(() => {
    adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, { ttlMs: 60_000 })
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
        )
        setEvents(sorted)
      })
      .catch(() => setError("행사 목록을 불러오지 못했습니다."))
  }, [])

  const loadOpenBatches = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ batches: OpenCaptureBatch[] }>("/api/admin/crm/capture/batches")
      setOpenBatches(data.batches)
    } catch {
      // 목록 로드 실패는 치명적이지 않음 — 섹션만 비워둔다.
    }
  }, [])

  useEffect(() => {
    void loadOpenBatches()
  }, [loadOpenBatches])

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  )

  const counts = useMemo(() => {
    const selected = rows.filter((r) => r.selected).length
    const newLeads = rows.filter((r) => r.matchStatus === "new_lead_candidate").length
    const review = rows.filter(
      (r) => r.matchStatus === "needs_review" || r.matchStatus === "multiple_candidates"
    ).length
    return { total: rows.length, selected, newLeads, review }
  }, [rows])

  const visibleRows = useMemo(
    () => (reviewOnly ? rows.filter((r) => r.matchStatus !== "confirmed_lead" && r.matchStatus !== "confirmed_customer") : rows),
    [rows, reviewOnly]
  )

  // 지금 작업 중인 배치는 이어하기 목록에서 제외
  const resumableBatches = useMemo(
    () => openBatches.filter((b) => b.id !== batch?.id),
    [openBatches, batch]
  )

  const handleAnalyze = useCallback(async () => {
    if (!selectedEventId) {
      setError("행사를 먼저 선택하세요.")
      return
    }
    if (!rawText.trim()) {
      setError("명단을 붙여넣으세요.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      let batchId = batch?.id
      if (!batchId) {
        const created = await adminFetchJson<{ batch: CaptureBatch }>("/api/admin/crm/capture/batches", {
          method: "POST",
          body: JSON.stringify({
            sourceType: "public_event",
            sourceLabel: selectedEvent?.title ?? null,
            publicEventId: selectedEventId,
            defaultActivityType: "event_attended",
            defaultTaskEnabled: true,
            defaultTaskOffsetDays: 1,
          }),
        })
        batchId = created.batch.id
      }
      const parsed = await adminFetchJson<{ batch: CaptureBatch; rows: CaptureRow[] }>(
        `/api/admin/crm/capture/batches/${batchId}/parse`,
        { method: "POST", body: JSON.stringify({ raw: rawText, mode }) }
      )
      setBatch(parsed.batch)
      setRows(parsed.rows)
      setStep("review")
      void loadOpenBatches()
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석에 실패했습니다.")
    } finally {
      setBusy(false)
    }
  }, [selectedEventId, selectedEvent, rawText, mode, batch, loadOpenBatches])

  const toggleRow = useCallback(async (row: CaptureRow, next: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, selected: next } : r)))
    try {
      await adminFetchJson(`/api/admin/crm/capture/rows/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ selected: next }),
      })
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, selected: !next } : r)))
    }
  }, [])

  const setRowOrigin = useCallback(async (row: CaptureRow, value: string) => {
    const next = value === "" ? null : value
    const prev = row.attendeeOrigin
    setRows((r) => r.map((x) => (x.id === row.id ? { ...x, attendeeOrigin: next } : x)))
    try {
      await adminFetchJson(`/api/admin/crm/capture/rows/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ attendeeOrigin: next }),
      })
    } catch {
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, attendeeOrigin: prev } : x)))
    }
  }, [])

  const setAllSelected = useCallback(
    async (next: boolean) => {
      const targets = visibleRows.filter((r) => r.matchStatus !== "duplicate_in_batch")
      setRows((prev) =>
        prev.map((r) => (targets.some((t) => t.id === r.id) ? { ...r, selected: next } : r))
      )
      await Promise.allSettled(
        targets.map((r) =>
          adminFetchJson(`/api/admin/crm/capture/rows/${r.id}`, {
            method: "PATCH",
            body: JSON.stringify({ selected: next }),
          })
        )
      )
    },
    [visibleRows]
  )

  const handleApply = useCallback(async () => {
    if (!batch) return
    if (counts.selected === 0) {
      setError("확정할 행을 1개 이상 선택하세요.")
      return
    }
    if (!window.confirm(`${counts.selected}건을 확정합니다.\n신규는 리드로 생성되고, 모두 "${selectedEvent?.title ?? "행사"}" 참석으로 기록됩니다.`)) {
      return
    }
    setApplying(true)
    setError(null)
    try {
      const result = await adminFetchJson<{ batch: CaptureBatch; summary: ApplySummary }>(
        `/api/admin/crm/capture/batches/${batch.id}/apply`,
        { method: "POST" }
      )
      setSummary(result.summary)
      setStep("done")
      void loadOpenBatches()
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정에 실패했습니다.")
    } finally {
      setApplying(false)
    }
  }, [batch, counts.selected, selectedEvent, loadOpenBatches])

  const reset = useCallback(() => {
    setBatch(null)
    setRows([])
    setSummary(null)
    setRawText("")
    setStep("compose")
    setError(null)
    setReviewOnly(false)
    void loadOpenBatches()
  }, [loadOpenBatches])

  const resumeBatch = useCallback(async (target: OpenCaptureBatch) => {
    setOpenBatchBusyId(target.id)
    setError(null)
    try {
      const data = await adminFetchJson<{ batch: OpenCaptureBatch; rows: CaptureRow[] }>(
        `/api/admin/crm/capture/batches/${target.id}`
      )
      setBatch(data.batch)
      setRows(data.rows)
      setSummary(null)
      setRawText("")
      setReviewOnly(false)
      if (data.batch.publicEventId) setSelectedEventId(data.batch.publicEventId)
      // 원문 텍스트는 저장하지 않으므로, 파싱된 행이 있으면 바로 검토 단계로 복원한다.
      setStep(data.rows.length > 0 ? "review" : "compose")
    } catch (e) {
      setError(e instanceof Error ? e.message : "배치를 불러오지 못했습니다.")
    } finally {
      setOpenBatchBusyId(null)
    }
  }, [])

  const cancelBatch = useCallback(
    async (target: OpenCaptureBatch) => {
      if (!window.confirm("이 배치를 취소할까요? 저장된 명단 행은 적용되지 않습니다.")) return
      setOpenBatchBusyId(target.id)
      setError(null)
      try {
        await adminFetchJson(`/api/admin/crm/capture/batches/${target.id}/cancel`, { method: "POST" })
        setOpenBatches((prev) => prev.filter((b) => b.id !== target.id))
        if (batch?.id === target.id) {
          setBatch(null)
          setRows([])
          setStep("compose")
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "배치 취소에 실패했습니다.")
      } finally {
        setOpenBatchBusyId(null)
      }
    },
    [batch]
  )

  // ─── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111110]">CRM 입력함</h1>
        <p className="mt-0.5 text-[13px] text-[#1a1a1a]/45">
          행사 참석·신청 명단을 붙여넣어 리드·고객과 매칭합니다. 확정한 행은 CRM 기록과 후속 태스크로 연결됩니다.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === "done" && summary ? (
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
          <div className="flex items-center gap-2 text-[#084734]">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="text-[15px] font-bold">확정 완료</h2>
          </div>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/50">
            {selectedEvent?.title ?? "행사"} 참석자가 CRM에 기록되었습니다.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="참석 기록" value={summary.eventCreated} tone="success" />
            <SummaryStat label="신규 리드" value={summary.leadCreated} />
            <SummaryStat label="후속 태스크" value={summary.taskCreated} />
            <SummaryStat label="검토 보류" value={summary.reviewRemaining} tone={summary.reviewRemaining > 0 ? "warn" : "neutral"} />
          </div>
          {summary.failed > 0 && (
            <p className="mt-3 text-[12px] text-[#B85C33]">{summary.failed}건은 적용에 실패했습니다. 다시 시도해 주세요.</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#111110] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700"
            >
              <ClipboardPaste className="h-4 w-4" />새 명단 입력
            </button>
            {summary.leadCreated > 0 && (
              <Link
                href="/admin/crm/customers/leads?filter=new"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-4 py-2 text-[13px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4]"
              >
                생성된 리드 보기
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            <Link
              href="/admin/crm/activity"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-4 py-2 text-[13px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4]"
            >
              활동 기록 보기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 진행 중인 배치 — 이탈/새로고침으로 남은 미완료 배치 이어하기·취소 */}
          {step === "compose" && resumableBatches.length > 0 && (
            <div className="mb-5 rounded-2xl border border-[#e8e8e4] bg-white">
              <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
                <History className="h-4 w-4 text-[#1a1a1a]/40" />
                <h2 className="text-[13px] font-bold text-[#111110]">진행 중인 배치</h2>
                <span className="text-[11px] text-[#1a1a1a]/40">{resumableBatches.length}건</span>
              </div>
              <ul className="divide-y divide-[#f0f0ec]">
                {resumableBatches.map((item) => {
                  const itemBusy = openBatchBusyId === item.id
                  return (
                    <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#111110]">
                          {item.sourceLabel ?? "이름 없는 명단"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                          {batchDateLabel(item.createdAt)} · {BATCH_STATUS_LABEL[item.status] ?? item.status}
                          {item.rowCount > 0 && ` · ${item.rowCount}행`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => resumeBatch(item)}
                          disabled={openBatchBusyId != null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#084734] transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
                        >
                          {itemBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                          이어서 하기
                        </button>
                        <button
                          onClick={() => cancelBatch(item)}
                          disabled={openBatchBusyId != null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a]/50 transition-colors hover:bg-[#F6F5F4] hover:text-[#B85C33] disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          취소
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* compose */}
          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/50">
                  <CalendarIcon className="mr-1 inline h-3.5 w-3.5" />행사 선택
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value)
                    if (batch) reset()
                  }}
                  disabled={step === "review"}
                  className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none disabled:bg-[#f6f5f4] disabled:text-[#1a1a1a]/45"
                >
                  <option value="">행사를 선택하세요…</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {eventDateLabel(event)} · {event.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="입력 형식">
                {(["table", "text"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    disabled={step === "review"}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50 ${
                      mode === m ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                    }`}
                  >
                    {m === "table" ? "표 붙여넣기" : "자유 텍스트"}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={step === "review"}
              rows={step === "review" ? 3 : 8}
              placeholder={PLACEHOLDER}
              className="mt-3 w-full resize-y rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 font-mono text-[12px] leading-relaxed focus:border-[#111110]/30 focus:outline-none disabled:bg-[#f6f5f4] disabled:text-[#1a1a1a]/45"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-[#1a1a1a]/40">
                전화·이메일이 정확히 일치하면 자동 확정, 그 외에는 검토 후 체크하세요.
              </p>
              {step === "compose" ? (
                <button
                  onClick={handleAnalyze}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#111110] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  명단 분석
                </button>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  다시 분석
                </button>
              )}
            </div>
          </div>

          {/* review */}
          {step === "review" && (
            <div className="mt-5 rounded-2xl border border-[#e8e8e4] bg-white">
              <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f0ec] px-2 py-0.5 font-medium text-[#1a1a1a]/60">
                    <Users className="h-3.5 w-3.5" />총 {counts.total}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">선택 {counts.selected}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">신규 {counts.newLeads}</span>
                  {counts.review > 0 && (
                    <span className="rounded-full bg-[#f6f5f4] px-2 py-0.5 font-medium text-[#1a1a1a]/55">검토 {counts.review}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[12px] text-[#1a1a1a]/55">
                    <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} className="accent-[#084734]" />
                    검토 필요만
                  </label>
                  <button onClick={() => setAllSelected(true)} className="text-[12px] font-medium text-[#084734] hover:underline">전체 선택</button>
                  <button onClick={() => setAllSelected(false)} className="text-[12px] font-medium text-[#1a1a1a]/45 hover:underline">해제</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[680px] w-full text-left text-[12px]">
                  <thead className="bg-[#fafaf8] text-[#1a1a1a]/45">
                    <tr>
                      <th className="w-10 px-3 py-2.5" />
                      <th className="px-3 py-2.5 font-semibold">기관 / 담당자</th>
                      <th className="px-3 py-2.5 font-semibold">연락처</th>
                      <th className="px-3 py-2.5 font-semibold">매칭</th>
                      <th className="px-3 py-2.5 font-semibold">출신</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f0ec]">
                    {visibleRows.map((row) => {
                      const meta = matchMeta(row.matchStatus)
                      const disabled = row.matchStatus === "duplicate_in_batch"
                      return (
                        <tr key={row.id} className={row.selected ? "bg-emerald-50/30" : ""}>
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={disabled}
                              onChange={(e) => toggleRow(row, e.target.checked)}
                              className="h-4 w-4 accent-[#084734] disabled:opacity-30"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-[#111110]">{row.organizationName ?? row.contactName ?? "(이름 없음)"}</p>
                            {row.organizationName && row.contactName && (
                              <p className="text-[11px] text-[#1a1a1a]/45">{row.contactName}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[#1a1a1a]/60">
                            <p>{row.phone ?? "—"}</p>
                            {row.email && <p className="text-[11px] text-[#1a1a1a]/40">{row.email}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.tone}`}>
                              {meta.label}
                            </span>
                            {row.matchedTargetLabel && (
                              <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-[#1a1a1a]/45">→ {row.matchedTargetLabel}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={row.attendeeOrigin ?? ""}
                              disabled={disabled}
                              onChange={(e) => setRowOrigin(row, e.target.value)}
                              title={`자동 도출: ${meta.origin}`}
                              className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1 text-[11px] focus:border-[#111110]/30 focus:outline-none disabled:opacity-40"
                            >
                              {ORIGIN_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.value === "" ? `자동 (${meta.origin})` : o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col-reverse items-stretch gap-2 border-t border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
                <button
                  onClick={handleApply}
                  disabled={applying || counts.selected === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#063d2a] disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {counts.selected}건 확정 적용
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SummaryStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warn" }) {
  const valueTone = tone === "success" ? "text-[#084734]" : tone === "warn" ? "text-[#B85C33]" : "text-[#111110]"
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/35">{label}</p>
      <p className={`mt-1 text-[20px] font-bold leading-none ${valueTone}`}>{value}</p>
    </div>
  )
}
