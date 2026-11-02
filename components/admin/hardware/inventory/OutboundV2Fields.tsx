"use client"

// 출고 등록 v2 입력 칸 — 유형(4종)·CRM 고객·물류번호·담당자. 빠른 기록 시트(QuickRecordSheet)와
// CRM 오더 대사 등록이 같은 칸을 쓴다. 상태는 부모가 갖고, 여기는 그리기와 조회만 한다.
// 규칙: outbound-v2-model.ts. 계약: docs/active/hardware-inventory-process-gap-2026-10-28.md §7-3.

import { useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { Check, Loader2, Search, X } from "lucide-react"

import type { HardwareOutboundType } from "@/lib/hardware/inventory-process"

import CustomerPicker from "./CustomerPicker"
import {
  customerDisplayName,
  fetchHardwareCustomers,
  fetchOwnerOptions,
  type HardwareCustomerOption,
  type HardwareOwnerOption,
} from "./hardware-lookups"
import { selectableLots } from "./lot-allocation-model"
import { canAssignOtherOwner, type HardwareViewer } from "./movement-permissions"
import { OUTBOUND_TYPE_OPTIONS, type CustomerInputMode } from "./outbound-v2-model"
import { formatNumber } from "./shared"
import type { LotLookupEntry } from "./use-hardware-lots"

const LABEL_CLASS = "text-[12px] font-semibold text-[#615D59]"
const FIELD_CLASS =
  "h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
const ERROR_CLASS = "mt-1 text-[11px] font-semibold text-[#8F2C2C]"

export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-[#B43E3E]">
      *
    </span>
  )
}

// ── 출고 유형 ────────────────────────────────────────────────────────────────────
export function OutboundTypeField({
  value,
  onChange,
  error,
}: {
  value: HardwareOutboundType | ""
  onChange: (value: HardwareOutboundType) => void
  error?: string | null
}) {
  const labelId = useId()
  return (
    <div>
      <span id={labelId} className={LABEL_CLASS}>
        출고 유형
        <RequiredMark />
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-1 grid grid-cols-4 gap-1.5">
        {OUTBOUND_TYPE_OPTIONS.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`min-h-[40px] cursor-pointer rounded-md border px-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${
                active
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// ── CRM 고객 ─────────────────────────────────────────────────────────────────────
interface CrmCustomerFieldProps {
  mode: CustomerInputMode
  onModeChange: (mode: CustomerInputMode) => void
  customerId: string | null
  /** 원장 to_location 에 남을 표시 이름. */
  customerName: string
  onSelect: (option: HardwareCustomerOption | null, displayName: string) => void
  onFreeTextChange: (value: string) => void
  /** 직접 입력 칸 제안 — 과거 출고처. */
  historyCustomers: string[]
  error?: string | null
}

export function CrmCustomerField({
  mode,
  onModeChange,
  customerId,
  customerName,
  onSelect,
  onFreeTextChange,
  historyCustomers,
  error,
}: CrmCustomerFieldProps) {
  const labelId = useId()
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className={LABEL_CLASS}>
          {mode === "crm" ? "도착 (CRM 고객)" : "도착 (CRM에 없는 곳 — 직접 입력)"}
          <RequiredMark />
        </span>
        <button
          type="button"
          onClick={() => onModeChange(mode === "crm" ? "free" : "crm")}
          className="cursor-pointer rounded px-1 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
        >
          {mode === "crm" ? "CRM에 없는 곳" : "CRM 고객에서 고르기"}
        </button>
      </div>
      <div className="mt-1">
        {mode === "crm" ? (
          <CrmCustomerSearch
            labelledBy={labelId}
            customerId={customerId}
            customerName={customerName}
            onSelect={onSelect}
          />
        ) : (
          <CustomerPicker
            value={customerName}
            onChange={onFreeTextChange}
            options={historyCustomers}
            ariaLabel="도착 — CRM에 없는 곳"
            placeholder="현장·기관 이름 — CRM에 없는 곳만"
            className={FIELD_CLASS}
          />
        )}
      </div>
      {mode === "free" ? (
        <p className="mt-1 text-[11px] text-[#A39E98]">CRM 고객과 연결되지 않습니다. 고객 집계는 이름으로만 묶입니다.</p>
      ) : null}
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

function CrmCustomerSearch({
  labelledBy,
  customerId,
  customerName,
  onSelect,
}: {
  labelledBy: string
  customerId: string | null
  customerName: string
  onSelect: (option: HardwareCustomerOption | null, displayName: string) => void
}) {
  const listId = useId()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<HardwareCustomerOption[]>([])
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!open) return
    const term = query.trim()
    const seq = ++requestSeq.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      setLookupError(null)
      fetchHardwareCustomers(term)
        .then((options) => {
          if (requestSeq.current !== seq) return
          setResults(options)
          setActiveIndex(options.length > 0 ? 0 : -1)
        })
        .catch((err: unknown) => {
          if (requestSeq.current !== seq) return
          setResults([])
          setLookupError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (requestSeq.current === seq) setLoading(false)
        })
    }, term ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [open, query])

  const pick = (option: HardwareCustomerOption) => {
    onSelect(option, customerDisplayName(option))
    setOpen(false)
    setQuery("")
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => (index + 1) % results.length)
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1))
    } else if (event.key === "Enter" && open && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault()
      pick(results[activeIndex])
    } else if (event.key === "Escape" && open) {
      // 시트의 Escape 닫기보다 먼저 목록만 닫는다(CustomerPicker 와 같은 규약).
      event.preventDefault()
      setOpen(false)
    }
  }

  if (customerId) {
    return (
      <div className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-[#084734]">
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{customerName || "CRM 고객"}</span>
        </span>
        <button
          type="button"
          onClick={() => onSelect(null, "")}
          aria-label="CRM 고객 선택 지우기"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[#084734] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
      <input
        role="combobox"
        aria-labelledby={labelledBy}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder="고객 이름·캠퍼스 검색"
        className={`${FIELD_CLASS} pl-8`}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-[rgba(0,0,0,0.08)] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        >
          {loading ? (
            <li className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-[#615D59]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              찾는 중
            </li>
          ) : lookupError ? (
            <li className="px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">고객 목록을 불러오지 못했습니다: {lookupError}</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-[#615D59]">
              {query.trim() ? "맞는 CRM 고객이 없습니다. 'CRM에 없는 곳'으로 직접 입력하세요." : "이름을 입력하세요."}
            </li>
          ) : (
            results.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(option)
                }}
                className={`cursor-pointer px-3 py-2 text-[12.5px] ${index === activeIndex ? "bg-[#ECFDF5]" : "hover:bg-[#F6F5F4]"}`}
              >
                <span className="block font-bold text-[#111110]">{customerDisplayName(option)}</span>
                {option.regionLabel ? <span className="block text-[11px] text-[#615D59]">{option.regionLabel}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

// ── 물류번호 ─────────────────────────────────────────────────────────────────────
export function LotPickerField({
  entry,
  value,
  onChange,
  quantity,
  error,
}: {
  entry: LotLookupEntry | undefined
  value: string
  onChange: (lotNo: string) => void
  quantity: number
  error?: string | null
}) {
  const id = useId()
  if (entry?.status === "ready" && !entry.data.lotTracked) {
    return <p className="text-[11px] text-[#A39E98]">수량만 관리하는 품목 — 물류번호를 고르지 않습니다.</p>
  }
  const lots = entry?.status === "ready" ? selectableLots(entry.data.lots) : []
  const current = entry?.status === "ready" ? entry.data.lots.find((lot) => lot.lotNo === value) : undefined
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        물류번호
        <RequiredMark />
      </label>
      {entry?.status === "error" ? (
        <>
          <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder="예: C3" className={`mt-1 ${FIELD_CLASS}`} />
          <p className="mt-1 text-[11px] text-[#A8741A]">잔여를 불러오지 못했습니다 — 저장 때 서버가 잔여를 확인합니다.</p>
        </>
      ) : (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={entry?.status !== "ready"}
          className={`mt-1 ${FIELD_CLASS}`}
        >
          <option value="">{entry?.status === "ready" ? (lots.length > 0 ? "물류번호 고르기" : "잔여 있는 물류번호 없음") : "잔여 불러오는 중"}</option>
          {lots.map((lot) => (
            <option key={lot.lotNo} value={lot.lotNo}>
              {lot.lotNo} · 잔여 {formatNumber(lot.remaining)}대{lot.remaining < quantity ? " (부족)" : ""}
            </option>
          ))}
          {/* 고른 값이 목록에서 빠졌어도(잔여 0) 지우지 않고 보여 준다 — 검증 문구가 왜 막는지 말한다. */}
          {value && !lots.some((lot) => lot.lotNo === value) ? (
            <option value={value}>
              {value} · 잔여 {formatNumber(current?.remaining ?? 0)}대
            </option>
          ) : null}
        </select>
      )}
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// ── 담당자 ───────────────────────────────────────────────────────────────────────
export function OwnerField({
  viewer,
  owner,
  ownerUserId,
  onChange,
}: {
  viewer: HardwareViewer | null | undefined
  owner: string
  ownerUserId: string | null
  /** userId null = 본인(서버가 로그인 계정으로 채운다). */
  onChange: (name: string, userId: string | null) => void
}) {
  const id = useId()
  const assignable = canAssignOtherOwner(viewer)
  const [options, setOptions] = useState<HardwareOwnerOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!assignable || options) return
    let cancelled = false
    fetchOwnerOptions()
      .then((loaded) => {
        if (!cancelled) setOptions(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [assignable, options])

  // 구응답(권한 칸 없음) — 예전처럼 자유 입력.
  if (typeof viewer?.canManageInventory !== "boolean") {
    return (
      <label className="block">
        <span className={LABEL_CLASS}>담당자</span>
        <input value={owner} onChange={(event) => onChange(event.target.value, null)} placeholder="자동 기억됨" className={`mt-1 ${FIELD_CLASS}`} />
      </label>
    )
  }

  const selfName = viewer.name ?? "나"
  if (!assignable) {
    return (
      <div>
        <span className={LABEL_CLASS}>담당자</span>
        <p className="mt-1 flex h-10 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 text-[13px] font-semibold text-[#31302E]">
          {selfName} <span className="ml-1.5 text-[11px] font-semibold text-[#A39E98]">본인 — 다른 담당 지정은 입고관리 권한자만</span>
        </p>
      </div>
    )
  }

  const others = (options ?? []).filter((option) => option.userId !== viewer.userId)
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        담당자
      </label>
      <select
        id={id}
        value={ownerUserId ?? ""}
        onChange={(event) => {
          const userId = event.target.value || null
          const picked = others.find((option) => option.userId === userId)
          onChange(picked?.name ?? selfName, userId)
        }}
        className={`mt-1 ${FIELD_CLASS}`}
      >
        <option value="">{selfName} (본인)</option>
        {others.map((option) => (
          <option key={option.userId} value={option.userId}>
            {option.name}
          </option>
        ))}
        {ownerUserId && !others.some((option) => option.userId === ownerUserId) ? <option value={ownerUserId}>{owner || "지정된 담당자"}</option> : null}
      </select>
      {loadError ? <p className="mt-1 text-[11px] text-[#A8741A]">담당자 목록을 불러오지 못했습니다: {loadError}</p> : null}
    </div>
  )
}

// ── 반납 예정일(샘플) ─────────────────────────────────────────────────────────────
export function ExpectedReturnField({ value, onChange, min, error }: { value: string; onChange: (value: string) => void; min?: string; error?: string | null }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        반납 예정일
        <RequiredMark />
      </label>
      <input id={id} type="date" value={value} min={min} onChange={(event) => onChange(event.target.value)} className={`mt-1 ${FIELD_CLASS}`} />
      {error ? <p className={ERROR_CLASS}>{error}</p> : <p className="mt-1 text-[11px] text-[#A39E98]">지나면 담당자 알림에 실립니다.</p>}
    </div>
  )
}

// ── 바구니 줄 물류번호 ────────────────────────────────────────────────────────────
/** 작업건(바구니) 줄마다 고르는 작은 물류번호 칸 — 수량만 관리하는 품목이면 그리지 않는다. */
export function BasketLineLotSelect({
  entry,
  value,
  onChange,
  quantity,
  productName,
  disabled,
}: {
  entry: LotLookupEntry
  value: string
  onChange: (lotNo: string) => void
  quantity: number
  productName: string
  disabled?: boolean
}) {
  if (entry.status === "ready" && !entry.data.lotTracked) return null
  const className =
    "mt-1 h-9 w-full max-w-[220px] rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[11.5px] font-semibold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:opacity-50"
  if (entry.status === "error") {
    return (
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={`${productName} 물류번호`}
        placeholder="물류번호"
        className={className}
      />
    )
  }
  const lots = entry.status === "ready" ? selectableLots(entry.data.lots) : []
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || entry.status !== "ready"}
      aria-label={`${productName} 물류번호`}
      className={`${className} ${value ? "" : "border-[#ECD29C] bg-[#FBF1E0]"}`}
    >
      <option value="">{entry.status === "ready" ? "물류번호 고르기 (필수)" : "잔여 불러오는 중"}</option>
      {lots.map((lot) => (
        <option key={lot.lotNo} value={lot.lotNo}>
          {lot.lotNo} · 잔여 {formatNumber(lot.remaining)}대{lot.remaining < quantity ? " (부족)" : ""}
        </option>
      ))}
      {value && !lots.some((lot) => lot.lotNo === value) ? <option value={value}>{value}</option> : null}
    </select>
  )
}
