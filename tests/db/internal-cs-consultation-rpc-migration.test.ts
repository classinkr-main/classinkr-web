import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260719123000_internal_cs_consultation_rpc_no_overload.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n")
}

describe("internal CS consultation RPC no-overload migration", () => {
  it("removes both ambiguous public overloads before recreating a single text RPC", () => {
    const sql = readMigration()

    expect(sql).toContain(
      "drop function if exists public.match_channel_conversation_chunks(text, int, float);"
    )
    expect(sql).toContain(
      "drop function if exists public.match_channel_conversation_chunks(extensions.vector, int, float);"
    )
    expect(sql.match(/create function public\.match_channel_conversation_chunks\(/gi)).toHaveLength(1)
    expect(sql).toContain("query_embedding text")
  })

  it("keeps vector matching behind a non-exposed private helper", () => {
    const sql = readMigration()

    expect(sql).toContain("create schema if not exists private;")
    expect(sql).toContain("create function private.match_channel_conversation_chunks_vector(")
    expect(sql).toContain("query_embedding extensions.vector(768)")
    expect(sql).toContain("from private.match_channel_conversation_chunks_vector(")
    expect(sql).not.toContain(
      "grant execute on function private.match_channel_conversation_chunks_vector"
    )
  })

  it("exposes only the text wrapper to service_role and reloads PostgREST schema", () => {
    const sql = readMigration()

    expect(sql).toContain(
      "grant execute on function public.match_channel_conversation_chunks(text, int, float) to service_role;"
    )
    expect(sql).not.toContain(
      "grant execute on function public.match_channel_conversation_chunks(extensions.vector"
    )
    expect(sql.toLowerCase()).toContain("notify pgrst, 'reload schema';")
  })
})
