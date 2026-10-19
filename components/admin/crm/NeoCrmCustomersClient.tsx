"use client"

import { matchesDataOwner } from "@/lib/crm/personal-owner"
import { branchMemberOwnerAliases } from "@/lib/branch/member-names"
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ClipboardList,
  Layers,
  PhoneCall,
  RefreshCw,
  Search,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { formatCNY, formatUSD } from "@/lib/crm/money-format"
import { formatAgeHours } from "@/lib/crm/sync-freshness"
import { NEO_SOURCE_EXPIRING_WINDOW_DAYS } from "@/lib/crm/customer-segment-spec"
import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import type {
  NeoCrmCustomerDetail,
  NeoCrmCustomerListResponse,
  NeoCrmCustomerListRow,
  NeoCrmCustomerMoneyItem,
} from "@/lib/admin-crm-customers-neo"
import type { LeadRecord } from "@/lib/repositories/leads"
import type { CrmCustomerEventRecord, ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"
import AdminErrorBanner from "@/components/admin/ui/AdminErrorBanner"

type SortKey = "balance" | "expire" | "order" | "lastClass" | "name"
type SourceFilter = "all" | "neo" | "lead"

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "balance", label: "잔액순" },
  { key: "lastClass", label: "최근활동순" },
  // "만료 임박"(통합 목록 SSOT 30일)과 다른 뜻이라 같은 단어를 쓰지 않는다 — 만료일이 가까운 순 정렬이다.
  { key: "expire", label: "만료일순" },
  { key: "order", label: "오더순" },
  { key: "name", label: "이름순" },
]

const CURRENT_OWNER_VALUE = "__me"
const PAGE_SIZE = 50
const DAY_MS = 24 * 60 * 60 * 1000

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ko-KR").format(Number(value ?? 0))
}

function formatDay(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const targetMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((targetMs - todayMs) / DAY_MS)
}

function ExpiryBadge({ expireAt }: { expireAt: string | null }) {
  const days = daysUntil(expireAt)
  if (!expireAt || days === null) return <span className="text-[#1a1a1a]/30">-</span>
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#F6D5C5] bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-semibold text-[#B85C33]">
        만료 {formatDay(expireAt)}
      </span>
    )
  if (days <= NEO_SOURCE_EXPIRING_WINDOW_DAYS)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-semibold text-[#7A520F]">
        D-{days} · {formatDay(expireAt)}
      </span>
    )
  return <span className="text-[12px] text-[#1a1a1a]/55">{formatDay(expireAt)}</span>
}

function MoneySection({
  title,
  items,
  emptyLabel,
  format,
}: {
  title: string
  items: NeoCrmCustomerMoneyItem[]
  emptyLabel: string
  format: (val: number | null | undefined) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, 5)
  if (items.length === 0) {
    return <p className="rounded-xl border border-[#f0f0ec] py-8 text-center text-[12px] text-[#1a1a1a]/30">{emptyLabel}</p>
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[12px] font-bold text-[#111110]">{title}</h4>
        <span className="text-[11px] text-[#1a1a1a]/40">{items.length}건</span>
      </div>
      <div className="divide-y divide-[#f0f0ec] rounded-xl border border-[#f0f0ec] px-3">
        {visible.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2 text-[12px]">
            <div className="min-w-0 pr-2">
              <p className="truncate font-medium text-[#111110]">{item.title}</p>
              <p className="text-[11px] text-[#1a1a1a]/40">
                {formatDay(item.occurredAt)} · {item.ownerName}
              </p>
            </div>
            <span className="shrink-0 font-semibold text-[#084734]">{format(item.amount)}</span>
          </div>
        ))}
      </div>
      {items.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-[11.5px] font-semibold text-[#084734] hover:underline"
        >
          {expanded ? "접기" : `더보기 (+${items.length - 5}건)`}
        </button>
      )}
    </div>
  )
}

function SummaryChip({ label, value, tone = "text-[#111110]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-[#fafaf8] p-2 text-center border border-[#e8e8e4]/60">
      <p className="text-[10.5px] text-[#615D59]">{label}</p>
      <p className={`mt-0.5 text-[13px] font-bold truncate ${tone}`}>{value}</p>
    </div>
  )
}

type DetailTab = "activity" | "eeo" | "orders" | "collections" | "performances"

interface TimelineEntry {
  id: string
  kind: string
  date: string | null
  title: string
  subtitle: string | null
  risk: boolean
  neo: boolean
}

const TIMELINE_META: Record<string, { label: string; tone: "normal" | "neo"; icon: React.ReactNode }> = {
  order: { label: "오더", tone: "neo", icon: <Wallet className="h-3.5 w-3.5" /> },
  collection: { label: "수금", tone: "neo", icon: <Building2 className="h-3.5 w-3.5" /> },
  performance: { label: "성과", tone: "neo", icon: <CalendarClock className="h-3.5 w-3.5" /> },
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const meta = TIMELINE_META[entry.kind] ?? { label: "기록", tone: "normal", icon: <ClipboardList className="h-3.5 w-3.5" /> }
  const iconClass = entry.risk
    ? "bg-[#FEF3EE] text-[#B85C33]"
    : meta.tone === "neo"
      ? "bg-[#ECFDF5] text-[#084734]"
      : "bg-[#fafaf8] text-[#1a1a1a]/45"
  return (
    <li className="flex gap-2.5">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1 border-b border-[#f5f5f2] pb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#1a1a1a]/45">{meta.label}</span>
          <span className="text-[11px] text-[#1a1a1a]/35">{formatDay(entry.date)}</span>
          {entry.risk ? (
            <span className="rounded bg-[#FEF3EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#B85C33]">위험</span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[12px] font-semibold text-[#111110]">{entry.title}</p>
        {entry.subtitle ? <p className="mt-0.5 line-clamp-2 text-[12px] text-[#1a1a1a]/55">{entry.subtitle}</p> : null}
      </div>
    </li>
  )
}

function CustomerDetailPanel({
  accountId,
  seedName,
  seedOwner,
  onClose,
}: {
  accountId: string
  seedName?: string | null
  seedOwner?: string | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<NeoCrmCustomerDetail | null>(null)
  const [events, setEvents] = useState<CrmCustomerEventRecord[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>("activity")
  const [note, setNote] = useState("")
  const [posting, setPosting] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminFetchJsonCached<NeoCrmCustomerDetail>(`/api/admin/crm/customers-neo/${accountId}`, undefined, {
      ttlMs: 60_000,
    })
      .then((next) => {
        if (cancelled) return
        setDetail(next)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "상세 데이터를 불러오지 못했습니다.")
        setLoading(false)
      })

    const eventsUrl = `/api/admin/crm/events?targetType=neo_account&targetId=${encodeURIComponent(accountId)}&limit=50`
    adminFetchJsonCached<ListCrmCustomerEventsResult>(eventsUrl, undefined, { ttlMs: 30_000 })
      .then((res) => {
        if (cancelled) return
        setEvents(res.rows)
        setTimelineLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setTimelineLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accountId])

  const handleAddNote = async () => {
    if (!note.trim() || posting) return
    setPosting(true)
    try {
      await adminFetchJson(`/api/admin/crm/events`, {
        method: "POST",
        body: JSON.stringify({
          targetType: "neo_account",
          targetId: accountId,
          sourceType: "internal_note",
          title: "수기 메모",
          body: note.trim(),
        }),
      })
      setNote("")
      setSavedMsg("메모가 저장되었습니다.")
      setTimeout(() => setSavedMsg(null), 2500)
    } catch {
      alert("메모 저장 실패")
    } finally {
      setPosting(false)
    }
  }

  const name = detail?.account?.name ?? seedName ?? "고객 상세"
  const owner = detail?.account?.ownerName ?? seedOwner ?? "-"
  const totalBalance = detail?.eeoAccounts.reduce((sum, item) => sum + (item.balance ?? 0), 0) ?? 0
  const totalOrder = detail?.orders.reduce((sum, item) => sum + (item.amount ?? 0), 0) ?? 0
  const totalPerformance = detail?.performances.reduce((sum, item) => sum + (item.amount ?? 0), 0) ?? 0

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = []
    for (const ev of events) {
      entries.push({
        id: `ev:${ev.id}`,
        kind: ev.sourceType,
        date: ev.occurredAt,
        title: ev.title,
        subtitle: ev.body ?? ev.summary,
        risk: ev.sentiment === "risk",
        neo: false,
      })
    }
    for (const o of detail?.orders ?? []) {
      entries.push({ id: `o:${o.id}`, kind: "order", date: o.occurredAt, title: o.title || "오더 확정", subtitle: formatUSD(o.amount), risk: false, neo: true })
    }
    for (const c of detail?.collections ?? []) {
      entries.push({ id: `c:${c.id}`, kind: "collection", date: c.occurredAt, title: c.title || "수금", subtitle: formatCNY(c.amount), risk: false, neo: true })
    }
    return entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  }, [events, detail])

  const tabs: Array<{ key: DetailTab; label: string; count: number }> = [
    { key: "activity", label: "활동", count: timeline.length },
    { key: "eeo", label: "EEO", count: detail?.eeoAccounts.length ?? 0 },
    { key: "orders", label: "오더", count: detail?.orders.length ?? 0 },
    { key: "collections", label: "수금", count: detail?.collections.length ?? 0 },
    { key: "performances", label: "성과", count: detail?.performances.length ?? 0 },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
      >
        <div className="border-b border-[#e8e8e4] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="rounded-xs bg-[#f0f0ec] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#615D59]">
                외부 CRM 연동 원천
              </span>
              <h3 className="mt-1 text-[17px] font-bold text-[#111110]">{name}</h3>
              <p className="mt-0.5 text-[12px] text-[#615D59]">담당: {owner}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] text-[#111110] hover:bg-[#f5f5f2]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <SummaryChip label="잔액" value={formatCNY(totalBalance)} tone="text-[#084734]" />
            <SummaryChip label="오더" value={formatUSD(totalOrder)} />
            <SummaryChip label="성과" value={formatCNY(totalPerformance)} tone="text-[#084734]" />
          </div>

          <div className="mt-3 flex gap-1 rounded-lg bg-[#fafaf8] p-1">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[11.5px] font-semibold transition-colors ${
                  tab === item.key ? "bg-white text-[#111110] shadow-xs" : "text-[#615D59] hover:text-[#111110]"
                }`}
              >
                {item.label}
                <span className="ml-1 text-[10px] opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? <p className="mb-3 text-[12px] text-[#B85C33]">{error}</p> : null}
          {loading && !detail ? (
            <div className="py-8 text-center text-[12px] text-[#615D59]">고객 상세 정보를 불러오는 중...</div>
          ) : tab === "activity" ? (
            timelineLoading ? (
              <div className="py-8 text-center text-[12px] text-[#615D59]">로딩 중...</div>
            ) : timeline.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[#615D59]">활동 기록이 없습니다.</div>
            ) : (
              <ul className="space-y-3">
                {timeline.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )
          ) : tab === "eeo" ? (
            detail?.eeoAccounts.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-[#615D59]">EEO 계정이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {detail?.eeoAccounts.map((eeo) => (
                  <div key={eeo.id} className="rounded-lg border border-[#f0f0ec] p-3">
                    <p className="text-[13px] font-semibold text-[#111110]">{eeo.name}</p>
                    <p className="text-[11px] text-[#615D59]">UID: {eeo.uid || "-"}</p>
                    <div className="mt-2 flex justify-between text-[12px]">
                      <span className="font-semibold text-[#084734]">{formatCNY(eeo.balance)}</span>
                      <ExpiryBadge expireAt={eeo.expireAt} />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : tab === "orders" ? (
            <MoneySection title="오더 (USD)" items={detail?.orders ?? []} emptyLabel="오더가 없습니다." format={formatUSD} />
          ) : tab === "collections" ? (
            <MoneySection title="수금 (CNY)" items={detail?.collections ?? []} emptyLabel="수금 기록이 없습니다." format={formatCNY} />
          ) : (
            <MoneySection title="성과 (CNY)" items={detail?.performances ?? []} emptyLabel="성과 기록이 없습니다." format={formatCNY} />
          )}
        </div>

        {tab === "activity" ? (
          <div className="border-t border-[#f0f0ec] bg-white p-3 flex gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="빠른 메모 입력..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-[#e8e8e4] p-2 text-[12px] outline-none focus:border-[#084734]"
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={posting || !note.trim()}
              className="rounded-lg bg-[#084734] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              저장
            </button>
          </div>
        ) : null}

        {savedMsg ? (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-[#084734] px-3 py-1 text-[11px] text-white">
            {savedMsg}
          </div>
        ) : null}
      </motion.aside>
    </motion.div>
  )
}

// ─── 통합 행 인터페이스: 원천 고객(NEO) + 리드(Lead) ───
export type CustomerAccountOrigin = "neo" | "lead"

export interface CustomerAccountUnifiedRow {
  key: string
  id: string
  origin: CustomerAccountOrigin
  name: string
  subText: string
  ownerName: string
  ownerId: string | null
  balance: number | null
  expireAt: string | null
  lastClassAt: string | null
  orderAmount: number
  orderCount: number
  statusText?: string | null
  tagLabel: string
  detailHref: string
  rawNeo?: NeoCrmCustomerListRow
  rawLead?: LeadRecord
}

export default function NeoCrmCustomersClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { currentOwner, currentOwnerKeys, owners: crmOwners } = useCrmOwners()

  const deepLinkedAccountId = searchParams.get("account")?.trim() ?? ""
  // ?expiring=1 딥링크 — Overview "리뉴얼 D-60" 타일에서 '60일 내 만료만' 필터가 켜진 채 착지한다.
  // 기준은 요약 타일(summary.expiringSoonCount)과 같은 창(오늘~60일, 지난 만료 제외)이라 착지 건수가 타일과 맞는다.
  const deepLinkedExpiring = searchParams.get("expiring") === "1"

  const [neoData, setNeoData] = useState<NeoCrmCustomerListResponse | null>(null)
  const [leadsData, setLeadsData] = useState<LeadRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // 원천 고객, 리드 전부 다 포함할 수 있는 소스 필터
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")

  // 담당자 필터: URL에 없으면 로그인한 사용자(CURRENT_OWNER_VALUE)를 디폴트로 잡는다
  const ownerParam = searchParams.get("owner")?.trim()
  const [ownerFilter, setOwnerScope] = useState<string>(() => ownerParam ?? CURRENT_OWNER_VALUE)
  const setOwnerFilter = useCallback((next: string) => {
    setOwnerScope(next)
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set("owner", next === "all" ? "" : next)
    window.history.replaceState(null, "", `?${nextParams.toString()}`)
  }, [searchParams])

  const [sortKey, setSortKey] = useState<SortKey>("balance")
  const [expiringOnly, setExpiringOnly] = useState(deepLinkedExpiring)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [dismissedDeepLinkedAccountId, setDismissedDeepLinkedAccountId] = useState<string | null>(null)

  // 원천 고객(NEO) + 리드(Leads) 데이터 동시 적재
  const load = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const [neoRes, leadsRes] = await Promise.all([
        adminFetchJsonCached<NeoCrmCustomerListResponse>(`/api/admin/crm/customers-neo`, undefined, {
          ttlMs: 60_000,
          force: options?.force,
        }),
        adminFetchJsonCached<{ leads: LeadRecord[] }>(`/api/admin/leads`, undefined, {
          ttlMs: 60_000,
          force: options?.force,
        }),
      ])
      setNeoData(neoRes)
      setLeadsData(leadsRes.leads ?? [])
      if (!neoRes.ok && neoRes.error) setError(neoRes.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : "고객 및 리드 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (
      !deepLinkedAccountId ||
      selectedAccountId === deepLinkedAccountId ||
      dismissedDeepLinkedAccountId === deepLinkedAccountId
    )
      return
    setSelectedAccountId(deepLinkedAccountId)
  }, [deepLinkedAccountId, dismissedDeepLinkedAccountId, selectedAccountId])

  const closeSelectedAccount = useCallback(() => {
    setSelectedAccountId(null)
    if (deepLinkedAccountId) setDismissedDeepLinkedAccountId(deepLinkedAccountId)
    if (!searchParams.has("account")) return
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete("account")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [deepLinkedAccountId, pathname, router, searchParams])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, sourceFilter, ownerFilter, sortKey, expiringOnly])

  const deferredQuery = useDeferredValue(query)

  // 원천 고객과 리드를 하나의 통합 목록으로 조립
  const allUnifiedRows = useMemo<CustomerAccountUnifiedRow[]>(() => {
    const list: CustomerAccountUnifiedRow[] = []

    // 1. 원천 고객 (NEO)
    for (const row of neoData?.rows ?? []) {
      list.push({
        key: `neo:${row.accountId}`,
        id: row.accountId,
        origin: "neo",
        name: row.name,
        subText: [row.uid ? `UID ${row.uid}` : "EEO 미연결", row.phone].filter(Boolean).join(" · "),
        ownerName: row.ownerName || "미배정",
        ownerId: row.ownerId,
        balance: row.balance,
        expireAt: row.expireAt,
        lastClassAt: row.lastClassAt,
        orderAmount: row.orderAmount,
        orderCount: row.orderCount,
        tagLabel: "원천 고객",
        detailHref: `/admin/crm/customers/${encodeURIComponent(`neo:${row.accountId}`)}`,
        rawNeo: row,
      })
    }

    // 2. 리드 (Leads)
    for (const lead of leadsData ?? []) {
      const leadName = lead.org?.trim() || lead.name?.trim() || "리드 고객"
      list.push({
        key: `lead:${lead.id}`,
        id: lead.id,
        origin: "lead",
        name: leadName,
        subText: [lead.phone, lead.source, lead.branch].filter(Boolean).join(" · "),
        ownerName: lead.assigned_to || "미배정",
        ownerId: lead.assigned_to ?? null,
        balance: null,
        expireAt: null,
        lastClassAt: lead.timestamp,
        orderAmount: 0,
        orderCount: 0,
        statusText: lead.status,
        tagLabel: "리드",
        detailHref: `/admin/crm/customers/leads?lead=${encodeURIComponent(lead.id)}`,
        rawLead: lead,
      })
    }

    return list
  }, [neoData?.rows, leadsData])

  // 현재 활성 담당자 명칭 확인
  // 필터링 및 정렬
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const ownerKeys = !ownerFilter || ownerFilter === "all" ? undefined : ownerFilter === CURRENT_OWNER_VALUE ? currentOwnerKeys : branchMemberOwnerAliases(ownerFilter)

    const result = allUnifiedRows.filter((row) => {
      // 1. 소스 필터 (전체 / 원천 고객 / 리드)
      if (sourceFilter === "neo" && row.origin !== "neo") return false
      if (sourceFilter === "lead" && row.origin !== "lead") return false

      // 담당자 별명을 동일 인물로 비교한다. 비슷한 이름을 부분 일치로 포함하지 않는다.
      if (!matchesDataOwner(row.ownerName, ownerKeys)) return false

      // 3. 60일 내 만료만(원천 고객 창 — 통합 목록의 "만료 임박" 30일과 다른 뜻)
      if (expiringOnly) {
        if (row.origin !== "neo") return false
        const d = daysUntil(row.expireAt)
        if (d === null || d < 0 || d > NEO_SOURCE_EXPIRING_WINDOW_DAYS) return false
      }

      // 4. 검색어 (학원명·UID·전화·담당자·리드)
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.subText.toLowerCase().includes(q) ||
        row.ownerName.toLowerCase().includes(q)
      )
    })

    return result.slice().sort((a, b) => {
      switch (sortKey) {
        case "balance":
          return (b.balance ?? -1) - (a.balance ?? -1)
        case "order":
          return b.orderAmount - a.orderAmount
        case "lastClass": {
          const av = a.lastClassAt ?? ""
          const bv = b.lastClassAt ?? ""
          return bv.localeCompare(av)
        }
        case "name":
          return a.name.localeCompare(b.name, "ko-KR")
        case "expire": {
          const av = a.expireAt ?? "9999"
          const bv = b.expireAt ?? "9999"
          return av.localeCompare(bv)
        }
        default:
          return 0
      }
    })
  }, [allUnifiedRows, sourceFilter, ownerFilter, currentOwnerKeys, expiringOnly, deferredQuery, sortKey])

  const visibleRows = filtered.slice(0, visibleCount)
  const hasActiveFilters = Boolean(query.trim()) || ownerFilter !== "all" || expiringOnly || sourceFilter !== "all"

  const resetFilters = useCallback(() => {
    setQuery("")
    setSourceFilter("all")
    setOwnerFilter(CURRENT_OWNER_VALUE)
    setExpiringOnly(false)
  }, [setOwnerFilter])

  const selectedRow = useMemo(
    () => (selectedAccountId ? neoData?.rows.find((row) => row.accountId === selectedAccountId) ?? null : null),
    [neoData, selectedAccountId]
  )

  const summary = neoData?.summary
  const syncHealth = neoData?.syncHealth

  const totalNeoCount = neoData?.rows.length ?? 0
  const totalLeadsCount = leadsData?.length ?? 0
  const grandTotal = totalNeoCount + totalLeadsCount

  return (
    <div className="space-y-4">
      {/* ─── 상단 헤더: 타이틀, 콤팩트 설명, 새로고침 (세로 길이 대폭 압축) ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[#111110]">
              고객 원천 데이터 (외부 CRM & 리드)
            </h1>
            <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-semibold text-[#084734]">
              원천 동기화
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-[#615D59]">
            외부 CRM(NEO) 계정과 인바운드 리드를 전부 포함한 원천 데이터베이스입니다. ·{" "}
            <Link
              href="/admin/crm/customers/unified"
              className="font-medium text-[#084734] underline-offset-2 hover:underline"
            >
              통합 고객DB 열기 →
            </Link>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#A39E98] hidden lg:inline">
            sync {formatDateTime(syncHealth?.shroffAccountSyncedAt)}
          </span>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {error ? <AdminErrorBanner message={error} className="mb-2" /> : null}

      {/* 콤팩트 알림 스트립 (15일 전 데이터 알림 슬림화) */}
      {syncHealth?.isShroffAccountStale ? (
        <div className="flex items-center justify-between rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3.5 py-1.5 text-[12px] text-[#7A520F]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              잔액·만료 원천 데이터가 {formatAgeHours(syncHealth.shroffAccountAgeHours)} 데이터입니다. 외부 CRM 동기화 후 최신 수치를 확인하세요.
            </span>
          </div>
          <span className="text-[11px] opacity-75 hidden sm:inline">동기화 권장</span>
        </div>
      ) : null}

      {/* ─── 가로 슬림 요약 스트립 (콤팩트 KPI: 세로 공간 100px 이상 절약) ─── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-2.5 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-[#615D59]">
            전체 원천 <strong className="font-bold tabular-nums text-[#111110]">{loading ? "…" : formatNumber(grandTotal)}</strong>곳
          </span>
          <span className="text-[#615D59]">
            원천 고객 <strong className="font-semibold tabular-nums text-[#084734]">{loading ? "…" : formatNumber(summary?.totalCount)}</strong>곳
            <span className="ml-1 text-[11px] opacity-75">(EEO {formatNumber(summary?.withEeoCount)})</span>
          </span>
          <span className="text-[#615D59]">
            리드 <strong className="font-semibold tabular-nums text-[#084734]">{loading ? "…" : formatNumber(totalLeadsCount)}</strong>건
          </span>
          <span
            className="text-[#615D59]"
            title={`오늘~${NEO_SOURCE_EXPIRING_WINDOW_DAYS}일 안에 만료되는 고객(지난 만료 제외)`}
          >
            {NEO_SOURCE_EXPIRING_WINDOW_DAYS}일 내 만료 <strong className="font-semibold tabular-nums text-[#B85C33]">{loading ? "…" : formatNumber(summary?.expiringSoonCount)}</strong>곳
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 text-[12px] font-medium text-[#615D59]">
          <span>총 잔액 <strong className="text-[#084734] font-bold">{loading ? "…" : formatCNY(summary?.totalBalance)}</strong></span>
          <span>총 오더 <strong className="text-[#111110] font-bold">{loading ? "…" : formatUSD(summary?.totalOrderAmount)}</strong></span>
        </div>
      </div>

      {/* ─── 필터 바: 소스 탭, 검색, 담당자(내 담당 디폴트), 정렬, 60일 내 만료 ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* 좌측: 소스 선택 세그먼트 (전체 / 원천 고객 / 리드 전부 다 포함) */}
        <div className="flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5 text-[12px] font-semibold">
          <button
            type="button"
            onClick={() => setSourceFilter("all")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
              sourceFilter === "all" ? "bg-white text-[#084734] shadow-xs" : "text-[#615D59] hover:text-[#111110]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>전체</span>
            <span className="text-[11px] opacity-75">({grandTotal})</span>
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter("neo")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
              sourceFilter === "neo" ? "bg-white text-[#084734] shadow-xs" : "text-[#615D59] hover:text-[#111110]"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>원천 고객</span>
            <span className="text-[11px] opacity-75">({totalNeoCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter("lead")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
              sourceFilter === "lead" ? "bg-white text-[#084734] shadow-xs" : "text-[#615D59] hover:text-[#111110]"
            }`}
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span>리드</span>
            <span className="text-[11px] opacity-75">({totalLeadsCount})</span>
          </button>
        </div>

        {/* 우측: 검색, 담당자(내 담당 기본), 정렬, 필터 칩 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 검색 입력 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="학원명·UID·전화·담당자·리드"
              className="h-8.5 w-[210px] rounded-lg border border-[#e8e8e4] bg-white pl-8 pr-2.5 text-[12.5px] text-[#111110] outline-none transition-colors focus:border-[#084734]"
            />
          </div>

          {/* 내 담당 칩 (디폴트) */}
          {currentOwner ? (
            <button
              type="button"
              onClick={() => setOwnerFilter(ownerFilter === CURRENT_OWNER_VALUE ? "all" : CURRENT_OWNER_VALUE)}
              aria-pressed={ownerFilter === CURRENT_OWNER_VALUE}
              className={`inline-flex h-8.5 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-all ${
                ownerFilter === CURRENT_OWNER_VALUE
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734] shadow-xs"
                  : "border-[#e8e8e4] bg-white text-[#615D59] hover:bg-[#fafaf8]"
              }`}
            >
              <User className="h-3 w-3" />
              <span>내 담당</span>
              <span className="text-[11px] opacity-70">({currentOwner.displayName})</span>
            </button>
          ) : null}

          {/* 담당자 전체 칩 */}
          <button
            type="button"
            onClick={() => setOwnerFilter("all")}
            aria-pressed={ownerFilter === "all" || !ownerFilter}
            className={`inline-flex h-8.5 items-center gap-1 rounded-lg border px-2 text-[12px] font-semibold transition-all ${
              ownerFilter === "all" || !ownerFilter
                ? "border-[#084734] bg-[#084734] text-white"
                : "border-[#e8e8e4] bg-white text-[#615D59] hover:bg-[#fafaf8]"
            }`}
          >
            <Users className="h-3 w-3" />
            <span>전체</span>
          </button>

          {/* 담당자 드롭다운 */}
          <select
            value={ownerFilter === CURRENT_OWNER_VALUE ? CURRENT_OWNER_VALUE : ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-8.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none focus:border-[#084734]"
          >
            <option value="all">담당자 선택 (전체)</option>
            <option value={CURRENT_OWNER_VALUE}>내 담당 · {currentOwner?.displayName ?? "담당자 연결 확인"}</option>
            {crmOwners.map((owner) => (
              <option key={owner.ownerKey} value={owner.displayName}>
                {owner.displayName} ({owner.teamRoleLabel})
              </option>
            ))}
          </select>

          {/* 정렬 드롭다운 */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none focus:border-[#084734]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>

          {/* 60일 내 만료만 버튼 */}
          <button
            type="button"
            onClick={() => setExpiringOnly((prev) => !prev)}
            className={`inline-flex h-8.5 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
              expiringOnly
                ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
                : "border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2]"
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            {NEO_SOURCE_EXPIRING_WINDOW_DAYS}일 내 만료만
          </button>

          <span className="text-[11.5px] font-medium text-[#615D59]">
            {formatNumber(filtered.length)}곳
          </span>
        </div>
      </div>

      {/* ─── 모바일 카드 리스트 ─── */}
      <div className="sm:hidden divide-y divide-[#f0f0ec] rounded-2xl border border-[#e8e8e4] bg-white">
        {loading && !neoData ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[#f5f5f2]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-[#615D59]">
            조건에 맞는 고객 또는 리드가 없습니다.
          </div>
        ) : (
          visibleRows.map((row) => (
            <div
              key={row.key}
              onClick={() => {
                if (row.origin === "neo") setSelectedAccountId(row.id)
              }}
              className="p-3.5 transition-colors hover:bg-[#fafaf8]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-xs px-1.5 py-0.2 text-[10px] font-bold ${
                        row.origin === "neo"
                          ? "bg-[#f0f0ec] text-[#615D59]"
                          : "bg-[#ECFDF5] text-[#084734]"
                      }`}
                    >
                      {row.tagLabel}
                    </span>
                    <p className="truncate text-[13.5px] font-semibold text-[#111110]">{row.name}</p>
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-[#A39E98]">{row.subText}</p>
                </div>
                <Link
                  href={row.detailHref}
                  className="shrink-0 text-[11px] font-semibold text-[#084734] underline"
                >
                  상세 ↗
                </Link>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between text-[12px]">
                <div className="flex items-center gap-2">
                  {row.origin === "neo" ? (
                    <span className="font-bold text-[#084734]">
                      {row.balance == null ? "-" : formatCNY(row.balance)}
                    </span>
                  ) : (
                    <span className="rounded-xs bg-[#f0f0ec] px-1.5 py-0.2 text-[11px] text-[#111110]">
                      {row.statusText || "신규 리드"}
                    </span>
                  )}
                  <span className="text-[#A39E98]">· {row.ownerName}</span>
                </div>
                {row.origin === "neo" && <ExpiryBadge expireAt={row.expireAt} />}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── 데스크톱 통합 테이블 ─── */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white sm:block">
        <table className="min-w-[920px] w-full text-left">
          <thead className="border-b border-[#f0f0ec] bg-[#fafaf8] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#615D59]">
            <tr>
              <th className="py-2.5 pl-4 pr-3">구분 · 고객/학원명</th>
              <th className="py-2.5 pr-3">담당자</th>
              <th className="py-2.5 pr-3 text-right">잔액 (CNY)</th>
              <th className="py-2.5 pr-3">만료일 / 리드상태</th>
              <th className="py-2.5 pr-3">최근수업 / 접수일</th>
              <th className="py-2.5 pl-3 pr-4 text-right">오더 (USD) / 바로가기</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0ec] text-[12.5px]">
            {loading && !neoData ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={6} className="py-3 px-4">
                    <div className="h-5 animate-pulse rounded bg-[#f5f5f2]" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[13px] text-[#615D59]">
                  {hasActiveFilters ? "검색 조건에 맞는 고객 또는 리드가 없습니다." : "등록된 고객 또는 리드가 없습니다."}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="ml-2 font-semibold text-[#084734] underline"
                    >
                      필터 초기화
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const isNeo = row.origin === "neo"

                return (
                  <tr
                    key={row.key}
                    onClick={() => {
                      if (isNeo) setSelectedAccountId(row.id)
                    }}
                    className="cursor-pointer align-middle transition-colors hover:bg-[#fafaf8]"
                  >
                    {/* 고객/학원명 */}
                    <td className="py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded-xs px-1.5 py-0.2 text-[10.5px] font-bold ${
                            isNeo
                              ? "bg-[#f0f0ec] text-[#615D59]"
                              : "bg-[#ECFDF5] text-[#084734]"
                          }`}
                        >
                          {row.tagLabel}
                        </span>
                        <p className="truncate font-semibold text-[#111110]">{row.name}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[#A39E98] pl-0.5">{row.subText}</p>
                    </td>

                    {/* 담당자 */}
                    <td className="py-2.5 pr-3 text-[#111110]">
                      <span className={row.ownerName === currentOwner?.displayName ? "font-bold text-[#084734]" : ""}>
                        {row.ownerName}
                      </span>
                    </td>

                    {/* 잔액 (CNY) */}
                    <td className="py-2.5 pr-3 text-right font-semibold text-[#084734] tabular-nums">
                      {isNeo ? (row.balance == null ? "-" : formatCNY(row.balance)) : <span className="text-[#A39E98] font-normal">-</span>}
                    </td>

                    {/* 만료일 / 리드상태 */}
                    <td className="py-2.5 pr-3">
                      {isNeo ? (
                        <ExpiryBadge expireAt={row.expireAt} />
                      ) : (
                        <span className="inline-flex rounded-sm bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#084734]">
                          {row.statusText || "신규 리드"}
                        </span>
                      )}
                    </td>

                    {/* 최근수업 / 접수일 */}
                    <td className="py-2.5 pr-3 text-[#615D59] tabular-nums">
                      {formatDay(row.lastClassAt)}
                    </td>

                    {/* 오더 / 상세 딥링크 */}
                    <td className="py-2.5 pl-3 pr-4 text-right">
                      {isNeo ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="text-right tabular-nums">
                            <span className="font-semibold text-[#111110]">{formatUSD(row.orderAmount)}</span>
                            {row.orderCount > 0 ? (
                              <span className="ml-1 text-[11px] text-[#A39E98]">({row.orderCount}건)</span>
                            ) : null}
                          </div>
                          <Link
                            href={row.detailHref}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-md border border-[#e8e8e4] px-1.5 py-0.5 text-[11px] font-semibold text-[#084734] hover:bg-[#ECFDF5]"
                          >
                            상세 ↗
                          </Link>
                        </div>
                      ) : (
                        <Link
                          href={row.detailHref}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11.5px] font-semibold text-[#084734] hover:bg-[#ECFDF5]"
                        >
                          리드 관리 ↗
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 더보기 버튼 */}
      {filtered.length > visibleRows.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          className="w-full rounded-xl border border-[#e8e8e4] bg-white py-2 text-[12.5px] font-semibold text-[#111110] transition-colors hover:bg-[#fafaf8]"
        >
          더보기 ({formatNumber(filtered.length - visibleRows.length)}곳 남음)
        </button>
      ) : null}

      {/* 원천 고객 상세 슬라이드오버 드로어 */}
      <AnimatePresence>
        {selectedAccountId ? (
          <CustomerDetailPanel
            key={selectedAccountId}
            accountId={selectedAccountId}
            seedName={selectedRow?.name}
            seedOwner={selectedRow?.ownerName}
            onClose={closeSelectedAccount}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
