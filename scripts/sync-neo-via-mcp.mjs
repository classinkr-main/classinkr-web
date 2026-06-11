import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createClient } from "@supabase/supabase-js"

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const DEFAULT_MCP_ROOT = "C:/tmp/eeocrm-personal"
const MCP_ROOT = process.env.EEOCRM_MCP_ROOT ?? DEFAULT_MCP_ROOT
const MCP_SSE_URL = process.env.EEOCRM_MCP_SSE_URL ?? "http://127.0.0.1:3000/sse"
const SOURCE_SYSTEM = "xiaoshouyi"

function loadDotEnvLocal() {
  const path = resolve(PROJECT_ROOT, ".env.local")
  if (!existsSync(path)) return

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] != null) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, "")
  }
}

function normalizeCrmName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/주식회사|유한회사|\(주\)|㈜|학원|어학원|캠퍼스|센터|본원|분원/g, "")
    .replace(/[()（）[\]{}·._-]/g, "")
}

function firstString(record, keys = []) {
  for (const key of keys) {
    const value = record[key]
    if (value == null || value === "") continue
    return String(value)
  }
  return null
}

function firstNumber(record, keys = []) {
  for (const key of keys) {
    const value = record[key]
    if (value == null || value === "") continue
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return null
}

function normalizeExternalDate(value) {
  if (value == null || value === "") return null
  const stringValue = String(value)
  const numeric = typeof value === "number" ? value : /^\d+$/.test(stringValue) ? Number(stringValue) : null
  const date = numeric == null ? new Date(stringValue) : new Date(numeric)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function firstDate(record, keys = []) {
  for (const key of keys) {
    const value = normalizeExternalDate(record[key])
    if (value) return value
  }
  return null
}

function hashPayload(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex")
}

function metadataArray(row, key) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  return Array.isArray(metadata[key]) ? metadata[key] : []
}

function toExternalRecord(row, record, syncedAt, runId) {
  const externalId = record.id == null ? null : String(record.id)
  if (!externalId) return null

  const displayName = firstString(record, metadataArray(row, "displayNameFields"))

  return {
    source_system: SOURCE_SYSTEM,
    object_api_key: row.object_api_key,
    external_id: externalId,
    normalized_name: displayName ? normalizeCrmName(displayName) : null,
    display_name: displayName,
    owner_name: firstString(record, metadataArray(row, "ownerFields")),
    status: firstString(record, metadataArray(row, "statusFields")),
    amount: firstNumber(record, metadataArray(row, "amountFields")),
    occurred_at: firstDate(record, metadataArray(row, "occurredAtFields")),
    payload: record,
    payload_hash: hashPayload(record),
    synced_at: syncedAt,
    last_seen_run_id: runId,
    is_stale: false,
    stale_at: null,
  }
}

function getRecordArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.result)) return payload.result
  if (Array.isArray(payload?.result?.records)) return payload.result.records
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.records)) return payload.data.records
  return []
}

function parseToolJson(result) {
  const text = result?.content?.find((item) => item?.type === "text")?.text
  if (!text) return {}
  return JSON.parse(text)
}

function buildQuery(row, pageSize, offset) {
  const fields = row.fields.join(",")
  const whereClause = row.where_clause?.trim()
  const whereSql = whereClause ? ` WHERE ${whereClause}` : ""
  const orderBy = row.order_by ?? (row.fields.includes("updatedAt") ? "updatedAt DESC" : "id DESC")
  return `SELECT ${fields} FROM ${row.object_api_key}${whereSql} ORDER BY ${orderBy} LIMIT ${offset},${pageSize}`
}

async function createRun(sb, objectApiKey) {
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from("external_crm_sync_runs")
    .insert({
      source_system: SOURCE_SYSTEM,
      object_api_key: objectApiKey,
      trigger: "manual",
      status: "running",
      started_at: now,
      metadata: { via: "eeocrm-personal-mcp", mcpSseUrl: MCP_SSE_URL },
    })
    .select("id")
    .single()

  if (error) throw error
  return data.id
}

async function finishRun(sb, id, patch) {
  const { error } = await sb
    .from("external_crm_sync_runs")
    .update({
      status: patch.status,
      finished_at: new Date().toISOString(),
      rows_scanned: patch.rowsScanned ?? null,
      rows_upserted: patch.rowsUpserted ?? null,
      cursor_value: patch.cursorValue ?? null,
      error: patch.error ?? null,
      metadata: patch.metadata ?? {},
    })
    .eq("id", id)

  if (error) throw error
}

async function upsertRows(sb, rows) {
  let count = 0
  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100)
    const { data, error } = await sb
      .from("external_crm_records")
      .upsert(chunk, { onConflict: "source_system,object_api_key,external_id" })
      .select("id")

    if (error) throw error
    count += data?.length ?? chunk.length
  }
  return count
}

async function main() {
  loadDotEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY")
  }

  const mcpRequire = createRequire(resolve(MCP_ROOT, "package.json"))
  const { Client } = await import(pathToFileURL(mcpRequire.resolve("@modelcontextprotocol/sdk/client/index.js")))
  const { SSEClientTransport } = await import(pathToFileURL(mcpRequire.resolve("@modelcontextprotocol/sdk/client/sse.js")))

  const sb = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const client = new Client({ name: "classin-neo-mcp-sync", version: "1.0.0" }, { capabilities: {} })
  const transport = new SSEClientTransport(new URL(MCP_SSE_URL))
  await client.connect(transport)

  try {
    const who = parseToolJson(await client.callTool({ name: "crm_whoami", arguments: {} }))
    if (!who.loggedIn) throw new Error("MCP is not logged in. Run npm run login in C:/tmp/eeocrm-personal.")
    console.log(`[mcp] logged in as ${who.currentUser ?? "unknown"}`)

    const { data: catalog, error: catalogError } = await sb
      .from("crm_xiaoshouyi_query_catalog")
      .select("object_api_key, fields, where_clause, order_by, page_size, max_pages, sync_priority, metadata")
      .eq("source_system", SOURCE_SYSTEM)
      .eq("is_default_enabled", true)
      .order("sync_priority", { ascending: true })
      .order("object_api_key", { ascending: true })

    if (catalogError) throw catalogError

    const results = []
    for (const row of catalog ?? []) {
      const pageSize = Number(row.page_size ?? 100)
      const maxPages = Number(row.max_pages ?? 20)
      const runId = await createRun(sb, row.object_api_key)
      const syncedAt = new Date().toISOString()

      let rowsScanned = 0
      let rowsUpserted = 0
      let pagesScanned = 0
      let nextOffset = 0
      let truncated = false

      try {
        for (let page = 0; page < maxPages; page += 1) {
          const offset = page * pageSize
          const soql = buildQuery(row, pageSize, offset)
          const payload = parseToolJson(await client.callTool({ name: "crm_soql_query", arguments: { soql } }))
          const records = getRecordArray(payload)
          pagesScanned += 1
          rowsScanned += records.length
          nextOffset = offset + records.length

          const rows = records.map((record) => toExternalRecord(row, record, syncedAt, runId)).filter(Boolean)
          rowsUpserted += await upsertRows(sb, rows)

          if (records.length < pageSize) {
            truncated = false
            break
          }
          truncated = page === maxPages - 1
        }

        let staleMarked = null
        if (!truncated) {
          const { data: staleRows, error: staleError } = await sb
            .from("external_crm_records")
            .update({ is_stale: true, stale_at: syncedAt })
            .eq("source_system", SOURCE_SYSTEM)
            .eq("object_api_key", row.object_api_key)
            .or(`last_seen_run_id.is.null,last_seen_run_id.neq.${runId}`)
            .eq("is_stale", false)
            .select("id")

          if (staleError) throw staleError
          staleMarked = staleRows?.length ?? 0
        }

        await finishRun(sb, runId, {
          status: "success",
          rowsScanned,
          rowsUpserted,
          cursorValue: truncated ? `offset:${nextOffset}` : "complete",
          metadata: {
            via: "eeocrm-personal-mcp",
            pageSize,
            maxPages,
            pagesScanned,
            truncated,
            staleMarked,
            orderBy: row.order_by ?? null,
            whereClause: row.where_clause ?? null,
          },
        })

        const result = {
          objectApiKey: row.object_api_key,
          status: "success",
          rowsScanned,
          rowsUpserted,
          pagesScanned,
          truncated,
          staleMarked,
        }
        results.push(result)
        console.log(`[sync] ${row.object_api_key}: ${JSON.stringify(result)}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await finishRun(sb, runId, {
          status: "failed",
          rowsScanned,
          rowsUpserted,
          error: message,
          metadata: { via: "eeocrm-personal-mcp", pageSize, maxPages, pagesScanned },
        })
        const result = { objectApiKey: row.object_api_key, status: "failed", error: message }
        results.push(result)
        console.error(`[sync] ${row.object_api_key}: ${message}`)
      }
    }

    const failed = results.filter((result) => result.status !== "success")
    console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exit(1)
})
