"use client"

// 홈 원장 — 대시보드 movements(최신순 · 2000건 캡)를 고객별 묶음 또는 전체 목록으로 본다.
// 묶기·필터·부호는 home-ledger-model(순수)이 정본이고, 여기서는 표시·펼침·확정 버튼만 맡는다.
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"

import ShowMore, { useVisibleCount, type VisibleCountState } from "@/components/admin/ui/ShowMore"

import {
  filterLedgerRows,
  formatSignedQuantity,
  groupLedgerRows,
  ledgerDate,
  ledgerPartyLabel,
  movementLot,
  type LedgerFilter,
  type LedgerGroup,
} from "./home-ledger-model"
import type { MovementButton, MovementButtonState } from "./movement-permissions"
import { formatLotLabel, formatNumber, isPlannedMovement, MOVEMENT_LABEL, todayKey, type HardwareMovement } from "./shared"

const GROUP_STEP = 12
const ROW_STEP = 30

type LedgerView = "party" | "all"

const FILTERS: Array<{ key: LedgerFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "planned", label: "배송 예정" },
  { key: "outbound", label: "출고" },
  { key: "inbound", label: "입고" },
  { key: "sample", label: "샘플" },
]

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"

interface HomeLedgerSectionProps {
  movements: readonly HardwareMovement[]
  setDetailId: (id: string) => void
  confirmPlannedMovement: (movement: HardwareMovement, override?: { quantity?: number; occurredAt?: string }) => Promise<void>
  plannedConfirmLocked: boolean
  movementButtonState: (button: MovementButton, movement: HardwareMovement) => MovementButtonState
  onOpenHistory: () => void
}

type LineActions = Pick<HomeLedgerSectionProps, "setDetailId" | "confirmPlannedMovement" | "plannedConfirmLocked" | "movementButtonState">

function LedgerHead({ showParty }: { showParty: boolean }) {
  const th = "px-2 py-2 font-semibold"
  return (
    <thead>
      <tr className="text-left text-[12px] text-[#615D59]">
        <th className={`${th} pl-3`}>날짜</th>
        <th className={th}>유형</th>
        {showParty ? <th className={th}>고객사</th> : null}
        <th className={th}>품목</th>
        {/* 부호는 물류번호(로트) 잔량 기준 — 카드의 창고 숫자 증감과 다를 수 있다. */}
        <th className={`${th} text-right`} title="물류번호 잔량 기준: 입고·회수 +, 출고 −, 이동·수리는 부호 없음. 창고 숫자 증감과 다를 수 있습니다.">
          수량
        </th>
        <th className={th}>물류번호</th>
        <th className={th}>담당</th>
        <th className={`${th} pr-3 text-right`}>상태</th>
      </tr>
    </thead>
  )
}

// 줄 클릭 = 상세 시트. 키보드는 품목 버튼으로 연다(표 의미를 지키려고 행에 role 을 씌우지 않는다).
// memo — 검색 타이핑·묶음 펼침 때 바뀌지 않은 줄은 다시 그리지 않는다.
const LedgerLine = memo(function LedgerLine({
  movement,
  showParty,
  today,
  actions,
}: { movement: HardwareMovement; showParty: boolean; today: string; actions: LineActions }) {
  const { setDetailId, confirmPlannedMovement, plannedConfirmLocked, movementButtonState } = actions
  const planned = isPlannedMovement(movement)
  const confirmState = planned ? movementButtonState("confirm", movement) : null
  const lot = formatLotLabel(movementLot(movement))
  const td = "px-2 py-2.5"
  return (
    <tr onClick={() => setDetailId(movement.id)} className="cursor-pointer border-t border-[rgba(0,0,0,0.06)] text-[13px] hover:bg-[#FAFAF8]">
      <td className={`${td} whitespace-nowrap pl-3 tabular-nums text-[#615D59]`}>{ledgerDate(movement.occurred_at, today)}</td>
      <td className={`${td} whitespace-nowrap text-[#31302E]`}>{MOVEMENT_LABEL[movement.movement_type]}</td>
      {showParty ? <td className={`${td} max-w-[200px] truncate font-semibold text-[#111110]`}>{ledgerPartyLabel(movement)}</td> : null}
      <td className={td}>
        <button
          type="button"
          onClick={() => setDetailId(movement.id)}
          title="상세 보기"
          className={`rounded text-left font-semibold text-[#111110] hover:underline ${FOCUS_RING}`}
        >
          {movement.product_name}
        </button>
      </td>
      <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums text-[#111110]`}>{formatSignedQuantity(movement)}</td>
      <td className={`${td} whitespace-nowrap text-[#615D59]`}>{lot ?? "—"}</td>
      <td className={`${td} whitespace-nowrap text-[#615D59]`}>{movement.owner ?? "—"}</td>
      <td className={`${td} whitespace-nowrap pr-3 text-right`}>
        {confirmState ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void confirmPlannedMovement(movement, { quantity: movement.quantity, occurredAt: todayKey() })
            }}
            disabled={plannedConfirmLocked || !confirmState.allowed}
            title={confirmState.title}
            className={`h-8 rounded-md border border-[#084734] bg-white px-2.5 text-[12px] font-bold tabular-nums text-[#084734] transition hover:bg-[#F7FAF8] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
          >
            예정 {ledgerDate(movement.occurred_at, today)} · 확정
          </button>
        ) : (
          <span className="text-[12px] text-[#615D59]">완료</span>
        )}
      </td>
    </tr>
  )
})

function Pager({ page, total, step }: { page: VisibleCountState; total: number; step: number }) {
  if (!page.canMore && !page.canCollapse) return null
  return (
    <ShowMore visible={page.visible} total={total} step={step} onMore={page.showMore} onCollapse={page.canCollapse ? page.collapse : undefined} />
  )
}

// 묶음 한 줄 + 펼친 표. 펼친 줄도 ROW_STEP 씩만 그린다(고객(미지정) 같은 큰 묶음이 한 번에 수백 줄을 그리지 않게).
const LedgerGroupRow = memo(function LedgerGroupRow({
  group,
  open,
  onToggle,
  today,
  actions,
}: { group: LedgerGroup; open: boolean; onToggle: (key: string) => void; today: string; actions: LineActions }) {
  const linePage = useVisibleCount(group.movements.length, ROW_STEP)
  return (
    <div className="border-t border-[rgba(0,0,0,0.06)] first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(group.key)}
        className={`flex w-full items-start gap-3 bg-white px-4 py-3.5 text-left hover:bg-[#FAFAF8] ${FOCUS_RING}`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`mt-[3px] h-3.5 w-3.5 shrink-0 text-[#615D59] transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1">
          <span className="min-w-0 truncate text-[14px] font-bold text-[#111110] md:w-[180px] md:shrink-0">{group.label}</span>
          <span className="min-w-0 basis-full truncate text-[13px] tabular-nums text-[#31302E] md:flex-1 md:basis-0">{group.summary}</span>
          {group.plannedCount > 0 ? (
            <span className="rounded border border-[#C9973F] px-1.5 py-px text-[11px] font-bold tabular-nums text-[#8A5A0E]">
              예정 {formatNumber(group.plannedCount)}
            </span>
          ) : null}
          <span className="ml-auto whitespace-nowrap text-[12px] tabular-nums text-[#615D59]">
            {formatNumber(group.movements.length)}건 ·{" "}
            {group.lastDate
              ? `최근 ${ledgerDate(group.lastDate, today)}`
              : group.nextPlannedDate
                ? `예정 ${ledgerDate(group.nextPlannedDate, today)}`
                : "날짜 없음"}
          </span>
        </span>
      </button>
      {open ? (
        <div className="space-y-2.5 px-4 pb-3.5 md:pl-11">
          <div className="overflow-x-auto rounded-lg border border-[rgba(0,0,0,0.08)]">
            <table className="w-full min-w-[640px] border-collapse">
              <LedgerHead showParty={false} />
              <tbody>
                {group.movements.slice(0, linePage.visible).map((movement) => (
                  <LedgerLine key={movement.id} movement={movement} showParty={false} today={today} actions={actions} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={linePage} total={group.movements.length} step={ROW_STEP} />
        </div>
      ) : null}
    </div>
  )
})

// 목록 본문 — 부모가 보기·칩·검색 조합을 key 로 주므로, 조건이 바뀌면 다시 마운트돼 페이지가 처음(12묶음 · 30줄)으로 돌아간다.
// memo — 검색 타이핑 중(지연값이 아직 그대로일 때)에는 이 트리를 건너뛰어 입력이 밀리지 않는다.
const LedgerBody = memo(function LedgerBody({
  view,
  rows,
  groups,
  expanded,
  onToggle,
  today,
  actions,
}: {
  view: LedgerView
  rows: readonly HardwareMovement[]
  groups: readonly LedgerGroup[]
  expanded: ReadonlySet<string>
  onToggle: (key: string) => void
  today: string
  actions: LineActions
}) {
  const groupPage = useVisibleCount(groups.length, GROUP_STEP)
  const rowPage = useVisibleCount(rows.length, ROW_STEP)
  const party = view === "party"
  const page = party ? groupPage : rowPage
  const total = party ? groups.length : rows.length
  return (
    <>
      {party ? (
        <div>
          {groups.slice(0, groupPage.visible).map((group) => (
            <LedgerGroupRow key={group.key} group={group} open={expanded.has(group.key)} onToggle={onToggle} today={today} actions={actions} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <LedgerHead showParty />
            <tbody>
              {rows.slice(0, rowPage.visible).map((movement) => (
                <LedgerLine key={movement.id} movement={movement} showParty today={today} actions={actions} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page.canMore || page.canCollapse ? (
        <div className="border-t border-[rgba(0,0,0,0.08)] px-4 py-3">
          <Pager page={page} total={total} step={party ? GROUP_STEP : ROW_STEP} />
        </div>
      ) : null}
    </>
  )
})

function HomeLedgerSection({
  movements,
  setDetailId,
  confirmPlannedMovement,
  plannedConfirmLocked,
  movementButtonState,
  onOpenHistory,
}: HomeLedgerSectionProps) {
  const [view, setView] = useState<LedgerView>("party")
  const [filter, setFilter] = useState<LedgerFilter>("all")
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const plannedCount = useMemo(() => filterLedgerRows(movements, "planned", "").length, [movements])
  const rows = useMemo(() => filterLedgerRows(movements, filter, deferredQuery), [movements, filter, deferredQuery])
  const groups = useMemo(() => (view === "party" ? groupLedgerRows(rows) : []), [rows, view])
  const today = todayKey()
  const actions = useMemo<LineActions>(
    () => ({ setDetailId, confirmPlannedMovement, plannedConfirmLocked, movementButtonState }),
    [setDetailId, confirmPlannedMovement, plannedConfirmLocked, movementButtonState]
  )

  const toggleGroup = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <section aria-label="입출고 기록" className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* 높이는 버튼이 정한다 — 모바일 래퍼가 버튼을 44px 로 올리므로 컨테이너 고정 높이는 잘린다. */}
          <div role="group" aria-label="보기" className="inline-flex overflow-hidden rounded-md border border-[rgba(0,0,0,0.14)]">
            {([["party", "고객별"], ["all", "전체 목록"]] as const).map(([key, label]) => {
              const on = view === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setView(key)}
                  className={`h-[34px] bg-white px-3.5 text-[13px] first:border-r first:border-[rgba(0,0,0,0.10)] ${FOCUS_RING} ${
                    on ? "font-bold text-[#084734] shadow-[inset_0_-2px_0_#084734]" : "text-[#31302E]"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div role="group" aria-label="유형 필터" className="flex flex-wrap gap-1.5">
            {FILTERS.map(({ key, label }) => {
              const on = filter === key
              // 배송 예정 칩은 늘 황색 외곽선 — 선택되면 외곽선을 두껍게.
              const tone =
                key === "planned"
                  ? `border-[#C9973F] font-bold text-[#8A5A0E] ${on ? "shadow-[inset_0_0_0_1px_#C9973F]" : ""}`
                  : on
                    ? "border-[#111110] font-bold text-[#111110]"
                    : "border-[rgba(0,0,0,0.14)] text-[#31302E]"
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(key)}
                  className={`h-8 rounded-full border bg-white px-3 text-[12px] tabular-nums ${tone} ${FOCUS_RING}`}
                >
                  {/* 줄(건) 수 — 위 합계 밴드의 배송 예정(전자칠판 대수)과 단위가 다르다. */}
                  {key === "planned" ? `${label} ${formatNumber(plannedCount)}건` : label}
                </button>
              )
            })}
          </div>
        </div>
        <label className="flex w-full items-center gap-2 text-[12px] text-[#615D59] sm:w-auto">
          검색
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="고객사 · 제품 · 물류번호"
            className={`h-8 min-w-0 flex-1 rounded-md border border-[rgba(0,0,0,0.14)] bg-white px-2.5 text-[16px] text-[#111110] sm:w-60 sm:flex-none md:text-[12px] ${FOCUS_RING}`}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-[#615D59]">
          {movements.length === 0 ? "기록이 없습니다." : "조건에 맞는 기록이 없습니다."}
        </p>
      ) : (
        <LedgerBody
          key={`${view}|${filter}|${deferredQuery}`}
          view={view}
          rows={rows}
          groups={groups}
          expanded={expanded}
          onToggle={toggleGroup}
          today={today}
          actions={actions}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] px-4 py-3 text-[12px] text-[#615D59]">
        <span className="tabular-nums">{formatNumber(rows.length)}건</span>
        <button type="button" onClick={onOpenHistory} className={`rounded font-semibold text-[#084734] hover:underline ${FOCUS_RING}`}>
          전체 내역 →
        </button>
      </div>
    </section>
  )
}

export default memo(HomeLedgerSection)
