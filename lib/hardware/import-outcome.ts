// 하드웨어 원장 가져오기(시트 싱크·백업 후 가져오기) 결과 계약과 화면 문구 — 서버·클라이언트 공용 순수 모듈.
// 하드웨어 라운드 2 S-4·S-6·S-7(docs/active/hardware-view-ux-round2-plan-2026-09-23.md §4.1).
//
// 동기화 결과 계약(lib/admin/sync-outcome.ts, 설계 §7.2)을 그대로 쓰고, 가져오기에만 있는 두 가지를 더한다.
// - stage: 어디서 멈췄는지(lock = 다른 실행이 잠금을 잡음 · sync = 시트 → 미러 · import = 미러 → 원장).
// - ledgerChanged: 원장이 바뀌었는지. 실패 문구가 "원장은 그대로입니다"를 말할 수 있는 근거다.
// 예전 화면은 성공(녹색)·실패(빨강 원문) 둘뿐이라, 잠김은 실행 자체가 없었고(잠금 우회) 건너뛴 시트 행·
// 정리 실패도 녹색 "완료"로 나갔다. 이 모듈의 describeHardwareImportOutcome 하나가 문구와 톤을 정한다.

import type { SyncOutcome, SyncOutcomeFields, SyncOutcomeNotice } from "@/lib/admin/sync-outcome"

export type HardwareImportStage = "lock" | "sync" | "import"

/** 가져오기 한 번의 결과 — 저장소 importHardwareFromBranchSheets 반환값 중 화면이 읽는 필드. */
export interface HardwareImportCounts {
  imported: number
  skipped: number
  snapshotId?: string
  sheetWinsVoided?: number
  sheetWinsKept?: number
  sheetWinsError?: string | null
  /** 교체는 커밋됐는데 이관 기록(hardware_import_runs)을 success로 못 바꾼 경우의 원인. */
  runRecordError?: string | null
}

export interface HardwareImportResponse extends SyncOutcomeFields {
  import?: HardwareImportCounts
  sync?: { inbound: number; outbound: number; stock: number; sales: number } | null
  stage?: HardwareImportStage
  ledgerChanged?: boolean
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value)
}

/**
 * 성공한 가져오기에서 사람이 확인해야 할 것 — 실패는 아니지만 녹색 "완료"로만 말하면 놓치는 것들.
 * 순서가 문구 우선순위다(첫 경고가 알림 본문에 붙는다).
 */
export function hardwareImportWarnings(result: HardwareImportCounts | null | undefined): string[] {
  if (!result) return []
  const warnings: string[] = []
  if (result.sheetWinsError) {
    warnings.push(`어드민 확정 정리에 실패했습니다(${result.sheetWinsError}) — 가져오기 자체는 반영됐습니다. 같은 물량이 두 번 잡혔는지 내역 탭에서 확인하세요.`)
  }
  if (result.skipped > 0) {
    warnings.push(`품목을 해석하지 못해 건너뛴 시트 행 ${formatCount(result.skipped)}건 — 시트의 품목명을 확인하세요.`)
  }
  if ((result.sheetWinsKept ?? 0) > 0) {
    warnings.push(
      `시트에 같은 물량이 없어 어드민 확정 ${formatCount(result.sheetWinsKept ?? 0)}건은 그대로 뒀습니다 — 시트에서 빠진 건인지 확인하세요.`
    )
  }
  if (result.runRecordError) {
    warnings.push(`원장은 반영됐지만 이관 기록을 남기지 못했습니다(${result.runRecordError}) — 신선도 표시가 늦을 수 있습니다.`)
  }
  return warnings
}

function minutesAgo(startedAt: string | undefined, now: number): string | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return null
  const minutes = Math.max(0, Math.floor((now - started) / 60_000))
  return minutes < 1 ? "방금 시작" : `${minutes}분 전 시작`
}

function resolveOutcome(body: HardwareImportResponse, httpStatus: number | undefined): SyncOutcome {
  if (body.outcome) return body.outcome
  if (body.skipped) return "running"
  if (body.ok && body.import) return "done"
  if (httpStatus != null && httpStatus >= 200 && httpStatus < 300 && body.import) return "done"
  return "failed"
}

/**
 * 가져오기 응답(또는 오류 본문)을 알림 한 줄로. httpStatus를 넘기면 권한 거부·시간 초과를 따로 말한다.
 * - 본문이 없거나(비-JSON 504 등) 게이트웨이 시간 초과면 "반영 여부 확인"을 경고로 말한다 — 함수가 끝까지
 *   돌았을 수도 있어 실패라고 단정하지 않는다. 호출부는 이때 화면을 다시 불러온다.
 */
export function describeHardwareImportOutcome(
  body: HardwareImportResponse | null | undefined,
  options: { now?: number; httpStatus?: number } = {}
): SyncOutcomeNotice {
  const now = options.now ?? Date.now()
  const status = options.httpStatus
  if (status === 401 || status === 403) {
    return { tone: "error", message: "시트 가져오기 권한이 없습니다 — 하드웨어 편집 권한이 있는 계정으로 실행하세요." }
  }
  if (!body || (status != null && (status === 502 || status === 504) && !body.outcome)) {
    return {
      tone: "warning",
      message:
        "서버 응답을 받지 못했습니다(시간 초과 가능) — 가져오기가 끝났을 수도 있어 화면을 다시 불러왔습니다. 스트립의 이관 시각으로 반영 여부를 확인한 뒤 필요할 때만 다시 실행하세요.",
    }
  }

  const outcome = resolveOutcome(body, status)
  switch (outcome) {
    case "running": {
      const since = minutesAgo(body.startedAt, now)
      return {
        tone: "info",
        message: `이미 시트 동기화·가져오기가 진행 중입니다${since ? `(${since})` : ""} — 이번 요청은 실행하지 않았습니다. 끝난 뒤 새로고침하면 반영됩니다.`,
      }
    }
    case "skipped":
      return { tone: "info", message: body.outcomeReason?.trim() || "가져오기를 건너뛰었습니다." }
    case "done":
    case "partial": {
      const result = body.import
      const imported = result ? `원장 ${formatCount(result.imported)}건 반영` : "원장 반영"
      const snapshot = result?.snapshotId ? ` · 백업 ${result.snapshotId.slice(0, 8)}` : ""
      const voided =
        result?.sheetWinsVoided && result.sheetWinsVoided > 0
          ? ` 시트가 같은 물량을 다시 실어, 시트 행에서 확정했던 어드민 기록 ${formatCount(result.sheetWinsVoided)}건은 취소했습니다(내역 탭 "취소 포함"에서 사유 확인).`
          : ""
      const warnings = body.warnings?.filter((item) => typeof item === "string" && item.trim()) ?? hardwareImportWarnings(result)
      const base = `시트 싱크·백업 후 가져오기 완료: ${imported}${snapshot}.${voided}`
      if (warnings.length === 0) return { tone: "success", message: base }
      const extra = warnings.length > 1 ? ` 외 ${formatCount(warnings.length - 1)}건` : ""
      return { tone: "warning", message: `${base} 확인할 것: ${warnings[0]}${extra}` }
    }
    case "failed":
    default: {
      const detail = body.error?.trim() ? ` — ${body.error.trim()}` : ""
      if (body.stage === "sync") {
        return {
          tone: "error",
          message: `시트 싱크에 실패해 가져오기를 하지 않았습니다${detail}. 원장은 바뀌지 않았습니다 — 잠시 뒤 다시 시도하세요.`,
        }
      }
      if (body.ledgerChanged === false || body.stage === "import") {
        return {
          tone: "error",
          message: `가져오기에 실패했습니다${detail}. 원장은 가져오기 전 그대로입니다 — 원인을 확인한 뒤 다시 시도하세요.`,
        }
      }
      return { tone: "error", message: `가져오기에 실패했습니다${detail}.` }
    }
  }
}
