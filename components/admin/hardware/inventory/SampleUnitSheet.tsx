"use client"

import { memo, useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Boxes, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  formatNumber,
  loanElapsedDays,
  MONO_META_CLASS,
  SAMPLE_EVENT_META,
  SAMPLE_STATUS_META,
  todayKey,
  type HardwareSampleEvent,
  type HardwareSampleUnit,
  type SampleEventType,
} from "./shared"

// 유닛 액션 폼 — 상태별 허용 전이는 서버(recordSampleUnitEvents)가 최종 가드하고,
// 여기서는 현재 상태에서 말이 되는 버튼만 노출한다.
type SheetAction = "loan" | "return" | "convert" | "repair" | "adjust" | "retire"

const ACTION_META: Record<SheetAction, { label: string; from: HardwareSampleUnit["status"][] }> = {
  loan: { label: "대여", from: ["office", "repair"] },
  return: { label: "반환", from: ["loaned"] },
  convert: { label: "판매 전환", from: ["loaned", "office"] },
  repair: { label: "수리", from: ["office", "loaned"] },
  adjust: { label: "정정", from: ["office", "loaned", "repair", "converted", "retired"] },
  retire: { label: "폐기", from: ["office", "loaned", "repair"] },
}

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-2.5 text-[12.5px] font-semibold text-[#111110] outline-none transition focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/20"

interface SampleUnitSheetProps {
  unit: HardwareSampleUnit | null
  onClose: () => void
  onChanged: () => Promise<void> | void
  reduceMotion: boolean | null
}

function SampleUnitSheet({ unit, onClose, onChanged, reduceMotion }: SampleUnitSheetProps) {
  const [events, setEvents] = useState<HardwareSampleEvent[] | null>(null)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [action, setAction] = useState<SheetAction | null>(null)
  const [customer, setCustomer] = useState("")
  const [occurredAt, setOccurredAt] = useState(todayKey())
  const [expectedReturnAt, setExpectedReturnAt] = useState("")
  const [serialNo, setSerialNo] = useState("")
  const [actionMemo, setActionMemo] = useState("")
  const [memoDraft, setMemoDraft] = useState("")
  const [busy, setBusy] = useState<"action" | "memo" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const unitId = unit?.id ?? null

  const loadEvents = useCallback(async () => {
    if (!unitId) return
    setEventsError(null)
    try {
      const result = await adminFetchJson<{ events: HardwareSampleEvent[] }>(
        `/api/admin/hardware/samples?unit=${encodeURIComponent(unitId)}`
      )
      setEvents(result.events)
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : "타임라인을 불러오지 못했습니다.")
    }
  }, [unitId])

  // 유닛이 바뀌면 폼·타임라인 리셋 후 재조회.
  useEffect(() => {
    setEvents(null)
    setAction(null)
    setCustomer("")
    setOccurredAt(todayKey())
    setExpectedReturnAt("")
    setSerialNo("")
    setActionMemo("")
    setMemoDraft("")
    setActionError(null)
    if (unitId) void loadEvents()
  }, [unitId, loadEvents])

  const postEvent = async (payload: Record<string, unknown>, kind: "action" | "memo") => {
    if (!unit) return
    setBusy(kind)
    setActionError(null)
    try {
      await adminFetchJson("/api/admin/hardware/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "event", unitIds: [unit.id], ...payload }),
      })
      await Promise.all([loadEvents(), onChanged()])
      if (kind === "memo") setMemoDraft("")
      if (kind === "action") {
        setAction(null)
        setCustomer("")
        setExpectedReturnAt("")
        setSerialNo("")
        setActionMemo("")
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "저장에 실패했습니다.")
    } finally {
      setBusy(null)
    }
  }

  const submitAction = () => {
    if (!action) return
    const eventType: SampleEventType = action
    void postEvent(
      {
        eventType,
        occurredAt,
        customer: customer.trim() || undefined,
        memo: actionMemo.trim() || undefined,
        expectedReturnAt: action === "loan" && expectedReturnAt ? expectedReturnAt : undefined,
        serialNo: action === "adjust" && serialNo.trim() ? serialNo.trim() : undefined,
      },
      "action"
    )
  }

  const statusMeta = unit ? SAMPLE_STATUS_META[unit.status] : null
  const elapsed = unit?.status === "loaned" ? loanElapsedDays(unit.loaned_at) : null
  const availableActions = unit
    ? (Object.keys(ACTION_META) as SheetAction[]).filter((key) => ACTION_META[key].from.includes(unit.status))
    : []

  return (
    <AnimatePresence>
      {unit && (
        <motion.div
          key="sample-unit-sheet"
          className="fixed inset-0 z-[46] flex justify-end bg-black/35 backdrop-blur-[2px]"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="샘플 유닛 상세"
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-full flex-col overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)] sm:max-w-[480px]"
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">
                  <Boxes className="h-3.5 w-3.5" />
                  샘플 유닛
                </p>
                <p className={`mt-1 truncate text-[16px] font-bold tracking-[-0.01em] text-[#111110] ${MONO_META_CLASS}`}>
                  {unit.asset_code}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold text-[#615D59]">
                  <span>{unit.product_name}</span>
                  {statusMeta && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${statusMeta.tone}`}>{statusMeta.label}</span>}
                  {unit.status === "loaned" && (
                    <span className="truncate">
                      {unit.current_customer ?? "고객 미상"}
                      {elapsed != null ? ` · ${formatNumber(elapsed)}일째` : ""}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 p-5">
              {/* 현재 상태 요약 */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-[#615D59]">현재 위치</p>
                  <p className="mt-0.5 truncate text-[13px] font-bold text-[#111110]">
                    {unit.status === "loaned" ? unit.current_customer ?? "고객 미상" : statusMeta?.label}
                  </p>
                </div>
                <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-[#615D59]">시리얼 / 담당</p>
                  <p className={`mt-0.5 truncate text-[13px] font-bold text-[#111110] ${MONO_META_CLASS}`}>
                    {unit.serial_no ?? "미기입"}
                    {unit.current_owner ? ` · ${unit.current_owner}` : ""}
                  </p>
                </div>
                {unit.status === "loaned" && (
                  <div className="col-span-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[#615D59]">대여 기간</p>
                    <p className="mt-0.5 text-[13px] font-bold tabular-nums text-[#111110]">
                      {unit.loaned_at ?? "-"} 부터
                      {elapsed != null ? ` · ${formatNumber(elapsed)}일째` : ""}
                      {unit.expected_return_at ? ` · 회수 예정 ${unit.expected_return_at}` : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* 상태 액션 */}
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {availableActions.map((key) => {
                    const active = action === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setAction(active ? null : key)
                          setActionError(null)
                          if (!active && key === "adjust") {
                            setCustomer(unit.current_customer ?? "")
                            setSerialNo(unit.serial_no ?? "")
                          }
                        }}
                        aria-pressed={active}
                        className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[11.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${
                          active ? "bg-[#111110] text-white" : "bg-[#F6F5F4] text-[#31302E] hover:bg-[#ECFDF5] hover:text-[#084734]"
                        }`}
                      >
                        {ACTION_META[key].label}
                      </button>
                    )
                  })}
                </div>

                {action && (
                  <div className="mt-3 space-y-2.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-[#615D59]">처리일</span>
                        <input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} className={INPUT_CLASS} />
                      </label>
                      {action === "loan" && (
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold text-[#615D59]">회수 예정일 (선택)</span>
                          <input type="date" value={expectedReturnAt} onChange={(event) => setExpectedReturnAt(event.target.value)} className={INPUT_CLASS} />
                        </label>
                      )}
                      {(action === "loan" || action === "adjust" || action === "convert") && (
                        <label className={`block ${action === "loan" ? "col-span-2" : ""}`}>
                          <span className="mb-1 block text-[11px] font-bold text-[#615D59]">
                            {action === "loan" ? "고객사 (필수)" : "고객사"}
                          </span>
                          <input
                            value={customer}
                            onChange={(event) => setCustomer(event.target.value)}
                            placeholder="예: 남명학원"
                            className={INPUT_CLASS}
                          />
                        </label>
                      )}
                      {action === "adjust" && (
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold text-[#615D59]">시리얼 번호</span>
                          <input value={serialNo} onChange={(event) => setSerialNo(event.target.value)} placeholder="실사 시 기입" className={INPUT_CLASS} />
                        </label>
                      )}
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold text-[#615D59]">메모 (선택)</span>
                      <input
                        value={actionMemo}
                        onChange={(event) => setActionMemo(event.target.value)}
                        placeholder={action === "return" ? "예: 상태 양호, 스탠드 포함 회수" : "예: 데모 설치, 4월말 회수 예정"}
                        className={INPUT_CLASS}
                      />
                    </label>
                    {actionError && <p className="text-[12px] font-semibold text-[#8F2C2C]">{actionError}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAction(null)}
                        className="cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-bold text-[#615D59] transition hover:text-[#111110]"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={submitAction}
                        disabled={busy != null || (action === "loan" && !customer.trim())}
                        className="cursor-pointer rounded-md bg-[#084734] px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:pointer-events-none disabled:opacity-60"
                      >
                        {busy === "action" ? "저장 중" : `${ACTION_META[action].label} 저장`}
                      </button>
                    </div>
                  </div>
                )}
                {!action && actionError && <p className="mt-2 text-[12px] font-semibold text-[#8F2C2C]">{actionError}</p>}
              </div>

              {/* 경로 + 메모 타임라인 */}
              <div className="min-h-0 flex-1">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#615D59]">경로 · 메모 타임라인</p>
                {eventsError ? (
                  <p className="rounded-lg bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">{eventsError}</p>
                ) : !events ? (
                  <div className="space-y-2" aria-hidden>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="h-14 animate-pulse rounded-lg bg-[#F6F5F4]" />
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <p className="rounded-lg bg-[#F6F5F4] px-3 py-2 text-[12px] font-semibold text-[#615D59]">기록이 없습니다.</p>
                ) : (
                  <ol className="relative space-y-0 border-l border-[rgba(0,0,0,0.1)] pl-4">
                    {events.map((event) => {
                      const meta = SAMPLE_EVENT_META[event.event_type]
                      const route =
                        event.from_location || event.to_location
                          ? [event.from_location, event.to_location].filter(Boolean).join(" → ")
                          : event.customer
                      return (
                        <li key={event.id} className="relative pb-4 last:pb-0">
                          <span
                            className="absolute -left-[21.5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white"
                            style={{ backgroundColor: meta.dot }}
                            aria-hidden
                          />
                          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-[12.5px] font-bold text-[#111110]">{meta.label}</span>
                            {route && <span className="text-[12px] font-semibold text-[#31302E]">{route}</span>}
                            <span className={`text-[11px] text-[#A39E98] ${MONO_META_CLASS}`}>{event.occurred_at}</span>
                            {event.created_by && <span className="text-[11px] text-[#A39E98]">{event.created_by}</span>}
                          </p>
                          {event.memo && (
                            <p className="mt-1 whitespace-pre-wrap rounded-md bg-[#F6F5F4] px-2.5 py-1.5 text-[12px] leading-relaxed text-[#31302E]">
                              {event.memo}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>

            {/* 메모 컴포저 — 이동 없이 언제든 붙이는 후속 메모 */}
            <div className="sticky bottom-0 border-t border-[rgba(0,0,0,0.08)] bg-white px-5 py-3.5">
              <div className="flex items-end gap-2">
                <textarea
                  value={memoDraft}
                  onChange={(event) => setMemoDraft(event.target.value)}
                  placeholder="메모 추가 — 예: 5월 초 회수 협의, 리모컨 분실"
                  rows={2}
                  className="min-h-[44px] w-full resize-y rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-2.5 py-2 text-[12.5px] font-medium leading-relaxed text-[#111110] outline-none transition focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/20"
                />
                <button
                  type="button"
                  onClick={() => void postEvent({ eventType: "memo", memo: memoDraft.trim(), occurredAt: todayKey() }, "memo")}
                  disabled={busy != null || !memoDraft.trim()}
                  className="shrink-0 cursor-pointer rounded-md bg-[#084734] px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:pointer-events-none disabled:opacity-60"
                >
                  {busy === "memo" ? "저장 중" : "메모 저장"}
                </button>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default memo(SampleUnitSheet)
