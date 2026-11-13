/** PostgREST/Postgres 가 "테이블 없음"으로 돌려주는 신호 — 마이그레이션 미적용 상태를 조용히 견딘다. */
export function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  return /relation .* does not exist|could not find the table/i.test(error.message ?? "")
}
