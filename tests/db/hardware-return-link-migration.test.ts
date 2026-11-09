import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const FILE = "supabase/migrations/20261109_hardware_return_link_survives_sheet_import.sql"
const sql = readFileSync(join(process.cwd(), FILE), "utf8").replace(/--[^\n]*/g, "")

function fnBody(signature: string): string {
  const start = sql.indexOf(`create or replace function public.${signature}`)
  expect(start).toBeGreaterThanOrEqual(0)
  return sql.slice(start, sql.indexOf("$$;", sql.indexOf("as $$", start) + 5))
}

describe("hardware return link migration", () => {
  it("never blocks a sheet-row delete on a return link", () => {
    expect(sql).toMatch(/FOREIGN KEY \(return_of_movement_id\) REFERENCES public\.hardware_movements\(id\) ON DELETE SET NULL/)
    expect(sql).not.toMatch(/ON DELETE RESTRICT/)
  })

  it.each([
    "replace_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)",
    "restore_hardware_sheet_import_snapshot(snapshot_id uuid, actor text default null)",
  ])("%s unlinks before delete and relinks by source_key after insert", (signature) => {
    const body = fnBody(signature)
    const capture = body.indexOf("create temp table _hw_return_links")
    const unlink = body.indexOf("set return_of_movement_id = null")
    const del = body.indexOf("delete from public.hardware_movements")
    const insert = body.indexOf("insert into public.hardware_movements")
    const relink = body.indexOf("set return_of_movement_id = n.id")
    expect([capture, unlink, del, insert, relink].every((i) => i >= 0)).toBe(true)
    expect(capture < unlink && unlink < del && del < insert && insert < relink).toBe(true)
    expect(body.slice(relink)).toContain("n.source_key = l.source_key")
  })

  it("keeps the sheet inbound storage text on replace", () => {
    expect(fnBody("replace_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)")).toContain("nullif(r->>'storage_location', '')")
  })
})
