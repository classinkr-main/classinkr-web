"use client"

// 장부 DSH 렌즈 팀·멤버 수치 그리드(2026-07-27 DSH 디벨롭 C) — summary의 dsh_rows
// (시트 '1. DSH' 팀 ALL/BD/MKT/CSM + 멤버 단위 Goal/Status 미러, ?breakdown=1 opt-in)를
// DshNumericGrid와 같은 CELL 규약(연간/Q1–Q4/월별)으로 보여준다. 트리 조립은
// dsh-derive의 buildDshTeamGrid(첫 행 채택 — 합산 금지) 순수 함수를 쓴다.
// 행: Team KR(ALL) 강조 → BD/MKT/CSM(팀 행 토글로 소속 멤버 확장, 접힘 기본).
// 열: 달성률(연간 기준, 뷰 전환과 무관하게 상시) + 연간 + Q1–Q4 + 월별.
// Goal/Status/Gap/Rate 뷰 토글은 이 그리드 자체 상태다(수치 그리드와 독립).

import { ArrowLeftRight, ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { TEAMS, type BranchDataSourceInfo, type BranchDshRow } from "../types"
import {
  buildDshTeamGrid,
  DSH_CELL,
  dshExactTitle,
  dshNumbersForView,
  dshRate,
  dshRateTitle,
  dshRateToneClass,
  formatDshRate,
  formatDshThousands,
  type DshNumbers,
  type DshTeamGridMember,
  type DshTeamGridTeam,
} from "./dsh-derive"
import { dshSourceLabel, type DshGridView } from "./DshNumericGrid"
import { CopyTableButton } from "./CopyTableButton"
import { buildDshTeamTsvRows, dshCopyCaption, DSH_COPY_VIEW_LABEL } from "./dsh-export"
import { withCaptionRow } from "./ledger-export"
import { LoadingPanel } from "./shared"
import { toTsv } from "@/lib/export/delimited"

const VIEW_OPTIONS: Array<{ id: DshGridView; label: string }> = [
  { id: "goal", label: "Goal" },
  { id: "status", label: "Status" },
  { id: "gap", label: "Gap" },
  { id: "rate", label: "Rate" },
]

// 팀 라벨 — ALL은 시트 표기(Team KR)를 따른다.
function teamLabel(team: string): string {
  return team === "ALL" ? "Team KR" : team
}

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

// 멤버 행 → REV 매트릭스 그 담당자(라운드 5 D-9). DSH 멤버명과 REV 담당자명은 둘 다 normalizeBranchMemberName
// (lib/branch/member-names.ts)으로 정규화돼 담당자 필터(mgr=)에 그대로 맞는다. 팀은 REV가 받는 값일 때만 싣는다.
export function dshMemberRevHref(team: string, member: string): string {
  const params = new URLSearchParams({ lens: "rev" })
  if (team !== "ALL" && (TEAMS as string[]).includes(team)) params.set("team", team)
  params.set("mgr", member)
  return `/admin/branch/ledger?${params.toString()}`
}

function RevMemberLink({ team, member }: { team: string; member: string }) {
  return (
    <Link
      href={dshMemberRevHref(team, member)}
      prefetch={false}
      aria-label={`${member} 담당 딜을 REV 매트릭스에서 보기`}
      className="ml-2 inline-flex min-h-11 shrink-0 items-center text-[10px] font-bold text-[#084734] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 md:min-h-0"
    >
      REV ↗
    </Link>
  )
}

// 금액 셀 묶음(연간+Q1–Q4+월별) — DshNumericGrid numericCells와 같은 규약
// (단위 천 + 원값 title + 음수 빨강). numbers가 null이면 전 칸 "–".
function amountCells(numbers: DshNumbers | null, monthKeys: string[], extra = "") {
  const tone = (value: number) => (value < 0 ? "text-[#B43E3E]" : "")
  const cell = (value: number | null, key: string, cellExtra: string) => (
    <td
      key={key}
      className={`${DSH_CELL} ${value == null ? "text-[#C9C5BF]" : `cursor-help ${tone(value)}`} ${cellExtra}`}
      {...(value == null ? {} : { title: dshExactTitle(value) })}
    >
      {value == null ? "–" : formatDshThousands(value)}
    </td>
  )
  return (
    <>
      {cell(numbers ? numbers.annual : null, "annual", extra)}
      {[0, 1, 2, 3].map((index) => cell(numbers ? numbers.quarters[index] ?? 0 : null, `q${index}`, extra || "bg-[#FBFAF7]"))}
      {monthKeys.map((ym) => cell(numbers ? numbers.months[ym] ?? 0 : null, ym, extra))}
    </>
  )
}

// Rate 셀 묶음 — 셀마다 Status ÷ Goal 달성률(목표 0/결측이면 "–") + 원값 쌍 title.
function rateCellsFor(
  entry: { goal: DshNumbers | null; status: DshNumbers | null },
  monthKeys: string[],
  extra = "",
) {
  const cell = (statusValue: number, goalValue: number, key: string, cellExtra: string) => {
    const pct = dshRate(statusValue, goalValue)
    return (
      <td
        key={key}
        className={`${DSH_CELL} cursor-help ${dshRateToneClass(pct)} ${cellExtra}`}
        title={dshRateTitle(statusValue, goalValue)}
      >
        {formatDshRate(pct)}
      </td>
    )
  }
  return (
    <>
      {cell(entry.status?.annual ?? 0, entry.goal?.annual ?? 0, "annual", extra)}
      {[0, 1, 2, 3].map((index) =>
        cell(entry.status?.quarters[index] ?? 0, entry.goal?.quarters[index] ?? 0, `q${index}`, extra || "bg-[#FBFAF7]"),
      )}
      {monthKeys.map((ym) => cell(entry.status?.months[ym] ?? 0, entry.goal?.months[ym] ?? 0, ym, extra))}
    </>
  )
}

// 상시 달성률(연간) 셀 — 뷰 전환과 무관하게 항상 노출한다(팀별 검수의 기준점).
function annualRateCell(entry: { goal: DshNumbers | null; status: DshNumbers | null }, extra = "") {
  const status = entry.status?.annual ?? 0
  const goal = entry.goal?.annual ?? 0
  const pct = dshRate(status, goal)
  return (
    <td className={`${DSH_CELL} cursor-help font-bold ${dshRateToneClass(pct)} ${extra}`} title={dshRateTitle(status, goal)}>
      {formatDshRate(pct)}
    </td>
  )
}

interface DshTeamGridProps {
  rows: BranchDshRow[]
  loading?: boolean
  /** 복사 첫 줄의 원천·기준 시각(라운드 5 B2). */
  dataSource?: BranchDataSourceInfo | null
}

export function DshTeamGrid({ rows, loading = false, dataSource = null }: DshTeamGridProps) {
  // 기본 뷰는 Status — 상시 달성률(연간) 열이 목표 대비 판정을 이미 깔고 있어,
  // 팀별 검수에서 먼저 확인하는 건 실적 절대치다(Goal은 토글 한 번).
  const [view, setView] = useState<DshGridView>("status")
  // 멤버 행은 접힘 기본 — 팀 단위 비교가 1차 용도고, 멤버 상세는 필요한 팀만 연다.
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const grid = useMemo(() => buildDshTeamGrid(rows), [rows])
  const { monthKeys, teams } = grid

  // 라운드 5 B2 — 현재 보기를 TSV로. 접힌 멤버 행도 전부 싣는다(펼침은 화면 상태일 뿐).
  const copyText = () =>
    toTsv(
      withCaptionRow(
        dshCopyCaption([
          "DSH 팀·멤버 수치",
          DSH_COPY_VIEW_LABEL[view],
          view === "rate" ? "달성률 % = 실적 ÷ 목표 · 목표 없는 칸은 빈 칸" : "단위 ¥(시트 원값 · 반올림 없음)",
          dataSource ? `원천 ${dshSourceLabel(dataSource)}` : null,
        ]),
        buildDshTeamTsvRows(grid, view),
      ),
    )

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
            팀 · 멤버 수치 <span className="font-semibold text-[#615D59]">(단위: ¥천 · 달성률 %)</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyTableButton
            getText={copyText}
            disabled={teams.length === 0}
            title="현재 보기를 팀·멤버 전부(접힌 멤버 포함) 표로 복사합니다 — 금액은 시트 원값(¥), 첫 줄에 보기·단위·원천"
            ariaLabel={`팀·멤버 수치 ${DSH_COPY_VIEW_LABEL[view]} 표 복사`}
          />
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
                    <th key={ym} className={`${DSH_CELL} bg-[#F6F5F4] font-bold`}>
                      {`${Number(ym.slice(5))}월`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <TeamRows
                    key={team.team}
                    team={team}
                    view={view}
                    monthKeys={monthKeys}
                    expanded={expandedTeams.has(team.team)}
                    onToggle={() => toggleTeam(team.team)}
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
}: {
  team: DshTeamGridTeam
  view: DshGridView
  monthKeys: string[]
  expanded: boolean
  onToggle: () => void
}) {
  const isAll = team.team === "ALL"
  // Team KR(ALL) 행은 기존 Team KR · Total 행 스타일로 강조 — 달성률 셀은 판정 색을
  // 유지해야 해서 배경 강조만 공유한다.
  const emphasis = isAll ? "bg-[#ECFDF5] font-extrabold" : ""
  const labelClass = isAll
    ? `${DSH_CELL} sticky left-0 z-[1] bg-[#ECFDF5] text-left font-extrabold text-[#084734]`
    : `${DSH_CELL} sticky left-0 z-[1] bg-white text-left font-semibold`
  const hasMembers = team.members.length > 0
  const cells =
    view === "rate"
      ? rateCellsFor(team, monthKeys, emphasis)
      : amountCells(dshNumbersForView(view, team, monthKeys), monthKeys, isAll ? `${emphasis} text-[#084734]` : "")

  return (
    <>
      <tr>
        <td className={labelClass}>
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
        {annualRateCell(team, emphasis)}
        {cells}
      </tr>
      {expanded &&
        team.members.map((member) => (
          <MemberRow key={member.member} team={team.team} member={member} view={view} monthKeys={monthKeys} />
        ))}
    </>
  )
}

function MemberRow({
  team,
  member,
  view,
  monthKeys,
}: {
  team: string
  member: DshTeamGridMember
  view: DshGridView
  monthKeys: string[]
}) {
  const cells =
    view === "rate"
      ? rateCellsFor(member, monthKeys, "bg-[#FAFAF8]")
      : amountCells(dshNumbersForView(view, member, monthKeys), monthKeys, "bg-[#FAFAF8]")
  return (
    <tr>
      <td className={`${DSH_CELL} sticky left-0 z-[1] bg-[#FAFAF8] text-left`}>
        <span className="pl-5 text-[11px] font-semibold text-[#615D59]">{member.member}</span>
        <RevMemberLink team={team} member={member.member} />
      </td>
      {annualRateCell(member, "bg-[#FAFAF8]")}
      {cells}
    </tr>
  )
}
