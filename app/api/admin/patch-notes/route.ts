import { NextRequest, NextResponse } from "next/server"
import { STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  getAllPatchNotes,
  createPatchNote,
  type GetAllPatchNotesOptions,
} from "@/lib/repositories/patch-notes"

const MAX_PATCH_NOTES_LIMIT = 100

// ?limit=n(양의 정수, 최대 100) · ?summary=1 — overview처럼 최신 1건 메타만 필요한 소비처용.
// 둘 다 없으면 options 없이 호출해 기존 전체 응답을 그대로 유지한다.
function parseListOptions(req: NextRequest): GetAllPatchNotesOptions | undefined {
  const params = req.nextUrl.searchParams
  const options: GetAllPatchNotesOptions = {}
  const rawLimit = params.get("limit")
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      options.limit = Math.min(parsed, MAX_PATCH_NOTES_LIMIT)
    }
  }
  if (params.get("summary") === "1") options.summary = true
  return Object.keys(options).length > 0 ? options : undefined
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err
  const options = parseListOptions(req)
  return adminCachedJson(options ? await getAllPatchNotes(options) : await getAllPatchNotes())
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (err) return err
  const body = await req.json()
  if (!body.version || !body.title || !body.date) {
    return NextResponse.json({ error: "version, title, date는 필수입니다." }, { status: 400 })
  }
  const note = await createPatchNote({
    version: body.version,
    title: body.title,
    date: body.date,
    status: body.status ?? "draft",
    changes: body.changes ?? [],
  })
  return NextResponse.json(note, { status: 201 })
}
