import { NextRequest, NextResponse } from "next/server"

import { hasAdminApiRole, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { createTeamContact, listTeamContacts } from "@/lib/repositories/team-contacts"
import { allowedTeamContactAreas, teamContactAreaOptions } from "@/lib/team-contacts/areas"
import { validateTeamContactInput } from "@/lib/team-contacts/model"

import {
  TEAM_CONTACTS_READ_ROLES,
  TEAM_CONTACTS_WRITE_ROLES,
  readJsonObject,
  teamContactActor,
  teamContactWriteError,
} from "./team-contacts-response"

// 담당자 표(2026-11-26) — internal_team_contacts. 갈매봇·위컴 1:1 담당자 안내가 읽는다(lib/internal-cs-chat/contact-deps.ts).
//
// GET  ?inactive=1 — 역할 SUPER_ADMIN·ADMIN. { available, warning, rows[], areas{KR,HQ}, viewer{canEdit} }.
//      표 미적용이면 200 available:false + 안내.
// POST {org, area, role?, name?, deputy?, channel?, prep?, adminLink?, note?, confirmedAt?, sortOrder?} — SUPER_ADMIN 만.
//      201 {row} · 400 검사(연락처 값·모르는 영역 등) · 409 같은 영역에 활성 행 있음 · 503 표 미적용.

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, TEAM_CONTACTS_READ_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const includeInactive = req.nextUrl.searchParams.get("inactive") === "1"
    const list = await listTeamContacts({ includeInactive })
    return NextResponse.json(
      {
        ...list,
        areas: teamContactAreaOptions(),
        viewer: { canEdit: hasAdminApiRole(admin.role, TEAM_CONTACTS_WRITE_ROLES) },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[GET /api/admin/team-contacts]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "담당자 표를 불러오지 못했습니다." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, TEAM_CONTACTS_WRITE_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })
  const validated = validateTeamContactInput(body, allowedTeamContactAreas())
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  try {
    const row = await createTeamContact(validated.value, teamContactActor(admin))
    // 감사 기록에는 사람 이름을 옮겨 적지 않는다(조직·영역만).
    await logAdminAudit({
      admin,
      action: "team_contacts.create",
      targetType: "internal_team_contact",
      targetId: row.id,
      payload: { org: row.org, area: row.area },
    })
    return NextResponse.json({ row }, { status: 201 })
  } catch (error) {
    return teamContactWriteError(error, "POST /api/admin/team-contacts")
  }
}
