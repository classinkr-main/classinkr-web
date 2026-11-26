export interface ExternalCrmSyncStatusLike {
  ok: boolean
  skipped?: boolean
  cached?: boolean
  objects: Array<{ status: "success" | "failed" | "skipped"; rowsUpserted?: number }>
}

export function hasFreshExternalCrmSyncData(result: ExternalCrmSyncStatusLike) {
  return !result.cached && result.objects.some(
    (object) => object.status === "success" || (object.rowsUpserted ?? 0) > 0
  )
}

export function getExternalCrmSyncHttpStatus(result: ExternalCrmSyncStatusLike) {
  if (result.ok) return 200

  const successCount = result.objects.filter((object) => object.status === "success").length
  const failedCount = result.objects.filter((object) => object.status === "failed").length
  if (successCount > 0 && failedCount > 0) return 207
  if (result.skipped) return 409
  return 502
}

export interface ExternalCrmSyncChainStatusLike {
  sync: ExternalCrmSyncStatusLike
  neoCustomerSnapshotsError?: string
  candidatesError?: string
  renewalAlertsError?: string
}

/** 동기화 자체는 성공이어도 후속 단계(스냅샷·후보·재연락 알림)가 실패했으면 200 대신 207 — 크론 대시보드가 초록으로 남지 않게 한다. */
export function getExternalCrmSyncChainHttpStatus(chain: ExternalCrmSyncChainStatusLike) {
  const status = getExternalCrmSyncHttpStatus(chain.sync)
  if (status === 200 && (chain.neoCustomerSnapshotsError || chain.candidatesError || chain.renewalAlertsError)) {
    return 207
  }
  return status
}
