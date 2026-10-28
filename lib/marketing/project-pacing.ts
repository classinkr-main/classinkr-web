// lib/marketing/project-pacing.ts
// 마케팅 프로젝트 페이싱 — 기간 경과 대비 예산 소진(순수 함수, DB 접근·부수효과 없음).
// 갤러리 카드(ProjectGalleryCard)와 상세 패널의 "예산 페이싱" 섹션이 같은 판정을 공유한다(SSOT).
//
// 판정 규칙:
//  - 기간 경과 = (오늘 − 시작) / (종료 − 시작), 0~100 으로 클램프. 시작·종료 중 하나라도 없으면 null.
//  - 오늘은 호출부가 KST 일자(YYYY-MM-DD)로 주입한다 — 서버·브라우저 TZ 와 무관하게 같은 값을 낸다.
//  - 소진%는 project-rollup 의 spentPct 를 그대로 받는다. 예산 미배정(null)이면 페이싱을 만들지
//    않는다(거짓 0% 금지 — 소진 원천의 정직 규칙은 project-rollup 이 정본).
//  - 소진% − 경과% 가 ±PACE_TOLERANCE_PP 를 넘으면 빠름/느림. 100% 초과는 "배정 예산 초과"가 우선한다.

import type { ProjectStatus } from "@/lib/types/marketing-campaign"

const DAY_MS = 86_400_000

// 소진%와 경과%의 차가 이 폭(%p) 안이면 "일정에 맞는 소진"으로 본다.
export const PACE_TOLERANCE_PP = 15
// 종료까지 남은 일수가 이 값 이하이면 D-day 를 경고 톤으로 올린다.
export const DDAY_SOON_DAYS = 14

// 톤은 의미만 말한다 — 색 토큰 매핑은 UI(ProjectCard)가 DESIGN.md 팔레트로 한다.
export type DdayTone = "muted" | "upcoming" | "normal" | "soon"
export type PaceTone = "muted" | "ok" | "warn" | "slow"

export interface ProjectPacingInput {
  status: ProjectStatus
  startsAt: string | null
  endsAt: string | null
  spentPct: number | null // rollup.spentPct — 예산 미배정이면 null
}

export interface ProjectPacing {
  elapsedPct: number | null // 0~100. 기간이 열려 있으면(시작·종료 중 하나라도 없음) null
  todayInRange: boolean // 시작 ≤ 오늘 ≤ 종료 — 상세의 "오늘" 눈금을 그릴지
  dday: { label: string; tone: DdayTone }
  pace: { label: string; tone: PaceTone }
}

// "YYYY-MM-DD"(ISO 앞 10자리) → UTC 자정 기준 일 번호. 형식이 아니면 null — 날짜를 추측하지 않는다.
function dayNumber(value: string | null): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
}

// 하루짜리 기간(종료 ≤ 시작)은 0 나눗셈 대신 시작일부터 100% 로 본다.
function elapsedBetween(start: number, end: number, today: number): number {
  if (end <= start) return today >= start ? 100 : 0
  return Math.max(0, Math.min(100, Math.round(((today - start) / (end - start)) * 100)))
}

function ddayOf(
  status: ProjectStatus,
  start: number | null,
  end: number | null,
  today: number,
): ProjectPacing["dday"] {
  // 완료로 닫은 프로젝트는 종료일이 남아 있어도 카운트다운하지 않는다(조기 종료 포함).
  if (status === "done") return { label: "종료", tone: "muted" }
  if (start != null && start > today) return { label: `시작 D-${start - today}`, tone: "upcoming" }
  if (end == null) return { label: "종료일 미정", tone: "muted" }
  if (end < today) return { label: "종료", tone: "muted" }
  const left = end - today
  return {
    label: left === 0 ? "D-Day" : `D-${left}`,
    tone: left <= DDAY_SOON_DAYS ? "soon" : "normal",
  }
}

/**
 * 프로젝트 1건의 페이싱 판정. today 는 KST "YYYY-MM-DD"(lib/business-time getBusinessDateParts().date).
 * 판정 우선순위: 완료 → 예산 미배정 → 기간 미정 → 시작 전 → 예산 초과 → 빠름/느림/정상.
 */
export function computeProjectPacing(input: ProjectPacingInput, today: string): ProjectPacing {
  const t = dayNumber(today)
  if (t == null) {
    return {
      elapsedPct: null,
      todayInRange: false,
      dday: { label: "—", tone: "muted" },
      pace: { label: "—", tone: "muted" },
    }
  }

  const start = dayNumber(input.startsAt)
  const end = dayNumber(input.endsAt)
  const hasPeriod = start != null && end != null
  const elapsedPct = hasPeriod ? elapsedBetween(start, end, t) : null
  const todayInRange = hasPeriod && start <= t && t <= end
  const dday = ddayOf(input.status, start, end, t)
  const { spentPct } = input

  let pace: ProjectPacing["pace"]
  if (input.status === "done") {
    pace = { label: "완료된 프로젝트", tone: "muted" }
  } else if (spentPct == null) {
    pace = { label: "예산 미배정 · 페이싱 없음", tone: "muted" }
  } else if (elapsedPct == null) {
    const missing = start == null && end == null ? "기간 미정" : end == null ? "종료일 미정" : "시작일 미정"
    pace = { label: `${missing} · 페이싱 없음`, tone: "muted" }
  } else if (start != null && start > t) {
    pace = { label: "시작 전", tone: "muted" }
  } else if (spentPct > 100) {
    pace = { label: "배정 예산 초과", tone: "warn" }
  } else {
    const diff = spentPct - elapsedPct
    if (diff > PACE_TOLERANCE_PP) pace = { label: `일정보다 빠른 소진 (+${diff}%p)`, tone: "warn" }
    else if (diff < -PACE_TOLERANCE_PP) pace = { label: `일정보다 느린 소진 (${diff}%p)`, tone: "slow" }
    else pace = { label: "일정에 맞는 소진", tone: "ok" }
  }

  return { elapsedPct, todayInRange, dday, pace }
}
