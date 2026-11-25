// 장부 초안·반영 항목(entry)의 metadata·sourceSnapshot 판독 — 순수 모듈(클라이언트·서버 겸용).
//
// 장부 화면(components/admin/branch/ledger/{shared.tsx, workbench-shared.tsx, rev-matrix-logic.ts})에 있던
// 헬퍼를 로직 그대로 옮겼다. 그 파일들은 "use client" 라 서버 집계·DSH·대조 스크립트가 부를 수 없었다 —
// 장부 오버레이(lib/branch/ledger-overlay.ts)가 이 모듈만 쓰게 해 화면과 서버가 같은 판독을 공유한다.
// 옛 경로는 같은 이름으로 다시 내보낸다(호출부 무변경).
// server-only·React·브라우저 API 금지.

export type DraftKind = "new-row" | "edit-row"

export type DraftConfidence = "expected" | "high-confidence" | "confirmed"

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// 초안 metadata 문자열 필드 안전 판독 — 워크벤치 본체와 ledger/DraftQueue가 함께 쓴다.
export function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

// 주차 병합 초안의 metadata.weekly(5칸 배열) 검증·정규화. 유효하지 않으면 null.
export function mergedWeeklyFromMetadata(metadata: Record<string, unknown> | null | undefined): number[] | null {
  const weekly = metadata?.weekly
  if (!Array.isArray(weekly) || weekly.length !== 5) return null
  if (!weekly.every((value) => typeof value === "number" && Number.isFinite(value))) return null
  const weeks = weekly.map((value) => Math.max(value, 0))
  return weeks.some((value) => value > 0) ? weeks : null
}

// 라운드 3(P1) — 주차별 확도 개별 기록: metadata.weeklyConfidence(5칸, metadata.weekly와 병렬)
// 검증 판독기. mergedWeeklyFromMetadata와 대칭 규약 —
//   - 필드 부재/무효(배열 아님·길이≠5·무효 원소)는 "없음"(null)으로 판독해 기존 폴백
//     (초안 단위 metadata.confidence — draftConfidenceFromMetadata)을 그대로 태운다(완전 하위호환).
//   - 전 칸 null(신호 없음)도 "없음"으로 본다 — mergedWeekly의 some(>0) 가드와 대칭.
//   - 유효 원소는 null(금액 0/빈 주차) 또는 DraftConfidence 3단뿐이다.
export function weeklyConfidenceFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Array<DraftConfidence | null> | null {
  const raw = metadata?.weeklyConfidence
  if (!Array.isArray(raw) || raw.length !== 5) return null
  if (!raw.every((value) => value === null || isDraftConfidence(value))) return null
  const states = raw.map((value) => (isDraftConfidence(value) ? value : null))
  return states.some((value) => value != null) ? states : null
}

export function isDraftConfidence(value: unknown): value is DraftConfidence {
  return value === "expected" || value === "high-confidence" || value === "confirmed"
}

export function draftConfidenceFromMetadata(metadata: Record<string, unknown> | null | undefined): DraftConfidence {
  const raw = metadataString(metadata, "confidence")?.replace("_", "-")
  return isDraftConfidence(raw) ? raw : "expected"
}

// metadata.week 문자열("w1".."w5") → 0~4 인덱스. "month"/그 외/누락이면 null.
export function weekIndexFromToken(token: string | null | undefined): number | null {
  if (!token) return null
  const match = /^w([1-5])$/.exec(token)
  return match ? Number(match[1]) - 1 : null
}

// 적용된 초안행의 weeklyPayments 구성. draft metadata.week가 wN이면 그 주차에 금액을 얹어
// { [month]: [.., amount, ..] }를 만든다(주차 합==월합이라 rowWeeklyMismatch 오탐 없음).
// week가 "month"/누락이면 주차 정보 없음 → {} (기존 동작 유지, month-only로 렌더).
function weeklyPaymentsFromWeekToken(month: string, amount: number, weekToken: string | null | undefined): Record<string, number[]> {
  const weekIdx = weekIndexFromToken(weekToken)
  if (weekIdx == null) return {}
  const weeks = Array.from({ length: 5 }, (_, index) => (index === weekIdx ? amount : 0))
  return { [month]: weeks }
}

// 적용된 초안행의 weeklyPayments 복원: 주차 병합 초안(metadata.weekly)이 있으면 그 배열을
// 그대로(단일 주차 토큰보다 우선) 쓴다 — explicit 주차 행의 주차 셀 편집이 나머지 주차를
// 보존(월 금액=주차 합 재기재)하기 위한 경로. 없으면 기존 단일 주차 토큰 규약으로 폴백.
export function weeklyPaymentsFromDraftMetadata(
  month: string,
  amount: number,
  metadata: Record<string, unknown> | null | undefined,
): Record<string, number[]> {
  const merged = mergedWeeklyFromMetadata(metadata)
  if (merged) return { [month]: merged }
  return weeklyPaymentsFromWeekToken(month, amount, metadataString(metadata, "week"))
}

/** 적용 초안·반영 항목 한 건이 행에 싣는 확도 맵(그 달 키 하나). */
export interface DraftConfidenceMaps {
  monthlyConfirmed: Record<string, number>
  monthlyHighConfidence: Record<string, number>
  monthlyRed: Record<string, boolean>
}

// 적용된 초안(장부 엔트리)의 확도를 행 확도 맵으로 변환. 확도와 무관하게 전액
// monthlyConfirmed+red로 만들면 '예정' 입력도 적용 즉시 확정으로 집계된다(확정·달성률 인플레).
// 라운드 3(P1): 유효한 weekly+weeklyConfidence(주차별 확도 병렬 배열)가 있으면 초안 단위
// 확도 대신 주차 합 exact로 분해한다 —
//   - monthlyConfirmed[month] = Σ(confirmed 주차 금액), monthlyHighConfidence = Σ(high-confidence).
//   - monthlyRed[month]는 전액 확정(¥1 오차 허용 — confirmed 합 ≥ amount-1)일 때만 true.
//     부분 확정을 red로 만들면 캐논(rev-confirmed)의 red 폴백이 월 전체를 확정으로 오집계한다.
// weeklyConfidence 부재/무효(기존 초안)는 기존 로직 그대로 — 완전 하위호환.
// tests/branch/weekly-confidence.test.ts가 exact 합·red 규칙을 직접 검증한다.
export function appliedDraftConfidenceMaps(
  month: string,
  amount: number,
  metadata: Record<string, unknown> | null | undefined,
): DraftConfidenceMaps {
  const weekly = mergedWeeklyFromMetadata(metadata)
  const states = weekly ? weeklyConfidenceFromMetadata(metadata) : null
  if (weekly && states) {
    let confirmed = 0
    let highConfidence = 0
    weekly.forEach((value, index) => {
      if (value <= 0) return
      if (states[index] === "confirmed") confirmed += value
      else if (states[index] === "high-confidence") highConfidence += value
    })
    return {
      monthlyConfirmed: confirmed > 0 ? { [month]: confirmed } : {},
      monthlyHighConfidence: highConfidence > 0 ? { [month]: highConfidence } : {},
      monthlyRed: amount > 0 && confirmed >= amount - 1 ? { [month]: true } : {},
    }
  }
  const confidence = draftConfidenceFromMetadata(metadata)
  return {
    monthlyConfirmed: confidence === "confirmed" ? { [month]: amount } : {},
    monthlyHighConfidence: confidence === "high-confidence" ? { [month]: amount } : {},
    monthlyRed: confidence === "confirmed" ? { [month]: true } : {},
  }
}

// sourceSnapshot 필드 판독 — 맨 위 키 → detail → row 순(셀 편집 스냅샷은 row 아래, 상세 패널 스냅샷은 detail 아래).
export function snapshotField(snapshot: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!snapshot) return undefined
  const direct = snapshot[key]
  if (direct != null) return direct
  const detail = isRecord(snapshot.detail) ? snapshot.detail[key] : undefined
  if (detail != null) return detail
  const row = isRecord(snapshot.row) ? snapshot.row[key] : undefined
  return row
}

export function snapshotText(snapshot: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = snapshotField(snapshot, key)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** 초안·반영값 sourceSnapshot 에 실린 시트 Row ID(시트 쓰기 baseline). 없으면 null. */
export function snapshotSheetRowId(snapshot: Record<string, unknown> | null | undefined): string | null {
  const baseline = snapshot && isRecord(snapshot.sheetBaseline) ? snapshot.sheetBaseline : null
  const rowId = baseline?.rowId
  return typeof rowId === "string" && rowId.trim() ? rowId.trim() : null
}
