// 현황 "오늘 연락"(C안 ①, 2026-09-25) — 서버(저장소·라우트)와 화면(패널)이 함께 쓰는 계약 타입.
// 순수 타입 파일이다(I/O·server-only·"use client" 없음). 계산 규칙은 lib/crm/today-contact-queue.ts,
// 원천 조립은 lib/repositories/crm-today-contacts.ts 가 맡는다. 이 파일을 바꾸면 두 쪽을 함께 본다.
//
// 원칙(A안 기본 + Compass 관계는 기존 방식):
//  - 리드 응대·전화는 Compass 에서 한다. Compass 에 매칭된 리드 행의 주 행동은 "Compass에서 열기"뿐이다.
//  - Home 에 쓰는 것은 Home 자기 테이블(crm_customer_events·crm_tasks·lead_contact_logs·leads.follow_up_at)뿐.
//    Compass(crm 스키마)·외부 NeoCRM 에는 쓰지 않는다(교차 쓰기 0).
//  - 진행률은 아침 목록을 저장하지 않아 추정이다(approximate: true — 화면이 그 사실을 밝힌다).

import type { ContactLogResult, ContactLogType } from "@/lib/supabase/database.types"
import type { NextContactKind } from "@/lib/crm/customer-contact-summary"
import type { LastContactSource } from "@/lib/crm/last-contact"
import type { CrmPrioritySeverity } from "@/lib/crm/priority"
import type { TodayCallSlotKey } from "@/lib/crm/today-calls"

/** 행이 오늘 목록에 오른 사유. 한 행에 여러 개가 붙을 수 있다(같은 고객이 여러 원천에 걸림). */
export type TodayContactReasonKind =
  | "first_response" // 우선순위 엔진: 신규 리드 첫 응답(bucket=today)
  | "follow_up" // 리드 follow_up_at 이 오늘 끝 이전(지난 것 포함)
  | "task" // 활성 할 일 기한 도래(지난 것 포함) 또는 기한 없는 긴급·높음
  | "compass_next_action" // Compass 다음 액션 next_action_at 이 [오늘-14일, 오늘 끝]
  | "account_expiry" // NEO 계정 만료 회복·연장(엔진 bucket=today)
  | "account_balance" // NEO 계정 재충전·소진(엔진 bucket=today)
  | "demo" // Compass 데모 신호(엔진)
  | "revisit" // 연락 후 재방문(엔진)
  | "reinflow" // 재문의(재유입) 뒤 아직 연락 없음

export interface TodayContactReason {
  kind: TodayContactReasonKind
  /** 칩 문구(예: "팔로업 · 2일 지남", "만료 D-5", "Compass 다음 액션 · 14:00") */
  label: string
  /** 보조 설명 — Compass 다음 액션 문구는 최대 60자로 잘라서만 싣는다(원문 복제 금지). */
  detail: string | null
  dueAt: string | null
  overdue: boolean
  /** 원천 참조 — 'lead:<id>' | 'task:<id>' | 'compass:<id>' | 'neo:<id>' | 'customer:<id>' | 'deal:<id>' */
  sourceRef: string
}

export type TodayContactEntityType = "lead" | "neo_account" | "customer" | "deal" | "compass_lead" | "task"

/**
 * 행의 주 행동:
 *  - open_compass: Compass 에 매칭된 리드 · Compass 전용 행 — "Compass에서 열기"만(Home 쓰기 버튼 없음)
 *  - record_outcome: NEO 계정·전환 고객·딜 — Home 에서 결과 → 다음 일정 기록(Compass 에 계정 개념 없음)
 *  - record_outcome_lead: Compass 에 매칭되지 않은 Home 리드(직접 문의 등) — 같은 폼, 서버는 리드 연락 경로
 *  - complete_task: 대상 없는 할 일 — 완료·미루기
 */
export type TodayContactPrimaryAction = "open_compass" | "record_outcome" | "record_outcome_lead" | "complete_task"

export type TodayContactHandledKind = "contact_logged" | "compass_activity" | "task_done" | "task_snoozed" | "rescheduled"

export interface TodayContactHandled {
  kind: TodayContactHandledKind
  at: string
  by: string | null
  source: "home" | "compass"
  /** 다음 일정(있으면) */
  nextAt: string | null
  /** 기록으로 재구성한 추정인지(미루기·팔로업 이동은 원래 기한이 남지 않아 추정) */
  approximate: boolean
}

export interface TodayContactLastContact {
  at: string
  source: LastContactSource
  channelLabel: string
  actor: string | null
}

export interface TodayContactCompassRef {
  leadId: number
  url: string
  stageLabel: string | null
  owner: string | null
  nextActionAt: string | null
}

export interface TodayContactRow {
  /** 병합 키 = 360 드로어 키와 같은 접두어(lead:·neo:·customer:·deal:·compass:·task:) */
  key: string
  entityType: TodayContactEntityType
  entityId: string
  title: string
  subtitle: string | null
  ownerName: string | null
  ownerKeys: string[]
  lane: TodayCallSlotKey
  laneLabel: string
  severity: CrmPrioritySeverity
  /** 상대 점수 — 금액처럼 표시하지 않는다 */
  score: number
  /** overdue 먼저 → dueAt 오름차순. reasons[0] 이 대표 사유 */
  reasons: TodayContactReason[]
  dueAt: string | null
  overdue: boolean
  /** 같은 기관 중복을 접은 수(1 이면 접지 않음) */
  groupedCount: number
  isMetaLead: boolean
  lastContact: TodayContactLastContact | null
  nextContact: { at: string; kind: NextContactKind } | null
  compass: TodayContactCompassRef | null
  primaryAction: TodayContactPrimaryAction
  /** 이 행에 묶인 열린 할 일 id(결과 저장 시 함께 닫을 후보) */
  openTaskIds: string[]
  handled: TodayContactHandled | null
  /** 보조 링크(리드 보드·원천 고객·할 일) */
  href: string
  /** NEO 값 기준 시각(계정 행만) — 동기화가 멈췄으면 화면이 "NEO 값 MM-DD 기준" 캡션 */
  neoAsOf: string | null
}

export interface TodayContactLaneProgress {
  total: number
  handled: number
}

export interface CrmTodayContacts {
  generatedAt: string
  /** KST YYYY-MM-DD */
  dateKey: string
  progress: {
    total: number
    handled: number
    remaining: number
    overdue: number
    byLane: Record<TodayCallSlotKey, TodayContactLaneProgress>
    /** Compass 에서 오늘 처리된 메타 리드 수(기한 재구성 불가라 분모에서 뺀다) */
    compassHandledToday: number
    approximate: true
  }
  counts: {
    bySource: Record<TodayContactReasonKind, number>
    /** 14일보다 오래 지난 Compass 다음 액션 — 목록에 올리지 않고 건수만(Compass 에서 정리) */
    compassOverdueBeyondLookback: number
  }
  rows: TodayContactRow[]
  /** 사유가 첫 응답뿐인 메타 광고 리드는 목록 대신 이 밴드로(건수·오늘·상위 4) */
  meta: {
    total: number
    today: number
    top: Array<Pick<TodayContactRow, "key" | "title" | "dueAt" | "href" | "compass">>
  }
  owners: Array<{ ownerName: string; count: number }>
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    tasksOk: boolean
    homeContactsOk: boolean
    compass: "ok" | "down" | "partial"
    neoSync: { latestSyncedAt: string | null; stale: boolean }
    warnings: string[]
  }
  truncated: {
    rows: boolean
    limit: number
    /**
     * 자르기 전 목록 행 수(includeHandled 반영) — "불러오지 않은 N건" = totalRows − 받은 행 수. progress.total 은 같은 기관으로
     * 접은 리드까지 센 대상 수라 행 수가 아니다. (옵셔널 추가, 2026-09-26 — 옛 응답에는 없다)
     */
    totalRows?: number
  }
}

// ── 결과 기록(POST /api/admin/crm/home/today-contacts/outcome) ──────────────────────────────

export type TodayContactOutcomeTargetType = "neo_account" | "customer" | "deal" | "lead"

export type TodayContactNextSchedule =
  | { preset: "tomorrow_9" | "in3_10" | "next_monday_10" }
  | { dueAt: string }

export interface TodayContactOutcomeRequest {
  /** 클라이언트가 만든 uuid — 멱등 키(기록 sourceId = 'today-contact:<requestId>') */
  requestId: string
  /** contact = 연락 결과 기록 / snooze = 기록 없이 다음 일정만 */
  mode: "contact" | "snooze"
  target: { type: TodayContactOutcomeTargetType; id: string; label: string }
  channel?: ContactLogType
  /** call·sms 만 결과를 갖는다(카톡·이메일은 버린다 — contact-log 규칙) */
  result?: ContactLogResult | null
  /** ≤500자 */
  memo?: string
  next: TodayContactNextSchedule | null
  /** 다음 일정 할 일 제목(기본: 사유 기반 — "연장 제안 후속"·"재충전 안내 후속"·"만료 회복 연락"·"재연락") */
  nextTitle?: string
  /** 함께 완료할 이 행의 열린 할 일(≤10, 대상이 일치하는 것만 서버가 닫는다) */
  closeTaskIds?: string[]
}

export interface TodayContactOutcomeResponse {
  /** 같은 requestId 재전송 — 새로 쓰지 않았다 */
  duplicate: boolean
  event: { id: string; occurredAt: string } | null
  contactLogId: string | null
  nextTask: { id: string; dueAt: string } | null
  followUpAt: string | null
  /**
   * 리드 행: 이 저장 직전의 follow_up_at(null = 없었음) — 되돌리기(DELETE)의 previousFollowUpAt 으로 그대로 돌려보낸다.
   * (K1 옵셔널 추가, 2026-09-25. 리드가 아니거나 알 수 없으면 생략)
   */
  previousFollowUpAt?: string | null
  closedTaskIds: string[]
  warnings: string[]
}

/** 되돌리기(DELETE, 8초 창) */
export interface TodayContactOutcomeUndoRequest {
  requestId: string
  target: { type: TodayContactOutcomeTargetType; id: string }
  eventId?: string | null
  contactLogId?: string | null
  nextTaskId?: string | null
  closedTaskIds?: string[]
  /** 리드 행: 되돌릴 이전 follow_up_at(null = 비움) */
  previousFollowUpAt?: string | null
}

export interface TodayContactOutcomeUndoResponse {
  ok: boolean
  warnings: string[]
}
