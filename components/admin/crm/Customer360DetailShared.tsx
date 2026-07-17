"use client"

import type { ReactNode } from "react"

import type { Customer360Severity } from "@/lib/repositories/crm-customer-360"

// 자세히 보기(360 디테일) 전용 공용 헬퍼·라벨·소프트 프리미티브.
// 드로어(Customer360Drawer)와 같은 어휘를 쓰되, 디테일 화면은 별도 파일이라 충돌 없이 재선언한다.

// ── 날짜 포맷 ──────────────────────────────────────────────────────────
// formatDay: 연·월·일 (YY.MM.DD) · formatDateTime: 월·일 시:분.
export function formatDay(value: string | null | undefined): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

// Deal Lite 예상금액은 내부 Classin 원화(₩). NEO orders($)/잔액·수금·성과(¥)와 절대 섞지 않는다.
export function formatKRW(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `₩${value.toLocaleString("ko-KR")}`
}

// 만료까지 D-day 라벨. 지난 만료는 D+N, 오늘은 D-DAY.
export function expireDdayLabel(value: string | null | undefined): string {
  if (!value) return "-"
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return "-"
  const days = Math.floor((time - Date.now()) / 86_400_000)
  if (days < 0) return `D+${Math.abs(days)}`
  if (days === 0) return "D-DAY"
  return `D-${days}`
}

// null 섞인 금액 합계(통화 동일 가정). 표시 가능한 값이 하나도 없으면 null.
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

// 가장 늦은(max) ISO 시각. lastClassAt 중 최신 수업일 산출 등.
export function latestIso(values: Array<string | null | undefined>): string | null {
  let best: number | null = null
  let bestIso: string | null = null
  for (const value of values) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (Number.isNaN(time)) continue
    if (best == null || time > best) {
      best = time
      bestIso = value
    }
  }
  return bestIso
}

// ── 리스크 라벨·색 (드로어와 동일 어휘) ────────────────────────────────
export const SEVERITY_LABEL: Record<Customer360Severity, string> = {
  critical: "긴급",
  high: "높음",
  medium: "주의",
  low: "안정",
}

export const SEVERITY_CLASS: Record<Customer360Severity, string> = {
  critical: "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]",
  high: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  medium: "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]",
  low: "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55",
}

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

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "신뢰 높음",
  medium: "신뢰 보통",
  low: "신뢰 낮음",
}

// ── 딜 단계 / 상태 라벨 ────────────────────────────────────────────────
export const DEAL_STAGE_LABEL: Record<string, string> = {
  consult: "상담",
  demo: "데모",
  quote: "견적",
  decision: "의사결정",
  order: "오더/설치",
  won: "완료",
  lost: "실패",
}

export const DEAL_STATUS_LABEL: Record<string, string> = {
  open: "진행",
  won: "완료",
  lost: "실패",
}

// 활동(이벤트) 출처 라벨·아이콘은 event-source-meta.tsx SSOT 사용(재선언 금지).

export const SENTIMENT_LABEL: Record<string, string> = {
  positive: "긍정",
  neutral: "중립",
  risk: "위험",
}

// ── 태스크 유형 / 우선순위 / 상태 라벨 ──────────────────────────────────
export const TASK_TYPE_LABEL: Record<string, string> = {
  call: "전화",
  kakao: "카카오",
  email: "이메일",
  meeting: "미팅",
  quote: "견적",
  demo: "데모",
  install: "설치",
  renewal: "갱신",
  cs_checkin: "CS 점검",
  data_fix: "데이터 정리",
  other: "기타",
}

export const TASK_PRIORITY_LABEL: Record<string, string> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급",
}

export const TASK_PRIORITY_CLASS: Record<string, string> = {
  low: "bg-[#f0f0ec] text-[#1a1a1a]/55",
  normal: "bg-[#fafaf8] text-[#1a1a1a]/55",
  high: "bg-[#FBF1E0] text-[#7A520F]",
  urgent: "bg-[#FEF3EE] text-[#B85C33]",
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  open: "열림",
  done: "완료",
  snoozed: "미루기",
  canceled: "취소",
}

// ── 작은 프리미티브 ────────────────────────────────────────────────────
// 라벨 + 값 한 쌍(정의 리스트 셀). 디테일 곳곳의 메타 표기를 단일화.
export function FieldCell({
  label,
  value,
  className = "",
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold text-[#1a1a1a]/35">{label}</p>
      <div className="mt-0.5 text-[13px] font-medium text-[#111110]">{value}</div>
    </div>
  )
}

// 작은 라벨 칩(중립 톤). 태그·속성 표기용.
export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-[#fafaf8] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55 ${className}`}
    >
      {children}
    </span>
  )
}

// 섹션 소제목(아이콘 + 라벨).
export function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/45">
      {icon}
      {children}
    </h3>
  )
}
