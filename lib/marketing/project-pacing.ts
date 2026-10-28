// lib/marketing/project-pacing.ts
// 마케팅 프로젝트 페이싱 — 순수 함수(입력 → 출력, DB 접근·부수효과 없음).
// "기간이 얼마나 지났나"와 "배정 예산이 얼마나 소진됐나"를 나란히 놓고 한 줄 판정을 낸다.
// 갤러리 카드(ProjectGalleryCard)와 상세 패널의 예산 페이싱 섹션이 공유한다(SSOT).
//
// 정직 규칙:
//  - 기간 경과는 시작·종료일이 모두 있을 때만 계산한다. 하나라도 없으면 null("—")이지 0%가 아니다.
//  - 소진%는 ProjectRollup.spentPct 를 그대로 쓴다(행사 KRW 광고비 기준 — project-rollup.ts).
//    예산 미배정이면 판정을 내지 않는다(거짓 "일정에 맞음" 금지).
//  - 날짜는 YYYY-MM-DD 를 로컬 자정으로 해석한다 — UTC 파싱이면 KST 오전 9시 전까지 하루 밀린다.

import type { ProjectRollup, ProjectStatus } from "@/lib/types/marketing-campaign"

const DAY_MS = 86_400_000
// 기간 경과 대비 소진 차이가 이 폭(%p)을 넘으면 "빠른/느린 소진"으로 본다.
export const PACE_TOLERANCE_PP = 15

export type PaceTone = "muted" | "neutral" | "good" | "warn"

export interface ProjectPacing {
  elapsedPct: number | null // 0~100 클램프. 시작·종료일 중 하나라도 없으면 null
  ddayLabel: string // "D-12" · "시작 D-5" · "종료" · "종료일 미정"
  ddayTone: "muted" | "neutral" | "strong" | "warn"
  paceLabel: string // 한 줄 판정
  paceTone: PaceTone
  inProgress: boolean // 오늘이 [시작, 종료] 안 — 상세의 "오늘" 세로선 표시 여부
}

/** "YYYY-MM-DD"(또는 ISO 앞 10자리)를 로컬 자정 Date 로. 형식이 아니면 null. */
export function parseLocalDate(value: string | null): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 오늘(로컬) 자정. 테스트·스냅샷은 now 를 주입한다. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** 캡션용 "2026.10.21". */
export function formatDotDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}.${mm}.${dd}`
}

export function computeProjectPacing(
  project: { status: ProjectStatus; startsAt: string | null; endsAt: string | null },
  rollup: Pick<ProjectRollup, "spentPct">,
  today: Date = startOfToday(),
): ProjectPacing {
  const start = parseLocalDate(project.startsAt)
  const end = parseLocalDate(project.endsAt)
  const t = today.getTime()

  let elapsedPct: number | null = null
  if (start && end) {
    const span = end.getTime() - start.getTime()
    // 하루짜리(시작=종료)는 시작 전 0%, 당일 이후 100%.
    const raw = span > 0 ? ((t - start.getTime()) / span) * 100 : t >= start.getTime() ? 100 : 0
    elapsedPct = Math.max(0, Math.min(100, Math.round(raw)))
  }

  const notStarted = start != null && start.getTime() > t
  let ddayLabel = "종료일 미정"
  let ddayTone: ProjectPacing["ddayTone"] = "muted"
  if (notStarted) {
    ddayLabel = `시작 D-${Math.ceil((start.getTime() - t) / DAY_MS)}`
    ddayTone = "neutral"
  } else if (end && end.getTime() < t) {
    ddayLabel = "종료"
  } else if (end) {
    const d = Math.ceil((end.getTime() - t) / DAY_MS)
    ddayLabel = d === 0 ? "D-day" : `D-${d}`
    ddayTone = d <= 14 ? "warn" : "strong"
  }

  const { spentPct } = rollup
  let paceLabel = "—"
  let paceTone: PaceTone = "muted"
  if (project.status === "done") {
    paceLabel = "완료된 프로젝트"
  } else if (spentPct == null) {
    paceLabel = "예산 미배정 · 페이싱 없음"
  } else if (elapsedPct == null) {
    paceLabel = start && !end ? "종료일 미정 · 페이싱 없음" : "기간 미정 · 페이싱 없음"
  } else if (notStarted) {
    paceLabel = "시작 전"
  } else if (spentPct > 100) {
    paceLabel = "배정 예산 초과"
    paceTone = "warn"
  } else {
    const diff = spentPct - elapsedPct
    if (diff > PACE_TOLERANCE_PP) {
      paceLabel = `일정보다 빠른 소진 (+${diff}%p)`
      paceTone = "warn"
    } else if (diff < -PACE_TOLERANCE_PP) {
      paceLabel = `일정보다 느린 소진 (${diff}%p)`
      paceTone = "neutral"
    } else {
      paceLabel = "일정에 맞는 소진"
      paceTone = "good"
    }
  }

  const inProgress = !!(start && end && start.getTime() <= t && end.getTime() >= t)

  return { elapsedPct, ddayLabel, ddayTone, paceLabel, paceTone, inProgress }
}
