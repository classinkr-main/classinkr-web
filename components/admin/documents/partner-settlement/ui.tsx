"use client"

import { Fragment, createContext, useContext, type ReactNode } from "react"

import type { Issue, PartnerSettlementSnapshot, Receipt } from "@/lib/partner-settlement"

import { KIND_META, STATUS_ORDER, mdHm, won, type Tone } from "./format"

// 쿼드러닝 정산 보드의 공용 조각. 색은 어드민 팔레트(DESIGN.md)로 옮겼다 — 면 채움 없이 글자색과 테두리로만 상태를 낸다.
// 숫자는 보드 루트가 `.num` 에 고정폭·tabular 를 건다.

const SnapshotContext = createContext<PartnerSettlementSnapshot | null>(null)
export const SnapshotProvider = SnapshotContext.Provider

export function useSnapshot(): PartnerSettlementSnapshot {
  const snapshot = useContext(SnapshotContext)
  if (!snapshot) throw new Error("useSnapshot 은 SnapshotProvider 안에서만 씁니다.")
  return snapshot
}

const TONE: Record<Tone, string> = {
  danger: "text-[#B43E3E] border-[#B43E3E]/50",
  warn: "text-[#A8741A] border-[#A8741A]/50",
  info: "text-[#31302E] border-[#31302E]/50",
  muted: "text-[#615D59] border-[#e8e8e4]",
  ok: "text-[#084734] border-[#084734]/45",
}

export function Chip({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[1px] text-[11.5px] font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  )
}

export function toneText(tone: Tone) {
  return TONE[tone].split(" ")[0]
}

/** 장부 기준 / 입금 미확인은 개수·금액이 있을 때만 그린다 */
export const hasLedger = (s: PartnerSettlementSnapshot) => s.totals.ledgerCount > 0 || s.totals.ledgerPaid > 0
/** 화면에 그릴 상태 (입금 미확인은 있을 때만) */
export const visibleStatuses = (s: PartnerSettlementSnapshot) =>
  STATUS_ORDER.filter((status) => status !== "unverified" || s.totals.counts.unverified > 0)

export const dealName = (s: PartnerSettlementSnapshot, id: string | null) =>
  (id ? s.deals.find((d) => d.id === id)?.customer : undefined) ?? id ?? "건 미지정"

/** 통장 대조 칸: 맞춘 이체는 확인 + 시각, 아니면 미대조 (카드는 Airwallex 내역 필요) */
export function BankCell({ r }: { r: Pick<Receipt, "bank" | "kind"> }) {
  return r.bank ? (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Chip tone="ok">통장 확인</Chip>
      <span className="num text-[11.5px] text-[#78736D]">{mdHm(r.bank.at)}</span>
    </span>
  ) : (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Chip tone="muted">미대조</Chip>
      {r.kind === "card" ? <span className="text-[11.5px] text-[#78736D]">Airwallex 내역 필요</span> : null}
    </span>
  )
}

/** 쿼드로 보낸 돈은 잔액에 넣지 않았다는 한 줄 (outflow > 0 일 때만) */
export function OutflowNote({ className = "" }: { className?: string }) {
  const o = useSnapshot().totals.outflow
  return o > 0 ? <p className={`text-[11.5px] text-[#78736D] ${className}`}>쿼드로 보낸 <span className="num">{won(o)}</span>원은 넣지 않았습니다.</p> : null
}

export function SourcesNote() {
  const S = useSnapshot()
  return (
    <ul className="grid gap-x-8 gap-y-1.5 text-[12px] text-[#615D59] sm:grid-cols-2">
      {S.sources.map((s) => (
        <li key={s.key}>
          <b className="font-semibold text-[#111110]">{s.name}</b> · {s.detail}
        </li>
      ))}
    </ul>
  )
}

const TH = "px-3 py-2 font-semibold"
const NUM = "num px-3 py-2 text-right"

/** 채널 유통 가격 정책표 — 제품별 4구간 */
export function PriceTable() {
  const S = useSnapshot()
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-[#e8e8e4] bg-white">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#e8e8e4] text-[11.5px] text-[#615D59]">
              <th className={TH}>제품</th>
              <th className={TH}>수량</th>
              <th className={`${TH} text-right`}>채널공급가</th>
              <th className={`${TH} text-right`}>시장판매가</th>
              <th className={`${TH} text-right`}>쿼드 몫</th>
            </tr>
          </thead>
          <tbody>
            {S.priceTable.map((p) =>
              p.tiers.map((t, i) => (
                <tr key={`${p.product}-${t.qty}`} className={`align-top ${i === p.tiers.length - 1 ? "border-b border-[#e8e8e4] last:border-0" : ""}`}>
                  {i === 0 ? (
                    <th scope="row" rowSpan={p.tiers.length} className="border-r border-[#e8e8e4] px-3 py-2 text-left font-semibold">
                      {p.product}
                    </th>
                  ) : null}
                  <td className="num px-3 py-2">{t.qty}</td>
                  <td className={NUM}>{won(t.supply)}</td>
                  <td className={NUM}>{won(t.market)}</td>
                  <td className={`${NUM} text-[#615D59]`}>{won(t.market - t.supply)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-[#78736D]">{S.priceNote} VAT 포함.</p>
    </div>
  )
}

const SEVERITY: Record<Issue["severity"], { tone: Tone; label: string }> = {
  high: { tone: "danger", label: "먼저" },
  mid: { tone: "warn", label: "다음" },
  low: { tone: "muted", label: "정리" },
}

/** 통장 내역이 오면 확인할 것 — snapshot.issues 순서 그대로 */
export function IssueList() {
  const S = useSnapshot()
  return (
    <>
      <div className="grid gap-3">
        {S.issues.map((it) => {
          const sev = SEVERITY[it.severity]
          return (
            <article key={it.id} className="rounded-lg border border-[#e8e8e4] bg-white p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Chip tone={sev.tone}>
                  {sev.label} · {it.kind}
                </Chip>
                <h3 className="min-w-0 text-[15px] font-semibold">{it.title}</h3>
                {it.amount != null ? <span className="num ml-auto text-[14px]">{won(it.amount)}원</span> : null}
              </div>
              <p className="mt-2 max-w-[90ch] text-[13.5px] leading-relaxed text-[#615D59]">{it.detail}</p>
              <p className="mt-2 text-[13.5px]">
                <b className="font-semibold">잔액 영향</b> {it.effect}
              </p>
              <p className="mt-1 text-[13.5px]">
                <b className="font-semibold">할 일</b> {it.action}
              </p>
              {it.deals.length ? <p className="mt-1.5 text-[12px] text-[#78736D]">관련: {it.deals.map((id) => dealName(S, id)).join(", ")}</p> : null}
            </article>
          )
        })}
      </div>
      <ResolvedList />
    </>
  )
}

/** 통장으로 확인돼 닫힌 것 */
function ResolvedList() {
  const S = useSnapshot()
  if (!S.resolved.length) return null
  return (
    <div className="mt-6">
      <h3 className="text-[14px] font-semibold">통장으로 확인된 것</h3>
      <ul className="mt-2 grid gap-3">
        {S.resolved.map((r) => (
          <li key={r.title} className="rounded-lg border border-[#e8e8e4] bg-white p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Chip tone="ok">확인됨</Chip>
              <span className="min-w-0 text-[14px] font-semibold">{r.title}</span>
              <span className="num ml-auto text-[14px]">{won(r.amount)}원</span>
            </div>
            <p className="mt-2 max-w-[90ch] text-[13px] leading-relaxed text-[#615D59]">{r.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 통장에는 있지만 잔액에 넣지 않은 것: 쿼드로 보낸 돈, 8월 이전 입금 */
export function BankExtras() {
  const { outflows, preAugust, outflowNote } = useSnapshot()
  const sum = (a: Array<{ amount: number }>) => a.reduce((x, y) => x + y.amount, 0)
  const totalRow = (cols: number, amount: number) => (
    <tr className="border-t border-[#111110] font-bold">
      <th scope="row" colSpan={cols} className="px-3 py-2 text-left">
        합계
      </th>
      <td className={NUM}>{won(amount)}</td>
    </tr>
  )
  return (
    <>
      {outflows.length ? (
        <div className="mt-8">
          <h3 className="text-[15px] font-semibold">쿼드로 보낸 돈</h3>
          <p className="mt-1 max-w-[80ch] text-[13.5px] text-[#615D59]">{outflowNote}</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[#e8e8e4] bg-white">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e8e8e4] text-[11.5px] text-[#615D59]">
                  <th className={TH}>일시</th>
                  <th className={TH}>적요</th>
                  <th className={`${TH} text-right`}>금액</th>
                </tr>
              </thead>
              <tbody>
                {outflows.map((o, i) => (
                  <tr key={i} className="border-b border-[#e8e8e4]/70">
                    <td className="num whitespace-nowrap px-3 py-2">{mdHm(o.at)}</td>
                    <td className="px-3 py-2">{o.label ? `${o.label} · ${o.memo}` : o.memo}</td>
                    <td className={NUM}>{won(o.amount)}</td>
                  </tr>
                ))}
                {totalRow(2, sum(outflows))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {preAugust.length ? (
        <div className="mt-8">
          <h3 className="text-[15px] font-semibold">8월 이전 입금</h3>
          <p className="mt-1 max-w-[80ch] text-[13.5px] text-[#615D59]">정산 기간 전의 쿼드 이체입니다. 4~7월 C물량 몫으로 보고 이 잔액에는 넣지 않았습니다.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[#e8e8e4] bg-white">
            <table className="w-full min-w-[320px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e8e8e4] text-[11.5px] text-[#615D59]">
                  <th className={TH}>일시</th>
                  <th className={`${TH} text-right`}>금액</th>
                </tr>
              </thead>
              <tbody>
                {preAugust.map((o, i) => (
                  <tr key={i} className="border-b border-[#e8e8e4]/70">
                    <td className="num whitespace-nowrap px-3 py-2">{mdHm(o.at)}</td>
                    <td className={NUM}>{won(o.amount)}</td>
                  </tr>
                ))}
                {totalRow(1, sum(preAugust))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  )
}

// 입금을 제대로 따라가려면 필요한 것 — 스냅샷이 아니라 정산 방식 설명이라 코드에 둔다.
const TRACKING_STEPS = [
  {
    title: "입금 원장은 통장과 Airwallex에서",
    body: "신한 통장과 Airwallex 거래 내역(CSV)을 입금 1건 = 1행으로 올린다. 매출장부 빨간 글씨와 NEO 回款은 공급가로 적는 매출 보고라서 입금 증빙으로 쓰지 않는다.",
    fields: "입금일 · 경로(이체/카드) · 총액 · 수수료 · 입금자 표기 · 거래 번호",
  },
  {
    title: "청구는 출고와 가격표에서",
    body: "하드웨어 시트 C물량 행이 청구가 된다. 채널 유통 가격 정책표의 공급가를 기본으로 하고, 건별 합의 단가는 근거와 함께 따로 적는다.",
    fields: "출고 행 · 고객 · 품목·수량 · 공급가 · 합의 단가 여부",
  },
  {
    title: "카드 직결제는 차액을 자동으로",
    body: "고객이 카드로 시장가를 내면 카드 총액에서 공급가를 뺀 금액이 쿼드 몫으로 계정에 쌓이고, 다음 이체에서 빠진다. 건마다 손으로 상계하지 않는다.",
    fields: "카드 총액 · 공급가 · 쿼드 몫",
  },
  {
    title: "쿼드 이체에는 명세를",
    body: "쿼드는 여러 건을 묶어 보내고 금액도 건별 청구와 다르다(8/28, 9/8, 10/9). 이체마다 어떤 건을 얼마로 계산했는지 명세를 받아 배분 행으로 남긴다.",
    fields: "입금 id · 건 id · 배분 금액",
  },
  {
    title: "잔액은 계정 하나로",
    body: "쿼드러닝과는 건별 미수가 아니라 계정 잔액(청구 합계 − 받은 돈)으로 맞춘다. 건별 화면은 잔액이 왜 그런지 설명하는 용도다.",
    fields: "월말 잔액 · 쿼드와 맞춘 날짜",
  },
  {
    title: "원천을 잇는 키",
    body: "출고 물류No.와 행, 매출장부 REV 행, NEO 回款 번호(O-…)를 건마다 저장해 같은 돈을 이름으로 다시 찾지 않게 한다. NEO 자동 동기화는 11/9 이후 멈춰 있어 복구가 필요하다.",
    fields: "hw_row · rev_row · neo_ref",
  },
] as const

const TRACKING_TABLES = [
  { name: "deposits", note: "입금 원장 (통장·Airwallex 1건 = 1행)" },
  { name: "charges", note: "청구 (출고 행 기준, 공급가)" },
  { name: "allocations", note: "입금 ↔ 청구 배분 (묶음 이체 명세)" },
  { name: "price_book", note: "가격 정책표 + 건별 합의 단가" },
] as const

/** 입금을 제대로 따라가려면 */
export function TrackingSteps() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {TRACKING_STEPS.map((t) => (
          <article key={t.title} className="min-w-0 rounded-lg border border-[#e8e8e4] bg-white p-4">
            <h3 className="text-[15px] font-semibold">{t.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#615D59]">{t.body}</p>
            <p className="mt-2 text-[12px] text-[#78736D]">{t.fields}</p>
          </article>
        ))}
      </div>
      <aside>
        <h3 className="text-[13px] font-semibold">필요한 표</h3>
        <ul className="mt-2 divide-y divide-[#e8e8e4] border-y border-[#e8e8e4]">
          {TRACKING_TABLES.map((t) => (
            <li key={t.name} className="py-2">
              <code className="num text-[12.5px] font-medium">{t.name}</code>
              <span className="block text-[12px] text-[#615D59]">{t.note}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

const monthOf = (iso: string) => `${Number(iso.slice(5, 7))}월`

/** 계정 원장 — 청구는 +, 받은 돈은 −. 근거 칸과 월말 소계 줄을 넣는다 */
export function StatementTable() {
  const rows = useSnapshot().statement
  return (
    <div className="overflow-x-auto rounded-lg border border-[#e8e8e4] bg-white">
      <table className="w-full min-w-[920px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#e8e8e4] text-[11.5px] text-[#615D59]">
            <th className={TH}>날짜</th>
            <th className={TH}>구분</th>
            <th className={TH}>고객 · 내용</th>
            <th className={`${TH} text-right`}>청구</th>
            <th className={`${TH} text-right`}>받은 돈</th>
            <th className={`${TH} text-right`}>잔액</th>
            <th className={TH}>근거</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => {
            const k = KIND_META[e.type]
            const monthEnd = i === rows.length - 1 || monthOf(rows[i + 1].date) !== monthOf(e.date)
            return (
              <Fragment key={i}>
                <tr className="border-b border-[#e8e8e4]/70 align-top">
                  <td className="num whitespace-nowrap px-3 py-2">{e.dateLabel}</td>
                  <td className="px-3 py-2">
                    <Chip tone={k.tone}>{k.label}</Chip>
                  </td>
                  <td className="px-3 py-2">
                    {e.label}
                    <span className="block text-[11.5px] text-[#78736D]">{e.detail}</span>
                  </td>
                  <td className={NUM}>{e.amount > 0 ? won(e.amount) : <span className="text-[#78736D]">—</span>}</td>
                  <td className={NUM}>{e.amount < 0 ? won(-e.amount) : <span className="text-[#78736D]">—</span>}</td>
                  <td className={`${NUM} ${e.balance < 0 ? "text-[#31302E]" : ""}`}>{won(e.balance)}</td>
                  <td className="px-3 py-2 text-[12px] text-[#615D59]">{e.evidence}</td>
                </tr>
                {monthEnd ? (
                  <tr className="border-b border-[#e8e8e4] bg-[#FAFAF8]">
                    <th scope="row" colSpan={5} className="px-3 py-2 text-left text-[12.5px] font-semibold">
                      {monthOf(e.date)} 말 잔액
                    </th>
                    <td className={`${NUM} font-bold ${e.balance < 0 ? "text-[#31302E]" : ""}`}>{won(e.balance)}</td>
                    <td />
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
