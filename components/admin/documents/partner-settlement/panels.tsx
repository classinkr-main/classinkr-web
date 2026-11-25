"use client"

import { Fragment } from "react"

import type { DealStatus } from "@/lib/partner-settlement"

import { KIND_META, ROUTE_LABEL, STATUS_META, STATUS_ORDER, signedWon, won } from "./format"
import { BankCell, BankExtras, Chip, PriceTable, TrackingSteps, useSnapshot } from "./ui"

const TABLE_BOX = "overflow-x-auto rounded-lg border border-[#e8e8e4] bg-white"
const HEAD_ROW = "border-b border-[#e8e8e4] text-[11.5px] text-[#615D59]"
const ROW = "border-b border-[#e8e8e4]/70 align-top last:border-0"
const TH = "px-3 py-2 font-semibold"
const TD = "px-3 py-2"
const NUM = "num px-3 py-2 text-right"
const faintDash = <span className="text-[#78736D]">—</span>

const rank = (s: DealStatus) => STATUS_ORDER.indexOf(s)

/* ── 건별 ─────────────────────────────────────────── */

export function DealsPanel({ filter, onClear }: { filter: DealStatus | null; onClear: () => void }) {
  const S = useSnapshot()
  const sorted = [...S.deals].sort((a, b) => rank(a.status) - rank(b.status) || Math.abs(b.diff) - Math.abs(a.diff))
  const list = filter ? sorted.filter((d) => d.status === filter) : sorted
  return (
    <div>
      {filter ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <button
            type="button"
            onClick={onClear}
            aria-label={`필터 해제: ${STATUS_META[filter].label}`}
            className="rounded-full border border-[#111110] bg-white px-2.5 py-0.5 font-semibold hover:border-[#615D59]"
          >
            필터: {STATUS_META[filter].label} <span aria-hidden>✕</span>
          </button>
          <span className="text-[#615D59]">
            <span className="num">{list.length}</span>건 / 전체 <span className="num">{S.deals.length}</span>건
          </span>
        </div>
      ) : null}
      <div className={TABLE_BOX}>
        <table className="w-full min-w-[980px] text-left text-[13px]">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>상태</th>
              <th className={TH}>고객</th>
              <th className={TH}>경로</th>
              <th className={`${TH} text-right`}>공급가</th>
              <th className={`${TH} text-right`}>받은 돈</th>
              <th className={`${TH} text-right`}>차액</th>
              <th className={TH}>한 줄 판정</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const meta = STATUS_META[d.status]
              const parts = (
                [
                  ["카드", d.card],
                  ["이체", d.transfer],
                  ["장부 기준", d.ledgerPaid],
                ] as const
              ).filter(([, v]) => v > 0)
              return (
                <tr key={d.id} className={ROW}>
                  <td className={TD}>
                    <Chip tone={meta.tone}>{meta.label}</Chip>
                  </td>
                  <th scope="row" className={`${TD} text-left font-semibold`}>
                    {d.customer}
                    <span className="block text-[11.5px] font-normal text-[#78736D]">
                      {d.installDate} · {d.owner}
                    </span>
                  </th>
                  <td className={`${TD} whitespace-nowrap text-[12.5px]`}>{ROUTE_LABEL[d.route]}</td>
                  <td className={NUM}>{won(d.supply)}</td>
                  <td className={NUM}>
                    {d.paid ? won(d.paid) : faintDash}
                    {parts.length ? (
                      <span className="block whitespace-nowrap text-[11px] text-[#78736D]">
                        {/* 한 경로뿐이면 금액을 되풀이하지 않고 경로 이름만 */}
                        {parts.length === 1
                          ? parts[0][0]
                          : parts.map(([k, v], i) => (
                              <Fragment key={k}>
                                {i ? " + " : ""}
                                {k} {won(v)}
                              </Fragment>
                            ))}
                      </span>
                    ) : null}
                  </td>
                  <td className={`${NUM} ${d.diff > 0 ? "font-semibold text-[#B43E3E]" : d.diff < 0 ? "text-[#31302E]" : "text-[#78736D]"}`}>{signedWon(d.diff)}</td>
                  <td className={`${TD} max-w-[420px] text-[12.5px] leading-snug text-[#615D59]`}>{d.note}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── 받은 돈 ─────────────────────────────────────── */

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

export function ReceiptsPanel() {
  const S = useSnapshot()
  return (
    <div className="grid gap-5">
      <div className={TABLE_BOX}>
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>날짜</th>
              <th className={TH}>경로</th>
              <th className={TH}>정산시트 표기</th>
              <th className={TH}>건</th>
              <th className={`${TH} text-right`}>금액</th>
              <th className={TH}>근거</th>
              <th className={TH}>통장 대조</th>
            </tr>
          </thead>
          <tbody>
            {S.receipts.map((r) => {
              const k = KIND_META[r.kind]
              return (
                <tr key={r.id} className={ROW}>
                  <td className={`num ${TD} whitespace-nowrap`}>{r.dateLabel}</td>
                  <td className={TD}>
                    <Chip tone={k.tone}>{k.label}</Chip>
                  </td>
                  <td className={TD}>{r.label}</td>
                  <td className={TD}>{r.deal === null ? <Chip tone="warn">건 미지정</Chip> : r.customer}</td>
                  <td className={NUM}>{won(r.amount)}</td>
                  <td className={`${TD} text-[12px] text-[#615D59]`}>{r.evidence}</td>
                  <td className={TD}>
                    <BankCell r={r} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-[13.5px] font-semibold">정산시트엔 입금이 없고 NEO에만 있는 것</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#615D59]">
          쿼드는 여러 건을 합쳐 한 번에 보냅니다. NEO 수금일이 다른 건의 이체와 같은 날이면 그 이체에 묶인 것이라 따로 들어온 돈이 아닙니다.
        </p>
        <div className={`${TABLE_BOX} mt-2`}>
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH}>NEO 수금일</th>
                <th className={TH}>고객</th>
                <th className={`${TH} text-right`}>NEO 금액</th>
                <th className={TH}>판단</th>
                <th className={TH}>NEO 번호</th>
              </tr>
            </thead>
            <tbody>
              {[...S.neoSameTransfer, ...S.neoOnly].map((n) => (
                <tr key={n.ref} className={ROW}>
                  <td className={`num ${TD}`}>{shortDate(n.collected)}</td>
                  <td className={TD}>{n.customer}</td>
                  <td className={NUM}>{won(n.amount)}</td>
                  <td className={`${TD} text-[12px]`}>
                    {n.receipt ? `${n.receiptLabel} 묶음 이체에 포함 · 별도 입금 아님` : `${n.channel} 내역으로 확인 필요`}
                  </td>
                  <td className={`num ${TD} text-[12px] text-[#615D59]`}>{n.ref}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#111110] font-bold">
                <th scope="row" colSpan={2} className={`${TD} text-left`}>
                  아직 확인할 것 · <span className="num">{S.neoOnly.length}</span>건
                </th>
                <td className={NUM}>{won(S.totals.neoOnly)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <BankExtras />
    </div>
  )
}

/* ── 못 넣은 것 ─────────────────────────────────── */

export function BacklogPanel() {
  const S = useSnapshot()
  return (
    <ul className="grid gap-3">
      {S.backlog.map((b) => (
        <li key={b.title} className="min-w-0 rounded-lg border border-[#e8e8e4] bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="min-w-0 text-[14.5px] font-semibold">{b.title}</h3>
            <span className="ml-auto text-[13.5px]">
              {b.amount != null ? (
                <>
                  <span className="num">{won(b.amount)}</span>원
                </>
              ) : (
                <span className="text-[#78736D]">금액 미정</span>
              )}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#615D59]">{b.detail}</p>
          <p className="mt-1.5 text-[12px] text-[#78736D]">
            출고 시트 <span className="num">{b.rows.length}</span>행: <span className="num">{b.rows.join(", ")}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}

/* ── 가격표 · 트래킹 ─────────────────────────────── */

export function PricesPanel() {
  return (
    <div className="grid gap-8">
      <div>
        <h3 className="mb-2 text-[13.5px] font-semibold">가격 정책표</h3>
        <PriceTable />
      </div>
      <div>
        <h3 className="mb-2 text-[13.5px] font-semibold">입금을 제대로 따라가려면</h3>
        <TrackingSteps />
      </div>
    </div>
  )
}
