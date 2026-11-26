import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { parseKrContactsCsv } from "@/lib/internal-cs-chat/contact"
import { applyTeamContactImport, listTeamContacts, TEAM_CONTACTS_NOT_READY_MESSAGE } from "@/lib/repositories/team-contacts"
import { allowedTeamContactAreas, teamContactAreaOptions } from "@/lib/team-contacts/areas"
import { importWritesOf, planKrContactImport } from "@/lib/team-contacts/csv-import"

import { TEAM_CONTACTS_WRITE_ROLES, readJsonObject, teamContactActor, teamContactWriteError } from "../team-contacts-response"

// 담당자 표 CSV 가져오기(2026-11-26) — 회사 드라이브의 초안 CSV(readKrContacts 양식)를 미리보고 넣는다. SUPER_ADMIN 만.
//
// POST {csv, apply?:false} — 미리보기: { plan } (만들기·고치기·그대로·건너뜀과 이유). 쓰기 없음.
// POST {csv, apply:true}   — 같은 계획을 다시 세워 넣는다: { plan, result{created, updated, failed[]} }.
// 400 CSV 없음·너무 큼·머리 칸 없음 · 503 표 미적용.

const MAX_CSV_BYTES = 200_000
const MAX_CSV_ROWS = 200

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, TEAM_CONTACTS_WRITE_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await readJsonObject(req)
  const csv = typeof body?.csv === "string" ? body.csv : ""
  if (!csv.trim()) return NextResponse.json({ error: "CSV 내용이 비어 있습니다." }, { status: 400 })
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV 가 너무 큽니다(200KB 이하)." }, { status: 400 })
  }
  const parsed = parseKrContactsCsv(csv)
  if (parsed.missingColumns.length > 0) {
    return NextResponse.json(
      { error: `CSV 머리 줄에 ${parsed.missingColumns.join("·")} 칸이 없습니다 — 한국 담당표 양식인지 확인해 주세요.` },
      { status: 400 }
    )
  }
  if (parsed.rows.length + parsed.skipped.length > MAX_CSV_ROWS) {
    return NextResponse.json({ error: `CSV 행이 너무 많습니다(${MAX_CSV_ROWS}행 이하).` }, { status: 400 })
  }

  try {
    const current = await listTeamContacts()
    if (!current.available) return NextResponse.json({ error: TEAM_CONTACTS_NOT_READY_MESSAGE }, { status: 503 })
    const plan = planKrContactImport(parsed, current.rows, {
      areas: allowedTeamContactAreas(),
      krAreas: teamContactAreaOptions().KR,
    })
    if (body?.apply !== true) return NextResponse.json({ plan })

    const actor = teamContactActor(admin)
    const result = await applyTeamContactImport(importWritesOf(plan, actor.name))
    await logAdminAudit({
      admin,
      action: "team_contacts.import",
      targetType: "internal_team_contact",
      payload: {
        created: result.created,
        updated: result.updated,
        failed: result.failed.length,
        skipped: plan.counts.skipped,
        areas: plan.items.filter((item) => item.action !== "same").map((item) => item.area),
      },
    })
    return NextResponse.json({ plan, result })
  } catch (error) {
    return teamContactWriteError(error, "POST /api/admin/team-contacts/import")
  }
}
