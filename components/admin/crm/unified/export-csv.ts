// 통합 고객 CSV 내려받기(클라이언트) — GET /api/admin/crm/customers/export 를 어드민 인증 헤더로 부르고
// 응답 헤더(X-Export-*)로 절단 여부를 읽는다. 파일 만들기는 lib/crm/csv.ts downloadCsvInBrowser.
//
// 역할: 서버가 SUPER_ADMIN·ADMIN 만 허용한다(개인정보 파일). 화면은 세션 역할이 확실히 다른 경우만
// 버튼을 막고(canExportUnifiedCsv), 모르면 열어 두되 403 을 한국어 인라인 오류로 바꾼다.

import { adminFetch } from "@/lib/admin-client"
import { CSV_BOM, csvFileName, downloadCsvInBrowser } from "@/lib/crm/csv"

export const CSV_EXPORT_ROLES = ["SUPER_ADMIN", "ADMIN"] as const
export const CSV_EXPORT_FORBIDDEN_MESSAGE = "CSV 내보내기는 관리자(ADMIN) 권한이 필요합니다."

/** 세션 역할(없으면 null = 모름) → 버튼 허용. 모르면 허용하고 서버가 최종 판단한다. */
export function canExportUnifiedCsv(role: string | null | undefined): boolean {
  const normalized = role?.trim().toUpperCase()
  if (!normalized) return true
  return (CSV_EXPORT_ROLES as readonly string[]).includes(normalized)
}

export function readSessionAdminRole(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage.getItem("admin_role")
  } catch {
    return null
  }
}

/** 서버 X-Export-Compass — 마지막 연락 열의 Compass 원천 상태(lib/repositories/crm-unified-customers.ts meta.compass). */
export type CsvExportCompassStatus = "ok" | "down" | "partial" | "skipped"

export interface UnifiedCsvExportResult {
  rows: number
  total: number
  truncated: boolean
  limit: number
  /** 헤더가 없거나(옛 서버) 모르는 값이면 null — 안내를 붙이지 않는다. */
  compass?: CsvExportCompassStatus | null
}

const CSV_COMPASS_STATUSES: readonly CsvExportCompassStatus[] = ["ok", "down", "partial", "skipped"]

/** 파일의 "마지막 연락" 열이 Compass 없이 만들어졌을 때의 안내 — 목록 캡션과 같은 사실을 같은 말로. */
export const CSV_COMPASS_DOWN_NOTE = "Compass 연결 끊김 — 마지막 연락은 Home 기록만"
export const CSV_COMPASS_PARTIAL_NOTE = "Compass 활동 일부만 반영(조회 상한) — 마지막 연락이 실제보다 오래돼 보일 수 있음"

function headerNumber(headers: Headers, name: string): number {
  const value = Number(headers.get(name))
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function headerCompass(headers: Headers): CsvExportCompassStatus | null {
  const value = headers.get("X-Export-Compass")?.trim().toLowerCase()
  return value && (CSV_COMPASS_STATUSES as readonly string[]).includes(value) ? (value as CsvExportCompassStatus) : null
}

/** 응답 헤더 → 내보내기 결과(순수). */
export function readCsvExportHeaders(headers: Headers): UnifiedCsvExportResult {
  const rows = headerNumber(headers, "X-Export-Rows")
  return {
    rows,
    total: headerNumber(headers, "X-Export-Total") || rows,
    truncated: headers.get("X-Export-Truncated") === "1",
    limit: headerNumber(headers, "X-Export-Limit"),
    compass: headerCompass(headers),
  }
}

/** Compass 원천 안내 — 끊김·일부면 문구, 정상·조회 대상 없음·모름이면 null. */
export function csvExportCompassNote(compass: CsvExportCompassStatus | null | undefined): string | null {
  if (compass === "down") return CSV_COMPASS_DOWN_NOTE
  if (compass === "partial") return CSV_COMPASS_PARTIAL_NOTE
  return null
}

/**
 * 결과 안내 문구(토스트) — 절단되면 전체 건수와 상한을, Compass 가 끊겼거나 일부면 그 사실을 함께 적는다.
 * 파일 안에는 주석 줄을 넣지 않는다(스프레드시트가 첫 줄을 헤더로 읽어야 한다) — 안내는 화면이 한다.
 */
export function describeCsvExport(result: UnifiedCsvExportResult): string {
  const base = result.truncated
    ? `CSV ${result.rows.toLocaleString("ko-KR")}명 내보냄 — 전체 ${result.total.toLocaleString("ko-KR")}명 중 앞 ${result.rows.toLocaleString("ko-KR")}명(상한)`
    : `CSV ${result.rows.toLocaleString("ko-KR")}명 내보냄`
  const note = csvExportCompassNote(result.compass)
  return note ? `${base} · ${note}` : base
}

function fileNameFromDisposition(disposition: string | null): string | null {
  const match = disposition ? /filename="?([^";]+)"?/i.exec(disposition) : null
  return match?.[1] ?? null
}

export async function downloadUnifiedCustomersCsv(url: string): Promise<UnifiedCsvExportResult> {
  const response = await adminFetch(url, { cache: "no-store" })
  if (!response.ok) {
    if (response.status === 403) throw new Error(CSV_EXPORT_FORBIDDEN_MESSAGE)
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? "고객 목록 CSV를 만들지 못했습니다.")
  }
  // fetch 의 text() 는 UTF-8 BOM 을 떼어 낸다 — 한글이 Excel 에서 깨지지 않게 다시 붙인다.
  const text = await response.text()
  const csv = text.startsWith(CSV_BOM) ? text : CSV_BOM + text
  const fileName = fileNameFromDisposition(response.headers.get("Content-Disposition")) ?? csvFileName("crm-customers")
  downloadCsvInBrowser(fileName, csv)
  return readCsvExportHeaders(response.headers)
}
