"use client"

import { Fragment, useMemo, useState, type ReactNode } from "react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { branchManagerLabel } from "@/lib/branch/personal-scope"
import { ApprovalBar, type ApprovalOutcome, type LedgerCellEditApi } from "./LedgerSimpleEdit"
import LedgerMatrix from "./LedgerMatrix"
import { SHEET_WRITE_ON_NOTICE, type SheetWriteMode } from "./sheet-write-view"
import { type DraftConfidence, type LedgerDraft, type LedgerRevenueRow, type RevMonthlyBucket } from "./shared"
import {
  buildManagerRollup,
  buildSimpleColumns,
  buildSimpleLedger,
  chipKey,
  fiscalPace,
  rowMatchesChips,
  SIMPLE_FILTER_CHIPS,
  SIMPLE_GROUP_BY_OPTIONS,
  type SimpleGroupBy,
} from "./ledger-simple-logic"

// 장부(A안) 기본 화면. 개인 범위면 고객×월 표(A, 묶기 선택 시 A-1), 팀·전체면 담당자별 합계(A-2).
// 금액 칸은 그 자리에서 고치고(주차·메모는 상세 레일), 입력·결재 흐름은 REV 렌즈와 같은 경로를 탄다.
// 표 금액은 ¥ 를 칸 왼쪽에 두고 숫자만 오른쪽 정렬, 전액 확정 칸은 확정 틴트 배경으로 구분한다.

const money = (value: number) => `¥${cny(value)}`
const exact = (value: number) => `¥${cnyExact(value)}`
const pct = (value: number, goal: number | null) => (goal && goal > 0 ? Math.round((value / goal) * 100) : null)

/** 표 칸 금액 — ¥ 는 칸 왼쪽, 숫자는 오른쪽. 0 이면 "–". */
function Yen({ value, sign }: { value: number; sign?: string }) {
  if (!value && !sign) return <span className="block text-right">–</span>
  return (
    <span className="flex items-center justify-between gap-2">
      <span aria-hidden className="text-[11.5px] font-normal text-[#8A857D]">¥</span>
      <span><span className="sr-only">¥</span>{sign}{cny(value)}</span>
    </span>
  )
}

/** 확도는 아이콘 없이 글자색으로 — 확정 초록·고확도 파랑·예정 호박(CONFIDENCE_TOKENS, 예정은 밀도 표용 강조색). */
const CONF_TEXT: Record<DraftConfidence, string> = {
  confirmed: CONFIDENCE_TOKENS.confirmed.textStrongClass,
  "high-confidence": CONFIDENCE_TOKENS["high-confidence"].textStrongClass,
  expected: CONFIDENCE_TOKENS.expected.textStrongClass,
}

function ConfText({ kind, children }: { kind: DraftConfidence; children: ReactNode }) {
  return <span className={`font-semibold ${CONF_TEXT[kind]}`}>{children}</span>
}

function bucketTitle(bucket: RevMonthlyBucket) {
  return `확정 ${exact(bucket.confirmed)} · 고확도 ${exact(bucket.high)} · 예정 ${exact(bucket.open)}`
}

function ProgressBar({ bucket, goal, pace, label, paceLabel, thin }: { bucket: RevMonthlyBucket; goal: number | null; pace: number; label: string; paceLabel?: boolean; thin?: boolean }) {
  const scale = Math.max(goal ?? 0, bucket.total, 1)
  const width = (value: number) => `${(value / scale) * 100}%`
  const paceLeft = goal ? `${Math.min(pace * goal, scale) / scale * 100}%` : null
  return (
    <div className={`relative ${paceLabel && paceLeft ? "pt-[18px]" : ""}`} role="img" aria-label={label}>
      {paceLabel && paceLeft ? <span aria-hidden className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] text-[#37352F]" style={{ left: paceLeft }}>오늘 페이스</span> : null}
      <div className={`flex overflow-hidden rounded-sm bg-[#F1EFEA] ${thin ? "h-2" : "h-3"}`}>
        <div className={CONFIDENCE_TOKENS.confirmed.bgClass} style={{ width: width(bucket.confirmed) }} />
        <div className={CONFIDENCE_TOKENS["high-confidence"].bgClass} style={{ width: width(bucket.high) }} />
        <div className="box-border border-[1.5px] border-l-0 border-dashed" style={{ width: width(bucket.open), borderColor: CONFIDENCE_TOKENS.expected.color }} />
      </div>
      {paceLeft ? <span aria-hidden className={`absolute -bottom-1 border-l-2 border-[#37352F] ${paceLabel ? "top-[15px]" : "-top-1"}`} style={{ left: paceLeft }} /> : null}
    </div>
  )
}

function SummaryBand({ bucket, goal, pace, goalNote }: { bucket: RevMonthlyBucket; goal: number | null; pace: number; goalNote: string }) {
  const cPct = pct(bucket.confirmed, goal)
  const pacePct = Math.round(pace * 100)
  const gap = goal ? Math.max(goal - bucket.total, 0) : null
  const items: Array<{ label: ReactNode; value: string; title: string; tone?: string }> = [
    { label: "FY 목표", value: goal ? money(goal) : "—", title: goal ? `오늘 페이스 ${pacePct}% = ${money(goal * pace)}` : goalNote },
    {
      label: <ConfText kind="confirmed">확정</ConfText>,
      value: money(bucket.confirmed),
      title: `${bucketTitle(bucket)} · ${cPct === null ? "목표 비교 없음" : `${cPct}% · 페이스보다 ${Math.abs(pacePct - cPct)}%p ${cPct >= pacePct ? "앞" : "뒤"}`}`,
      tone: CONFIDENCE_TOKENS.confirmed.textClass,
    },
    { label: <ConfText kind="high-confidence">고확도</ConfText>, value: money(bucket.high), title: goal ? `더하면 ${pct(bucket.confirmed + bucket.high, goal)}%` : "확정 전 단계" },
    { label: <ConfText kind="expected">예정</ConfText>, value: money(bucket.open), title: goal ? `전부 들어오면 ${pct(bucket.total, goal)}%` : "입금 예정" },
    { label: "새로 만들어야 할 매출", value: gap === null ? "—" : money(gap), title: "예정까지 다 넣어도 모자란 금액" },
  ]
  return (
    <section aria-label="장부 요약" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5">
      {items.map((item, index) => (
        <div key={index} title={item.title} className="flex items-baseline gap-2">
          <span className="text-[12px] text-[#615D59]">{item.label}</span>
          <span className={`text-[16px] font-semibold tabular-nums ${item.tone ?? "text-[#111110]"}`}>{item.value}</span>
        </div>
      ))}
      <div className="min-w-[160px] flex-1">
        <ProgressBar thin bucket={bucket} goal={goal} pace={pace} label={`목표 대비 확정 ${money(bucket.confirmed)}, 고확도 ${money(bucket.high)}, 예정 ${money(bucket.open)}${goal ? `, 오늘 페이스 ${pacePct}%` : ""}`} />
      </div>
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
          className={`min-h-11 rounded-md px-3 md:min-h-7 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25 ${value === option.id ? "text-[#084734] shadow-[inset_0_0_0_1px_#084734]" : "text-[#615D59] hover:text-[#111110]"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
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
        <td className="min-w-[96px] px-3 py-3 tabular-nums">{goal ? <Yen value={goal} /> : <span className="block text-right">—</span>}</td>
        <td className={`min-w-[96px] px-3 py-3 font-semibold tabular-nums ${CONFIDENCE_TOKENS.confirmed.textClass}`} title={exact(bucket.confirmed)}><Yen value={bucket.confirmed} /></td>
        <td className="min-w-[96px] px-3 py-3 tabular-nums" title={exact(bucket.high)}><Yen value={bucket.high} /></td>
        <td className="min-w-[96px] px-3 py-3 tabular-nums text-[#615D59]" title={exact(bucket.open)}><Yen value={bucket.open} /></td>
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
              <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><ConfText kind="confirmed">확정</ConfText></span></th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><ConfText kind="high-confidence">고확도</ConfText></span></th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><ConfText kind="expected">예정</ConfText></span></th>
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
  /** 숫자가 틀리거나 빠질 수 있는 상황(큐 오류·목록 상한·원본을 못 찾은 정정) — 표 위에 그대로 보여 준다. */
  notices?: string[]
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
  /** 칸 수정 계약(없으면 읽기 전용). */
  edit: LedgerCellEditApi | null
  /** 이 범위의 대기 변경(초안·확인됨). */
  pendingDrafts: LedgerDraft[]
  serverQueue: boolean
  /** REV 시트 쓰기 스위치(GET sheetWrite.mode). on 이면 상단 안내 한 줄·반영 확인 문구가 바뀐다. 생략 = off. */
  sheetWriteMode?: SheetWriteMode
  /** 시트 쓰기 기록·동기화 시각을 읽지 못했을 때 서버 문구(배지·이중 집계 제외가 비어 보일 수 있다). */
  sheetWriteHealthMessage?: string | null
  onCheckDrafts: (ids: string[]) => Promise<ApprovalOutcome>
  onApplyDrafts: (ids: string[]) => Promise<ApprovalOutcome>
  onShowQueue: () => void
  onOpenRow: (row: LedgerRevenueRow) => void
  onOpenManager: (manager: string) => void
}

export default function LedgerSimpleView({ notices = [], rows, months, currentMonth, monthlyGoals, personal, managerGoals, loading, edit, pendingDrafts, serverQueue, sheetWriteMode = "off", sheetWriteHealthMessage = null, onCheckDrafts, onApplyDrafts, onShowQueue, onOpenRow, onOpenManager }: LedgerSimpleViewProps) {
  const [groupBy, setGroupBy] = useState<SimpleGroupBy>("none")
  const [teamView, setTeamView] = useState<"members" | "deals">("members")
  const [chips, setChips] = useState<Set<string>>(() => new Set())
  const pace = fiscalPace(months, currentMonth)
  const shown = useMemo(() => rows.filter((row) => rowMatchesChips(row, chips)), [rows, chips])
  const total = useMemo(() => buildSimpleLedger(shown, buildSimpleColumns(months, currentMonth), "none").total, [shown, months, currentMonth])
  // 칩 필터는 목표(DSH)와 모집단이 달라진다 — 워크벤치 필터와 같은 규칙으로 목표 비교를 끈다.
  const goals = chips.size > 0 ? null : monthlyGoals
  const fyGoal = goals ? months.reduce((sum, month) => sum + (goals.get(month) ?? 0), 0) : 0
  const toggleChip = (key: string) => setChips((current) => {
    const next = new Set(current)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const showMembers = !personal && teamView === "members"

  const toolbar = (
    <>
      {!personal ? <SegButtons label="표 형태" value={teamView} options={[{ id: "members", label: "담당자별" }, { id: "deals", label: "딜 전체" }]} onChange={setTeamView} /> : null}
      {!showMembers ? (
        <>
          <span className="text-[12.5px] text-[#615D59]">묶기</span>
          <SegButtons label="묶기 기준" value={groupBy} options={SIMPLE_GROUP_BY_OPTIONS} onChange={setGroupBy} />
        </>
      ) : null}
      <span className="mx-1 hidden h-5 w-px bg-[rgba(0,0,0,0.12)] sm:block" aria-hidden />
      <div role="group" aria-label="필터" className="flex flex-wrap items-center gap-1.5">
        {SIMPLE_FILTER_CHIPS.map((chip) => {
          const key = chipKey(chip)
          const on = chips.has(key)
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleChip(key)}
              className={`min-h-11 rounded-md border bg-transparent px-2 text-[12px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734] md:min-h-7 ${on ? "border-[#084734] font-bold text-[#084734]" : "border-[#E8E8E4] font-medium text-[#31302E] hover:border-[rgba(0,0,0,0.3)]"}`}
            >
              {chip.label}
            </button>
          )
        })}
        {chips.size > 0 ? <button type="button" onClick={() => setChips(new Set())} className="min-h-11 px-2 text-[12px] text-[#084734] underline-offset-2 hover:underline md:min-h-7">초기화</button> : null}
      </div>
    </>
  )
  const statusNode = (
    <span className="ml-auto flex flex-wrap items-center gap-3 text-[12px] text-[#615D59]">
      {/* REV 시트 쓰기 켜짐일 때만 — 반영이 '2. REV' 에도 쓴다는 사실을 상태 줄에 늘 둔다. */}
      {sheetWriteMode === "on" ? (
        <span data-sheet-write-notice className="font-semibold text-[#084734]">{SHEET_WRITE_ON_NOTICE}</span>
      ) : null}
      {sheetWriteHealthMessage ? (
        <span role="status" data-sheet-write-health className="font-semibold text-[#7A520F]">{sheetWriteHealthMessage}</span>
      ) : null}
    </span>
  )
  const matrixStatus = (
    <>
      {sheetWriteMode === "on" ? (
        <span data-sheet-write-notice className="font-semibold text-[#084734]">{SHEET_WRITE_ON_NOTICE}</span>
      ) : null}
      {sheetWriteHealthMessage ? (
        <span role="status" data-sheet-write-health className="font-semibold text-[#7A520F]">{sheetWriteHealthMessage}</span>
      ) : null}
    </>
  )

  return (
    <div className="space-y-3">
      {notices.length > 0 ? (
        <div role="status" className="space-y-1 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-4 py-2.5 text-[12.5px] font-semibold text-[#7A520F]">
          {notices.map((notice) => <p key={notice}>⚠ {notice}</p>)}
        </div>
      ) : null}
      <SummaryBand bucket={total} goal={fyGoal > 0 ? fyGoal : null} pace={pace} goalNote={loading ? "불러오는 중" : goals ? "목표 미등록" : "필터 중 — 목표 비교 생략"} />
      {loading || showMembers ? <div className="flex flex-wrap items-center gap-2">{toolbar}{statusNode}</div> : null}
      {loading ? (
        <p role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-6 py-10 text-center text-[13px] text-[#615D59]">장부를 불러오는 중입니다.</p>
      ) : showMembers ? (
        <ManagerTable rows={shown} months={months} currentMonth={currentMonth} managerGoals={managerGoals} pace={pace} onOpenManager={onOpenManager} />
      ) : (
        <LedgerMatrix rows={shown} months={months} currentMonth={currentMonth} monthlyGoals={goals} groupBy={groupBy} showManager={!personal} edit={edit} onOpenRow={onOpenRow} toolbar={toolbar} status={matrixStatus} />
      )}
      <p className="text-[12px] text-[#615D59]">
        {showMembers
          ? "담당자 이름을 누르면 그 사람 장부로 바뀝니다."
          : "금액 칸을 누르면 그 자리에서 고칩니다(E·H·C 확도, Enter 저장, Esc 취소). 깔때기는 그 달·주에 숫자가 있는 행만, 열 이름은 정렬, 고객 이름은 상세를 엽니다. 점선 칸은 아직 반영 전."}
      </p>
      <ApprovalBar drafts={pendingDrafts} serverQueue={serverQueue} sheetWriteMode={sheetWriteMode} onCheck={onCheckDrafts} onApply={onApplyDrafts} onShowAll={onShowQueue} />
    </div>
  )
}
