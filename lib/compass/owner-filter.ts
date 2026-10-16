/** PostgREST 값을 인용해 담당자 별명을 OR로 대조한다. 빈 배열은 미매핑 키로 제한한다. */
export function compassOwnerFilter(keys: readonly string[] | undefined, columns = ["owner", "caller", "bd_owner"]) {
  if (!keys) return undefined
  const values = (keys.length ? keys : ["__no_current_admin_owner__"])
    .map(key => `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")
  return columns.map(column => `${column}.in.(${values})`).join(",")
}

export function withCompassOwner<T extends { or(filters: string): T }>(query: T, keys?: readonly string[], columns?: string[]): T {
  const filter = compassOwnerFilter(keys, columns)
  return filter ? query.or(filter) : query
}

export function compassOwnerCacheKey(keys?: readonly string[]) {
  return keys ? JSON.stringify([...new Set(keys)].sort()) : "all"
}
