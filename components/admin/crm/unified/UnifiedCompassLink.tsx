"use client"

// 통합 고객 행의 "Compass에서 열기" — A안(2026-09-25) Compass 거울. 리드 응대·전화·기록은 Compass
// (mkt.classin.co.kr)에서 하고, 이 목록은 판단·집계만 한다. 그래서 행동은 새 탭 링크 하나다(교차 쓰기 0).
//
// 규칙
//  - row.compass(같은 전화 키의 대표 Compass 리드 — 저장소가 채운다)가 없으면 아무것도 그리지 않는다.
//    Compass 가 끊겨 참조를 못 읽은 경우도 행 단위로는 같다(저장소는 참조 조회의 청크 하나만 끊겨도 전 행을 null 로
//    둔다). 행만 보면 "매칭 없음"과 구분되지 않으므로 끊김은 행이 아니라 목록 위 캡션이 알린다 —
//    ContactSourceCaption 이 meta.compassRefs === "down" 을 "Compass 연결 끊김 — Compass 링크를 표시하지 못함"으로.
//    참조 조회는 활동 조회(meta.compass)와 따로 돌아 활동이 ok 여도 참조만 끊길 수 있다 — meta.compass 만 보면
//    이 경우를 놓친다(2026-09-25 리뷰 P2). 저장소가 compassRefs 를 싣기 전(옛 캐시 스냅샷 포함)에는 캡션이 없다.
//  - URL 은 compassLeadUrl(leadId) 하나만 쓴다 — 응답의 compass.url 문자열을 href 로 그대로 싣지 않고
//    CompassOpenLink 가 id 로 다시 만든다(같은 값, 빌더 하나).
//  - 문구는 공용 판정 resolveCrmWriteSurface(lib/crm/write-surface — 고객 360·리드 보드·오늘 연락과 같은 규칙)로
//    고른다(2026-09-26 교차 리뷰 [25]). Compass 가 정본(surface=compass)이면 주 행동 "Compass에서 열기",
//    Home 이 정본이면 보조 "Compass 기록 ↗".
//      · 리드 행: 전환(converted)·NEO 계정 등록 확정 리드는 Compass 매칭이 있어도 Home 정본(규칙 3). 전환 링크가
//        없어 고객 행으로 접히지 않은 전환 리드(링크 이전 레거시·링크 저장 실패·링크 조회 실패 스냅샷)와 NEO 행이
//        스냅샷에 없어 접히지 않은 등록 리드가 여기 걸린다 — 예전에는 source 만 보고 "Compass에서 열기"를 붙여,
//        같은 리드를 목록은 Compass, 360·리드 보드는 Home 으로 안내했다.
//      · 계정(NEO) 행: 규칙 2 — Home 정본. 전환 고객(customer) 행: 전환 산출물이라 규칙 3 과 같다 — Home 정본.
//    판정 입력:
//      · leadStatus — 행의 원값(UnifiedCompassWriteHints.leadStatus)이 있으면 그것, 없으면 저장소 leadStatusLabel 이
//        converted 에만 주는 statusLabel("전환 완료")로 폴백한다(문구 계약은 테스트가 저장소 소스로 고정).
//      · crmRegistered — 360 의 findConfirmedLeadNeoLink 와 같은 external_account 확정 링크만(neoAccountConfirmed).
//        행의 crmRegistered 는 external_lead 까지 세는 더 넓은 배지라 쓰지 않는다 — 쓰면 external_lead 만 있는
//        리드를 목록은 Home, 360 은 Compass 로 반대 방향 갈림이 생긴다.
//        원천(2026-09-26 검증 [25] 잔여): 저장소가 리드 행에 neoAccountConfirmed 를 실으면 그것이 정본이다(조회 실패한
//        스냅샷은 필드 없음). 필드가 없는 행(옛 캐시 스냅샷·링크 조회 실패)만 리드 보드와 같은
//        GET /api/admin/crm/leads/neo-registered(listConfirmedLeadNeoAccountLinks — 360 과 같은 external_account 확정
//        집합)를 목록 화면이 한 번 읽어(useUnifiedNeoRegisteredLeadIds) neoRegisteredLeadIds 로 넘긴다. 행에
//        neoAccountConfirmed 가 실려 오면 그것도 받는다(둘 중 하나라도 참이면 등록 확정). 조회 전·실패는 미등록
//        폴백 — 리드 보드·360 도 같은 조회 실패를 미등록으로 두므로 장애 때도 세 화면이 같은 쪽으로 떨어진다.
//        바뀌는 것은 읽기 전용 링크 문구뿐이다(쓰기 0).
//  - 조상이 <button> 인 자리(카드 전체가 버튼인 레이아웃)에서는 a 를 둘 수 없다 — interactive=false 로
//    링크 대신 비상호작용 표시만 한다(CompassLeadChip 의 interactive=false 와 같은 판단).

import { useEffect, useState } from "react"

import CompassOpenLink, { COMPASS_OPEN_LABEL, resolveCompassOpenHref } from "@/components/admin/compass/CompassOpenLink"
import { adminFetchJson } from "@/lib/admin-client"
import { COMPASS_RECORD_LABEL, resolveCrmWriteSurface, type CrmWriteSurfaceResult } from "@/lib/crm/write-surface"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"
import type { LeadStatus } from "@/lib/supabase/database.types"

export const UNIFIED_COMPASS_RECORD_LABEL = COMPASS_RECORD_LABEL

/**
 * 저장소(lib/repositories/crm-unified-customers.ts leadStatusLabel)가 converted 리드 행에만 주는 statusLabel.
 * 행에 리드 상태 원값이 실리기 전의 폴백 판정 근거다 — 문구가 바뀌면 tests/crm/unified-compass-link 가 깨진다.
 */
export const UNIFIED_LEAD_CONVERTED_STATUS_LABEL = "전환 완료"

/**
 * NEO 계정 등록 확정 리드 id 원천 — 리드 보드(LeadsBoardClient useLeadNeoRegistered)와 같은 라우트.
 * 360 의 crmRegistered(findConfirmedLeadNeoLink)와 같은 external_account 확정 링크 집합이다.
 */
export const UNIFIED_NEO_REGISTERED_ENDPOINT = "/api/admin/crm/leads/neo-registered"

const LEAD_ROW_KEY_PREFIX = "lead:"

/**
 * 공용 판정에 필요한 행 입력 — 저장소가 lead 행에 실어 주면 그대로 쓴다(둘 다 옵셔널, 없으면 폴백·모름).
 * 계약(CrmUnifiedCustomerRow)에 같은 이름의 옵셔널 필드로 추가되면 호출부 변경 없이 흘러든다.
 */
export interface UnifiedCompassWriteHints {
  /** 리드 상태 원값(lead 행만). 없으면 statusLabel 폴백. */
  leadStatus?: LeadStatus | null
  /** 리드 → NEO 계정(external_account) 등록 확정 — 360 findConfirmedLeadNeoLink 와 같은 집합. */
  neoAccountConfirmed?: boolean
}

type CompassSurfaceRow = Pick<CrmUnifiedCustomerRow, "source" | "compass"> &
  Partial<Pick<CrmUnifiedCustomerRow, "statusLabel" | "key">> &
  UnifiedCompassWriteHints

type CompassLinkRow = CompassSurfaceRow & Pick<CrmUnifiedCustomerRow, "name">

/** 링크를 그릴 Compass 리드 id — 참조가 없거나 id 가 링크를 만들 수 없는 값이면 null. */
export function unifiedCompassLeadId(row: Pick<CrmUnifiedCustomerRow, "compass">): number | null {
  const leadId = row.compass?.leadId
  return resolveCompassOpenHref({ compassLeadId: leadId }) ? (leadId as number) : null
}

function unifiedLeadStatus(row: CompassSurfaceRow): LeadStatus | null {
  if (row.leadStatus) return row.leadStatus
  return row.statusLabel === UNIFIED_LEAD_CONVERTED_STATUS_LABEL ? "converted" : null
}

/** lead 행의 Home 리드 id(행 키 `lead:<id>`) — lead 행이 아니거나 키가 없으면 null. */
export function unifiedLeadRowId(row: Pick<CompassSurfaceRow, "source" | "key">): string | null {
  if (row.source !== "lead" || !row.key?.startsWith(LEAD_ROW_KEY_PREFIX)) return null
  const id = row.key.slice(LEAD_ROW_KEY_PREFIX.length)
  return id ? id : null
}

/**
 * 행에 등록 확정 원천(neoRegisteredLeadIds)을 덧입힌다 — 행 값과 원천 중 하나라도 참이면 등록 확정.
 * 원천이 없거나(조회 전·실패) 이 행이 없으면 행을 그대로 돌려준다(미등록 폴백).
 */
export function withUnifiedNeoRegistration<T extends CompassSurfaceRow>(
  row: T,
  neoRegisteredLeadIds: ReadonlySet<string> | null | undefined
): T {
  if (row.neoAccountConfirmed === true || !neoRegisteredLeadIds || neoRegisteredLeadIds.size === 0) return row
  const leadId = unifiedLeadRowId(row)
  return leadId && neoRegisteredLeadIds.has(leadId) ? { ...row, neoAccountConfirmed: true } : row
}

/**
 * 이 행의 문구가 등록 확정 여부로 바뀔 수 있는가 — Compass 링크가 있는 lead 행 중 아직 Home 정본으로 판정되지
 * 않은 것(전환 아님·행 등록 표시 없음). 이런 행이 없으면 원천을 읽지 않는다(불필요한 전체 스캔 방지).
 */
export function unifiedRowNeedsNeoRegistration(row: CompassSurfaceRow): boolean {
  // 저장소가 등록 여부를 실어 보냈으면(참·거짓 모두) 다시 조회할 필요가 없다 — 필드 없음(모름)일 때만 조회한다.
  if (row.source !== "lead" || typeof row.neoAccountConfirmed === "boolean") return false
  if (unifiedCompassLeadId(row) == null || unifiedLeadRowId(row) == null) return false
  return unifiedLeadStatus(row) !== "converted"
}

/** 라우트 응답({ leadIds: string[] })을 id 집합으로 — 모양이 틀리면 null(미등록 폴백, 옛 값 유지). */
export function parseUnifiedNeoRegisteredLeadIds(data: unknown): ReadonlySet<string> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const leadIds = (data as { leadIds?: unknown }).leadIds
  if (!Array.isArray(leadIds)) return null
  return new Set(leadIds.filter((id): id is string => typeof id === "string" && id.length > 0))
}

/**
 * 등록 확정 리드 id 집합을 한 번 읽는다(GET 읽기 전용). 조회 실패·응답 모양 오류는 null — 호출부는 "등록 없음"이
 * 아니라 "모름"으로 받아 직전 값을 유지한다.
 */
export async function fetchUnifiedNeoRegisteredLeadIds(
  fetchJson: (input: string) => Promise<unknown> = (input) => adminFetchJson<unknown>(input)
): Promise<ReadonlySet<string> | null> {
  try {
    return parseUnifiedNeoRegisteredLeadIds(await fetchJson(UNIFIED_NEO_REGISTERED_ENDPOINT))
  } catch {
    return null
  }
}

const EMPTY_LEAD_IDS: ReadonlySet<string> = new Set()

/**
 * 등록 확정 리드 id 집합을 읽는다 — enabled(unifiedRowNeedsNeoRegistration 인 행이 있을 때)일 때만, refreshKey
 * (목록 응답 generatedAt)가 바뀌면 다시 읽는다(360 에서 등록 연결한 뒤 목록 새로고침에 따라온다).
 * 조회 전은 빈 집합(미등록 폴백), 실패는 직전 성공 값을 유지한다(빈 값으로 덮어 "등록 없음"으로 위장하지 않는다).
 */
export function useUnifiedNeoRegisteredLeadIds(enabled: boolean, refreshKey: string | null = null): ReadonlySet<string> {
  const [leadIds, setLeadIds] = useState<ReadonlySet<string>>(EMPTY_LEAD_IDS)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void fetchUnifiedNeoRegisteredLeadIds().then((parsed) => {
      if (!cancelled && parsed) setLeadIds(parsed)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, refreshKey])
  return leadIds
}

/**
 * 행의 기록 위치 판정 — 공용 resolveCrmWriteSurface 그대로(행은 레코드를 이미 들고 있으므로 found=true).
 * 그릴 링크가 없으면 null. 링크는 compassLeadUrl(id) 로 다시 만든 것만 판정에 넘긴다.
 */
export function unifiedCompassWriteSurface(row: CompassSurfaceRow): CrmWriteSurfaceResult | null {
  const leadId = unifiedCompassLeadId(row)
  if (leadId == null) return null
  const compassHref = resolveCompassOpenHref({ compassLeadId: leadId })
  if (row.source === "neo_account") {
    return resolveCrmWriteSurface({ source: "neo_account", found: true, compassHref })
  }
  if (row.source === "customer") {
    // 전환 고객 = 리드 전환의 산출물 — 규칙 3(전환 리드)과 같은 Home 정본.
    return resolveCrmWriteSurface({ source: "lead", found: true, compassHref, leadStatus: "converted" })
  }
  return resolveCrmWriteSurface({
    source: "lead",
    found: true,
    compassHref,
    leadStatus: unifiedLeadStatus(row),
    crmRegistered: row.neoAccountConfirmed === true,
  })
}

/** 행의 Compass 링크 문구 — Compass 정본이면 "Compass에서 열기", Home 정본이면 "Compass 기록". 링크가 없으면 null. */
export function unifiedCompassLinkLabel(row: CompassSurfaceRow): string | null {
  const surface = unifiedCompassWriteSurface(row)
  if (!surface) return null
  return surface.surface === "compass" ? COMPASS_OPEN_LABEL : UNIFIED_COMPASS_RECORD_LABEL
}

export default function UnifiedCompassLink({
  row: rawRow,
  neoRegisteredLeadIds,
  interactive = true,
  variant = "inline",
  className = "",
  linkClassName = "",
}: {
  row: CompassLinkRow
  /**
   * NEO 계정 등록 확정 리드 id(useUnifiedNeoRegisteredLeadIds) — 행 키(`lead:<id>`)로 찾는다. 생략하면 행의
   * neoAccountConfirmed 만 본다(없으면 미등록).
   */
  neoRegisteredLeadIds?: ReadonlySet<string> | null
  /** false = 조상이 button 인 자리 — 링크 대신 표시만(유효하지 않은 DOM·중첩 상호작용 방지). */
  interactive?: boolean
  /** inline = 글자 링크 + 단계 캡션(통합 목록), icon = 좁은 표 칸용 아이콘 링크(문구는 접근성 라벨·title 로만). */
  variant?: "inline" | "icon"
  className?: string
  /** 링크(a)에만 붙는 클래스 — 모바일 카드처럼 본문이 pointer-events-none 인 자리에서 링크만 되살릴 때. */
  linkClassName?: string
}) {
  const row = withUnifiedNeoRegistration(rawRow, neoRegisteredLeadIds)
  const leadId = unifiedCompassLeadId(row)
  const surface = unifiedCompassWriteSurface(row)
  const label = unifiedCompassLinkLabel(row)
  if (leadId == null || !surface || !label) return null
  const stageLabel = variant === "inline" ? (row.compass?.stageLabel ?? null) : null
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 ${className}`}
      data-testid="unified-compass-ref"
      data-write-surface={surface.surface}
    >
      {interactive ? (
        <CompassOpenLink
          compassLeadId={leadId}
          name={row.name}
          variant={variant}
          label={label}
          className={linkClassName}
          testId="unified-compass-open"
        />
      ) : (
        <span className="inline-flex items-center text-[12px] font-medium text-[#615D59]">{label}</span>
      )}
      {stageLabel ? (
        <span className="text-[11px] font-medium text-[#1a1a1a]/40" title="Compass 퍼널 단계">
          · {stageLabel}
        </span>
      ) : null}
    </span>
  )
}
