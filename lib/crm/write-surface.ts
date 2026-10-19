// 기록 위치 판정(A안 "기록은 Compass에서", 2026-09-25) — 고객 360 드로어·상세, 리드 보드(목록·드로어), 기록 탭의
// 리드 포커스, 그리고 C안 ① 오늘 연락 행이 같은 규칙으로 "주 행동이 Compass 링크인가, Home 기록인가"를 정한다.
// 순수 모듈이다(I/O·server-only·"use client" 없음) — 화면·서버·테스트가 그대로 import 한다.
//
// 원칙:
//  - Compass → Home 단방향 읽기. 새로 생기는 것은 Compass 새 탭 링크뿐이고 Home 쓰기 경로는 바뀌지 않는다
//    (교차 쓰기 0). Home 에 따로 남긴 기록은 Compass 담당자에게 보이지 않는다 — 화면은 그 사실을 캡션으로 밝힌다.
//  - 매칭은 전화 키 하나뿐(추측 매칭 금지). 매칭을 모르는 상태(로딩·옛 캐시·호출부가 Compass 정보를 안 넘김)는
//    지금 화면(Home 기록이 주 행동)과 같게 둔다.
//
// 판정 규칙(위에서부터 먼저 맞는 것):
//  1. source 없음 또는 found=false            → home / unknown
//  2. NEO 계정                                 → home / neo_account   (같은 전화의 Compass 리드는 보조 링크)
//  3. 리드인데 전환(converted) 또는 NEO 등록 확정 → home / converted_lead (고객이 된 뒤는 Home 이 정본, 보조 링크)
//  4. 리드이고 Compass 링크 있음(단계 무관 — 결제·이탈·BD 포함) → compass / compass_lead
//     활동 조회만 끊긴 경우(down=true 인데 href 있음)도 매칭은 확인됐으므로 compass 다.
//  5. 리드이고 Compass 연결 끊김 + 링크 없음    → home / compass_down (캡션으로 알린다 — 0 과 구분)
//  6. 그 밖(Compass 에 없는 리드)               → home / no_compass_match

import type { LeadStatus } from "@/lib/supabase/database.types"

export type CrmWriteSurface = "compass" | "home"

export type CrmWriteSurfaceReason =
  | "compass_lead"
  | "neo_account"
  | "converted_lead"
  | "no_compass_match"
  | "compass_down"
  | "unknown"

export interface CrmWriteSurfaceInput {
  source: "lead" | "neo_account" | null | undefined
  /** 360 found — 없으면(undefined) 찾은 것으로 본다(리드 보드처럼 레코드를 이미 들고 있는 호출부). */
  found?: boolean
  /** 대표 Compass 리드 딥링크(lib/compass/normalize compassLeadUrl). 매칭이 없으면 null. */
  compassHref: string | null | undefined
  /** Compass 브리지 끊김 — "매칭 없음"과 다른 사실이다. */
  compassDown?: boolean
  leadStatus?: LeadStatus | null
  /** 리드 → NEO 계정 등록 확정(crm_source_links confirmed) */
  crmRegistered?: boolean
}

export interface CrmWriteSurfaceResult {
  surface: CrmWriteSurface
  reason: CrmWriteSurfaceReason
  /** 입력 링크(공백 정리). surface 와 무관하게 그대로 넘긴다. */
  compassHref: string | null
  /** surface=home 인데 같은 전화의 Compass 기록이 있으면 보조 링크("Compass 기록 ↗") — 그 외 null. */
  secondaryCompassHref: string | null
}

/** "Compass에서 열기"는 components/admin/compass/CompassOpenLink 의 COMPASS_OPEN_LABEL 을 쓴다(한 곳). */
export const COMPASS_RECORD_LABEL = "Compass 기록"
export const HOME_SEPARATE_LOG_LABEL = "Home에 따로 남기기"
export const COMPASS_WRITE_TITLE = "기록은 Compass에서"
export const COMPASS_WRITE_HINT = "콜·문자·미팅은 Compass에 남기면 마지막 연락·타임라인에 반영됩니다."
export const HOME_ONLY_CAPTION = "Home에만 저장됩니다 — Compass 담당자에게는 보이지 않습니다."
export const COMPASS_DOWN_WRITE_CAPTION = "Compass 연결 끊김 — 응대 위치를 확인할 수 없어 Home 기록을 엽니다."

function cleanHref(href: string | null | undefined): string | null {
  const value = href?.trim()
  return value ? value : null
}

function result(surface: CrmWriteSurface, reason: CrmWriteSurfaceReason, compassHref: string | null): CrmWriteSurfaceResult {
  return {
    surface,
    reason,
    compassHref,
    secondaryCompassHref: surface === "home" ? compassHref : null,
  }
}

export function resolveCrmWriteSurface(input: CrmWriteSurfaceInput): CrmWriteSurfaceResult {
  const compassHref = cleanHref(input.compassHref)
  if (!input.source || input.found === false) return result("home", "unknown", compassHref)
  if (input.source === "neo_account") return result("home", "neo_account", compassHref)
  if (input.leadStatus === "converted" || input.crmRegistered === true) {
    return result("home", "converted_lead", compassHref)
  }
  if (compassHref) return result("compass", "compass_lead", compassHref)
  if (input.compassDown === true) return result("home", "compass_down", null)
  return result("home", "no_compass_match", null)
}

export interface LeadBoardWriteSurfaceInput {
  leadStatus: LeadStatus | null | undefined
  /** 보드 Compass 오버레이 항목의 url(CompassOverlayEntry.url). 매칭이 없으면 null/undefined. */
  compassHref: string | null | undefined
  compassDown?: boolean
  /** 리드 → NEO 계정 등록 확정 — 고객 360 의 crmRegistered 와 같은 링크 집합(GET /api/admin/crm/leads/neo-registered). */
  crmRegistered?: boolean
}

/**
 * 리드 보드 공용 판정 — 목록(모바일 카드·데스크톱 "연락 기록" 알약)과 리드 드로어가 이 함수 하나로 같은 입력을
 * 넘긴다. 그래서 한 리드를 목록은 "Compass 정본", 드로어는 "Home 정본"으로 안내하는 갈림이 생기지 않는다.
 * 보드는 레코드를 이미 들고 있으므로 found=true 다. 전환(converted)·NEO 등록 확정 리드는 Compass 매칭이 있어도
 * Home 정본(규칙 3)이고, 360(드로어·상세·기록 탭)과 같은 판정이 된다.
 */
export function resolveLeadBoardWriteSurface(input: LeadBoardWriteSurfaceInput): CrmWriteSurfaceResult {
  return resolveCrmWriteSurface({
    source: "lead",
    found: true,
    compassHref: input.compassHref,
    compassDown: input.compassDown === true,
    leadStatus: input.leadStatus ?? null,
    crmRegistered: input.crmRegistered === true,
  })
}

/** 편의 — 주 행동이 Compass 링크인가. */
export function isCompassWriteSurface(value: CrmWriteSurfaceResult | null | undefined): boolean {
  return value?.surface === "compass"
}
