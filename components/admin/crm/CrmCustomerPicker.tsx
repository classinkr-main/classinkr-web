"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Building2, Check, PhoneCall, Search, X } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { entityIdFromCustomerKey, getRecentCustomers, type RecentCustomer } from "@/lib/crm/recent-customers"

export interface CustomerPickValue {
  targetType: "lead" | "neo_account"
  targetId: string
  targetLabel: string
}

interface PickerRow {
  key: string
  name: string
  contact: string | null
  sourceLabel: string
  source: "lead" | "neo_account"
}

interface UnifiedResponse {
  // 통합 API는 전환 고객(customer)도 반환 — 픽커 대상(리드/NEO 드로어·타깃)만 남기고 거른다.
  rows: Array<Omit<PickerRow, "source"> & { source: "lead" | "neo_account" | "customer" }>
}

interface Props {
  label: string
  linkedId: string
  onPick: (pick: CustomerPickValue) => void
  onFreeText: (label: string) => void
  onClear: () => void
}

function rowFromRecent(recent: RecentCustomer): PickerRow {
  return { key: recent.key, name: recent.name, contact: null, sourceLabel: recent.sourceLabel, source: recent.source }
}

export default function CrmCustomerPicker({ label, linkedId, onPick, onFreeText, onClear }: Props) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PickerRow[]>([])
  const [recents, setRecents] = useState<PickerRow[]>([])
  const [loading, setLoading] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)

  const linked = Boolean(linkedId)

  useEffect(() => {
    setRecents(getRecentCustomers().map(rowFromRecent))
  }, [open])

  useEffect(() => {
    if (!open) return
    const term = label.trim()
    const current = ++reqId.current
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const query = term
          ? `q=${encodeURIComponent(term)}&limit=8`
          : `owner=__me&limit=8`
        const data = await adminFetchJsonCached<UnifiedResponse>(`/api/admin/crm/customers/unified?${query}`, undefined, {
          cacheKey: `picker:${query}`,
          ttlMs: 30_000,
          staleWhileRevalidateMs: 60_000,
        })
        if (current === reqId.current) {
          setRows((data.rows ?? []).filter((row): row is PickerRow => row.source !== "customer"))
        }
      } catch {
        if (current === reqId.current) setRows([])
      } finally {
        if (current === reqId.current) setLoading(false)
      }
    }, 220)
    return () => clearTimeout(handle)
  }, [label, open])

  const handleSelect = useCallback(
    (row: PickerRow) => {
      onPick({ targetType: row.source, targetId: entityIdFromCustomerKey(row.key), targetLabel: row.name })
      setOpen(false)
    },
    [onPick]
  )

  const suggestions = label.trim() ? rows : dedupe([...recents, ...rows])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1a1a1a]/30" />
        <input
          value={label}
          onChange={(event) => {
            onFreeText(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current)
            blurTimer.current = setTimeout(() => setOpen(false), 150)
          }}
          placeholder="고객/리드 검색 또는 직접 입력"
          className={`mt-1 h-10 w-full rounded-lg border bg-white pl-9 pr-9 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734] ${
            linked ? "border-[#D7EBDD]" : "border-[#e8e8e4]"
          }`}
        />
        {linked ? (
          <span className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#084734]">
            <Check className="h-3 w-3" />
            연결됨
          </span>
        ) : label ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onClear()
              setOpen(false)
            }}
            className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[#1a1a1a]/35 hover:text-[#111110]"
            aria-label="지우기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#e8e8e4] bg-white py-1 shadow-lg">
          {!label.trim() && suggestions.length > 0 ? (
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/35">
              최근·내 담당
            </p>
          ) : null}
          {loading && suggestions.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-[#1a1a1a]/40">검색 중...</p>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-[#1a1a1a]/40">일치하는 고객이 없습니다. 직접 입력으로 저장됩니다.</p>
          ) : (
            suggestions.map((row) => (
              <button
                key={row.key}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(row)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#fafaf8]"
              >
                <span className="text-[#1a1a1a]/35">
                  {row.source === "lead" ? <PhoneCall className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[#111110]">{row.name}</span>
                  {row.contact ? <span className="block truncate text-[11px] text-[#1a1a1a]/40">{row.contact}</span> : null}
                </span>
                <span className="shrink-0 rounded-full bg-[#fafaf8] px-2 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/45">
                  {row.sourceLabel}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function dedupe(rows: PickerRow[]): PickerRow[] {
  const seen = new Set<string>()
  const out: PickerRow[] = []
  for (const row of rows) {
    if (seen.has(row.key)) continue
    seen.add(row.key)
    out.push(row)
  }
  return out
}
