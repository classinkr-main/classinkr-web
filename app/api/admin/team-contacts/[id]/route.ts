import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import {
  confirmTeamContact,
  getTeamContact,
  setTeamContactActive,
  updateTeamContact,
} from "@/lib/repositories/team-contacts"
import { allowedTeamContactAreas } from "@/lib/team-contacts/areas"
import { validateTeamContactInput } from "@/lib/team-contacts/model"

import { TEAM_CONTACTS_WRITE_ROLES, readJsonObject, teamContactActor, teamContactWriteError } from "../team-contacts-response"

// 담당자 표 한 행(2026-11-26). 모두 SUPER_ADMIN 만.
//
// PATCH {action:"confirm"}    — 확인일 찍기(오늘 한국 날짜 + 확인한 사람).
// PATCH {action:"activate"}   — 다시 켜기(같은 영역에 활성 행이 있으면 409).
// PATCH {role?, name?, …}     — 보낸 키만 고친다(검사는 만들기와 같다). 비활성 행은 다시 켠 뒤 고친다.
// DELETE                       — 비활성화(active=false, 물리 삭제 없음).
// 404 = 없음 · 400 검사 · 409 영역 겹침 · 503 표 미적용.

type RouteContext = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND = { error: "담당자 표 행을 찾을 수 없습니다." }

async function loadRow(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, TEAM_CONTACTS_WRITE_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json(NOT_FOUND, { status: 404 })
  const row = await getTeamContact(id)
  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 })
  return { admin, row }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const loaded = await loadRow(req, context)
    if (loaded instanceof NextResponse) return loaded
    const { admin, row } = loaded

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })
    const actor = teamContactActor(admin)
    const audit = (action: string, payload: Record<string, unknown> = {}) =>
      logAdminAudit({
        admin,
        action,
        targetType: "internal_team_contact",
        targetId: row.id,
        payload: { org: row.org, area: row.area, ...payload },
      })

    if (body.action === "confirm") {
      if (!row.active) return NextResponse.json({ error: "비활성 행은 확인일을 찍지 않습니다 — 먼저 다시 켜 주세요." }, { status: 400 })
      const updated = await confirmTeamContact(row.id, actor)
      if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 })
      await audit("team_contacts.confirm", { confirmedAt: updated.confirmedAt })
      return NextResponse.json({ row: updated })
    }
    if (body.action === "activate") {
      const updated = await setTeamContactActive(row.id, true)
      if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 })
      await audit("team_contacts.activate")
      return NextResponse.json({ row: updated })
    }
    if (body.action !== undefined) return NextResponse.json({ error: "모르는 동작입니다." }, { status: 400 })
    if (!row.active) return NextResponse.json({ error: "비활성 행은 고치지 않습니다 — 먼저 다시 켜 주세요." }, { status: 400 })

    // 조직·영역을 바꾸는 것은 다른 행이다 — 새로 만들고 이 행을 비활성화한다.
    if (("org" in body && body.org !== row.org) || ("area" in body && body.area !== row.area)) {
      return NextResponse.json({ error: "조직·업무 영역은 바꾸지 않습니다 — 새 행을 만들고 이 행을 비활성화하세요." }, { status: 400 })
    }
    const validated = validateTeamContactInput(body, allowedTeamContactAreas(), row)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const updated = await updateTeamContact(row, validated.value, actor)
    if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 })
    await audit("team_contacts.update", {
      fields: Object.keys(body).filter((key) => key !== "org" && key !== "area").slice(0, 12),
    })
    return NextResponse.json({ row: updated })
  } catch (error) {
    return teamContactWriteError(error, "PATCH /api/admin/team-contacts/[id]")
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const loaded = await loadRow(req, context)
    if (loaded instanceof NextResponse) return loaded
    const { admin, row } = loaded
    const updated = row.active ? await setTeamContactActive(row.id, false) : row
    if (!updated) return NextResponse.json(NOT_FOUND, { status: 404 })
    await logAdminAudit({
      admin,
      action: "team_contacts.deactivate",
      targetType: "internal_team_contact",
      targetId: row.id,
      payload: { org: row.org, area: row.area },
    })
    return NextResponse.json({ row: updated })
  } catch (error) {
    return teamContactWriteError(error, "DELETE /api/admin/team-contacts/[id]")
  }
}
