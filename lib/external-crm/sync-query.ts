export function resolveXiaoshouyiOrderBy(fields: string[], configuredOrderBy?: string | null) {
  const fallback = fields.includes("updatedAt") ? "updatedAt DESC" : "id DESC"
  const orderBy = configuredOrderBy?.trim() || fallback

  // Offset pagination is only deterministic when rows that share the primary
  // sort value have a stable tie-breaker. All sync objects include id, so keep
  // the operator-configured order and append id when it is not already there.
  if (!fields.includes("id") || /\bid\b/i.test(orderBy)) return orderBy
  return `${orderBy}, id DESC`
}
