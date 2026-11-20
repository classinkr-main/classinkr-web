"use client"

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Funnel, Lock, Pencil } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { InlineCellEditor, type LedgerCellEditApi } from "./LedgerSimpleEdit"
import {
  MATRIX_PINNED_PAST_MONTHS,
  MATRIX_WIDTH,
  buildMatrixLedger,
  buildMatrixLeaves,
  bucketTone,
  cellCandidates,
  filterMatrixLines,
  isTextSortKey,
  lineLeafBucket,
  monthNumber,
  sortMatrixLines,
  sumMatrixLeaf,
  weekIndexOfDate,
  type BucketTone,
  type MatrixLeaf,
  type MatrixLine,
  type MatrixSort,
} from "./ledger-matrix-logic"
import type { SimpleGroupBy } from "./ledger-simple-logic"
import type { LedgerRevenueRow, RevMonthlyBucket } from "./shared"

// 장부 기본 보기(A-2) — 고객·제품 고정, 12개월(주차 펼침), 열 깔때기·정렬, 확도 틴트 매트릭스.
// 금액 칸 편집은 LedgerCellEditApi(InlineCellEditor)만 쓴다. 확도 색은 CONFIDENCE_TOKENS 에서만 가져온다.

const GREEN = "#084734"
const LINE = "#E8E8E4"
const FRAME = "#8A857F"
const NOW_WEEK_SHADOW = "inset 1px 0 0 #084734, inset -1px 0 0 #084734"
const HEAD_H = 30
const ROW_H = 28
const MIXED_BG = "#F0F0EC"
const PAST_FACE = "linear-gradient(rgba(97,93,89,.12), rgba(97,93,89,.12))"

const exact = (value: number) => `¥${cnyExact(value)}`
/** 칸 금액 — 축약(1.0만) 없이 전체 자릿수(시트와 같은 숫자). 0 은 빈칸. 칸 폭을 넘는 큰 합계만 만·억으로 줄인다(title 에 원값). */
const cell = (value: number, leaf?: Pick<MatrixLeaf, "kind">) => {
  if (!(value > 0)) return ""
  const limit = leaf?.kind === "week" ? 1_000_000 : leaf?.kind === "fy" ? 1_000_000_000 : 10_000_000
  return value >= limit ? cny(value) : cnyExact(Math.round(value))
}
const breakdown = (b: RevMonthlyBucket) => `확정 ${exact(b.confirmed)} · 고확도 ${exact(b.high)} · 예정 ${exact(b.open)}`

interface Face { bg: string; color: string; weight: number }

function toneFace(tone: BucketTone): Face | null {
  if (tone === "empty") return null
  if (tone === "mixed") return { bg: MIXED_BG, color: "#111110", weight: 700 }
  const token = CONFIDENCE_TOKENS[tone]
  return { bg: token.tintBg, color: token.strongColor, weight: tone === "expected" ? 600 : 700 }
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
const outlineBtn = (on: boolean) =>
  `min-h-11 rounded-md border bg-transparent px-2 text-[12px] md:min-h-7 ${FOCUS} ${on ? "border-[#084734] font-bold text-[#084734]" : "border-[#E8E8E4] font-medium text-[#31302E] hover:border-[rgba(0,0,0,0.3)]"}`

const monthText = (month: string) => `${monthNumber(month)}월`

function leafName(leaf: MatrixLeaf) {
  if (leaf.kind === "fy") return "FY 합계"
  const base = monthText(leaf.month!)
  return leaf.kind === "week" ? `${base} w${leaf.week! + 1}` : base
}

function keyName(key: string) {
  const [kind, month, week] = key.split(":")
  return kind === "w" ? `${monthText(month)} w${Number(week) + 1}` : monthText(month)
}

/** 달 시작 왼쪽 선·지난달 오른쪽 경계선. 이번 달 시작 잎은 지난달이 있으면 선을 긋지 않는다(경계선이 대신). */
function leafEdges(leaf: MatrixLeaf, hasPast: boolean): CSSProperties {
  const style: CSSProperties = {}
  if (leaf.start && !(hasPast && leaf.currentMonth)) style.borderLeft = `1px solid ${leaf.past ? "#A39E98" : "#C8C8C4"}`
  if (leaf.lastPast) style.borderRight = `1px solid ${FRAME}`
  return style
}

function headFace(leaf: MatrixLeaf, inCurrentMonth: boolean): { bg: string; color: string; weight: number; shadow?: string } {
  if (leaf.currentWeek) return { bg: GREEN, color: "#FFFFFF", weight: 700 }
  if (leaf.currentMonth) return { bg: "#D1FAE5", color: GREEN, weight: 700, shadow: `inset 0 -2px 0 ${GREEN}` }
  if (leaf.kind === "week" && inCurrentMonth) return { bg: "#FAFAF8", color: "#31302E", weight: 600 }
  if (leaf.past) return { bg: "#E8E8E4", color: "#31302E", weight: 600 }
  if (leaf.band) return { bg: "#F0F0EC", color: "#31302E", weight: 600 }
  return { bg: "#F6F5F4", color: "#31302E", weight: leaf.kind === "fy" ? 700 : 600 }
}

function SortArrow({ sort, k }: { sort: MatrixSort | null; k: string }) {
  if (sort?.key !== k) return null
  return <span aria-hidden>{sort.dir === "desc" ? "↓" : "↑"}</span>
}

interface LedgerMatrixProps {
  rows: LedgerRevenueRow[]
  months: string[]
  currentMonth: string
  monthlyGoals: Map<string, number> | null
  groupBy: SimpleGroupBy
  showManager: boolean
  edit: LedgerCellEditApi | null
  onOpenRow: (row: LedgerRevenueRow) => void
  toolbar?: ReactNode
  status?: ReactNode
  today?: Date
}

export default function LedgerMatrix({ rows, months, currentMonth, monthlyGoals, groupBy, showManager, edit, onOpenRow, toolbar, status, today }: LedgerMatrixProps) {
  const currentIndex = months.indexOf(currentMonth)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentIndex >= 0 ? [currentMonth] : []))
  const [valueKeys, setValueKeys] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState<MatrixSort | null>(null)
  const [pinPast, setPinPast] = useState(true)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const refocus = useRef<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  const closeEditor = (returnFocus = true) => {
    refocus.current = returnFocus ? editing : null
    setEditing(null)
  }
  useEffect(() => {
    if (editing || !refocus.current) return
    sectionRef.current?.querySelector<HTMLElement>(`[data-cell-key="${CSS.escape(refocus.current)}"]`)?.focus()
    refocus.current = null
  }, [editing])

  const currentWeek = weekIndexOfDate(today ?? new Date())
  const leaves = useMemo(() => buildMatrixLeaves({ months, currentMonth, currentWeek, expanded, pinPast }), [months, currentMonth, currentWeek, expanded, pinPast])
  const hasPast = leaves.some((leaf) => leaf.past)
  const ledger = useMemo(() => buildMatrixLedger(rows, months, groupBy), [rows, months, groupBy])
  const sections = useMemo(
    () => ledger.sections
      .map((section) => ({ ...section, lines: sortMatrixLines(filterMatrixLines(section.lines, { query, valueKeys }), sort) }))
      .filter((section) => section.lines.length > 0),
    [ledger, query, valueKeys, sort],
  )
  const visible = useMemo(() => sections.flatMap((section) => section.lines), [sections])
  const grouped = groupBy !== "none"
  const anyFilter = query.trim() !== "" || valueKeys.size > 0 || sort !== null
  const reset = () => {
    setQuery("")
    setValueKeys(new Set())
    setSort(null)
  }

  const toggleSort = (key: string) => {
    const first = isTextSortKey(key) ? "asc" : "desc"
    setSort((current) => {
      if (current?.key !== key) return { key, dir: first }
      if (current.dir === first) return { key, dir: first === "desc" ? "asc" : "desc" }
      return null
    })
  }
  const toggleValueKey = (key: string, expandMonth?: string) => {
    const wasOn = valueKeys.has(key)
    setValueKeys((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
    if (!wasOn && expandMonth) setExpanded((current) => new Set(current).add(expandMonth))
  }
  const toggleExpanded = (month: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(month)) next.add(month)
      return next
    })

  const weekKey = `w:${currentMonth}:${currentWeek}`
  const nextMonth = currentIndex >= 0 ? months[currentIndex + 1] : undefined
  const orderedKeys: string[] = []
  for (const month of months) {
    orderedKeys.push(`m:${month}`)
    for (let week = 0; week < 5; week += 1) orderedKeys.push(`w:${month}:${week}`)
  }
  const activeKeys = orderedKeys.filter((key) => valueKeys.has(key))

  // ── 열 구성 ──
  const labelCols = 3 + (showManager ? 1 : 0) // 지역·계약·경로(·담당)
  const frozenCols = 2
  const tableWidth =
    MATRIX_WIDTH.customer + MATRIX_WIDTH.product + MATRIX_WIDTH.region + MATRIX_WIDTH.contract + MATRIX_WIDTH.channel + (showManager ? MATRIX_WIDTH.manager : 0) + leaves.reduce((sum, leaf) => sum + leaf.width, 0)

  const leadDefs: Array<{ key: "region" | "contract" | "channel" | "manager"; label: string; width: number }> = [
    { key: "region", label: "지역", width: MATRIX_WIDTH.region },
    { key: "contract", label: "계약", width: MATRIX_WIDTH.contract },
    { key: "channel", label: "경로", width: MATRIX_WIDTH.channel },
    ...(showManager ? [{ key: "manager" as const, label: "담당", width: MATRIX_WIDTH.manager }] : []),
  ]

  // 좌우 고정은 md 이상에서만(left 는 인라인 + max-md:!left-auto, 본문 sticky 는 md:sticky). 위쪽 고정은 항상.
  const stickyLeftClass = "max-md:!left-auto"

  const headBtn = "inline-flex h-5 items-center gap-0.5 whitespace-nowrap px-0.5 text-[12px]"

  const renderHeadLeaf = (leaf: MatrixLeaf) => {
    const face = headFace(leaf, currentIndex >= 0 && leaf.month === currentMonth)
    const name = leafName(leaf)
    const sortKey = leaf.key
    const sortLabel = leaf.kind === "month-total" ? `${name} 합계 정렬` : `${name} 정렬`
    const month = leaf.month
    const filterOn = valueKeys.has(leaf.key)
    const white = leaf.currentWeek
    const style: CSSProperties = {
      position: "sticky",
      top: 0,
      zIndex: leaf.pinned ? 5 : 3,
      width: leaf.width,
      minWidth: leaf.width,
      height: HEAD_H,
      padding: 0,
      textAlign: "right",
      backgroundColor: face.bg,
      borderBottom: `1px solid ${LINE}`,
      ...leafEdges(leaf, hasPast),
      ...(face.shadow ? { boxShadow: face.shadow } : null),
      ...(leaf.pinned ? { left: leaf.left } : null),
    }
    return (
      <th key={leaf.key} scope="col" aria-sort={sort?.key === leaf.key ? (sort.dir === "desc" ? "descending" : "ascending") : undefined} className={leaf.pinned ? stickyLeftClass : undefined} style={style}>
        <div className="flex items-center justify-end gap-0.5 pr-0.5" style={{ height: HEAD_H - 1 }}>
          <button type="button" aria-label={sortLabel} title={sortLabel} onClick={() => toggleSort(sortKey)} className={`${headBtn} ${FOCUS}`} style={{ color: face.color, fontWeight: sort?.key === leaf.key ? 700 : face.weight }}>
            {leaf.label}
            <SortArrow sort={sort} k={leaf.key} />
          </button>
          {leaf.kind === "month" || leaf.kind === "month-total" ? (
            <button type="button" aria-label={`${monthText(month!)} 주차 ${leaf.kind === "month-total" ? "접기" : "펼치기"}`} onClick={() => toggleExpanded(month!)} className={`grid h-5 w-4 place-items-center rounded ${FOCUS}`} style={{ color: face.color }}>
              {leaf.kind === "month-total" ? <ChevronDown aria-hidden size={12} /> : <ChevronRight aria-hidden size={12} />}
            </button>
          ) : null}
          {leaf.kind !== "fy" ? (
            <button
              type="button"
              aria-pressed={filterOn}
              aria-label={`${leaf.kind === "week" ? `${monthText(month!)} w${leaf.week! + 1}` : monthText(month!)} 값 있는 행만`}
              onClick={() => toggleValueKey(leaf.key)}
              className={`grid h-5 w-5 place-items-center rounded ${FOCUS}`}
              style={white ? (filterOn ? { backgroundColor: "#FAFAF8", color: GREEN } : { color: "#FFFFFF" }) : { color: filterOn ? GREEN : "#615D59", boxShadow: filterOn ? `inset 0 0 0 1px ${GREEN}` : undefined }}
            >
              <Funnel aria-hidden size={12} />
            </button>
          ) : null}
        </div>
      </th>
    )
  }

  const textHead = (key: "customer" | "product" | "region" | "contract" | "channel" | "manager", label: string, width: number, extra: CSSProperties, className?: string) => (
    <th key={key} scope="col" aria-sort={sort?.key === key ? (sort.dir === "desc" ? "descending" : "ascending") : undefined} className={className} style={{ position: "sticky", top: 0, width, minWidth: width, height: HEAD_H, padding: 0, backgroundColor: "#F6F5F4", borderBottom: `1px solid ${LINE}`, ...extra }}>
      <button type="button" onClick={() => toggleSort(key)} aria-label={`${label}순 정렬`} title={`${label}순 정렬`} className={`${headBtn} ${FOCUS}`} style={{ marginLeft: key === "customer" ? 8 : 3, color: sort?.key === key ? GREEN : "#31302E", fontWeight: sort?.key === key ? 700 : 600 }}>
        {label}
        <SortArrow sort={sort} k={key} />
      </button>
    </th>
  )

  // ── 본문 칸 ──
  const leafBodyStyle = (leaf: MatrixLeaf, bucket: RevMonthlyBucket, bad: boolean, tone: BucketTone): CSSProperties => {
    const face = toneFace(tone)
    const style: CSSProperties = {
      height: ROW_H,
      padding: "0 6px",
      textAlign: "right",
      whiteSpace: "nowrap",
      borderBottom: `1px solid ${LINE}`,
      ...leafEdges(leaf, hasPast),
      ...(leaf.pinned ? { left: leaf.left, zIndex: 2 } : null),
      ...(leaf.currentWeek ? { boxShadow: NOW_WEEK_SHADOW } : null),
    }
    if (bad) {
      style.backgroundColor = "#FCE9E9"
      style.color = "#8F2C2C"
      style.fontWeight = 700
    } else if (leaf.past) {
      style.backgroundColor = "inherit"
      style.backgroundImage = PAST_FACE
      style.color = face?.color ?? "#111110"
      style.fontWeight = 700
    } else if (face && bucket.total > 0) {
      style.backgroundColor = face.bg
      style.color = face.color
      style.fontWeight = face.weight
    } else if (leaf.band) {
      style.backgroundColor = "rgba(97,93,89,.06)"
    }
    return style
  }

  const renderBodyLeaf = (line: MatrixLine, leaf: MatrixLeaf, leafIndex: number) => {
    const bucket = lineLeafBucket(line, leaf)
    const tone = bucketTone(bucket)
    const month = leaf.month
    const monthCell = month ? line.byMonth[month] : null
    const isMonthKind = leaf.kind === "month" || leaf.kind === "month-total"
    const bad = isMonthKind && !!monthCell?.mismatch && bucket.total > 0
    const monthOnly = isMonthKind && !!monthCell?.monthOnly && bucket.total > 0
    const style = leafBodyStyle(leaf, bucket, bad, tone)
    const className = leaf.pinned ? `md:sticky ${stickyLeftClass}` : undefined
    let title: string | undefined
    if (bad) title = "주차 합 ≠ 월합계"
    else if (bucket.total > 0) title = leaf.kind === "fy" ? `FY 합계 · ${breakdown(bucket)}` : `${leafName(leaf)} · ${breakdown(bucket)}`
    if (leaf.kind === "week" && edit) title = `${title ?? leafName(leaf)} · 주차 수정은 주차 검수 보기에서`

    const candidates = edit && isMonthKind && month ? cellCandidates(line.rows, month, edit) : []
    if (edit && month && candidates.length > 0) {
      const cellKey = `${line.key}:${month}`
      const label = `${line.label} ${monthText(month)}`
      if (editing === cellKey) {
        const rightAlign = leafIndex >= leaves.length - 3
        return (
          <td key={leaf.key} className={leaf.pinned ? `relative ${className}` : undefined} style={{ ...style, padding: 0, position: leaf.pinned ? undefined : "relative", zIndex: 20 }}>
            <div className={`absolute top-0 z-20 w-[200px] rounded-lg border border-[rgba(0,0,0,0.12)] bg-white p-1.5 text-left shadow-[0_8px_24px_rgba(17,17,16,0.16)] ${rightAlign ? "right-0" : "left-0"}`} style={{ color: "#111110", fontWeight: 400, whiteSpace: "normal" }}>
              <InlineCellEditor
                label={label}
                month={month}
                candidates={candidates}
                edit={edit}
                onClose={closeEditor}
                onMore={(row) => {
                  setEditing(null)
                  onOpenRow(row)
                }}
              />
            </div>
          </td>
        )
      }
      const hasPending = line.rows.some((row) => edit.pending(row, month))
      const shownAmount = hasPending ? line.rows.reduce((sum, row) => sum + edit.value(row, month), 0) : bucket.total
      const pendingTitle = hasPending ? `대기 중 변경 ${exact(shownAmount)} (지금 장부 ${exact(bucket.total)})` : title
      return (
        <td key={leaf.key} className={className} style={{ ...style, padding: 0 }} title={pendingTitle}>
          <button
            type="button"
            data-cell-key={cellKey}
            aria-label={`${label} ${hasPending ? `대기 중 ¥${cny(shownAmount)}` : shownAmount > 0 ? `¥${cny(shownAmount)}` : "비어 있음"} — 수정`}
            onClick={() => setEditing(cellKey)}
            className={`relative flex w-full cursor-text items-center justify-end gap-1 px-1.5 text-right hover:bg-[rgba(8,71,52,0.08)] focus-visible:-outline-offset-2 ${FOCUS} ${hasPending ? "outline-dashed outline-[1.5px] -outline-offset-2 outline-[#37352F]" : ""}`}
            style={{ height: ROW_H - 1 }}
          >
            {bad ? <AlertTriangle aria-hidden size={11} /> : null}
            {monthOnly ? <span title="월합계만 — 주차 미입력" style={{ borderBottom: `1px dashed ${CONFIDENCE_TOKENS.expected.strongColor}` }}>{cell(shownAmount, leaf)}</span> : cell(shownAmount, leaf)}
            {hasPending ? <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#37352F]" /> : null}
          </button>
        </td>
      )
    }
    return (
      <td key={leaf.key} className={className} style={style} title={title}>
        {bad ? <AlertTriangle aria-hidden size={11} className="mr-1 inline-block align-[-1px]" /> : null}
        {monthOnly ? <span title="월합계만 — 주차 미입력" style={{ borderBottom: `1px dashed ${CONFIDENCE_TOKENS.expected.strongColor}` }}>{cell(bucket.total, leaf)}</span> : cell(bucket.total, leaf)}
      </td>
    )
  }

  const labelColor = (line: MatrixLine, key: (typeof leadDefs)[number]["key"]) => {
    if (key === "region" || key === "manager") return { color: "#31302E", fontWeight: 400 }
    const hi = key === "contract" ? line.contractRare : line.channelRare
    return { color: hi ? (key === "contract" ? GREEN : "#111110") : "#615D59", fontWeight: hi ? 700 : 400 }
  }

  const renderLine = (line: MatrixLine) => (
    <tr key={line.key} className="bg-white hover:bg-[#F5F5F2]">
      <th
        scope="row"
        className={`md:sticky ${stickyLeftClass}`}
        style={{ left: 0, zIndex: 2, width: MATRIX_WIDTH.customer, minWidth: MATRIX_WIDTH.customer, height: ROW_H, padding: `0 8px 0 ${grouped ? 16 : 8}px`, background: "inherit", borderBottom: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, textAlign: "left" }}
      >
        <div className="flex items-center gap-1" style={{ maxWidth: MATRIX_WIDTH.customer - 16 }}>
          <button type="button" title={line.label} onClick={() => onOpenRow(line.rows[0])} className={`min-w-0 truncate text-left underline-offset-2 hover:underline ${FOCUS}`} style={line.locked ? { color: "#615D59", fontWeight: 500 } : { color: "#111110", fontWeight: 700 }}>
            {line.label}
          </button>
          {line.mismatchMonths.length > 0 ? <span title={`주차 합 ≠ 월합계 · ${line.mismatchMonths.map(monthText).join("·")}`} className="shrink-0" style={{ color: "#B43E3E" }}><AlertTriangle aria-hidden size={12} /></span> : null}
          {line.locked ? <span title="전액 확정 — 잠김" className="shrink-0" style={{ color: "#615D59" }}><Lock aria-hidden size={12} /></span> : null}
          {line.hasDraft ? <span title="초안 포함" className="shrink-0" style={{ color: "#615D59" }}><Pencil aria-hidden size={12} /></span> : null}
        </div>
      </th>
      <td
        className={`md:sticky ${stickyLeftClass}`}
        style={{ left: MATRIX_WIDTH.customer, zIndex: 2, width: MATRIX_WIDTH.product, minWidth: MATRIX_WIDTH.product, height: ROW_H, padding: 0, textAlign: "center", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "inherit", borderBottom: `1px solid ${LINE}`, borderRight: `1px solid ${FRAME}`, color: line.productRare ? "#111110" : "#615D59", fontWeight: line.productRare ? 700 : 400 }}
        title={line.product || undefined}
      >
        {line.product}
      </td>
      {leadDefs.map((def) => (
        <td key={def.key} title={line[def.key] || undefined} style={{ height: ROW_H, padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderBottom: `1px solid ${LINE}`, ...labelColor(line, def.key) }}>
          {line[def.key]}
        </td>
      ))}
      {leaves.map((leaf, index) => renderBodyLeaf(line, leaf, index))}
      <td style={{ height: ROW_H, padding: 0, borderBottom: `1px solid ${LINE}` }} />
    </tr>
  )

  const sum = (lines: MatrixLine[], leaf: MatrixLeaf) => sumMatrixLeaf(lines, leaf)

  const totalCell = (leaf: MatrixLeaf) => {
    const bucket = sum(visible, leaf)
    const tone = bucketTone(bucket)
    const face = toneFace(tone)
    return (
      <td
        key={leaf.key}
        className={leaf.pinned ? stickyLeftClass : undefined}
        title={bucket.total > 0 ? breakdown(bucket) : undefined}
        style={{
          position: "sticky", top: HEAD_H, zIndex: leaf.pinned ? 5 : 3, height: ROW_H, padding: "0 6px", textAlign: "right", whiteSpace: "nowrap",
          backgroundColor: leaf.past ? "#E8E8E4" : face ? face.bg : "#F6F5F4",
          borderBottom: "2px solid #111110", fontWeight: 700, color: face?.color ?? "#111110",
          ...leafEdges(leaf, hasPast),
          ...(leaf.currentWeek ? { boxShadow: NOW_WEEK_SHADOW } : null),
          ...(leaf.pinned ? { left: leaf.left } : null),
        }}
      >
        {cell(bucket.total, leaf)}
      </td>
    )
  }

  const monthGoal = (leaf: MatrixLeaf) => {
    if (!monthlyGoals) return 0
    if (leaf.kind === "fy") return months.reduce((total, month) => total + (monthlyGoals.get(month) ?? 0), 0)
    if (leaf.kind === "week" || !leaf.month) return 0
    return monthlyGoals.get(leaf.month) ?? 0
  }

  const footRows: Array<{ kind: "confirmed" | "high-confidence" | "expected"; label: string; pick: (b: RevMonthlyBucket) => number }> = [
    { kind: "confirmed", label: "확정", pick: (b) => b.confirmed },
    { kind: "high-confidence", label: "고확도", pick: (b) => b.high },
    { kind: "expected", label: "예정", pick: (b) => b.open },
  ]
  const footLeafStyle = (leaf: MatrixLeaf, extra?: CSSProperties): CSSProperties => ({
    height: ROW_H, padding: "0 6px", textAlign: "right", whiteSpace: "nowrap",
    ...leafEdges(leaf, hasPast),
    ...(leaf.pinned ? { left: leaf.left, zIndex: 2, backgroundColor: "#FFFFFF" } : null),
    ...extra,
  })
  const footClass = (leaf: MatrixLeaf) => (leaf.pinned ? `md:sticky ${stickyLeftClass}` : undefined)

  const legendChip = (label: string, bg: string, color: string) => (
    <span key={label} className="inline-flex h-5 items-center rounded px-1.5 text-[11.5px] font-semibold" style={{ backgroundColor: bg, color }}>{label}</span>
  )

  const quickDefs: Array<{ label: string; key: string; expandMonth?: string }> = []
  if (currentIndex >= 0) {
    quickDefs.push({ label: "이번 주 값 있음", key: weekKey, expandMonth: currentMonth })
    quickDefs.push({ label: "이번 달 값 있음", key: `m:${currentMonth}` })
    if (nextMonth) quickDefs.push({ label: "다음 달 값 있음", key: `m:${nextMonth}` })
  }

  const toolbarNode = (
    <div className="flex flex-wrap items-center gap-2">
      {toolbar}
      <input
        type="search"
        aria-label="고객 검색"
        placeholder="고객 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={`min-h-11 w-[160px] rounded-md border border-[#E8E8E4] bg-white px-2 text-[12px] text-[#111110] placeholder:text-[#615D59] md:min-h-7 ${FOCUS}`}
      />
      {quickDefs.map((def) => (
        <button key={def.key} type="button" aria-pressed={valueKeys.has(def.key)} onClick={() => toggleValueKey(def.key, def.expandMonth)} className={outlineBtn(valueKeys.has(def.key))}>
          {def.label}
        </button>
      ))}
      {hasPast ? (
        <button type="button" aria-pressed={pinPast} title={`최근 지난달 ${MATRIX_PINNED_PAST_MONTHS}개를 고객 옆에 고정`} onClick={() => setPinPast((value) => !value)} className={outlineBtn(pinPast)}>
          지난달 고정
        </button>
      ) : null}
      {activeKeys.map((key) => (
        <button key={key} type="button" aria-label={`${keyName(key)} 값 있음 해제`} onClick={() => toggleValueKey(key)} className={outlineBtn(true)}>
          {keyName(key)} 값 있음 ×
        </button>
      ))}
      {anyFilter ? (
        <button type="button" onClick={reset} className={outlineBtn(false)}>초기화</button>
      ) : null}
      <span className="ml-auto flex flex-wrap items-center gap-2 text-[12px] text-[#615D59]">
        <span className="tabular-nums">{ledger.lines.length}곳 중 {visible.length}곳</span>
        {status}
        <span>단위 ¥</span>
        {legendChip("지난달", "#E8E8E4", "#31302E")}
        {legendChip("확정", CONFIDENCE_TOKENS.confirmed.tintBg, CONFIDENCE_TOKENS.confirmed.strongColor)}
        {legendChip("고확도", CONFIDENCE_TOKENS["high-confidence"].tintBg, CONFIDENCE_TOKENS["high-confidence"].strongColor)}
        {legendChip("예정", CONFIDENCE_TOKENS.expected.tintBg, CONFIDENCE_TOKENS.expected.strongColor)}
        {legendChip("섞임", MIXED_BG, "#111110")}
        {legendChip("불일치", "#FCE9E9", "#8F2C2C")}
      </span>
    </div>
  )

  const emptyBox = "rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-6 py-10 text-center text-[13px] text-[#615D59]"

  let body: ReactNode
  if (ledger.lines.length === 0) {
    body = <p className={emptyBox}>이 범위에 이번 회계연도 매출이 없습니다.</p>
  } else if (visible.length === 0) {
    body = (
      <div className={emptyBox}>
        <p>조건에 맞는 고객이 없습니다.</p>
        <button type="button" onClick={reset} className={`mt-3 ${outlineBtn(false)}`}>초기화</button>
      </div>
    )
  } else {
    const goalLines = ledger.lines
    body = (
      <div className="max-h-[calc(100dvh-13rem)] min-h-[20rem] overflow-auto rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[12px] tabular-nums" style={{ minWidth: tableWidth }}>
          <colgroup>
            <col style={{ width: MATRIX_WIDTH.customer }} />
            <col style={{ width: MATRIX_WIDTH.product }} />
            {leadDefs.map((def) => <col key={def.key} style={{ width: def.width }} />)}
            {leaves.map((leaf) => <col key={leaf.key} style={{ width: leaf.width }} />)}
            <col />
          </colgroup>
          <thead>
            <tr>
              {textHead("customer", "고객", MATRIX_WIDTH.customer, { left: 0, zIndex: 5, borderRight: `1px solid ${LINE}`, textAlign: "left" }, stickyLeftClass)}
              {textHead("product", "제품", MATRIX_WIDTH.product, { left: MATRIX_WIDTH.customer, zIndex: 5, borderRight: `1px solid ${FRAME}`, textAlign: "center" }, stickyLeftClass)}
              {leadDefs.map((def) => textHead(def.key, def.label, def.width, { zIndex: 3, textAlign: "left" }))}
              {leaves.map(renderHeadLeaf)}
              <th scope="col" style={{ position: "sticky", top: 0, zIndex: 3, height: HEAD_H, padding: 0, backgroundColor: "#F6F5F4", borderBottom: `1px solid ${LINE}` }} />
            </tr>
            <tr>
              <th scope="row" className={stickyLeftClass} style={{ position: "sticky", top: HEAD_H, left: 0, zIndex: 5, height: ROW_H, padding: "0 8px", textAlign: "left", backgroundColor: "#F6F5F4", borderBottom: "2px solid #111110", borderRight: `1px solid ${LINE}`, fontWeight: 700, whiteSpace: "nowrap" }}>
                합계 · {visible.length}곳
              </th>
              <td className={stickyLeftClass} style={{ position: "sticky", top: HEAD_H, left: MATRIX_WIDTH.customer, zIndex: 5, height: ROW_H, padding: 0, backgroundColor: "#F6F5F4", borderBottom: "2px solid #111110", borderRight: `1px solid ${FRAME}` }} />
              {leadDefs.map((def) => (
                <td key={def.key} style={{ position: "sticky", top: HEAD_H, zIndex: 3, height: ROW_H, padding: 0, backgroundColor: "#F6F5F4", borderBottom: "2px solid #111110" }} />
              ))}
              {leaves.map(totalCell)}
              <td style={{ position: "sticky", top: HEAD_H, zIndex: 3, height: ROW_H, padding: 0, backgroundColor: "#F6F5F4", borderBottom: "2px solid #111110" }} />
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.key}>
                {grouped ? (
                  <tr>
                    <th scope="rowgroup" colSpan={2} className={`md:sticky ${stickyLeftClass}`} style={{ left: 0, zIndex: 2, height: ROW_H, padding: "0 8px", textAlign: "left", backgroundColor: "#FAF9F6", borderBottom: `1px solid ${LINE}`, borderRight: `1px solid ${FRAME}`, fontWeight: 400, color: "#615D59", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 700, color: "#111110" }}>{section.label}</span> {section.lines.length}곳
                    </th>
                    <td colSpan={labelCols} style={{ backgroundColor: "#FAF9F6", borderBottom: `1px solid ${LINE}` }} />
                    {leaves.map((leaf) => (
                      <td
                        key={leaf.key}
                        className={footClass(leaf)}
                        style={{ height: ROW_H, padding: "0 6px", textAlign: "right", whiteSpace: "nowrap", backgroundColor: "#FAF9F6", borderBottom: `1px solid ${LINE}`, fontWeight: 700, color: "#111110", ...leafEdges(leaf, hasPast), ...(leaf.pinned ? { left: leaf.left, zIndex: 2 } : null) }}
                      >
                        {cell(sum(section.lines, leaf).total, leaf)}
                      </td>
                    ))}
                    <td style={{ backgroundColor: "#FAF9F6", borderBottom: `1px solid ${LINE}` }} />
                  </tr>
                ) : null}
                {section.lines.map(renderLine)}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            {footRows.map((foot) => (
              <tr key={foot.kind}>
                <th scope="row" colSpan={frozenCols} style={{ left: 0, zIndex: 2, height: ROW_H, padding: "0 8px", textAlign: "left", fontWeight: 600, backgroundColor: "#FFFFFF", borderRight: `1px solid ${FRAME}`, borderTop: foot.kind === "confirmed" ? "1px solid rgba(0,0,0,0.12)" : undefined }} className={`md:sticky ${stickyLeftClass} ${CONFIDENCE_TOKENS[foot.kind].textStrongClass}`}>
                  {foot.label}
                </th>
                <td colSpan={labelCols} style={{ borderTop: foot.kind === "confirmed" ? "1px solid rgba(0,0,0,0.12)" : undefined }} />
                {leaves.map((leaf) => {
                  const value = foot.pick(sum(visible, leaf))
                  return (
                    <td key={leaf.key} className={footClass(leaf)} style={footLeafStyle(leaf, { fontWeight: foot.kind === "confirmed" ? 700 : 500, color: "#31302E", borderTop: foot.kind === "confirmed" ? "1px solid rgba(0,0,0,0.12)" : undefined })}>
                      {cell(value, leaf)}
                    </td>
                  )
                })}
                <td />
              </tr>
            ))}
            {monthlyGoals ? (
              <tr>
                <th scope="row" colSpan={frozenCols} title="목표와 같은 모집단(검색·열 필터와 무관)" className={`md:sticky ${stickyLeftClass}`} style={{ left: 0, zIndex: 2, height: ROW_H, padding: "0 8px", textAlign: "left", fontWeight: 700, color: "#111110", backgroundColor: "#FFFFFF", borderRight: `1px solid ${FRAME}`, borderTop: "1px solid #37352F", whiteSpace: "nowrap" }}>
                  월 목표 대비
                </th>
                <td colSpan={labelCols} style={{ borderTop: "1px solid #37352F" }} />
                {leaves.map((leaf) => {
                  const goal = monthGoal(leaf)
                  const diff = goal > 0 ? sumMatrixLeaf(goalLines, leaf).total - goal : 0
                  const good = goal > 0 && diff >= 0
                  return (
                    <td key={leaf.key} className={footClass(leaf)} style={footLeafStyle(leaf, { borderTop: "1px solid #37352F", fontWeight: good ? 700 : 500, color: good ? CONFIDENCE_TOKENS.confirmed.strongColor : "#111110" })}>
                      {goal > 0 ? `${diff >= 0 ? "+" : "−"}${cell(Math.abs(diff), leaf) || "0"}` : "–"}
                    </td>
                  )
                })}
                <td style={{ borderTop: "1px solid #37352F" }} />
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>
    )
  }

  return (
    <section ref={sectionRef} aria-label="장부 표" className="space-y-2">
      {toolbarNode}
      {body}
    </section>
  )
}
