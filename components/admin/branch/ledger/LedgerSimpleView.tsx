"use client"

import { Fragment, useMemo, useState, type ReactNode } from "react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { branchManagerLabel } from "@/lib/branch/personal-scope"
import { dominantCellConfidence } from "./rev-matrix-logic"
import type { DraftConfidence, LedgerRevenueRow, RevMonthlyBucket } from "./shared"
import {
  buildManagerRollup,
  buildSimpleColumns,
  buildSimpleLedger,
  fiscalPace,
  SIMPLE_GROUP_BY_OPTIONS,
  type SimpleGroupBy,
} from "./ledger-simple-logic"

// 장부(A안) 기본 화면. 개인 범위면 고객×월 표(A, 묶기 선택 시 A-1), 팀·전체면 담당자별 합계(A-2).
// 수정은 기존 상세 레일(행 선택)로 넘긴다 — 입력·결재 흐름은 REV 렌즈와 같은 경로를 탄다.

const money = (value: number) => `¥${cny(value)}`
const exact = (value: number) => `¥${cnyExact(value)}`
const pct = (value: number, goal: number | null) => (goal && goal > 0 ? Math.round((value / goal) * 100) : null)

function Mark({ kind }: { kind: DraftConfidence }) {
  if (kind === "expected") {
    return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 border-[1.5px] border-dashed" style={{ borderColor: CONFIDENCE_TOKENS.expected.color }} />
  }
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 ${CONFIDENCE_TOKENS[kind].bgClass}`} />
}

function bucketTitle(bucket: RevMonthlyBucket) {
  return `확정 ${exact(bucket.confirmed)} · 고확도 ${exact(bucket.high)} · 예정 ${exact(bucket.open)}`
}

function ProgressBar({ bucket, goal, pace, label }: { bucket: RevMonthlyBucket; goal: number | null; pace: number; label: string }) {
  const scale = Math.max(goal ?? 0, bucket.total, 1)
  const width = (value: number) => `${(value / scale) * 100}%`
  return (
    <div className="relative" role="img" aria-label={label}>
      <div className="flex h-3 overflow-hidden rounded-sm bg-[#F1EFEA]">
        <div className={CONFIDENCE_TOKENS.confirmed.bgClass} style={{ width: width(bucket.confirmed) }} />
        <div className={CONFIDENCE_TOKENS["high-confidence"].bgClass} style={{ width: width(bucket.high) }} />
        <div className="box-border border-[1.5px] border-l-0 border-dashed" style={{ width: width(bucket.open), borderColor: CONFIDENCE_TOKENS.expected.color }} />
      </div>
      {goal ? <span aria-hidden className="absolute -bottom-1 -top-1 border-l-2 border-[#37352F]" style={{ left: `${Math.min(pace * goal, scale) / scale * 100}%` }} /> : null}
    </div>
  )
}

function SummaryBand({ bucket, goal, pace, goalNote }: { bucket: RevMonthlyBucket; goal: number | null; pace: number; goalNote: string }) {
  const cPct = pct(bucket.confirmed, goal)
  const pacePct = Math.round(pace * 100)
  const gap = goal ? Math.max(goal - bucket.total, 0) : null
  const tiles: Array<{ label: ReactNode; value: string; note: string; tone?: string }> = [
    { label: "FY 목표", value: goal ? money(goal) : "—", note: goal ? `오늘 페이스 ${pacePct}% = ${money(goal * pace)}` : goalNote },
    {
      label: <><Mark kind="confirmed" />확정</>,
      value: money(bucket.confirmed),
      note: cPct === null ? "목표 비교 없음" : `${cPct}% · 페이스보다 ${Math.abs(pacePct - cPct)}%p ${cPct >= pacePct ? "앞" : "뒤"}`,
      tone: CONFIDENCE_TOKENS.confirmed.textClass,
    },
    { label: <><Mark kind="high-confidence" />고확도</>, value: money(bucket.high), note: goal ? `더하면 ${pct(bucket.confirmed + bucket.high, goal)}%` : "확정 전 단계" },
    { label: <><Mark kind="expected" />예정</>, value: money(bucket.open), note: goal ? `전부 들어오면 ${pct(bucket.total, goal)}%` : "입금 예정" },
    { label: "새로 만들어야 할 매출", value: gap === null ? "—" : money(gap), note: "예정까지 다 넣어도 모자란 금액" },
  ]
  return (
    <section aria-label="장부 요약" className="space-y-4 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-5 sm:px-6">
      <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile, index) => (
          <div key={index} className={`flex min-w-0 flex-col gap-1 px-0 lg:px-5 ${index === 0 ? "lg:pl-0" : "lg:border-l lg:border-[rgba(0,0,0,0.06)]"}`}>
            <div className="flex items-center gap-2 text-[12px] text-[#615D59]">{tile.label}</div>
            <div className={`text-[22px] font-semibold tabular-nums ${tile.tone ?? "text-[#111110]"}`} title={tile.value === "—" ? undefined : bucketTitle(bucket)}>{tile.value}</div>
            <div className="text-[11.5px] text-[#615D59]">{tile.note}</div>
          </div>
        ))}
      </div>
      <ProgressBar bucket={bucket} goal={goal} pace={pace} label={`목표 대비 확정 ${money(bucket.confirmed)}, 고확도 ${money(bucket.high)}, 예정 ${money(bucket.open)}${goal ? `, 오늘 페이스 ${pacePct}%` : ""}`} />
    </section>
  )
}

function SegButtons<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (next: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-9 rounded-md px-3 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25 ${value === option.id ? "text-[#084734] shadow-[inset_0_0_0_1px_#084734]" : "text-[#615D59] hover:text-[#111110]"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function AmountCell({ bucket, current, strong }: { bucket: RevMonthlyBucket; current?: boolean; strong?: boolean }) {
  const base = `whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${current ? "bg-[#FBFCFB]" : ""}`
  if (bucket.total <= 0) return <td className={`${base} text-[#C5C0B8]`}>–</td>
  const kind = dominantCellConfidence(bucket)
  return (
    <td className={`${base} ${strong || kind === "confirmed" ? "font-semibold text-[#111110]" : kind === "expected" ? "text-[#615D59]" : "text-[#111110]"}`} title={bucketTitle(bucket)}>
      <span className="inline-flex items-center gap-1.5"><Mark kind={kind} />{money(bucket.total)}</span>
    </td>
  )
}

function DealTable({ rows, months, currentMonth, monthlyGoals, groupBy, onOpenRow }: {
  rows: LedgerRevenueRow[]
  months: string[]
  currentMonth: string
  monthlyGoals: Map<string, number> | null
  groupBy: SimpleGroupBy
  onOpenRow: (row: LedgerRevenueRow) => void
}) {
  const columns = useMemo(() => buildSimpleColumns(months, currentMonth), [months, currentMonth])
  const ledger = useMemo(() => buildSimpleLedger(rows, columns, groupBy), [rows, columns, groupBy])
  const grouped = groupBy !== "none"
  const columnGoal = (months: string[]) => (monthlyGoals ? months.reduce((sum, month) => sum + (monthlyGoals.get(month) ?? 0), 0) : 0)
  const footRows: Array<{ kind: DraftConfidence; label: string; pick: (b: RevMonthlyBucket) => number }> = [
    { kind: "confirmed", label: "확정", pick: (b) => b.confirmed },
    { kind: "high-confidence", label: "고확도", pick: (b) => b.high },
    { kind: "expected", label: "예정", pick: (b) => b.open },
  ]

  if (ledger.sections.length === 0) {
    return <p className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-6 py-10 text-center text-[13px] text-[#615D59]">이 범위에 이번 회계연도 매출이 없습니다.</p>
  }

  return (
    <section aria-label="장부 표" className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[rgba(0,0,0,0.08)] text-[12px] text-[#615D59]">
              <th scope="col" className="px-3 py-2.5 pl-5 text-left font-medium">고객</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">유형</th>
              {ledger.columns.map((column, index) => (
                <th key={column.key} scope="col" className={`whitespace-nowrap px-3 py-2.5 text-right align-bottom font-medium ${column.current ? "bg-[#FBFCFB] font-semibold text-[#084734]" : ""}`}>
                  <div>{column.label}{column.current ? " · 이번 달" : ""}</div>
                  <div className="mt-0.5 text-[11px] font-normal tabular-nums text-[#615D59]">{ledger.cells[index].total > 0 ? money(ledger.cells[index].total) : "–"}</div>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 pr-5 text-right font-semibold text-[#111110]">FY 합계</th>
            </tr>
          </thead>
          <tbody>
            {ledger.sections.map((section) => (
              <Fragment key={section.key}>
                {grouped ? (
                  <tr className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAF9F6] text-[12px] text-[#615D59]">
                    <th scope="rowgroup" colSpan={2} className="px-3 py-2 pl-5 text-left font-normal">
                      <span className="font-bold text-[#111110]">{section.label}</span> {section.lines.length}곳
                      <span className="ml-2 tabular-nums">확정 {money(section.total.confirmed)} · 고확도 {money(section.total.high)} · 예정 {money(section.total.open)}</span>
                    </th>
                    {section.cells.map((bucket, index) => (
                      <td key={index} className="px-3 py-2 text-right tabular-nums">{bucket.total > 0 ? money(bucket.total) : "–"}</td>
                    ))}
                    <td className="px-3 py-2 pr-5 text-right font-bold tabular-nums text-[#111110]">{money(section.total.total)}</td>
                  </tr>
                ) : null}
                {section.lines.map((line) => (
                  <tr key={line.key} className="border-b border-[rgba(0,0,0,0.05)] hover:bg-[#FAFAF8]">
                    <th scope="row" className={`px-3 py-2.5 text-left font-medium ${grouped ? "pl-8" : "pl-5"}`}>
                      <button type="button" onClick={() => onOpenRow(line.rows[0])} className="text-left text-[#111110] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]">
                        {line.label}
                      </button>
                    </th>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-[#615D59]">{line.tag || "–"}</td>
                    {line.cells.map((bucket, index) => <AmountCell key={index} bucket={bucket} current={ledger.columns[index].current} />)}
                    <td className="whitespace-nowrap px-3 py-2.5 pr-5 text-right font-semibold tabular-nums" title={bucketTitle(line.total)}>{money(line.total.total)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="text-[#615D59]">
            {footRows.map((foot, footIndex) => (
              <tr key={foot.kind} className={footIndex === 0 ? "border-t border-[rgba(0,0,0,0.12)]" : ""}>
                <th scope="row" colSpan={2} className="px-3 py-2 pl-5 text-left font-normal"><span className="inline-flex items-center gap-2"><Mark kind={foot.kind} />{foot.label}</span></th>
                {ledger.cells.map((bucket, index) => (
                  <td key={index} className={`px-3 py-2 text-right tabular-nums ${foot.kind === "confirmed" ? "font-semibold text-[#111110]" : ""}`}>{foot.pick(bucket) > 0 ? money(foot.pick(bucket)) : "–"}</td>
                ))}
                <td className={`px-3 py-2 pr-5 text-right font-semibold tabular-nums ${foot.kind === "confirmed" ? CONFIDENCE_TOKENS.confirmed.textClass : "text-[#111110]"}`}>{money(foot.pick(ledger.total))}</td>
              </tr>
            ))}
            {monthlyGoals ? (
              <tr className="border-t border-[#37352F] text-[#111110]">
                <th scope="row" colSpan={2} className="px-3 py-2.5 pl-5 text-left font-semibold">월 목표 대비 <span className="font-normal text-[#615D59]">(전부 합산)</span></th>
                {ledger.columns.map((column, index) => {
                  const goal = columnGoal(column.months)
                  const diff = ledger.cells[index].total - goal
                  return <td key={column.key} className={`px-3 py-2.5 text-right tabular-nums ${goal > 0 && diff >= 0 ? `font-semibold ${CONFIDENCE_TOKENS.confirmed.textClass}` : ""}`}>{goal > 0 ? `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}` : "–"}</td>
                })}
                <td className="px-3 py-2.5 pr-5 text-right font-bold tabular-nums">
                  {(() => {
                    const diff = ledger.total.total - columnGoal(months)
                    return columnGoal(months) > 0 ? `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}` : "–"
                  })()}
                </td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function ManagerTable({ rows, months, currentMonth, managerGoals, pace, onOpenManager }: {
  rows: LedgerRevenueRow[]
  months: string[]
  currentMonth: string
  managerGoals: Array<{ member: string; team: string | null; goal: number }>
  pace: number
  onOpenManager: (manager: string) => void
}) {
  const teams = useMemo(() => buildManagerRollup(rows, months, currentMonth, managerGoals), [rows, months, currentMonth, managerGoals])
  const pacePct = Math.round(pace * 100)
  const cells = (bucket: RevMonthlyBucket, goal: number | null, name: string, strong: boolean) => {
    const cPct = pct(bucket.confirmed, goal)
    const behind = cPct !== null && cPct < pacePct - 15
    return (
      <>
        <td className="px-3 py-3 text-right tabular-nums">{goal ? money(goal) : "—"}</td>
        <td className={`px-3 py-3 text-right font-semibold tabular-nums ${CONFIDENCE_TOKENS.confirmed.textClass}`} title={exact(bucket.confirmed)}>{money(bucket.confirmed)}</td>
        <td className="px-3 py-3 text-right tabular-nums" title={exact(bucket.high)}>{money(bucket.high)}</td>
        <td className="px-3 py-3 text-right tabular-nums text-[#615D59]" title={exact(bucket.open)}>{money(bucket.open)}</td>
        <td className="w-[220px] px-3 py-3">
          <ProgressBar bucket={bucket} goal={goal} pace={pace} label={`${name} 목표 대비 확정 ${money(bucket.confirmed)}, 고확도 ${money(bucket.high)}, 예정 ${money(bucket.open)}`} />
        </td>
        <td className={`px-3 py-3 text-right tabular-nums ${behind || strong ? "font-bold text-[#111110]" : ""}`}>
          {cPct === null ? "—" : `${cPct}%`}{behind ? <span className="ml-1.5 text-[11px] underline">뒤처짐</span> : null}
        </td>
        <td className="px-3 py-3 text-right tabular-nums">{goal ? `${pct(bucket.confirmed + bucket.high, goal)}%` : "—"}</td>
      </>
    )
  }

  if (teams.length === 0) {
    return <p className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-6 py-10 text-center text-[13px] text-[#615D59]">이 범위에 이번 회계연도 매출이 없습니다.</p>
  }

  return (
    <section aria-label="담당자별 합계" className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[rgba(0,0,0,0.08)] text-[12px] text-[#615D59]">
              <th scope="col" className="px-3 py-2.5 pl-5 text-left font-medium">담당</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">FY 목표</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><Mark kind="confirmed" />확정</span></th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><Mark kind="high-confidence" />고확도</span></th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><Mark kind="expected" />예정</span></th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">진행 <span className="text-[11px]">(세로선 = 오늘 페이스 {pacePct}%)</span></th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">확정률</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">확정+고확도</th>
              <th scope="col" className="px-3 py-2.5 pr-5 text-right font-medium">이번 달 미확정</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <Fragment key={team.team}>
                <tr className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAF9F6] font-semibold">
                  <th scope="rowgroup" className="px-3 py-3 pl-5 text-left">{team.team} <span className="text-[12px] font-normal text-[#615D59]">{team.members.length}명</span></th>
                  {cells(team.bucket, team.goal, team.team, true)}
                  <td className="px-3 py-3 pr-5 text-right tabular-nums">{team.dueUnconfirmed ? `${team.dueUnconfirmed}건` : "–"}</td>
                </tr>
                {team.members.map((member) => (
                  <tr key={member.manager} className="border-b border-[rgba(0,0,0,0.05)] hover:bg-[#FAFAF8]">
                    <th scope="row" className="px-3 py-3 pl-8 text-left font-medium">
                      <button type="button" onClick={() => onOpenManager(member.manager)} className="text-left text-[#111110] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]">
                        {branchManagerLabel(member.manager)}
                      </button>
                    </th>
                    {cells(member.bucket, member.goal, member.manager, false)}
                    <td className="px-3 py-3 pr-5 text-right tabular-nums">{member.dueUnconfirmed ? `${member.dueUnconfirmed}건` : "–"}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export interface LedgerSimpleViewProps {
  /** 범위·검색 필터가 반영된 장부 행(워크벤치 filteredRows). */
  rows: LedgerRevenueRow[]
  /** 회계연도 12개월(YYYY-MM). */
  months: string[]
  /** 오늘이 속한 달(YYYY-MM). */
  currentMonth: string
  /** 월 목표 — 목표와 같은 모집단일 때만(필터가 걸리면 null). */
  monthlyGoals: Map<string, number> | null
  /** 담당 한 명 범위(내 담당 포함)면 true — 아니면 담당자별 합계(A-2)가 기본. */
  personal: boolean
  /** 팀·전체 보기의 담당자 FY 목표(DSH). 아직 안 왔으면 빈 배열. */
  managerGoals: Array<{ member: string; team: string | null; goal: number }>
  /** 장부 행·목표를 아직 받는 중 — 빈 표·"목표 미등록"을 사실처럼 보이지 않게 한다. */
  loading: boolean
  onOpenRow: (row: LedgerRevenueRow) => void
  onOpenManager: (manager: string) => void
}

export default function LedgerSimpleView({ rows, months, currentMonth, monthlyGoals, personal, managerGoals, loading, onOpenRow, onOpenManager }: LedgerSimpleViewProps) {
  const [groupBy, setGroupBy] = useState<SimpleGroupBy>("none")
  const [teamView, setTeamView] = useState<"members" | "deals">("members")
  const pace = fiscalPace(months, currentMonth)
  const total = useMemo(() => buildSimpleLedger(rows, buildSimpleColumns(months, currentMonth), "none").total, [rows, months, currentMonth])
  const fyGoal = monthlyGoals ? months.reduce((sum, month) => sum + (monthlyGoals.get(month) ?? 0), 0) : 0
  const showMembers = !personal && teamView === "members"

  return (
    <div className="space-y-4">
      <SummaryBand bucket={total} goal={fyGoal > 0 ? fyGoal : null} pace={pace} goalNote={loading ? "불러오는 중" : monthlyGoals ? "목표 미등록" : "필터 중 — 목표 비교 생략"} />
      <div className="flex flex-wrap items-center gap-2">
        {!personal ? <SegButtons label="표 형태" value={teamView} options={[{ id: "members", label: "담당자별" }, { id: "deals", label: "딜 전체" }]} onChange={setTeamView} /> : null}
        {!showMembers ? (
          <>
            <span className="text-[12.5px] text-[#615D59]">묶기</span>
            <SegButtons label="묶기 기준" value={groupBy} options={SIMPLE_GROUP_BY_OPTIONS} onChange={setGroupBy} />
          </>
        ) : null}
        <span className="ml-auto flex items-center gap-3 text-[12px] text-[#615D59]">
          <span className="inline-flex items-center gap-1.5"><Mark kind="confirmed" />확정</span>
          <span className="inline-flex items-center gap-1.5"><Mark kind="high-confidence" />고확도</span>
          <span className="inline-flex items-center gap-1.5"><Mark kind="expected" />예정</span>
        </span>
      </div>
      {loading ? (
        <p role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-6 py-10 text-center text-[13px] text-[#615D59]">장부를 불러오는 중입니다.</p>
      ) : showMembers ? (
        <ManagerTable rows={rows} months={months} currentMonth={currentMonth} managerGoals={managerGoals} pace={pace} onOpenManager={onOpenManager} />
      ) : (
        <DealTable rows={rows} months={months} currentMonth={currentMonth} monthlyGoals={monthlyGoals} groupBy={groupBy} onOpenRow={onOpenRow} />
      )}
      <p className="text-[12px] text-[#615D59]">
        {showMembers ? "담당자 이름을 누르면 그 사람 장부로 바뀝니다." : "고객 이름을 누르면 오른쪽에 상세·수정이 열립니다. 주차·칸 단위 편집은 REV 탭에서 합니다."}
      </p>
    </div>
  )
}
