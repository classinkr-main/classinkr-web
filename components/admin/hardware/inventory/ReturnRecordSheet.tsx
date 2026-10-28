"use client"

// 회수 등록 시트 — 원 출고 건을 검색해 고르면 품목·물류번호·고객·유형이 따라오고, 남은 회수 가능 수량까지만
// 받는다(정의서 §회수, 계약 §7-3 return-candidates · movements POST returnOfMovementId).
// 모델: return-form-model.ts. 열고 닫기·저장 후 새로고침은 부모가 맡는다.

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, RotateCcw, Search, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"

import { fetchReturnCandidates } from "./hardware-lookups"
import { OutboundTypeBadge } from "./OutboundMetaBadges"
import {
  buildReturnPayload,
  defaultReturnQuantity,
  initialReturnForm,
  RETURN_DESTINATIONS,
  validateReturnForm,
  type ReturnCandidate,
  type ReturnDestination,
  type ReturnFormState,
} from "./return-form-model"
import { formatDate, formatNumber, todayKey } from "./shared"

const FIELD_CLASS =
  "h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
const LABEL_CLASS = "text-[12px] font-semibold text-[#615D59]"

interface ReturnRecordSheetProps {
  open: boolean
  onClose: () => void
  /** 저장 성공 — 부모가 알림·새로고침을 한다. */
  onSaved: (message: string) => void | Promise<void>
  reduceMotion: boolean | null
  /** 원장 행에서 바로 열 때 검색어(고객사 등). */
  initialQuery?: string
}

export default function ReturnRecordSheet({ open, onClose, onSaved, reduceMotion, initialQuery = "" }: ReturnRecordSheetProps) {
  return (
    <AnimatePresence>
      {open ? (
        <ReturnRecordSheetBody key="return-sheet" onClose={onClose} onSaved={onSaved} reduceMotion={reduceMotion} initialQuery={initialQuery} />
      ) : null}
    </AnimatePresence>
  )
}

function ReturnRecordSheetBody({ onClose, onSaved, reduceMotion, initialQuery }: Omit<ReturnRecordSheetProps, "open">) {
  const [query, setQuery] = useState(initialQuery ?? "")
  const [candidates, setCandidates] = useState<ReturnCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [form, setForm] = useState<ReturnFormState>(() => initialReturnForm(todayKey()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    const seq = ++requestSeq.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      setLookupError(null)
      fetchReturnCandidates({ q: query })
        .then((rows) => {
          if (requestSeq.current === seq) setCandidates(rows)
        })
        .catch((err: unknown) => {
          if (requestSeq.current !== seq) return
          setCandidates([])
          setLookupError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (requestSeq.current === seq) setLoading(false)
        })
    }, query.trim() ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || saving) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose, saving])

  const selected = useMemo(() => candidates.find((candidate) => candidate.id === form.candidateId) ?? null, [candidates, form.candidateId])
  // 검색어가 바뀌어 목록에서 빠져도 고른 건은 유지한다.
  const [pinned, setPinned] = useState<ReturnCandidate | null>(null)
  const candidate = selected ?? (pinned?.id === form.candidateId ? pinned : null)

  const pick = (row: ReturnCandidate) => {
    setPinned(row)
    setError(null)
    setForm((current) => ({ ...current, candidateId: row.id, quantity: defaultReturnQuantity(row) }))
  }

  const submit = async () => {
    const message = validateReturnForm(candidate, form)
    if (message || !candidate) {
      setError(message)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adminFetchJson("/api/admin/hardware/movements", { method: "POST", body: JSON.stringify(buildReturnPayload(candidate, form)) })
      await onSaved(`${candidate.productName} ${formatNumber(Number(form.quantity))}대 회수를 기록했습니다(${candidate.toLocation ?? "고객"} → ${form.toLocation}).`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-40 flex justify-end bg-black/35 backdrop-blur-[2px]"
      onClick={() => {
        if (!saving) onClose()
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16 }}
    >
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="회수 등록"
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full flex-col overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.05)] sm:max-w-xl"
        initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
        animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
              <RotateCcw className="h-4 w-4 text-[#084734]" />
              회수 등록
            </p>
            <p className="mt-1 text-[11.5px] text-[#615D59]">원 출고 건을 고르면 품목·물류번호·고객·유형이 따라옵니다. 남은 수량까지만 회수할 수 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 p-5">
          {error ? (
            <div role="alert" className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">
              {error}
            </div>
          ) : null}

          <div>
            <label htmlFor="hardware-return-search" className={LABEL_CLASS}>
              원 출고 건 찾기
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
              <input
                id="hardware-return-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객사·품목·물류번호"
                className={`${FIELD_CLASS} pl-8`}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)]" role="listbox" aria-label="회수 가능한 출고">
            {loading ? (
              <p className="flex items-center gap-1.5 px-3 py-3 text-[12px] text-[#615D59]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                찾는 중
              </p>
            ) : lookupError ? (
              <p className="px-3 py-3 text-[12px] font-semibold text-[#8F2C2C]">회수 후보를 불러오지 못했습니다: {lookupError}</p>
            ) : candidates.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-[#615D59]">회수할 수 있는 출고가 없습니다.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-[rgba(0,0,0,0.05)] overflow-y-auto">
                {candidates.map((row) => {
                  const active = row.id === form.candidateId
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={row.returnable <= 0}
                        onClick={() => pick(row)}
                        className={`flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                          active ? "bg-[#ECFDF5]" : "hover:bg-[#FAFAF8]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-bold text-[#111110]">{row.toLocation ?? "고객 미상"}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#615D59]">
                            {row.productName}
                            {row.lotNo ? ` · ${row.lotNo}` : ""} · {formatDate(row.occurredAt)}
                            {row.owner ? ` · ${row.owner}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <OutboundTypeBadge type={row.outboundType} size="xs" />
                          <span className="text-[11px] font-bold tabular-nums text-[#31302E]">
                            회수 가능 {formatNumber(row.returnable)}/{formatNumber(row.quantity)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {candidate ? (
            <div className="space-y-3 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5]/40 p-3">
              <dl className="grid grid-cols-2 gap-2 text-[12px]">
                {[
                  ["품목", candidate.productName],
                  ["물류번호", candidate.lotNo ?? "없음"],
                  ["고객", candidate.toLocation ?? "미상"],
                  ["원 출고일", formatDate(candidate.occurredAt)],
                  ["이미 회수", `${formatNumber(candidate.returned)}대`],
                  ["회수 가능", `${formatNumber(candidate.returnable)}대`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-semibold text-[#615D59]">{label}</dt>
                    <dd className="font-bold text-[#111110]">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <label className="block">
                  <span className={LABEL_CLASS}>회수 수량</span>
                  <input
                    type="number"
                    min={1}
                    max={candidate.returnable}
                    inputMode="numeric"
                    value={form.quantity}
                    onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                    className={`mt-1 ${FIELD_CLASS} tabular-nums`}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>회수일</span>
                  <input
                    type="date"
                    value={form.occurredAt}
                    onChange={(event) => setForm((current) => ({ ...current, occurredAt: event.target.value }))}
                    className={`mt-1 ${FIELD_CLASS}`}
                  />
                </label>
              </div>
              <label className="block">
                <span className={LABEL_CLASS}>들어오는 곳</span>
                <select
                  value={form.toLocation}
                  onChange={(event) => setForm((current) => ({ ...current, toLocation: event.target.value as ReturnDestination }))}
                  className={`mt-1 ${FIELD_CLASS}`}
                >
                  {RETURN_DESTINATIONS.map((destination) => (
                    <option key={destination} value={destination}>
                      {destination}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>메모</span>
                <textarea
                  value={form.memo}
                  onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                  rows={2}
                  placeholder="회수 사유·상태"
                  className="mt-1 w-full resize-none rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[rgba(0,0,0,0.08)] bg-white px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !candidate}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            회수 저장
          </button>
        </div>
      </motion.aside>
    </motion.div>
  )
}
