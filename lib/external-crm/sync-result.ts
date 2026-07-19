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
