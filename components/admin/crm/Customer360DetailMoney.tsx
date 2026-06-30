"use client"

import { Coins, Receipt, TrendingUp, Wallet } from "lucide-react"

import { Panel, StatTile, TableEmpty } from "@/components/admin/viz"
import { formatCNY, formatUSD } from "@/lib/crm/money-format"
import type { Customer360Money } from "@/lib/repositories/crm-customer-360"
import type { NeoCrmCustomerEeoAccount, NeoCrmCustomerMoneyItem } from "@/lib/admin-crm-customers-neo"

import { formatDay, SERVICE_RISK_CLASS, SERVICE_RISK_LABEL, sumAmounts } from "./Customer360DetailShared"

// 패널 헤더 우측 합계 표기.
function TotalTag({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] font-bold tabular-nums text-[#111110]">{children}</span>
}

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
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
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
    <ul className="divide-y divide-[#f0f0ec]">
      {items.map((item) => (
        <MoneyRow key={item.id} item={item} format={format} />
      ))}
    </ul>
  )
}

function EeoRow({ account }: { account: NeoCrmCustomerEeoAccount }) {
  const status = account.serviceStatus?.trim().toLowerCase()
  const statusClass =
    status && (SERVICE_RISK_CLASS[status] ?? null) ? SERVICE_RISK_CLASS[status] : "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
  const statusLabel = account.serviceStatus
    ? SERVICE_RISK_LABEL[status ?? ""] ?? account.serviceStatus
    : null
  return (
    <li className="rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2.5">
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
          <p className="text-[11px] font-semibold text-[#1a1a1a]/35">잔액</p>
          <p className="font-medium text-[#111110] tabular-nums">{formatCNY(account.balance)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#1a1a1a]/35">만료</p>
          <p className="font-medium text-[#111110]">{formatDay(account.expireAt)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#1a1a1a]/35">최근 수업</p>
          <p className="font-medium text-[#111110]">{formatDay(account.lastClassAt)}</p>
        </div>
        {account.uid ? (
          <div>
            <p className="text-[11px] font-semibold text-[#1a1a1a]/35">UID</p>
            <p className="truncate font-mono text-[12px] font-medium text-[#1a1a1a]/55">{account.uid}</p>
          </div>
        ) : null}
      </div>
    </li>
  )
}

export default function Customer360DetailMoney({ money }: { money: Customer360Money }) {
  if (!money.available) {
    return (
      <Panel title="Revenue" description="NEO(본사 CRM) 동기화 원천">
        <TableEmpty message="표시할 돈흐름 데이터가 없습니다. (리드 단계이거나 NEO 연결 없음)" />
      </Panel>
    )
  }

  const orderTotal = sumAmounts(money.orders.map((o) => o.amount))
  const collectionTotal = sumAmounts(money.collections.map((c) => c.amount))
  const performanceTotal = sumAmounts(money.performances.map((p) => p.amount))
  const balanceTotal = sumAmounts(money.eeoAccounts.map((a) => a.balance))

  return (
    <div className="space-y-4">
      {/* Revenue 요약 — Overview StatTile + KR Team 보드 섹션 헤더 융합 */}
      <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">Revenue</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#111110]">수금 · 성과 요약</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
            NEO(본사 CRM) 동기화 · 통화 혼용 주의 (오더 $, 수금·성과·잔액 ¥)
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={<Receipt className="h-4 w-4" />}
            label="오더 합계"
            value={formatUSD(orderTotal)}
            hint={`${money.orders.length}건 · USD`}
            tone="neutral"
          />
          <StatTile
            icon={<Coins className="h-4 w-4" />}
            label="수금 합계"
            value={formatCNY(collectionTotal)}
            hint={`${money.collections.length}건 · ¥`}
            tone="brand"
          />
          <StatTile
            icon={<TrendingUp className="h-4 w-4" />}
            label="성과 합계"
            value={formatCNY(performanceTotal)}
            hint={`${money.performances.length}건 · ¥`}
            tone="neutral"
          />
          <StatTile
            icon={<Wallet className="h-4 w-4" />}
            label="EEO 잔액"
            value={formatCNY(balanceTotal)}
            hint={`${money.eeoAccounts.length}개 계정 · ¥`}
            tone="brand"
          />
        </div>
      </section>

      <Panel
        title="오더 (Opportunity)"
        description="NEO 오더 · 달러($) 네이티브"
        action={<TotalTag>{formatUSD(orderTotal)}</TotalTag>}
      >
        <MoneyList items={money.orders} format={formatUSD} empty="오더 기록이 없습니다." />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="수금 (Collection)"
          description="NEO 수금 · 위안화(¥)"
          action={<TotalTag>{formatCNY(collectionTotal)}</TotalTag>}
        >
          <MoneyList items={money.collections} format={formatCNY} empty="수금 기록이 없습니다." />
        </Panel>
        <Panel
          title="성과 (Sales Performance)"
          description="NEO 성과 · 위안화(¥)"
          action={<TotalTag>{formatCNY(performanceTotal)}</TotalTag>}
        >
          <MoneyList items={money.performances} format={formatCNY} empty="성과 기록이 없습니다." />
        </Panel>
      </div>

      <Panel
        title="EEO 계정"
        description="잔액 위안화(¥) · 만료 · 최근 수업 · 서비스 상태"
        action={<span className="text-[12px] font-semibold text-[#1a1a1a]/45">{money.eeoAccounts.length}개</span>}
      >
        {money.eeoAccounts.length === 0 ? (
          <TableEmpty message="연결된 EEO 계정이 없습니다." />
        ) : (
          <ul className="space-y-2.5">
            {money.eeoAccounts.map((account) => (
              <EeoRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
