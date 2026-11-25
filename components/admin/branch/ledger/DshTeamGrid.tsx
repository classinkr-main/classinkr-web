"use client"

// 장부 DSH 렌즈 팀·멤버 수치 그리드(2026-07-27 DSH 디벨롭 C) — summary의 dsh_rows
// (시트 '1. DSH' 팀 ALL/BD/MKT/CSM + 멤버 단위 Goal/Status 미러, ?breakdown=1 opt-in)를
// DshNumericGrid와 같은 CELL 규약(연간/Q1–Q4/월별)으로 보여준다. 트리 조립은
// dsh-derive의 buildDshTeamGrid(첫 행 채택 — 합산 금지) 순수 함수를 쓴다.
// 행: Team KR(ALL) 강조 → BD/MKT/CSM(팀 행 토글로 소속 멤버 확장, 접힘 기본).
// 열: 달성률(연간 기준, 뷰 전환과 무관하게 상시) + 연간 + Q1–Q4 + 월별.
// Goal/Status/Gap/Rate 뷰 토글은 이 그리드 자체 상태다(수치 그리드와 독립).
// 시트 고정 뒤(D4, summary 의 dsh_ledger): 고정 달부터 실적은 장부 확정이다 — 열 머리 '장부'·셀 title 로 밝힌다.
// 장부 담당자가 DSH 멤버에 없으면 서버가 '미배정' 팀 행을 만든다(목표 없음 · Team KR 합계에 포함). 고정 달 한 달 동안
// Status 뷰의 그 달 칸 아래에 시트 실적을 흐리게 둔다. 음수(환불)는 Goal·Status 에서 중립색이다(D2).

import { ArrowLeftRight, ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { TEAMS, type BranchDshRow } from "../types"
import {
  buildDshTeamGrid,
  DSH_CELL,
  DSH_UNASSIGNED_TITLE,
  dshActiveSheetCompare,
  dshCompareTitle,
  dshGapTitle,
  dshLedgerColumnTitle,
  dshQuarterMonthKeys,
  dshRate,
  dshRateTitleFor,
  dshRateToneClass,
  dshStatusSource,
  dshTeamLabel,
  dshValueTitle,
  emptyDshNumbers,
  formatDshRate,
  formatDshThousands,
  isDshLedgerMonth,
  isDshUnassignedTeam,
  subtractDshNumbers,
  type BranchDshLedgerInfo,
  type DshNumbers,
  type DshStatusSource,
  type DshTeamGridMember,
  type DshTeamGridTeam,
} from "./dsh-derive"
import type { DshGridView } from "./DshNumericGrid"
import { LoadingPanel } from "./shared"

const VIEW_OPTIONS: Array<{ id: DshGridView; label: string }> = [
  { id: "goal", label: "Goal" },
  { id: "status", label: "Status" },
  { id: "gap", label: "Gap" },
  { id: "rate", label: "Rate" },
]

// 팀 라벨 — ALL은 시트 표기(Team KR), 미배정은 "DSH 밖 담당 · 미배정"(dsh-derive dshTeamLabel 단일 소스).
const teamLabel = dshTeamLabel

// 셀 자리(연간·분기·월) — 장부 달을 걸치는지 보고 title 출처를 정한다.
type CellSlot = { kind: "annual" } | { kind: "quarter"; index: number } | { kind: "month"; ym: string }

// 셀 표기 문맥 — 뷰·장부 정보·고정 달 비교값. 장부 정보가 없으면 지금 문구 그대로다.
interface CellContext {
  view: DshGridView
  ledger: BranchDshLedgerInfo | null
  /** 고정 달(비교 달) — Status 뷰에서 고정 달 동안만. */
  compareMonth: string | null
}

function slotSource(context: CellContext, monthKeys: string[], slot: CellSlot): DshStatusSource {
  if (context.view === "goal") return "sheet"
  const months =
    slot.kind === "month" ? [slot.ym] : slot.kind === "quarter" ? dshQuarterMonthKeys(monthKeys, slot.index) : monthKeys
  return dshStatusSource(context.ledger, months)
}

const SHEET_CONTEXT: CellContext = { view: "status", ledger: null, compareMonth: null }

// 입력 진입점(기획 2026-09-20 §8.4 DSH 행: "입력 진입점이 0개") — 팀 그리드는 읽기 전용이라
// REV 렌즈로 팀 필터까지 동봉해 넘긴다. 같은 라우트 딥링크라 워크벤치의 URL 동기화(마운트 +
// useSearchParams 반응형 복원)가 lens=rev·team=X를 그대로 적용한다. ALL이나 TEAMS(REV team
// 필터가 실제로 받는 값) 밖의 팀 표기는 워크벤치가 조용히 ALL로 무시해 필터가 안 먹힌 채
// 걸린 링크처럼 보이므로, 그런 team 값은 아예 렌더하지 않는다.
function RevLensLink({ team }: { team: string }) {
  if (team === "ALL" || !(TEAMS as string[]).includes(team)) return null
  return (
    <Link
      href={`/admin/branch/ledger?lens=rev&team=${encodeURIComponent(team)}`}
      onClick={(event) => event.stopPropagation()}
      aria-label={`${teamLabel(team)} 팀을 REV 매트릭스에서 보기`}
      className="ml-2 inline-flex min-h-11 shrink-0 items-center text-[10px] font-bold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 md:min-h-0"
    >
      REV에서 보기 ↗
    </Link>
  )
}

// 뷰별 수치 묶음 — goal/status는 해당 kind가 시트에 없으면 null(전부 "–"),
// gap은 한쪽만 있어도 0으로 간주해 전개한다(수치 그리드 Gap 규약과 동일).
function numbersForView(
  view: Exclude<DshGridView, "rate">,
  entry: { goal: DshNumbers | null; status: DshNumbers | null },
  monthKeys: string[],
): DshNumbers | null {
  if (view === "goal") return entry.goal
  if (view === "status") return entry.status
  if (!entry.goal && !entry.status) return null
  return subtractDshNumbers(entry.status ?? emptyDshNumbers(), entry.goal ?? emptyDshNumbers(), monthKeys)
}

// 금액 셀 묶음(연간+Q1–Q4+월별) — DshNumericGrid numericCells와 같은 규약
// (단위 천 + 원값 title + Gap 음수 빨강). numbers가 null이면 전 칸 "–".
// sheetCompare: 고정 달 동안 Status 뷰의 그 달 칸 아래 시트 실적(흐리게).
function amountCells(
  numbers: DshNumbers | null,
  monthKeys: string[],
  extra = "",
  context: CellContext = SHEET_CONTEXT,
  sheetCompare: number | null = null,
) {
  // Gap 음수 = 목표 미달(빨강). Goal·Status 의 음수(환불)는 중립색(D2).
  const tone = (value: number) => (context.view === "gap" && value < 0 ? "text-[#B43E3E]" : "")
  const titleOf = (value: number, slot: CellSlot) => {
    const source = slotSource(context, monthKeys, slot)
    return context.view === "gap" ? dshGapTitle(value, source) : dshValueTitle(value, source)
  }
  const cell = (value: number | null, key: string, cellExtra: string, slot: CellSlot) => {
    const compare = value != null && slot.kind === "month" && slot.ym === context.compareMonth ? sheetCompare : null
    return (
      <td
        key={key}
        className={`${DSH_CELL} ${value == null ? "text-[#C9C5BF]" : `cursor-help ${tone(value)}`} ${cellExtra}`}
        {...(value == null ? {} : { title: compare != null ? dshCompareTitle(value, compare) : titleOf(value, slot) })}
      >
        {value == null ? "–" : formatDshThousands(value)}
        {compare != null && (
          <span className="block text-[10px] font-normal text-[#A39E98]">시트 {formatDshThousands(compare)}</span>
        )}
      </td>
    )
  }
  return (
    <>
      {cell(numbers ? numbers.annual : null, "annual", extra, { kind: "annual" })}
      {[0, 1, 2, 3].map((index) =>
        cell(numbers ? numbers.quarters[index] ?? 0 : null, `q${index}`, extra || "bg-[#FBFAF7]", { kind: "quarter", index }),
      )}
      {monthKeys.map((ym) => cell(numbers ? numbers.months[ym] ?? 0 : null, ym, extra, { kind: "month", ym }))}
    </>
  )
}

// Rate 셀 묶음 — 셀마다 Status ÷ Goal 달성률(목표 0/결측이면 "–") + 원값 쌍 title.
function rateCellsFor(
  entry: { goal: DshNumbers | null; status: DshNumbers | null },
  monthKeys: string[],
  extra = "",
  context: CellContext = SHEET_CONTEXT,
) {
  const cell = (statusValue: number, goalValue: number, key: string, cellExtra: string, slot: CellSlot) => {
    const pct = dshRate(statusValue, goalValue)
    return (
      <td
        key={key}
        className={`${DSH_CELL} cursor-help ${dshRateToneClass(pct)} ${cellExtra}`}
        title={dshRateTitleFor(statusValue, goalValue, slotSource(context, monthKeys, slot))}
      >
        {formatDshRate(pct)}
      </td>
    )
  }
  return (
    <>
      {cell(entry.status?.annual ?? 0, entry.goal?.annual ?? 0, "annual", extra, { kind: "annual" })}
      {[0, 1, 2, 3].map((index) =>
        cell(entry.status?.quarters[index] ?? 0, entry.goal?.quarters[index] ?? 0, `q${index}`, extra || "bg-[#FBFAF7]", {
          kind: "quarter",
          index,
        }),
      )}
      {monthKeys.map((ym) => cell(entry.status?.months[ym] ?? 0, entry.goal?.months[ym] ?? 0, ym, extra, { kind: "month", ym }))}
    </>
  )
}

// 상시 달성률(연간) 셀 — 뷰 전환과 무관하게 항상 노출한다(팀별 검수의 기준점).
function annualRateCell(
  entry: { goal: DshNumbers | null; status: DshNumbers | null },
  extra = "",
  source: DshStatusSource = "sheet",
) {
  const status = entry.status?.annual ?? 0
  const goal = entry.goal?.annual ?? 0
  const pct = dshRate(status, goal)
  return (
    <td className={`${DSH_CELL} cursor-help font-bold ${dshRateToneClass(pct)} ${extra}`} title={dshRateTitleFor(status, goal, source)}>
      {formatDshRate(pct)}
    </td>
  )
}

interface DshTeamGridProps {
  personalManager?: string
  rows: BranchDshRow[]
  loading?: boolean
  /** 시트 고정 뒤 장부 실적 표기(summary 의 dsh_ledger). null·없음 = 지금 그대로. */
  ledger?: BranchDshLedgerInfo | null
  /** 테스트용 "오늘" 고정 — 고정 달 비교 표시 판정에 쓴다. */
  now?: Date
}

export function DshTeamGrid({ rows, loading = false, personalManager, ledger = null, now: fixedNow }: DshTeamGridProps) {
  // 기본 뷰는 Status — 상시 달성률(연간) 열이 목표 대비 판정을 이미 깔고 있어,
  // 팀별 검수에서 먼저 확인하는 건 실적 절대치다(Goal은 토글 한 번).
  const [view, setView] = useState<DshGridView>("status")
  // 멤버 행은 접힘 기본 — 팀 단위 비교가 1차 용도고, 멤버 상세는 필요한 팀만 연다.
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const grid = useMemo(() => buildDshTeamGrid(rows), [rows])
  const { monthKeys, teams } = grid
  const now = useMemo(() => fixedNow ?? new Date(), [fixedNow])
  // 고정 달 한 달 동안 Status 뷰에서만 — 그 달 칸 아래 시트 팀·멤버 실적(흐리게).
  const sheetCompare = view === "status" ? dshActiveSheetCompare(ledger, now) : null
  const context: CellContext = { view, ledger, compareMonth: sheetCompare?.month ?? null }
  const annualSource = dshStatusSource(ledger, monthKeys)
  const compareOf = (kind: "team" | "member", name: string): number | null => {
    if (!sheetCompare) return null
    const value = kind === "team" ? sheetCompare.byTeam[name] : sheetCompare.byMember[name]
    return value ?? null
  }

  const toggleTeam = (team: string) => {
    setExpandedTeams((current) => {
      const next = new Set(current)
      if (next.has(team)) next.delete(team)
      else next.add(team)
      return next
    })
  }

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <div>
          <p className="text-[13px] font-bold text-[#111110]">
            {personalManager ? "개인 DSH 수치" : "팀 · 멤버 수치"} <span className="font-semibold text-[#615D59]">(단위: 천 · 달성률 %)</span>
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="팀 그리드 Goal/Status/Gap/Rate 보기 전환">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${
                view === option.id
                  ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="p-4">
          <LoadingPanel label="팀·멤버 수치를 불러오는 중" />
        </div>
      ) : teams.length === 0 ? (
        <p className="px-4 py-10 text-center text-[12px] text-[#615D59]">
          팀·멤버 수치가 없습니다 — 시트 &lsquo;1. DSH&rsquo; 동기화 후 다시 확인하세요(캐시된 이전
          응답이면 새로고침 시 채워집니다).
        </p>
      ) : (
        <>
          {/* DshNumericGrid의 모바일 규약 복제 — 열 축약 대신 sticky 첫 열 + 가로 스크롤 힌트. */}
          <div className="flex items-center gap-1.5 border-b border-[rgba(0,0,0,0.08)] bg-[#FFFCF5] px-4 py-1.5 text-[10.5px] font-semibold text-[#7A520F] md:hidden">
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            좌우로 스크롤하면 분기·월별 수치를 볼 수 있습니다 — 구분 열은 고정됩니다.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-[11.5px] tabular-nums">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.04em] text-[#615D59]">
                  <th className={`${DSH_CELL} sticky left-0 z-[1] bg-[#F6F5F4] text-left font-bold`}>구분</th>
                  <th
                    className={`${DSH_CELL} bg-[#F6F5F4] font-bold`}
                    title="연간 실적 ÷ 연간 목표 — Goal/Status/Gap/Rate 뷰 전환과 무관하게 상시 표시"
                  >
                    달성률
                  </th>
                  <th className={`${DSH_CELL} bg-[#F6F5F4] font-bold`}>연간</th>
                  {["Q1", "Q2", "Q3", "Q4"].map((label) => (
                    <th key={label} className={`${DSH_CELL} bg-[#F6F5F4] font-bold`}>
                      {label}
                    </th>
                  ))}
                  {monthKeys.map((ym) => (
                    <th
                      key={ym}
                      className={`${DSH_CELL} bg-[#F6F5F4] font-bold`}
                      {...(ledger && isDshLedgerMonth(ledger, ym) ? { title: dshLedgerColumnTitle(ledger) } : {})}
                    >
                      {`${Number(ym.slice(5))}월`}
                      {isDshLedgerMonth(ledger, ym) && (
                        <span className="ml-1 text-[9px] font-semibold normal-case tracking-normal text-[#A39E98]">장부</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {personalManager ? teams.flatMap(team => team.members).map(member => (
                  <MemberRow
                    key={member.member}
                    member={member}
                    view={view}
                    monthKeys={monthKeys}
                    context={context}
                    annualSource={annualSource}
                    sheetCompare={compareOf("member", member.member)}
                  />
                )) : teams.map((team) => (
                  <TeamRows
                    key={team.team}
                    team={team}
                    view={view}
                    monthKeys={monthKeys}
                    expanded={expandedTeams.has(team.team)}
                    onToggle={() => toggleTeam(team.team)}
                    context={context}
                    annualSource={annualSource}
                    sheetCompareOf={compareOf}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function TeamRows({
  team,
  view,
  monthKeys,
  expanded,
  onToggle,
  context = SHEET_CONTEXT,
  annualSource = "sheet",
  sheetCompareOf = () => null,
}: {
  team: DshTeamGridTeam
  view: DshGridView
  monthKeys: string[]
  expanded: boolean
  onToggle: () => void
  context?: CellContext
  annualSource?: DshStatusSource
  /** 고정 달 시트 실적(비교) — 팀·멤버 이름으로. */
  sheetCompareOf?: (kind: "team" | "member", name: string) => number | null
}) {
  const isAll = team.team === "ALL"
  // Team KR(ALL) 행은 기존 Team KR · Total 행 스타일로 강조 — 달성률 셀은 판정 색을
  // 유지해야 해서 배경 강조만 공유한다.
  const emphasis = isAll ? "bg-[#EAF6F0] font-extrabold" : ""
  const labelClass = isAll
    ? `${DSH_CELL} sticky left-0 z-[1] bg-[#EAF6F0] text-left font-extrabold text-[#084734]`
    : `${DSH_CELL} sticky left-0 z-[1] bg-white text-left font-semibold`
  const hasMembers = team.members.length > 0
  const cells =
    view === "rate"
      ? rateCellsFor(team, monthKeys, emphasis, context)
      : amountCells(
          numbersForView(view, team, monthKeys),
          monthKeys,
          isAll ? `${emphasis} text-[#084734]` : "",
          context,
          sheetCompareOf("team", team.team),
        )
  const unassigned = isDshUnassignedTeam(team.team)

  return (
    <>
      <tr>
        <td className={labelClass} {...(unassigned ? { title: DSH_UNASSIGNED_TITLE } : {})}>
          {hasMembers ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              title={expanded ? "멤버 행 접기" : "멤버 행 펼치기"}
              className="inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#615D59]" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#615D59]" aria-hidden="true" />
              )}
              {teamLabel(team.team)}
              <span className="text-[10px] font-semibold text-[#615D59]">{team.members.length}명</span>
            </button>
          ) : (
            teamLabel(team.team)
          )}
          <RevLensLink team={team.team} />
        </td>
        {annualRateCell(team, emphasis, annualSource)}
        {cells}
      </tr>
      {expanded &&
        team.members.map((member) => (
          <MemberRow
            key={member.member}
            member={member}
            view={view}
            monthKeys={monthKeys}
            context={context}
            annualSource={annualSource}
            sheetCompare={sheetCompareOf("member", member.member)}
          />
        ))}
    </>
  )
}

function MemberRow({
  member,
  view,
  monthKeys,
  context = SHEET_CONTEXT,
  annualSource = "sheet",
  sheetCompare = null,
}: {
  member: DshTeamGridMember
  view: DshGridView
  monthKeys: string[]
  context?: CellContext
  annualSource?: DshStatusSource
  sheetCompare?: number | null
}) {
  const cells =
    view === "rate"
      ? rateCellsFor(member, monthKeys, "bg-[#FAFAF8]", context)
      : amountCells(numbersForView(view, member, monthKeys), monthKeys, "bg-[#FAFAF8]", context, sheetCompare)
  return (
    <tr>
      <td className={`${DSH_CELL} sticky left-0 z-[1] bg-[#FAFAF8] text-left`}>
        <span className="pl-5 text-[11px] font-semibold text-[#615D59]">{member.member}</span>
      </td>
      {annualRateCell(member, "bg-[#FAFAF8]", annualSource)}
      {cells}
    </tr>
  )
}
