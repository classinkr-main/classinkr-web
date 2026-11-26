"use client"

import { useLayoutEffect, useRef, useState } from "react"

import type { StatementEntry } from "@/lib/partner-settlement"

import { KIND_META, man, signedWon, won } from "./format"
import { useSnapshot } from "./ui"

export const KIND_FILL: Record<StatementEntry["type"], string> = {
  charge: "#A39E98",
  transfer: "#084734",
  card: "#31302E",
  ledger: "#A8741A",
}

const INK = "#111110"
const MUTED = "#615D59"
const LINE = "#E8E8E4"

export const peakOf = (rows: StatementEntry[]) => Math.max(...rows.map((r) => r.balance))

const H = 172
const MIN_W = 440
const L = 26
const R = 46
const T = 22
const B = 22

const monthNo = (label: string) => Number(label.replace("월", ""))

/** 잔액 계단 그래프 — 칸 폭을 재서 그 폭 그대로 그린다(글자 크기가 화면 폭에 따라 커지지 않게) */
export function FlowChart() {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={box} className="overflow-x-auto" style={{ minHeight: H }}>
      {w ? <Chart W={Math.max(MIN_W, w)} /> : null}
    </div>
  )
}

function Chart({ W }: { W: number }) {
  const { statement: rows, months } = useSnapshot()
  const PEAK = peakOf(rows)
  const year = Number(rows[0].date.slice(0, 4))
  const t0 = Date.UTC(year, monthNo(months[0].month) - 1, 1)
  const t1 = Date.UTC(year, monthNo(months[months.length - 1].month), 0) // 마지막 달 말일
  const x = (ms: number) => L + ((ms - t0) / (t1 - t0)) * (W - L - R)
  const xd = (iso: string) => x(Date.parse(iso))

  const lo = Math.min(0, ...rows.map((r) => r.balance))
  const pad = (PEAK - lo) * 0.1
  const top = PEAK + pad
  const bot = lo - pad
  const y = (v: number) => T + ((top - v) / (top - bot || 1)) * (H - T - B)

  const pts: string[] = [`${L},${y(0)}`]
  let prev = 0
  for (const r of rows) {
    pts.push(`${xd(r.date)},${y(prev)}`, `${xd(r.date)},${y(r.balance)}`)
    prev = r.balance
  }
  const peak = rows.find((r) => r.balance === PEAK) ?? rows[0]
  const last = rows[rows.length - 1]

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${months[0].month}부터 ${months[months.length - 1].month}까지 쿼드러닝 계정 잔액의 흐름. 가장 높았을 때 ${man(PEAK)} 원, 지금은 ${man(last.balance)} 원입니다.`}
      className="block"
    >
      {months.map((m) => {
        const mx = x(Date.UTC(year, monthNo(m.month) - 1, 1))
        return (
          <g key={m.month}>
            <line x1={mx} x2={mx} y1={T - 8} y2={H - B} stroke={LINE} strokeWidth={1} />
            <text x={mx + 4} y={H - 6} fontSize={10.5} fill={MUTED}>
              {m.month}
            </text>
          </g>
        )
      })}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={MUTED} strokeWidth={1} />
      <text x={L - 5} y={y(0) + 3.5} textAnchor="end" fontSize={10} fill={MUTED} className="num">
        0
      </text>
      <polyline points={pts.join(" ")} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {rows.map((r, i) => (
        <g key={i}>
          <title>{`${r.dateLabel} ${KIND_META[r.type].label} · ${r.label} ${signedWon(r.amount)} → 잔액 ${won(r.balance)}`}</title>
          <circle cx={xd(r.date)} cy={y(r.balance)} r={9} fill="transparent" />
          <circle cx={xd(r.date)} cy={y(r.balance)} r={4} fill={KIND_FILL[r.type]} stroke="#FFFFFF" strokeWidth={1.5} />
        </g>
      ))}
      <text x={xd(peak.date)} y={y(PEAK) - 9} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK} className="num">
        {man(PEAK)}
      </text>
      <text x={xd(last.date) + 8} y={y(last.balance) + 4} fontSize={11} fontWeight={600} fill={INK} className="num">
        {man(last.balance)}
      </text>
    </svg>
  )
}
