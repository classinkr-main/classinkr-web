import { assertXiaoshouyiOk } from "@/lib/external-crm/xiaoshouyi-request"

/** A failed/malformed query is never an empty full snapshot: that would retire every existing row. */
export function parseXiaoshouyiQueryRecords(payload: unknown, objectApiKey: string): Array<Record<string, unknown>> {
  const context = `query ${objectApiKey}`
  assertXiaoshouyiOk(payload, context)
  const value = payload as Record<string, unknown>
  const result = value.result as { records?: unknown } | null | undefined
  const data = value.data as { records?: unknown; result?: { records?: unknown } } | null | undefined
  const records = result?.records ?? data?.records ?? value.records ?? data?.result?.records
  if (!Array.isArray(records)) throw new Error(`Xiaoshouyi ${context}: missing records array`)

  return records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`Xiaoshouyi ${context}: invalid record shape`)
    }
    const row = record as Record<string, unknown>
    const id = row.id
    if (!(typeof id === "string" && id.trim()) && !(typeof id === "number" && Number.isFinite(id))) {
      throw new Error(`Xiaoshouyi ${context}: missing record id`)
    }
    return row
  })
}
