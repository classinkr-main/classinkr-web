"use client"

// 고객 360 드로어 공유 상수·포맷터·소형 아톰.
// Customer360Drawer.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  COMPASS_TIMELINE_SOURCE_LABEL,
  type CompassTimelineEntry,
} from "@/lib/crm/compass-timeline"
import type { CrmDealStage } from "@/lib/repositories/crm-deals"
import type { CrmTaskType } from "@/lib/repositories/crm-tasks"

export const DEAL_STAGE_OPTIONS: Array<{ value: CrmDealStage; label: string }> = [
  { value: "consult", label: "상담" },
  { value: "demo", label: "데모" },
  { value: "quote", label: "견적" },
  { value: "decision", label: "의사결정" },
  { value: "order", label: "오더/설치" },
  { value: "won", label: "완료" },
  { value: "lost", label: "실패" },
]

export const DEAL_STAGE_LABEL: Record<CrmDealStage, string> = {
  consult: "상담",
  demo: "데모",
  quote: "견적",
  decision: "의사결정",
  order: "오더/설치",
  won: "완료",
  lost: "실패",
}

// 섹션 점프 탭 — 활동 승격 스펙: 탭 표시·DOM 등장 순서 모두 요약→활동→할일→딜→머니.
// 스크롤 스파이는 이 배열 순서로 '마지막 통과' 판정을 하므로 실제 렌더 순서와 함께 맞춘다.
export const C360_SECTION_DOM_ORDER = ["c360-summary", "c360-activity", "c360-tasks", "c360-deal", "c360-money"] as const

export const SERVICE_RISK_LABEL: Record<string, string> = {
  urgent: "긴급",
  soon: "임박",
  watch: "주시",
  normal: "정상",
}

export const SERVICE_RISK_CLASS: Record<string, string> = {
  urgent: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
  soon: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  watch: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  normal: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
}

export const CONFIDENCE_LABEL: Record<string, string> = { high: "신뢰 높음", medium: "신뢰 보통", low: "신뢰 낮음" }

export const TASK_TYPE_OPTIONS: Array<{ value: CrmTaskType; label: string }> = [
  { value: "call", label: "전화" },
  { value: "kakao", label: "카카오" },
  { value: "email", label: "이메일" },
  { value: "meeting", label: "미팅" },
  { value: "quote", label: "견적" },
  { value: "demo", label: "데모" },
  { value: "install", label: "설치" },
  { value: "renewal", label: "갱신" },
  { value: "cs_checkin", label: "CS 점검" },
  { value: "data_fix", label: "데이터 정리" },
  { value: "other", label: "기타" },
]

// 고정 컴포저 본문 textarea id — 헤더 '활동 기록'·추천 '메모 남기기' CTA의 포커스 대상.
// 콜/문자/메모/회의록 입력은 전부 고정 컴포저(ActivityQuickForm)가 담당한다(구 인라인 폼 제거).
export const COMPOSER_BODY_ID = "c360-composer-body"

export function sumAmounts(values: Array<number | null | undefined>): number | null {
  let total = 0
  let seen = false
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue
    total += value
    seen = true
  }
  return seen ? total : null
}

// 제품 매출 타일 — SW/HW 결제 누적(¥ CNY)·칠판 대수(대). REV/HW 원장을 계정키로 조인한 값.
// matched=false면 "—"로 흐리게 표기(연결 없음). 통화 칩(¥/대)으로 SW·HW·대수 오독을 막는다.
export function ProductTile({
  label,
  chip,
  display,
  matched,
}: {
  label: string
  chip: string
  display: string
  matched: boolean
}) {
  return (
    <div className="rounded-xl bg-[#fafaf8] px-3 py-2.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-[#1a1a1a]/45">{label}</span>
        <span className="rounded-full bg-white px-1 py-0.5 text-[9px] font-bold text-[#1a1a1a]/40">{chip}</span>
      </div>
      <p className={`mt-1 text-[15px] font-bold ${matched ? "text-[#111110]" : "text-[#1a1a1a]/30"}`}>
        {matched ? display : "—"}
      </p>
    </div>
  )
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date)
}

export function formatDay(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date)
}

export function formatAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("ko-KR").format(value)
}

// 다가오는 일정 — 예정 콜/미팅 날짜 상대 표기.
export function dueRelativeLabel(value: string | null | undefined): string {
  if (!value) return "기한 미정"
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return "기한 미정"
  const now = new Date()
  const dayMs = 86_400_000
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((dueDay - todayDay) / dayMs)
  if (diff === 0) return "오늘"
  if (diff === 1) return "내일"
  return `D-${diff}`
}

export function monthDayParts(value: string | null | undefined): { month: string; day: string } {
  if (!value) return { month: "", day: "-" }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { month: "", day: "-" }
  return { month: `${date.getMonth() + 1}월`, day: String(date.getDate()) }
}

// 비핵심 섹션 — 기본 접힘. 첫 화면은 핵심만, 필요할 때 펼쳐 보는 컴팩트 패턴.
export function CollapsibleSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/45">
          {icon}
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#1a1a1a]/35 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? <div id={contentId} className="mt-3">{children}</div> : null}
    </section>
  )
}

export function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/45">
      {icon}
      {children}
    </h3>
  )
}

/**
 * Compass(마케팅팀 앱) 활동 한 줄. 우리 원장 기록과 섞이므로 소스 라벨을 항상 붙인다.
 * actor 는 표시용 문자열 — Compass는 공용 계정 앱이라 신원 증거가 아니다(매핑 금지).
 * 장문은 3줄로 접고 펼칠 수 있게 한다.
 */
export function CompassTimelineRow({ entry }: { entry: CompassTimelineEntry }) {
  const [expanded, setExpanded] = useState(false)
  const body = entry.body
  const isLong = Boolean(body && (body.length > 120 || body.split("\n").length > 3))

  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[#2F5D8C]/25 text-[10px] font-bold text-[#2F5D8C]">
        C
      </span>
      <div className="min-w-0 flex-1 border-b border-[#f5f5f2] pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#2F5D8C]">
            {COMPASS_TIMELINE_SOURCE_LABEL} · {entry.kindLabel}
          </span>
          <span className="text-[11px] text-[#1a1a1a]/35">{formatDate(entry.occurredAt)}</span>
          {entry.actor ? <span className="text-[11px] text-[#1a1a1a]/35">· {entry.actor}</span> : null}
        </div>
        {body ? (
          <>
            <p
              className={`mt-0.5 whitespace-pre-wrap text-[12px] text-[#1a1a1a]/55 ${
                isLong && !expanded ? "line-clamp-3" : ""
              }`}
            >
              {body}
            </p>
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="mt-0.5 text-[11px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
              >
                {expanded ? "접기" : "펼치기"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  )
}
