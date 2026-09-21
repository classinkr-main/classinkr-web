"use client"

// 고객 360 · 매출(돈흐름) 탭 — 기획안 §11.1 M1(통화별 분리 타일) · M2(품목별 대수) ·
// M3(주문 타임라인) · M4(미매칭 출고 즉시 연결).
//
// 통화 정책: ₩(자체 딜) / $(NEO 오더) / ¥(NEO 수금·성과·EEO 잔액)은 절대 합산하지 않는다.
// 이 파일의 합계는 전부 같은 통화 목록 안에서만 센다(sumAmounts 호출부 확인). 통화를 넘나드는
// 합계 변수·표기는 두지 않는다. M2 품목 표도 같은 원칙 — 통화·근거·출처가 다른 행은
// lib/crm/money-line-items.ts가 이미 분리해 두므로 여기서 다시 합치지 않는다.

import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, Coins, Handshake, Link2, Receipt, TrendingUp, Wallet } from "lucide-react"

import { EmptyState, Panel, StatTile, TableEmpty } from "@/components/admin/viz"
import { CRM_CURRENCY_BADGE, formatCrmMoney, formatCNY, formatKRWAbbrev, formatUSD, type CrmCurrency } from "@/lib/crm/money-format"
import {
  buildMoneyTimeline,
  groupMoneyTimelineByMonth,
  MONEY_TIMELINE_KIND_META,
  moneyTimelineStatusLabel,
  type MoneyTimelineEntry,
  type MoneyTimelineKind,
} from "@/lib/crm/money-timeline"
import { categorizeMoneyLineItemProduct, type CrmMoneyLineItem, type CrmUnmatchedOutboundCandidate } from "@/lib/crm/money-line-items"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { Customer360Money } from "@/lib/repositories/crm-customer-360"
import type { ListCrmDealsResult } from "@/lib/repositories/crm-deals"
import type { NeoCrmCustomerEeoAccount, NeoCrmCustomerMoneyItem } from "@/lib/admin-crm-customers-neo"

import { formatDay, SERVICE_RISK_CLASS, SERVICE_RISK_LABEL, sumAmounts } from "./Customer360DetailShared"

/** 통화별 합계 캡션 — 테스트가 이 문구를 고정한다. */
export const MONEY_NO_SUM_CAPTION = "통화별 합계 · 서로 더하지 않음"
/** 타임라인 기본 표시 행 수. "더 보기"를 누를 때마다 같은 수만큼 늘어난다. */
export const MONEY_TIMELINE_PAGE_SIZE = 20

const CURRENCY_ORDER: CrmCurrency[] = ["USD", "CNY", "KRW"]

// 통화 그룹 헤더의 출처 칩 — 어드민 밀집 화면이라 채움 없이 글자색·선으로만 구분한다.
const CURRENCY_SOURCE_CHIPS: Record<CrmCurrency, string[]> = {
  USD: ["NEO 오더"],
  CNY: ["NEO 수금", "NEO 성과", "EEO 잔액"],
  KRW: ["딜(₩)"],
}

const CURRENCY_TITLE: Record<CrmCurrency, string> = {
  USD: "달러",
  CNY: "위안화",
  KRW: "원화",
}

// 패널 헤더 우측 합계 표기.
function TotalTag({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-bold tabular-nums text-[#111110]">{children}</span>
}

// ── M1 · 통화별 그룹 ───────────────────────────────────────────────────
function SourceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[#E8E8E4] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#615D59]">
      {children}
    </span>
  )
}

function CurrencyGroup({
  currency,
  hasData,
  emptyHint,
  children,
}: {
  currency: CrmCurrency
  /** false 면 타일 대신 "해당 없음"을 흐리게 그린다(숨기지 않음 — 가시성 우선). */
  hasData: boolean
  emptyHint?: string
  children: ReactNode
}) {
  const badge = CRM_CURRENCY_BADGE[currency]
  return (
    <section
      data-testid={`money-currency-group-${currency}`}
      aria-label={`${CURRENCY_TITLE[currency]}(${currency}) 합계`}
      className={`rounded-xl border border-[#E8E8E4] bg-[#F6F5F4] p-3 ${hasData ? "" : "opacity-60"}`}
    >
      <header className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[13px] font-bold tabular-nums text-[#111110]"
        >
          {badge.symbol}
        </span>
        <span className="text-[12px] font-bold text-[#111110]">{currency}</span>
        <span className="text-[11px] text-[#615D59]">{CURRENCY_TITLE[currency]}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {CURRENCY_SOURCE_CHIPS[currency].map((chip) => (
            <SourceChip key={chip}>{chip}</SourceChip>
          ))}
        </span>
      </header>
      {hasData ? (
        <div className="grid gap-2">{children}</div>
      ) : (
        <div className="rounded-xl bg-white p-4">
          <p className="text-[13px] font-semibold text-[#615D59]">해당 없음</p>
          <p className="mt-0.5 text-[11px] text-[#615D59]">{emptyHint ?? `${badge.symbol} 기준 기록이 없습니다.`}</p>
        </div>
      )}
    </section>
  )
}

// ── M3 · 타임라인 ──────────────────────────────────────────────────────
const KIND_ICON: Record<MoneyTimelineKind, ReactNode> = {
  order: <Receipt className="h-3.5 w-3.5" aria-hidden="true" />,
  collection: <Coins className="h-3.5 w-3.5" aria-hidden="true" />,
  deal: <Handshake className="h-3.5 w-3.5" aria-hidden="true" />,
}

function StatusDot({ entry }: { entry: MoneyTimelineEntry }) {
  const label = moneyTimelineStatusLabel(entry)
  if (!label) return null
  // 채움 pill 대신 점 + 텍스트. 톤이 없으면 중립 글자색.
  const toneClass = entry.statusTone ? STATUS_TONE_TEXT_CLASS[entry.statusTone] : "text-[#615D59]"
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${toneClass}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  )
}

function TimelineRow({ entry }: { entry: MoneyTimelineEntry }) {
  const meta = MONEY_TIMELINE_KIND_META[entry.kind]
  return (
    <li data-testid="money-timeline-row" className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 py-2.5">
      <span className="inline-flex min-w-[52px] items-center gap-1 pt-0.5 text-[11px] font-semibold text-[#31302E]">
        {KIND_ICON[entry.kind]}
        <span>{meta.label}</span>
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#111110]">{entry.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-[#615D59]">
          {formatDay(entry.occurredAt)}
          {` · ${entry.sourceLabel}`}
          {entry.ownerName ? ` · ${entry.ownerName}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[13px] font-bold tabular-nums text-[#111110]">
          {entry.amount == null ? "-" : formatCrmMoney({ amount: entry.amount, currency: entry.currency })}
        </span>
        <StatusDot entry={entry} />
      </div>
    </li>
  )
}

function MoneyTimeline({ entries }: { entries: MoneyTimelineEntry[] }) {
  const [visible, setVisible] = useState(MONEY_TIMELINE_PAGE_SIZE)
  const shown = useMemo(() => entries.slice(0, visible), [entries, visible])
  const groups = useMemo(() => groupMoneyTimelineByMonth(shown), [shown])
  const remaining = entries.length - shown.length

  if (entries.length === 0) {
    return (
      <EmptyState
        title="주문 타임라인 항목이 없습니다"
        description="NEO 오더·수금이나 자체 딜이 쌓이면 최신 순으로 여기에 모입니다."
      />
    )
  }

  return (
    <div>
      <ol className="space-y-4">
        {groups.map((group) => (
          <li key={group.key}>
            <h3 className="mb-1 border-b border-[#E8E8E4] pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#615D59]">
              {group.label}
              <span className="ml-1.5 font-medium normal-case tabular-nums text-[#615D59]">{group.entries.length}건</span>
            </h3>
            <ul className="divide-y divide-[#E8E8E4]">
              {group.entries.map((entry) => (
                <TimelineRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setVisible((count) => count + MONEY_TIMELINE_PAGE_SIZE)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E8E8E4] bg-white px-4 text-[13px] font-semibold text-[#31302E] transition-colors hover:bg-[#F6F5F4]"
        >
          더 보기 · 남은 {remaining.toLocaleString("ko-KR")}건
        </button>
      ) : null}
    </div>
  )
}

// ── M2 · 품목별 대수 표 ────────────────────────────────────────────────
const LINE_ITEM_CATEGORY_LABEL: Record<CrmMoneyLineItem["category"], string> = {
  board: "칠판",
  stand: "스탠드",
  camera: "카메라",
  software: "소프트웨어",
  other: "기타",
}

/** 확정=점+텍스트, 추정=점선 배지("추정 · 이름 일치") — Warning 톤(#7A520F/#FBF1E0). */
function EvidenceBadge({ evidence, optimistic }: { evidence: CrmMoneyLineItem["evidence"]; optimistic?: boolean }) {
  if (evidence === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#084734]">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        {optimistic ? "연결됨 · 다음 새로고침에 반영" : "확정"}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-[#ECD29C] bg-[#FBF1E0] px-1.5 py-0.5 text-[10px] font-semibold text-[#7A520F]">
      추정 · 이름 일치
    </span>
  )
}

function LineItemRow({
  item,
  isOpen,
  onToggle,
  optimistic,
}: {
  item: CrmMoneyLineItem
  isOpen: boolean
  onToggle: () => void
  optimistic?: boolean
}) {
  const hasDetails = item.details.length > 0
  return (
    <>
      <tr className="border-b border-[#E8E8E4] align-top last:border-b-0">
        <td className="py-2 pr-3">
          <button
            type="button"
            aria-expanded={hasDetails ? isOpen : undefined}
            disabled={!hasDetails}
            onClick={onToggle}
            className="flex min-h-11 items-center gap-1.5 text-left font-semibold text-[#111110] disabled:cursor-default sm:min-h-0"
          >
            {hasDetails ? (
              <ChevronDown
                aria-hidden="true"
                className={`h-3.5 w-3.5 shrink-0 text-[#615D59] transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            ) : null}
            <span className="truncate">{item.product}</span>
          </button>
        </td>
        <td className="py-2 pr-3 text-[12px] text-[#615D59]">{LINE_ITEM_CATEGORY_LABEL[item.category]}</td>
        <td className="py-2 pr-3 text-right text-[13px] font-semibold tabular-nums text-[#111110]">
          {item.quantity.toLocaleString("ko-KR")}개
        </td>
        <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-[#615D59]">
          {item.unitPrice == null || item.currency == null ? "-" : formatCrmMoney({ amount: item.unitPrice, currency: item.currency })}
        </td>
        <td className="py-2 pr-3 text-right text-[13px] font-bold tabular-nums text-[#111110]">
          {item.amount == null || item.currency == null ? "-" : formatCrmMoney({ amount: item.amount, currency: item.currency })}
        </td>
        <td className="py-2 pr-3 text-[12px] text-[#615D59]">{formatDay(item.lastAt)}</td>
        <td className="py-2 pr-0">
          <EvidenceBadge evidence={item.evidence} optimistic={optimistic} />
        </td>
      </tr>
      {isOpen && hasDetails ? (
        <tr className="border-b border-[#E8E8E4] bg-[#F6F5F4] last:border-b-0">
          <td colSpan={7} className="px-3 py-2.5">
            <ul className="space-y-1.5">
              {item.details.map((detail, index) => (
                <li
                  key={`${item.key}:${detail.ref}:${index}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#615D59]"
                >
                  <span className="font-semibold text-[#31302E]">{detail.ref}</span>
                  <span>{formatDay(detail.at)}</span>
                  <span className="tabular-nums">{detail.quantity.toLocaleString("ko-KR")}개</span>
                  {detail.serials.length > 0 ? <span className="truncate">S/N {detail.serials.join(", ")}</span> : null}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  )
}

const LINE_ITEM_TABLE_HEADERS = ["품목", "구분", "수량", "단가", "금액", "최근", "근거"] as const

function LineItemsTable({
  items,
  truncated,
  note,
  optimisticKeys,
}: {
  items: CrmMoneyLineItem[]
  truncated: boolean
  note?: string
  optimisticKeys: Set<string>
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  if (items.length === 0) {
    return <TableEmpty message="품목 데이터 없음 · NEO 오더는 위 통화 그룹 참고" />
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#E8E8E4] text-left text-[11px] font-semibold text-[#615D59]">
              {LINE_ITEM_TABLE_HEADERS.map((label, index) => (
                <th
                  key={label}
                  className={`py-2 pr-3 font-semibold ${index >= 2 && index <= 4 ? "text-right" : "text-left"}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <LineItemRow
                key={item.key}
                item={item}
                isOpen={expandedKey === item.key}
                onToggle={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
                optimistic={optimisticKeys.has(item.key)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {truncated ? (
        <p className="mt-2 text-[11px] text-[#615D59]">일부 원천 데이터가 조회 상한에 걸려 최신 전부가 아닐 수 있습니다.</p>
      ) : null}
      {note ? <p className="mt-2 text-[11px] text-[#615D59]">{note}</p> : null}
    </div>
  )
}

// ── M4 · 연결 대기 출고 ────────────────────────────────────────────────
function UnmatchedOutboundRow({
  row,
  accountId,
  pending,
  linked,
  error,
  onLink,
}: {
  row: CrmUnmatchedOutboundCandidate
  accountId: string | null
  pending: boolean
  linked: boolean
  error: string | null
  onLink: () => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#111110]">
          {row.destination || "목적지 미상"} · {row.product}
        </p>
        <p className="mt-0.5 text-[11px] text-[#615D59]">
          {row.quantity.toLocaleString("ko-KR")}개 · {formatDay(row.outboundDate)} · 유사도{" "}
          <span className="tabular-nums">{Math.round(row.similarity * 100)}%</span>
        </p>
        {error ? <p className="mt-0.5 text-[11px] font-semibold text-[#B43E3E]">{error}</p> : null}
      </div>
      {linked ? (
        <span className="shrink-0 text-[12px] font-semibold text-[#084734]">연결됨 · 다음 새로고침에 반영</span>
      ) : (
        <button
          type="button"
          disabled={pending || !accountId}
          onClick={onLink}
          title={accountId ? undefined : "계정 정보가 없어 연결할 수 없습니다."}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#084734] px-3 text-[13px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {pending ? "연결 중…" : "이 고객에 연결"}
        </button>
      )}
    </li>
  )
}

function UnmatchedOutboundSection({
  rows,
  accountId,
  onRelinked,
}: {
  rows: CrmUnmatchedOutboundCandidate[]
  accountId: string | null
  onRelinked?: (row: CrmUnmatchedOutboundCandidate) => void
}) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set())
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  if (rows.length === 0) return null

  async function handleLink(row: CrmUnmatchedOutboundCandidate) {
    if (pendingId) return // 중복 클릭 잠금
    if (!accountId) {
      setErrorById((prev) => ({ ...prev, [row.id]: "계정 정보가 없어 연결할 수 없습니다." }))
      return
    }
    setPendingId(row.id)
    setErrorById((prev) => {
      if (!(row.id in prev)) return prev
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    try {
      const res = await fetch("/api/admin/crm/source-links/hw-outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundId: row.id, accountId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || "연결에 실패했습니다.")
      }
      setLinkedIds((prev) => new Set(prev).add(row.id))
      onRelinked?.(row)
    } catch (error) {
      setErrorById((prev) => ({ ...prev, [row.id]: error instanceof Error ? error.message : "연결에 실패했습니다." }))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Panel title="연결 대기 출고" description="이름이 비슷하지만 아직 이 고객으로 확정되지 않은 HW 출고입니다.">
      <ul className="divide-y divide-[#E8E8E4]">
        {rows.map((row) => (
          <UnmatchedOutboundRow
            key={row.id}
            row={row}
            accountId={accountId}
            pending={pendingId === row.id}
            linked={linkedIds.has(row.id)}
            error={errorById[row.id] ?? null}
            onLink={() => handleLink(row)}
          />
        ))}
      </ul>
    </Panel>
  )
}

// ── 원천별 목록(기존 유지, 접기 가능) ───────────────────────────────────
// 돈 항목 한 줄: 제목 · 금액 · 날짜 · 담당 · 상태.
function MoneyRow({
  item,
  format,
}: {
  item: NeoCrmCustomerMoneyItem
  format: (value: number | null | undefined) => string
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#111110]">{item.title || "제목 없음"}</p>
        <p className="mt-0.5 text-[11px] text-[#615D59]">
          {formatDay(item.occurredAt)}
          {item.ownerName ? ` · ${item.ownerName}` : ""}
          {item.status ? ` · ${item.status}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-[13px] font-bold tabular-nums text-[#111110]">{format(item.amount)}</span>
    </li>
  )
}

function MoneyList({
  items,
  format,
  empty,
}: {
  items: NeoCrmCustomerMoneyItem[]
  format: (value: number | null | undefined) => string
  empty: string
}) {
  if (items.length === 0) return <TableEmpty message={empty} />
  return (
    <ul className="divide-y divide-[#E8E8E4]">
      {items.map((item) => (
        <MoneyRow key={item.id} item={item} format={format} />
      ))}
    </ul>
  )
}

function EeoRow({ account }: { account: NeoCrmCustomerEeoAccount }) {
  const status = account.serviceStatus?.trim().toLowerCase()
  const statusClass =
    status && (SERVICE_RISK_CLASS[status] ?? null) ? SERVICE_RISK_CLASS[status] : "border-[#E8E8E4] bg-[#F6F5F4] text-[#615D59]"
  const statusLabel = account.serviceStatus
    ? SERVICE_RISK_LABEL[status ?? ""] ?? account.serviceStatus
    : null
  return (
    <li className="rounded-xl border border-[#E8E8E4] bg-[#F6F5F4] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-[#111110]">{account.name || "이름 없는 계정"}</p>
        {statusLabel ? (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold text-[#615D59]">잔액</p>
          <p className="font-medium text-[#111110] tabular-nums">{formatCNY(account.balance)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#615D59]">만료</p>
          <p className="font-medium text-[#111110]">{formatDay(account.expireAt)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#615D59]">최근 수업</p>
          <p className="font-medium text-[#111110]">{formatDay(account.lastClassAt)}</p>
        </div>
        {account.uid ? (
          <div>
            <p className="text-[11px] font-semibold text-[#615D59]">UID</p>
            <p className="truncate font-mono text-[12px] font-medium text-[#615D59]">{account.uid}</p>
          </div>
        ) : null}
      </div>
    </li>
  )
}

// 접기 가능한 원천별 목록 래퍼. summary 는 모바일 터치 타겟(min-h-11)을 지킨다.
function CollapsibleSection({
  summary,
  count,
  defaultOpen = false,
  children,
}: {
  summary: string
  count: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-[#E8E8E4] bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-semibold text-[#31302E] [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span className="text-[12px] font-medium tabular-nums text-[#615D59]">
          {count.toLocaleString("ko-KR")}건 · <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <div className="border-t border-[#E8E8E4] px-4 pb-4 pt-2">{children}</div>
    </details>
  )
}

export default function Customer360DetailMoney({
  money,
  deals,
  accountId,
  onRelinked,
}: {
  money: Customer360Money
  /**
   * 자체 딜(₩). 상위(Customer360DetailClient)가 `data.deals` 를 넘겨야 KRW 그룹과 타임라인의 딜 행이 채워진다.
   * 생략되면 KRW 그룹은 "해당 없음"으로, 타임라인은 NEO 오더·수금만 그린다.
   */
  deals?: ListCrmDealsResult | null
  /**
   * NEO 계정 id — M4 "이 고객에 연결" POST 바디에 필요하다. lead 대상이거나 상위가 아직
   * 전달하지 않으면 undefined/null → 연결 버튼이 비활성화되고 안내 캡션을 보여준다.
   */
  accountId?: string | null
  /** M4 연결 성공 후 상위가 360 데이터를 다시 불러오고 싶을 때(선택). */
  onRelinked?: () => void
}) {
  const dealRows = useMemo(() => deals?.rows ?? [], [deals])
  const timeline = useMemo(
    () =>
      money.available
        ? buildMoneyTimeline({ orders: money.orders, collections: money.collections, deals: dealRows })
        : [],
    [money.available, money.orders, money.collections, dealRows]
  )

  // M4 — 연결 성공 시 8초 되돌리기 없이 낙관적으로 품목 표에 확정 행을 얹는다. 부모가
  // money를 다시 내려주면(onRelinked 이후 재조회) 이 로컬 상태는 그냥 남아 있어도 되지만,
  // key가 `optimistic:`로 시작해 서버 lineItems와 절대 충돌하지 않는다.
  const [optimisticLineItems, setOptimisticLineItems] = useState<CrmMoneyLineItem[]>([])
  const [dismissedUnmatchedIds, setDismissedUnmatchedIds] = useState<Set<string>>(new Set())

  const lineItems = useMemo(() => {
    if (optimisticLineItems.length === 0) return money.lineItems
    return [...money.lineItems, ...optimisticLineItems].sort((a, b) => b.quantity - a.quantity)
  }, [money.lineItems, optimisticLineItems])

  const unmatchedOutbound = useMemo(() => {
    if (dismissedUnmatchedIds.size === 0) return money.unmatchedOutbound
    return money.unmatchedOutbound.filter((row) => !dismissedUnmatchedIds.has(row.id))
  }, [money.unmatchedOutbound, dismissedUnmatchedIds])

  const optimisticKeys = useMemo(() => new Set(optimisticLineItems.map((item) => item.key)), [optimisticLineItems])

  function handleRelinked(row: CrmUnmatchedOutboundCandidate) {
    setDismissedUnmatchedIds((prev) => new Set(prev).add(row.id))
    setOptimisticLineItems((prev) => [
      ...prev,
      {
        key: `optimistic:hw_outbound:${row.id}`,
        product: row.product,
        category: categorizeMoneyLineItemProduct(row.product),
        quantity: row.quantity,
        unitPrice: null,
        amount: null,
        currency: null,
        source: "hw_outbound",
        evidence: "confirmed",
        lastAt: row.outboundDate,
        details: [{ ref: row.id, at: row.outboundDate, quantity: row.quantity, serials: row.serials }],
      },
    ])
    onRelinked?.()
  }

  const hasLineItemData = lineItems.length > 0 || unmatchedOutbound.length > 0

  if (!money.available && !hasLineItemData) {
    return (
      <Panel title="Revenue" description="NEO(본사 CRM) 동기화 원천">
        <TableEmpty message="표시할 돈흐름 데이터가 없습니다. (리드 단계이거나 NEO 연결 없음)" />
      </Panel>
    )
  }

  // 아래 합계는 각각 단일 통화 목록 안에서만 센다. 서로 더하지 않는다.
  const orderTotal = sumAmounts(money.orders.map((o) => o.amount)) // USD
  const collectionTotal = sumAmounts(money.collections.map((c) => c.amount)) // CNY
  const performanceTotal = sumAmounts(money.performances.map((p) => p.amount)) // CNY
  const balanceTotal = sumAmounts(money.eeoAccounts.map((a) => a.balance)) // CNY
  // 딜(KRW): 실패(lost) 제외한 예상금액. 페이지 단위 목록이라 hasMore 면 "일부"라고 밝힌다.
  const dealActiveRows = dealRows.filter((deal) => deal.status !== "lost")
  const dealTotal = sumAmounts(dealActiveRows.map((deal) => deal.expectedAmount)) // KRW
  const dealPartial = Boolean(deals?.pagination.hasMore || deals?.summary.aggregateTruncated)

  const hasUsd = money.orders.length > 0
  const hasCny = money.collections.length > 0 || money.performances.length > 0 || money.eeoAccounts.length > 0
  const hasKrw = dealRows.length > 0

  return (
    <div className="space-y-4">
      {/* M1 · Revenue 요약 — 통화별로 묶은 타일. 통화 사이는 절대 더하지 않는다. */}
      <section className="rounded-2xl border border-[#E8E8E4] bg-white p-4 sm:p-5">
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#615D59]">Revenue</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#111110]">매출 · 수금 요약</h2>
          <p className="mt-1 text-[12px] text-[#615D59]">
            NEO(본사 CRM) 동기화 오더($)·수금·성과·잔액(¥) 과 자체 딜(₩)을 통화별로 따로 보여줍니다.
          </p>
        </div>
        <p
          data-testid="money-no-sum-caption"
          className="mb-3 border-l-2 border-[#084734] pl-2 text-[12px] font-semibold text-[#084734]"
        >
          {MONEY_NO_SUM_CAPTION}
        </p>
        <div className="grid gap-3 lg:grid-cols-3">
          {CURRENCY_ORDER.map((currency) => {
            if (currency === "USD") {
              return (
                <CurrencyGroup key={currency} currency={currency} hasData={hasUsd} emptyHint="NEO 오더 기록이 없습니다.">
                  <StatTile
                    icon={<Receipt className="h-4 w-4" />}
                    iconLayout="inline"
                    compact
                    label="오더 합계"
                    value={formatUSD(orderTotal)}
                    hint={`${money.orders.length}건 · USD`}
                    tone="neutral"
                  />
                </CurrencyGroup>
              )
            }
            if (currency === "CNY") {
              return (
                <CurrencyGroup
                  key={currency}
                  currency={currency}
                  hasData={hasCny}
                  emptyHint="NEO 수금·성과·EEO 잔액 기록이 없습니다."
                >
                  <StatTile
                    icon={<Coins className="h-4 w-4" />}
                    iconLayout="inline"
                    compact
                    label="수금 합계"
                    value={formatCNY(collectionTotal)}
                    hint={`${money.collections.length}건 · CNY`}
                    tone="brand"
                  />
                  <StatTile
                    icon={<TrendingUp className="h-4 w-4" />}
                    iconLayout="inline"
                    compact
                    label="성과 합계"
                    value={formatCNY(performanceTotal)}
                    hint={`${money.performances.length}건 · CNY`}
                    tone="neutral"
                  />
                  <StatTile
                    icon={<Wallet className="h-4 w-4" />}
                    iconLayout="inline"
                    compact
                    label="EEO 잔액"
                    value={formatCNY(balanceTotal)}
                    hint={`${money.eeoAccounts.length}개 계정 · CNY`}
                    tone="brand"
                  />
                </CurrencyGroup>
              )
            }
            return (
              <CurrencyGroup
                key={currency}
                currency={currency}
                hasData={hasKrw}
                emptyHint={deals ? "연결된 자체 딜이 없습니다." : "딜 데이터가 전달되지 않았습니다."}
              >
                <StatTile
                  icon={<Handshake className="h-4 w-4" />}
                  iconLayout="inline"
                  compact
                  label="딜 예상금액"
                  value={formatKRWAbbrev(dealTotal)}
                  hint={`${dealActiveRows.length}건(실패 제외) · KRW${dealPartial ? " · 일부 집계" : ""}`}
                  tone="neutral"
                />
              </CurrencyGroup>
            )
          })}
        </div>
      </section>

      {/* M2 · 품목별 대수 — 딜 라인아이템·HW 출고를 품목으로 합산, 근거(확정/추정) 표기 */}
      <Panel
        title="품목별 대수"
        description="딜 라인아이템·HW 출고를 품목으로 합산 · 통화가 다른 금액은 더하지 않음"
        action={<TotalTag>{lineItems.length.toLocaleString("ko-KR")}개 품목</TotalTag>}
      >
        <LineItemsTable
          items={lineItems}
          truncated={money.lineItemsMeta.truncated}
          note={money.lineItemsMeta.note}
          optimisticKeys={optimisticKeys}
        />
      </Panel>

      {/* M4 · 미매칭 출고 즉시 연결 — 이름이 비슷하지만 확정 링크가 없는 HW 출고 상위 5 */}
      <UnmatchedOutboundSection rows={unmatchedOutbound} accountId={accountId ?? null} onRelinked={handleRelinked} />

      {/* M3 · 주문 타임라인 — 오더($) · 수금(¥) · 딜(₩) 한 축, 최신 먼저 */}
      <Panel
        title="주문 타임라인"
        description="NEO 오더($) · NEO 수금(¥) · 자체 딜(₩) 을 최신 순으로 한 축에 · 통화가 다른 금액은 더하지 않음"
        action={<TotalTag>{timeline.length.toLocaleString("ko-KR")}건</TotalTag>}
      >
        <MoneyTimeline entries={timeline} />
      </Panel>

      {/* 원천별 목록(기존 정보 유지) — 접어 두고 필요할 때 펼친다. */}
      <CollapsibleSection summary="오더 (Opportunity) · NEO · $" count={money.orders.length}>
        <div className="mb-2 flex items-center justify-between text-[11px] text-[#615D59]">
          <span>달러($) 네이티브</span>
          <TotalTag>{formatUSD(orderTotal)}</TotalTag>
        </div>
        <MoneyList items={money.orders} format={formatUSD} empty="오더 기록이 없습니다." />
      </CollapsibleSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <CollapsibleSection summary="수금 (Collection) · NEO · ¥" count={money.collections.length}>
          <div className="mb-2 flex items-center justify-between text-[11px] text-[#615D59]">
            <span>위안화(¥)</span>
            <TotalTag>{formatCNY(collectionTotal)}</TotalTag>
          </div>
          <MoneyList items={money.collections} format={formatCNY} empty="수금 기록이 없습니다." />
        </CollapsibleSection>
        <CollapsibleSection summary="성과 (Sales Performance) · NEO · ¥" count={money.performances.length}>
          <div className="mb-2 flex items-center justify-between text-[11px] text-[#615D59]">
            <span>위안화(¥)</span>
            <TotalTag>{formatCNY(performanceTotal)}</TotalTag>
          </div>
          <MoneyList items={money.performances} format={formatCNY} empty="성과 기록이 없습니다." />
        </CollapsibleSection>
      </div>

      <CollapsibleSection summary="EEO 계정 · 잔액(¥) · 만료 · 최근 수업" count={money.eeoAccounts.length} defaultOpen>
        {money.eeoAccounts.length === 0 ? (
          <TableEmpty message="연결된 EEO 계정이 없습니다." />
        ) : (
          <ul className="space-y-2.5">
            {money.eeoAccounts.map((account) => (
              <EeoRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  )
}
