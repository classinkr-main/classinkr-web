"use client"

// CRM 고객 고르기(직배송 고객사) — GET /api/admin/hardware/customers?q= 로 찾고, 목록에서 고른 고객만 받는다.
// 자유 텍스트 CustomerPicker 와 달리 새 이름으로 저장하지 않는다 — 출고에 customer_id 가 붙어야 해서다(§7-1).

import { useEffect, useId, useState } from "react"
import { Check, Search, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { searchHardwareCustomers, type HardwareCrmCustomer } from "./stock-admin-model"

const SEARCH_DELAY_MS = 250

interface Props {
  value: { id: string; name: string } | null
  onChange: (customer: { id: string; name: string } | null) => void
  disabled?: boolean
  invalid?: boolean
}

export default function CrmCustomerSearchField({ value, onChange, disabled, invalid }: Props) {
  const listId = useId()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<HardwareCrmCustomer[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")

  useEffect(() => {
    const text = query.trim()
    if (value || text.length < 1) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setStatus("loading")
      searchHardwareCustomers(adminFetchJson, text)
        .then((customers) => {
          if (cancelled) return
          setResults(customers)
          setStatus("idle")
        })
        .catch(() => {
          if (cancelled) return
          setResults([])
          setStatus("error")
        })
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, value])

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#084734] bg-white px-3 text-[12.5px] font-semibold text-[#084734] shadow-[inset_0_0_0_1px_#084734]">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {value.name}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(null)
            setQuery("")
            setResults([])
          }}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-[#615D59] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          다른 고객사
        </button>
      </div>
    )
  }

  const text = query.trim()
  return (
    <div className="space-y-1.5">
      <div className="relative max-w-[360px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
          aria-label="직배송 고객사 검색"
          aria-controls={listId}
          aria-invalid={invalid ? true : undefined}
          placeholder="CRM 고객 이름으로 검색"
          autoComplete="off"
          className="h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-8 pr-2.5 text-[13px] text-[#111110] outline-none transition placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:opacity-60"
        />
      </div>
      {text ? (
        <div id={listId} role="listbox" aria-label="CRM 고객" className="max-h-52 max-w-[360px] overflow-y-auto rounded-md border border-[rgba(0,0,0,0.08)] bg-white">
          {status === "loading" && results.length === 0 ? <p className="px-3 py-2 text-[12px] text-[#615D59]">찾는 중…</p> : null}
          {status === "error" ? <p className="px-3 py-2 text-[12px] font-semibold text-[#B43E3E]">고객 목록을 불러오지 못했습니다. 다시 입력해 보세요.</p> : null}
          {status === "idle" && results.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-[#615D59]">맞는 CRM 고객이 없습니다 — 고객을 CRM 에 먼저 등록하세요.</p>
          ) : null}
          {results.map((customer) => (
            <button
              key={customer.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onChange({ id: customer.id, name: customer.name })}
              className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 px-3 text-left text-[12.5px] text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:bg-[#F6F5F4] focus-visible:outline-none"
            >
              <span className="min-w-0 truncate font-semibold text-[#111110]">{customer.name}</span>
              <span className="shrink-0 text-[11px] text-[#A39E98]">{[customer.campusName, customer.regionLabel].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
