"use client"

import { Component, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import type { Deal, DealStatus, PartnerSettlementSnapshot, StatementEntry } from "@/lib/partner-settlement"

import { FlowChart, KIND_FILL, peakOf } from "./flow-chart"
import { KIND_META, STATUS_META, man, mdOf, snapshotTime, won } from "./format"
import { BacklogPanel, DealsPanel, PricesPanel, ReceiptsPanel } from "./panels"
import {
  Chip,
  IssueList,
  OutflowNote,
  SnapshotProvider,
  SourcesNote,
  StatementTable,
  hasLedger,
  toneText,
  useSnapshot,
  visibleStatuses,
} from "./ui"

// 견적·문서 › 총판 미수금 위쪽 — 쿼드러닝 계정 잔액 보드(시안 B1 한 화면 보드를 옮긴 것, 2026-11-23).
// 잔액·흐름·지금 확인할 것을 첫 화면에 두고, 나머지는 아래 패널 하나를 바꿔 본다.
// 데이터는 정산 대조 스크립트가 올린 스냅샷 한 덩어리다(GET /api/admin/partner-settlement).

const PARTNER_SETTLEMENT_API = "/api/admin/partner-settlement"

type BoardPayload = { available: boolean; warning: string | null; snapshot: PartnerSettlementSnapshot | null }

const WRAP = "mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-5"
// 숫자(.num)는 고정폭·tabular. 보드 밖으로 새지 않게 루트에서만 건다.
const ROOT = `${WRAP} break-keep text-[#111110] [&_.num]:font-mono [&_.num]:tabular-nums [&_.num]:tracking-[-0.01em] [&_h2]:text-balance [&_h3]:text-balance`
const CARD = "min-w-0 rounded-lg border border-[#e8e8e4] bg-white p-4"
const CARD_HEAD = "text-[13.5px] font-semibold"

function QuietLine({ children }: { children: ReactNode }) {
  return (
    <div className={WRAP}>
      <p role="status" className="text-[12.5px] text-[#615D59]">
        {children}
      </p>
    </div>
  )
}

// 스냅샷 안의 행 모양이 바뀌어 그리다 실패해도 아래 총판 미수금 목록은 살린다.
class BoardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error("[partner-settlement] 보드를 그리지 못했습니다.", error)
  }

  render() {
    if (this.state.failed) return <QuietLine>정산 스냅샷을 그리지 못했습니다. 스냅샷 형식을 확인해 주세요.</QuietLine>
    return this.props.children
  }
}

export default function PartnerSettlementBoard() {
  const [payload, setPayload] = useState<BoardPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    adminFetchJson<BoardPayload>(PARTNER_SETTLEMENT_API, { cache: "no-store" })
      .then((data) => {
        if (!cancelled) setPayload(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) return <QuietLine>정산 스냅샷을 불러오지 못했습니다.</QuietLine>
  if (!payload) return <QuietLine>정산 스냅샷을 불러오는 중</QuietLine>
  if (!payload.snapshot) {
    // 표 미적용·행 없음은 같은 한 줄. 모양이 맞지 않는 스냅샷만 저장소가 준 안내를 쓴다.
    return <QuietLine>{(payload.available && payload.warning) || "정산 스냅샷이 아직 올라오지 않았습니다."}</QuietLine>
  }

  return (
    <BoardBoundary>
      <SnapshotProvider value={payload.snapshot}>
        <Board />
      </SnapshotProvider>
    </BoardBoundary>
  )
}

type Tab = "deals" | "ledger" | "receipts" | "issues" | "backlog" | "prices"

function Board() {
  const [tab, setTab] = useState<Tab>("deals")
  const [filter, setFilter] = useState<DealStatus | null>(null)
  const panel = useRef<HTMLElement>(null)

  const pickStatus = (s: DealStatus) => {
    setFilter((f) => (f === s ? null : s))
    setTab("deals")
  }

  const openIssues = () => {
    setTab("issues")
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    panel.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }

  return (
    <div className={ROOT}>
      <TitleStrip />

      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <BalanceCard />
        <FlowCard />
        <NowCard onAll={openIssues} />
      </div>

      <StatusTiles filter={filter} onPick={pickStatus} />

      <Panel tab={tab} setTab={setTab} filter={filter} clearFilter={() => setFilter(null)} panelRef={panel} />

      <footer className="mt-10 border-t border-[#e8e8e4] pt-5">
        <SourcesNote />
      </footer>
    </div>
  )
}

/* ── 0. 제목 ─────────────────────────────────────── */

function TitleStrip() {
  const S = useSnapshot()
  const t = S.totals
  const r = S.rule
  const year = S.statement[0].date.slice(0, 4)
  const monthLabel = (m: string) => m.replace("월", "")
  const period = `${year}년 ${monthLabel(S.months[0].month)}~${monthLabel(S.months[S.months.length - 1].month)}월 정산분`
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[20px] font-bold tracking-tight">{S.partner} 계정</h2>
        <span className="text-[13px] text-[#615D59]">
          C물량 · {period} · 스냅샷 <span className="num">{snapshotTime(S.generatedAt)}</span>
        </span>
        <span className="ml-auto">
          <Chip tone="warn">
            통장 대조&nbsp;<span className="num">{t.bankMatched} / {t.receiptCount}</span>건
          </Chip>
        </span>
      </div>
      <details className="mt-0.5">
        <summary className="w-fit cursor-pointer text-[12.5px] text-[#615D59] hover:text-[#111110] hover:underline">정산 방식 보기</summary>
        <div className="mt-1.5 max-w-[86ch] text-[13px] leading-relaxed">
          <p>
            기본: 쿼드가 고객에게 시장가(<span className="num">{man(r.market)}</span>)를 받고 공급가(<span className="num">{man(r.supply)}</span>)를 우리에게
            이체합니다.
          </p>
          <p>
            예외: 고객이 카드로 우리에게 직접 내면 차액(<span className="num">{man(r.margin)}</span>)은 쿼드 몫이라 쿼드의 다음 이체에서 뺍니다. 그래서 건별 미수가
            아니라 계정 잔액으로 맞춥니다.
          </p>
        </div>
      </details>
    </div>
  )
}

/* ── 1. 잔액 · 흐름 · 지금 확인할 것 ──────────────── */

function BalanceCard() {
  const S = useSnapshot()
  const t = S.totals
  const rows: Array<[ReactNode, number]> = [
    [<>공급가 청구 · <span className="num">{S.deals.length}</span>건</>, t.supply],
    [<>− 쿼드 이체 · <span className="num">{t.transferCount}</span>건</>, t.transfer],
    [<>− 고객 카드 · <span className="num">{t.cardCount}</span>건</>, t.card],
    ...(hasLedger(S)
      ? [
          [
            <>
              − 장부 기준 · <span className="num">{t.ledgerCount}</span>건{" "}
              <span className="leading-[13px]">
                <Chip tone="warn">미확인</Chip>
              </span>
            </>,
            t.ledgerPaid,
          ] as [ReactNode, number],
        ]
      : []),
  ]
  return (
    <section aria-labelledby="ps-balance" className={`${CARD} xl:col-span-4`}>
      <h2 id="ps-balance" className="text-[12.5px] text-[#615D59]">
        쿼드러닝이 더 보내야 할 돈
      </h2>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p>
          <span className={`num text-[44px] font-medium leading-none tracking-tight ${t.balance < 0 ? "text-[#31302E]" : "text-[#B43E3E]"}`}>{man(t.balance)}</span>
          <span className="text-[18px]"> 원</span>
        </p>
        <p className="text-[11.5px] text-[#78736D]">카드 <span className="num">{t.cardCount}</span>건은 Airwallex 확인 전</p>
      </div>
      <dl className="mt-2.5 text-[12.5px] leading-[18px]">
        {rows.map(([label, value], i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-[2px]">
            <dt className="min-w-0">{label}</dt>
            <dd className="num">{won(value)}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[#111110] pt-1.5 font-bold">
          <dt>= 잔액</dt>
          <dd className="num">{won(t.balance)}</dd>
        </div>
      </dl>
      <OutflowNote className="mt-1" />
      <RangeBar />
    </section>
  )
}

function RangeBar() {
  const S = useSnapshot()
  const { low, high, balance, outflow } = S.totals
  const p = (v: number) => Math.min(100, Math.max(0, ((v - low) / (high - low || 1)) * 100))
  const zero = p(0)
  const at = p(balance)
  return (
    <div className="mt-3">
      <div
        role="img"
        aria-label={`통장을 확인하면 잔액은 ${man(low)}에서 ${man(high)} 사이에서 정해집니다. 지금은 ${man(balance)}입니다.`}
        className="flex items-center gap-2.5"
      >
        <span className="num text-[12px] font-medium text-[#31302E]">{man(low)}</span>
        <div className="relative h-1.5 flex-1">
          <span className="absolute inset-y-0 left-0 rounded-l-full bg-[#31302E]" style={{ width: `${zero}%` }} />
          <span className="absolute inset-y-0 right-0 rounded-r-full bg-[#111110]/25" style={{ left: `${zero}%` }} />
          <span className="absolute -inset-y-1 w-px bg-[#111110]" style={{ left: `${zero}%` }} />
          <span className="num absolute top-full mt-1.5 -translate-x-1/2 text-[10px] leading-none text-[#615D59]" style={{ left: `${zero}%` }}>
            0
          </span>
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-[#111110] bg-white"
            style={{ left: `${at}%` }}
          />
        </div>
        <span className="num text-[12px] font-medium">{man(high)}</span>
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-[#78736D]">
        NEO에만 있는 {S.neoOnly.map((n) => `${n.customer} ${n.channel} ${man(n.amount)}`).join(" · ")}이 실제 결제면{" "}
        <span className="num">{man(low)}</span>
      </p>
      {outflow > 0 && S.outflows[0] ? (
        <p className="text-[11.5px] leading-snug text-[#78736D]">
          {mdOf(S.outflows[0].at)} 쿼드로 보낸 돈이 더 받은 돈 반환이면 <span className="num">{man(high)}</span>
        </p>
      ) : null}
    </div>
  )
}

function FlowCard() {
  const S = useSnapshot()
  return (
    <section aria-labelledby="ps-flow" className={`${CARD} flex flex-col xl:col-span-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="ps-flow" className={CARD_HEAD}>
          잔액 흐름
        </h2>
        <p className="text-[11.5px] text-[#78736D]">
          최고 <span className="num">{man(peakOf(S.statement))}</span> · 지금 <span className="num">{man(S.totals.balance)}</span>
        </p>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[#615D59]" aria-label="점 색">
        {(Object.keys(KIND_FILL) as Array<StatementEntry["type"]>).filter((k) => k !== "ledger" || hasLedger(S)).map((k) => (
          <li key={k} className="flex items-center gap-1">
            <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: KIND_FILL[k] }} />
            {KIND_META[k].label}
          </li>
        ))}
      </ul>
      <div className="mt-1 flex-1">
        <FlowChart />
      </div>
      <dl className="mt-1 grid grid-cols-4 border-t border-[#e8e8e4] pt-2">
        {S.months.map((m) => (
          <div key={m.month} className="min-w-0">
            <dt className="text-[11px] text-[#78736D]">{m.month} 말</dt>
            <dd className={`num text-[13px] ${m.endBalance < 0 ? "text-[#31302E]" : ""}`}>{man(m.endBalance)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function NowCard({ onAll }: { onAll: () => void }) {
  const S = useSnapshot()
  const list = S.issues.filter((i) => i.severity === "high")
  return (
    <section aria-labelledby="ps-now" className={`${CARD} xl:col-span-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ps-now" className={CARD_HEAD}>
          지금 확인할 것
        </h2>
        <button type="button" onClick={onAll} className="shrink-0 text-[12px] text-[#615D59] underline-offset-2 hover:text-[#111110] hover:underline">
          전체 <span className="num">{S.issues.length}</span>건
        </button>
      </div>
      <ol className="mt-2.5 grid gap-3">
        {list.map((it, i) => (
          <li key={it.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5">
            <span aria-hidden className="num mt-px grid size-[18px] place-items-center rounded-full border border-[#111110]/60 text-[10.5px] font-medium">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-snug">
                {/* 금액을 첫 줄 오른쪽에 띄워 두 번째 줄부터는 제목이 칸 폭을 다 쓴다 */}
                {it.amount != null ? <span className="num float-right ml-2 text-[12.5px] font-normal">{man(it.amount)}</span> : null}
                {it.title}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-[#615D59]">{it.action}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ── 2. 상태 타일 ─────────────────────────────────── */

const tileValue = (s: DealStatus, d: Deal) => (s === "due" || s === "credit" ? Math.abs(d.diff) : s === "unverified" ? d.ledgerPaid : d.supply)

function StatusTiles({ filter, onPick }: { filter: DealStatus | null; onPick: (s: DealStatus) => void }) {
  const S = useSnapshot()
  const t = S.totals
  const statuses = visibleStatuses(S)
  return (
    <section aria-label="상태별 건" className="mt-4">
      <div className={`grid gap-3 ${statuses.length > 3 ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
        {statuses.map((s) => {
          const meta = STATUS_META[s]
          const list = S.deals.filter((d) => d.status === s)
          const on = filter === s
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(s)}
              className={`flex min-w-0 flex-col items-start rounded-lg border-2 bg-white px-3.5 py-2.5 text-left transition-colors ${on ? "border-[#111110]" : "border-[#e8e8e4] hover:border-[#A39E98]"}`}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={`text-[13px] font-bold ${toneText(meta.tone)}`}>{meta.label}</span>
                <span className="text-[12px] text-[#78736D]">
                  <span className="num">{list.length}</span>건
                </span>
              </span>
              <span className="num mt-0.5 text-[22px] leading-tight">{man(list.reduce((a, d) => a + tileValue(s, d), 0))}</span>
              <span className="mt-0.5 text-[11.5px] leading-snug text-[#78736D]">{meta.desc}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[12.5px] text-[#615D59]">
        <span className="num">{man(t.due)}</span> − <span className="num">{man(t.credit)}</span>
        {t.unallocated > 0 ? (
          <>
            {" "}
            − 건 미지정 입금 <span className="num">{man(t.unallocated)}</span>
          </>
        ) : null}{" "}
        = 잔액 <span className="num">{man(t.balance)}</span>. {t.counts.unverified > 0 ? "입금 미확인과 " : ""}끝난 건은 잔액에 0으로 들어가 있습니다.
      </p>
    </section>
  )
}

/* ── 3. 아래 패널 ─────────────────────────────────── */

function Panel({
  tab,
  setTab,
  filter,
  clearFilter,
  panelRef,
}: {
  tab: Tab
  setTab: (t: Tab) => void
  filter: DealStatus | null
  clearFilter: () => void
  panelRef: RefObject<HTMLElement | null>
}) {
  const S = useSnapshot()
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const TABS: Array<[Tab, string, number | null]> = [
    ["deals", "건별", S.deals.length],
    ["ledger", "타임라인", S.statement.length],
    ["receipts", "받은 돈", S.receipts.length],
    ["issues", "확인할 것", S.issues.length],
    ["backlog", "못 넣은 것", S.backlog.length],
    ["prices", "가격표 · 트래킹", null],
  ]

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const n = (i + step + TABS.length) % TABS.length
    setTab(TABS[n][0])
    tabs.current[n]?.focus()
  }

  return (
    <section ref={panelRef} aria-label="자세히 보기" className="mt-4 scroll-mt-3 rounded-lg border border-[#e8e8e4]">
      <div role="tablist" aria-label="아래 패널" className="flex gap-5 overflow-x-auto rounded-t-lg [scrollbar-width:none] border-b border-[#e8e8e4] bg-white px-4">
        {TABS.map(([id, label, n], i) => {
          const on = tab === id
          return (
            <button
              key={id}
              ref={(el) => {
                tabs.current[i] = el
              }}
              id={`ps-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="ps-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-2 pt-2.5 text-[13px] font-semibold ${on ? "border-[#111110] text-[#111110]" : "border-transparent text-[#615D59] hover:text-[#111110]"}`}
            >
              {label}
              {n != null ? <span className={`num ml-1.5 text-[12px] font-normal ${on ? "text-[#615D59]" : "text-[#78736D]"}`}>{n}</span> : null}
            </button>
          )
        })}
      </div>
      <div id="ps-tabpanel" role="tabpanel" aria-labelledby={`ps-tab-${tab}`} tabIndex={0} className="min-w-0 rounded-b-lg bg-[#FAFAF8] p-3 sm:p-4">
        {tab === "deals" ? <DealsPanel filter={filter} onClear={clearFilter} /> : null}
        {tab === "ledger" ? <StatementTable /> : null}
        {tab === "receipts" ? <ReceiptsPanel /> : null}
        {tab === "issues" ? <IssueList /> : null}
        {tab === "backlog" ? <BacklogPanel /> : null}
        {tab === "prices" ? <PricesPanel /> : null}
      </div>
    </section>
  )
}
