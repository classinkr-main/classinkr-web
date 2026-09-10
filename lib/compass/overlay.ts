// Compass 오버레이 — 브리지 원본 행(compass_leads_v)을 어드민 화면이 겹쳐 그릴 수 있는
// 최소 페이로드로 접는다. 클라이언트/서버 양쪽에서 안전하다("server-only" 미포함).
//
// 계약:
//  * 병합 금지·병기만 — 여기서 만드는 값은 어떤 자체 리드 필드도 덮어쓰지 않는다.
//    화면은 우리 상태 옆에 Compass 상태를 나란히 보여줄 뿐이다.
//  * 키는 normalizePhoneKey 산출값 하나뿐이다. 이메일 조인은 뷰가 email_key를 주지만
//    Compass 리드의 이메일 채움률이 낮아(콜 중심 원장) 전화 키만 계약으로 삼는다.
//  * 장문(note/memo/next_action 본문)은 싣지 않는다 — 어드민에 Compass 텍스트를 복제하지 않는다.

import {
  COMPASS_CARE_STAGE_LABEL,
  COMPASS_STAGE_LABEL,
  compassLeadUrl,
  normalizePhoneKey,
} from "@/lib/compass/normalize"

/** 오버레이가 읽는 필드만 추린 구조적 입력. CompassLeadRow가 그대로 만족한다. */
export interface CompassOverlaySource {
  id: number
  academy?: string | null
  name?: string | null
  phone_key?: string | null
  stage?: string | null
  owner?: string | null
  caller?: string | null
  care_stage?: string | null
  care_track?: string | null
  next_action_at?: string | null
  demo_at?: string | null
  callback_at?: string | null
  bd_owner?: string | null
  bd_paid_at?: string | null
  neocrm_registered_at?: string | null
  last_inflow_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  meta_ad_id?: string | null
}

/** 카드 칩 한 개를 그리는 데 필요한 전부. 전화 원문·장문 메모는 포함하지 않는다. */
export interface CompassOverlayEntry {
  compassLeadId: number
  academy: string | null
  name: string | null
  stage: string | null
  careStage: string | null
  owner: string | null
  caller: string | null
  bdOwner: string | null
  nextActionAt: string | null
  demoAt: string | null
  neocrmRegisteredAt: string | null
  lastInflowAt: string | null
  url: string
}

export type CompassOverlayMap = Record<string, CompassOverlayEntry>

/** 오버레이 API 응답 계약. down=true면 화면은 칩을 그리지 않고 "연결 끊김"으로 강등한다. */
export interface CompassOverlayResponse {
  overlay: CompassOverlayMap
  down: boolean
  /** 클라이언트가 보낸 키 수 */
  requested: number
  /** 실제로 매칭된 키 수 */
  matched: number
}

/** 단계 라벨 — 사전에 없는 값이 오면 지어내지 않고 원값을 그대로 보여 준다. */
export function compassStageLabel(stage: string | null | undefined): string | null {
  const key = stage?.trim()
  if (!key) return null
  return COMPASS_STAGE_LABEL[key] ?? key
}

export function compassCareStageLabel(careStage: string | null | undefined): string | null {
  const key = careStage?.trim()
  if (!key) return null
  return COMPASS_CARE_STAGE_LABEL[key] ?? key
}

/**
 * KST 기준 "M/D". Intl 로케일 표기("9. 1.")를 쓰지 않고 직접 만든다 —
 * 칩 폭 예산이 좁고, 런타임 로케일 데이터에 표기가 흔들리면 안 된다.
 */
export function formatCompassDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
}

/** 같은 전화 키에 Compass 리드가 여러 건일 때 어느 행을 대표로 쓸지 정하는 정렬 키. */
function recencyOf(row: CompassOverlaySource): number {
  for (const candidate of [row.last_inflow_at, row.updated_at, row.created_at]) {
    if (!candidate) continue
    const at = new Date(candidate).getTime()
    if (!Number.isNaN(at)) return at
  }
  return 0
}

/**
 * phone_key → 대표 1건 맵.
 *
 * 한 학원이 같은 번호로 여러 번 유입되면 Compass에도 리드가 여러 건 쌓인다. 임의로 고르면
 * 새로고침마다 칩이 바뀌므로 규칙을 고정한다 — 최근성(last_inflow_at → updated_at →
 * created_at) 내림차순, 동률이면 id가 큰 쪽(나중에 만들어진 행).
 */
export function buildCompassOverlayMap(rows: CompassOverlaySource[]): CompassOverlayMap {
  const best = new Map<string, CompassOverlaySource>()
  for (const row of rows) {
    const key = row.phone_key?.trim()
    if (!key) continue
    const current = best.get(key)
    if (!current) {
      best.set(key, row)
      continue
    }
    const delta = recencyOf(row) - recencyOf(current)
    if (delta > 0 || (delta === 0 && row.id > current.id)) best.set(key, row)
  }

  const overlay: CompassOverlayMap = {}
  for (const [key, row] of best) {
    overlay[key] = {
      compassLeadId: row.id,
      academy: row.academy?.trim() || null,
      name: row.name?.trim() || null,
      stage: row.stage?.trim() || null,
      careStage: row.care_stage?.trim() || null,
      owner: row.owner?.trim() || null,
      caller: row.caller?.trim() || null,
      bdOwner: row.bd_owner?.trim() || null,
      nextActionAt: row.next_action_at ?? null,
      demoAt: row.demo_at ?? null,
      neocrmRegisteredAt: row.neocrm_registered_at ?? null,
      lastInflowAt: row.last_inflow_at ?? null,
      url: compassLeadUrl(row.id),
    }
  }
  return overlay
}

export interface CompassChipSummary {
  /** 칩의 주 라벨 — 예: "Compass 컨택". 단계가 비면 "Compass 등록". */
  primary: string
  /** 보조 표기 — 예: ["콜 진소망", "데모 9/1", "BD인계", "NeoCRM 등록됨"]. */
  details: string[]
  /** aria-label·title 용 한 줄 요약. */
  title: string
}

/**
 * 칩 문구 조립. 없는 신호는 만들어 내지 않는다 — 담당이 비면 담당 표기가 없고,
 * 데모 일정이 없으면 데모 조각이 없다.
 */
export function summarizeCompassEntry(entry: CompassOverlayEntry): CompassChipSummary {
  const stage = compassStageLabel(entry.stage)
  const primary = `Compass ${stage ?? "등록"}`

  const details: string[] = []
  // 콜 담당(caller)이 실제 통화 주체라 먼저 본다. 없으면 리드 오너로 떨어진다.
  if (entry.caller) details.push(`콜 ${entry.caller}`)
  else if (entry.owner) details.push(`담당 ${entry.owner}`)

  const demoDay = formatCompassDay(entry.demoAt)
  if (demoDay) details.push(`데모 ${demoDay}`)

  // 단계가 이미 "BD인계"면 같은 말을 두 번 하지 않는다.
  if (entry.stage !== "bd" && entry.bdOwner) details.push(`BD ${entry.bdOwner}`)

  const care = compassCareStageLabel(entry.careStage)
  if (care) details.push(care)

  const nextDay = formatCompassDay(entry.nextActionAt)
  if (nextDay) details.push(`다음 ${nextDay}`)

  if (entry.neocrmRegisteredAt) details.push("NeoCRM 등록됨")

  const who = entry.academy ?? entry.name
  return {
    primary,
    details,
    title: [primary, ...details, who ? `(${who})` : null].filter(Boolean).join(" · "),
  }
}

/** 수기 등록 화면에 띄우는 교차 중복 경고. 차단이 아니라 경고다 — 등록은 그대로 진행된다. */
export interface CompassDuplicateWarning {
  compassLeadId: number
  academy: string | null
  name: string | null
  /** 한글 단계 라벨. 사전에 없는 값은 원값 그대로. */
  stageLabel: string | null
  owner: string | null
  caller: string | null
  lastInflowAt: string | null
  url: string
}

export interface CompassDuplicateReport {
  /** 단건 등록 화면이 그대로 그리는 대표 1건. */
  first: CompassDuplicateWarning | null
  /** 벌크 등록에서 Compass에 이미 있는 입력 행 수. */
  count: number
  /**
   * 브리지 장애로 대조를 못 했는가. true면 "겹치는 리드 없음"이 아니라 "확인 못 함"이다 —
   * 이 둘을 같은 침묵으로 뭉개면 이미 콜이 돌고 있는 학원을 조용히 다시 등록하게 된다.
   */
  down: boolean
}

/**
 * 등록하려는 입력의 전화를 Compass 리드와 대조한다.
 *
 * 자기 테이블 중복 검사(같은 전화가 이미 leads에 있는지)와 **직교**한다. 우리 쪽에는 없어도
 * 마케팅팀이 이미 콜을 돌리고 있을 수 있고, 그때 아무 말 없이 등록하면 같은 원장을 두 팀이
 * 따로 굴리게 된다. 그래서 막지 않고 알린다.
 */
export function buildCompassDuplicateReport(
  inputs: Array<{ phone?: string | null }>,
  rows: CompassOverlaySource[]
): CompassDuplicateReport {
  const overlay = buildCompassOverlayMap(rows)
  let first: CompassDuplicateWarning | null = null
  let count = 0

  for (const input of inputs) {
    const key = normalizePhoneKey(input.phone)
    if (!key) continue
    const entry = overlay[key]
    if (!entry) continue
    count += 1
    if (first) continue
    first = {
      compassLeadId: entry.compassLeadId,
      academy: entry.academy,
      name: entry.name,
      stageLabel: compassStageLabel(entry.stage),
      owner: entry.owner,
      caller: entry.caller,
      lastInflowAt: entry.lastInflowAt,
      url: entry.url,
    }
  }

  // 여기까지 왔다는 건 행을 실제로 받아 봤다는 뜻 — 장애 판정은 조회 계층(호출부)이 한다.
  return { first, count, down: false }
}

/** 화면에 로드된 리드 전화들을 오버레이 조회 키로 접는다(중복 제거·정렬로 요청을 안정화). */
export function toCompassPhoneKeys(leads: Array<{ phone?: string | null }>): string[] {
  const keys = new Set<string>()
  for (const lead of leads) {
    const key = normalizePhoneKey(lead.phone)
    if (key) keys.add(key)
  }
  return Array.from(keys).sort()
}
