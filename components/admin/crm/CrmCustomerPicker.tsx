"use client"

import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react"
import { Building2, Check, PhoneCall, Search, X } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { entityIdFromCustomerKey, getRecentCustomers, type RecentCustomer } from "@/lib/crm/recent-customers"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import { SECONDARY_TEXT_CLASS } from "@/components/admin/crm/home/shared"

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
  /** 검색 소스 제한 — 지정 시 unified API `?source=`로 좁히고 최근 목록도 같은 소스만 남긴다. */
  sources?: "lead" | "neo_account"
  /** 화면의 헤더(예: 홈 '고객 찾기' <p id>)와 콤보박스를 aria-labelledby 로 연결한다. */
  labelledBy?: string
}

/**
 * 키보드 이동 — CrmCommandPalette 의 activeIndex 순환 규칙과 동일(끝에서 처음으로 감김).
 * 순수 함수로 분리해 테스트한다(home-08).
 */
export function movePickerActiveIndex(prev: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return 0
  const clamped = Math.min(Math.max(prev, 0), length - 1)
  return (clamped + delta + length) % length
}

/**
 * focusout 이 래퍼 밖으로 나갈 때만 닫는다 — Tab 으로 목록·지우기 버튼으로 옮겨가도 결과가 사라지지 않는다.
 * relatedTarget 이 null 이면(창 포커스 이탈·본문 클릭) 닫는다.
 */
export function shouldCloseOnFocusOut(wrapper: Node | null, relatedTarget: EventTarget | null): boolean {
  if (!wrapper) return true
  if (!relatedTarget || !(relatedTarget instanceof Node)) return true
  return !wrapper.contains(relatedTarget)
}

function rowFromRecent(recent: RecentCustomer): PickerRow {
  return { key: recent.key, name: recent.name, contact: null, sourceLabel: recent.sourceLabel, source: recent.source }
}

export default function CrmCustomerPicker({ label, linkedId, onPick, onFreeText, onClear, sources, labelledBy }: Props) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PickerRow[]>([])
  const [recents, setRecents] = useState<PickerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  // rows 가 어느 검색어에 대해 확정(fetch 완료)된 것인지 — 입력이 바뀐 뒤 220ms 디바운스·fetch 가 끝나기 전에는
  // 이전 검색어의 결과라서, 화면·SR 상태·Enter 선택 어디에도 노출하지 않는다(review: 오래된 후보 선택 방지).
  const [committedTerm, setCommittedTerm] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  // '다시 시도' 한 회차만 캐시를 건너뛴다 — 그 뒤의 일반 검색은 다시 TTL/SWR 캐시를 탄다(UX 규약 2).
  const forceNextRef = useRef(false)
  const [active, setActive] = useState(0)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const reqId = useRef(0)
  const baseId = useId()
  const listId = `${baseId}-listbox`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const linked = Boolean(linkedId)

  useEffect(() => {
    setRecents(getRecentCustomers().map(rowFromRecent))
  }, [open])

  useEffect(() => {
    if (!open) return
    const term = label.trim()
    // 세대 카운터(UX 규약 8) — 대상이 바뀐 뒤 도착한 늦은 응답은 버린다.
    const current = ++reqId.current
    const force = forceNextRef.current
    forceNextRef.current = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const base = term
          ? `q=${encodeURIComponent(term)}&limit=8`
          : `owner=__me&limit=8`
        const query = sources ? `${base}&source=${sources}` : base
        const data = await adminFetchJsonCached<UnifiedResponse>(`/api/admin/crm/customers/unified?${query}`, undefined, {
          cacheKey: `picker:${query}`,
          ttlMs: 30_000,
          staleWhileRevalidateMs: 60_000,
          force,
        })
        if (current === reqId.current) {
          setRows((data.rows ?? []).filter((row): row is PickerRow => row.source !== "customer"))
          setCommittedTerm(term)
          setSearchFailed(false)
        }
      } catch {
        // 검색 실패를 "일치하는 고객이 없습니다 · 직접 입력으로 저장됩니다"로 그리면,
        // 실제로는 있는 고객을 자유 텍스트로 새로 만들게 만든다(중복·미연결 레코드).
        if (current === reqId.current) {
          setRows([])
          setCommittedTerm(term)
          setSearchFailed(true)
        }
      } finally {
        if (current === reqId.current) setLoading(false)
      }
    }, 220)
    return () => clearTimeout(handle)
  }, [label, open, sources, retryKey])

  const handleSelect = useCallback(
    (row: PickerRow) => {
      onPick({ targetType: row.source, targetId: entityIdFromCustomerKey(row.key), targetLabel: row.name })
      setOpen(false)
    },
    [onPick]
  )

  const term = label.trim()
  // 현재 입력에 대해 확정된 결과만 후보로 쓴다 — 디바운스 중에는 이전 검색어의 rows 를 비운 것으로 취급해
  // 빠른 타이핑 뒤 Enter 가 화면 문자열과 무관한 고객을 고르지 못하게 한다. 최근 목록은 로컬 저장이라 항상 유효.
  const resolvedRows = committedTerm === term ? rows : []
  // 최근 목록은 소스 무관하게 쌓이므로, 소스 제한 시 검색 결과와 함께 여기서 거른다.
  const pool = term ? resolvedRows : dedupe([...recents, ...resolvedRows])
  const suggestions = sources ? pool.filter((row) => row.source === sources) : pool
  // active 는 파생 클램프 — suggestions 가 줄어도 effect 없이 안전 범위 유지(팔레트와 동일).
  const activeIndex = suggestions.length === 0 ? 0 : Math.min(active, suggestions.length - 1)
  const listboxOpen = open
  const activeId = listboxOpen && suggestions.length > 0 ? optionId(activeIndex) : undefined

  // 키보드로 옮긴 활성 항목이 스크롤 목록 밖이면 보이게 한다.
  useEffect(() => {
    if (!listboxOpen) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    node?.scrollIntoView?.({ block: "nearest" })
  }, [activeIndex, listboxOpen])

  const onInputKey = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        if (!open) {
          setOpen(true)
          return
        }
        setActive((prev) => movePickerActiveIndex(prev, 1, suggestions.length))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        if (!open) return
        setActive((prev) => movePickerActiveIndex(prev, -1, suggestions.length))
      } else if (event.key === "Enter") {
        // 목록이 열려 있고 후보가 있을 때만 가로챈다 — 그 외에는 바깥 <form> 제출을 막지 않는다.
        if (!open || suggestions.length === 0) return
        event.preventDefault()
        handleSelect(suggestions[activeIndex])
      } else if (event.key === "Escape") {
        if (!open) return
        // 열린 목록만 닫는다 — 바깥 드로어·모달의 Escape 닫기까지 번지지 않게 전파를 멈춘다.
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
      }
    },
    [open, suggestions, activeIndex, handleSelect]
  )

  const onWrapperBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (shouldCloseOnFocusOut(wrapperRef.current, event.relatedTarget)) setOpen(false)
  }, [])

  const statusText = !listboxOpen
    ? ""
    : loading && suggestions.length === 0
      ? "고객을 검색하는 중입니다."
      : searchFailed && suggestions.length === 0
        ? "고객 검색에 실패했습니다."
        : suggestions.length === 0
          ? "일치하는 고객이 없습니다."
          : `${suggestions.length}건의 고객 후보가 있습니다. 위아래 방향키로 이동하고 Enter 로 선택합니다.`

  return (
    <div ref={wrapperRef} className="relative" onBlur={onWrapperBlur}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1a1a1a]/30" aria-hidden />
        <input
          role="combobox"
          aria-expanded={listboxOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          // aria-labelledby 가 있으면 accname 규칙상 aria-label 은 무시되므로 둘 중 하나만 낸다.
          aria-label={labelledBy ? undefined : "고객/리드 검색"}
          aria-labelledby={labelledBy}
          autoComplete="off"
          value={label}
          onChange={(event) => {
            onFreeText(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKey}
          placeholder="고객/리드 검색 또는 직접 입력"
          className={`mt-1 h-10 w-full rounded-lg border bg-white pl-9 pr-9 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/40 focus:border-[#084734] ${
            linked ? "border-[#D7EBDD]" : "border-[#e8e8e4]"
          }`}
        />
        {linked ? (
          <span className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#084734]">
            <Check className="h-3 w-3" aria-hidden />
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
            className={`absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded ${SECONDARY_TEXT_CLASS} hover:text-[#111110]`}
            aria-label="지우기"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* 항상 마운트된 SR 상태 영역(UX 규약 7) — 결과 수·실패·검색 중을 통지한다. */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusText}
      </span>

      {/* 목록은 항상 DOM 에 두고(aria-controls 대상 유지) 닫힘은 hidden 으로 처리한다. */}
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="고객 검색 결과"
        hidden={!listboxOpen}
        // 스크롤바 클릭이 입력의 blur 를 만들지 않게 — 마우스 경로도 focusout 규칙과 일관되게 유지.
        onMouseDown={(event) => event.preventDefault()}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#e8e8e4] bg-white py-1 shadow-lg"
      >
        {!label.trim() && suggestions.length > 0 ? (
          <li role="presentation" className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/35">
            최근·내 담당
          </li>
        ) : null}
        {loading && suggestions.length === 0 ? (
          <li role="presentation" className={`px-3 py-2 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            검색 중...
          </li>
        ) : searchFailed && suggestions.length === 0 ? (
          <li role="presentation" className={`flex flex-wrap items-center gap-2 px-3 py-2 text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`}>
            <span role="alert">고객 검색에 실패했습니다. 이대로 저장하면 미연결 기록이 되니 다시 시도해 주세요.</span>
            <button
              type="button"
              onClick={() => {
                forceNextRef.current = true
                setRetryKey((key) => key + 1)
              }}
              disabled={loading}
              aria-busy={loading ? true : undefined}
              className="min-h-11 rounded-md border border-current px-2 text-[11px] font-semibold disabled:opacity-50 sm:min-h-0 sm:h-6"
            >
              다시 시도
            </button>
          </li>
        ) : suggestions.length === 0 ? (
          <li role="presentation" className={`px-3 py-2 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            일치하는 고객이 없습니다. 직접 입력으로 저장됩니다.
          </li>
        ) : (
          suggestions.map((row, index) => {
            const isActive = index === activeIndex
            return (
              <li
                key={row.key}
                id={optionId(index)}
                role="option"
                aria-selected={isActive}
                data-index={index}
                tabIndex={-1}
                onMouseEnter={() => setActive(index)}
                onClick={() => handleSelect(row)}
                className={`flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors sm:min-h-0 ${
                  isActive ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                }`}
              >
                <span className="text-[#1a1a1a]/35" aria-hidden>
                  {row.source === "lead" ? <PhoneCall className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[#111110]">{row.name}</span>
                  {row.contact ? <span className={`block truncate text-[11px] ${SECONDARY_TEXT_CLASS}`}>{row.contact}</span> : null}
                </span>
                <span className={`shrink-0 rounded-full bg-[#fafaf8] px-2 py-0.5 text-[10px] font-semibold ${SECONDARY_TEXT_CLASS}`}>
                  {row.sourceLabel}
                </span>
              </li>
            )
          })
        )}
      </ul>
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
